import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { DocumentWriteError } from '@/lib/documentWriteError';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';
import { SupabaseProjectRepository } from '@/repositories/projectRepository';
import type { Project } from '@/types/user';

type Row = Record<string, unknown>;

/** 用内存行模拟带版本校验的 RPC 与只读查询，行为与 SQL 迁移一致。 */
function fakeClient(ownerId = 'user-1') {
  const rows = new Map<string, Row>();
  const now = () => new Date().toISOString();

  const rpc = async (name: string, params: Row): Promise<{ data: unknown; error: { message: string; code: string } | null }> => {
    const id = String(params.project_id ?? '');
    if (name === 'save_project_document') {
      const payload = params.project_payload as Row;
      if (params.expected_revision === null) {
        if (rows.has(id)) return { data: null, error: { message: 'Document already exists', code: 'P0002' } };
        const row: Row = {
          id,
          owner_id: ownerId,
          name: payload.name,
          description: params.project_description ?? '',
          config: payload,
          revision: 1,
          created_at: now(),
          updated_at: now(),
        };
        rows.set(id, row);
        return { data: [{ revision: 1, updated_at: row.updated_at }], error: null };
      }
      const row = rows.get(id);
      if (!row || row.owner_id !== ownerId) {
        return { data: null, error: { message: 'Document not found', code: 'P0002' } };
      }
      if (row.revision !== params.expected_revision) {
        return { data: null, error: { message: 'Version conflict', code: 'P0002' } };
      }
      row.revision = (row.revision as number) + 1;
      row.name = payload.name;
      row.config = payload;
      if (params.project_description !== null && params.project_description !== undefined) {
        row.description = params.project_description;
      }
      row.updated_at = now();
      return { data: [{ revision: row.revision, updated_at: row.updated_at }], error: null };
    }
    if (name === 'update_project_metadata') {
      const row = rows.get(id);
      if (!row || row.owner_id !== ownerId) {
        return { data: null, error: { message: 'Document not found', code: 'P0002' } };
      }
      if (row.revision !== params.expected_revision) {
        return { data: null, error: { message: 'Version conflict', code: 'P0002' } };
      }
      row.revision = (row.revision as number) + 1;
      if (params.new_name !== null && params.new_name !== undefined) row.name = params.new_name;
      if (params.new_description !== null && params.new_description !== undefined) row.description = params.new_description;
      row.updated_at = now();
      return { data: [{ revision: row.revision, updated_at: row.updated_at }], error: null };
    }
    if (name === 'delete_project_document') {
      const row = rows.get(id);
      if (!row || row.owner_id !== ownerId) {
        return { data: null, error: { message: 'Document not found', code: 'P0002' } };
      }
      if (row.revision !== params.expected_revision) {
        return { data: null, error: { message: 'Version conflict', code: 'P0002' } };
      }
      rows.delete(id);
      return { data: null, error: null };
    }
    return { data: null, error: { message: `unexpected rpc: ${name}`, code: '' } };
  };

  const client = {
    rpc,
    from(table: string) {
      if (table !== 'projects') throw new Error(`unexpected table: ${table}`);
      const filters: Row = {};
      let columns = '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: (selected: string) => {
          columns = selected;
          return builder;
        },
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return builder;
        },
        order: async () => ({
          data: [...rows.values()].filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value)),
          error: null,
        }),
        maybeSingle: async () => ({
          data: [...rows.values()].find((row) => Object.entries(filters).every(([key, value]) => row[key] === value)) ?? null,
          error: null,
        }),
        then: (resolve: (value: { data: Row[]; error: null }) => unknown) => {
          const selected = [...rows.values()].filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
          const projected = columns
            ? selected.map((row) => Object.fromEntries(columns.split(',').map((column) => [column, row[column]])))
            : selected;
          return Promise.resolve({ data: projected, error: null }).then(resolve);
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;

  return { client, rows };
}

function makeProject(): Project {
  return {
    id: 'project-1',
    userId: 'user-1',
    name: 'Test project',
    description: 'Repository test',
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('SupabaseProjectRepository', () => {
  it('creates and loads a project with its database version', async () => {
    const { client, rows } = fakeClient();
    const repository = new SupabaseProjectRepository(client);
    const project = makeProject();
    const config = {
      ...createFallbackConfig(),
      id: project.id,
      name: project.name,
    };

    const version = await repository.createProject(project, config);

    expect(version).toEqual({ revision: 1, updatedAt: expect.any(String) });
    expect(rows.get(project.id)).toEqual(expect.objectContaining({
      id: project.id,
      owner_id: project.userId,
      name: project.name,
      config,
      revision: 1,
    }));
    await expect(repository.load(project.id)).resolves.toEqual({
      status: 'ok',
      config,
      version,
    });
  });

  it('lists, updates metadata, and saves content through the same version contract', async () => {
    const { client } = fakeClient();
    const repository = new SupabaseProjectRepository(client);
    const project = makeProject();
    const config = { ...createFallbackConfig(), id: project.id, name: project.name };
    const created = await repository.createProject(project, config);

    const renamed = await repository.updateProject(project.id, { description: 'Updated description' }, created);
    expect(renamed.revision).toBe(2);
    const saved = await repository.save(project.id, { ...config, name: 'Updated name' }, renamed);
    expect(saved.revision).toBe(3);

    await expect(repository.listProjects(project.userId)).resolves.toEqual([
      expect.objectContaining({
        id: project.id,
        name: 'Updated name',
        description: 'Updated description',
      }),
    ]);
  });

  it('rejects a stale writer instead of silently overwriting', async () => {
    const { client } = fakeClient();
    const repository = new SupabaseProjectRepository(client);
    const project = makeProject();
    const config = { ...createFallbackConfig(), id: project.id, name: project.name };
    const created = await repository.createProject(project, config);
    await repository.save(project.id, { ...config, name: '第一版' }, created);

    await expect(repository.save(project.id, { ...config, name: '旧窗口' }, created))
      .rejects.toMatchObject({ code: 'conflict' });
    const loaded = await repository.load(project.id);
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') {
      expect(loaded.config.name).toBe('第一版');
      expect(loaded.version.revision).toBe(2);
    }
  });

  it('rejects invalid documents before writing them', async () => {
    const { client } = fakeClient();
    const repository = new SupabaseProjectRepository(client);
    const config = { ...createFallbackConfig(), id: 'project-2' };

    await expect(repository.save(
      'project-2',
      { ...config, materials: [{ id: 'broken' }] } as typeof config,
      null,
    )).rejects.toThrow('Invalid project document');
  });

  it('fails the save when the target project row no longer exists', async () => {
    const { client } = fakeClient();
    const repository = new SupabaseProjectRepository(client);
    const config = { ...createFallbackConfig(), id: 'missing-project' };

    await expect(repository.save('missing-project', config, { revision: 1, updatedAt: '' }))
      .rejects.toBeInstanceOf(DocumentWriteError);
    await expect(repository.save('missing-project', config, { revision: 1, updatedAt: '' }))
      .rejects.toMatchObject({ code: 'missing' });
  });

  it('never resurrects a deleted project through a stale-version save', async () => {
    const { client } = fakeClient();
    const repository = new SupabaseProjectRepository(client);
    const project = makeProject();
    const config = { ...createFallbackConfig(), id: project.id, name: project.name };
    const created = await repository.createProject(project, config);
    await repository.remove(project.id, created);

    await expect(repository.save(project.id, config, created))
      .rejects.toMatchObject({ code: 'missing' });
  });

  it('fails the metadata update when the target project row no longer exists', async () => {
    const { client } = fakeClient();
    const repository = new SupabaseProjectRepository(client);

    await expect(repository.updateProject('missing-project', { name: '新名称' }, { revision: 1, updatedAt: '' }))
      .rejects.toMatchObject({ code: 'missing' });
  });

  it('hard deletes a project only with the exact expected revision', async () => {
    const { client, rows } = fakeClient();
    const repository = new SupabaseProjectRepository(client);
    const project = makeProject();
    const config = { ...createFallbackConfig(), id: project.id, name: project.name };
    const created = await repository.createProject(project, config);

    await expect(repository.remove(project.id, { revision: 99, updatedAt: '' }))
      .rejects.toMatchObject({ code: 'conflict' });
    expect(rows.has(project.id)).toBe(true);

    await repository.remove(project.id, created);
    expect(rows.has(project.id)).toBe(false);
  });
});

import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';
import { SupabaseProjectRepository } from '@/repositories/projectRepository';
import type { Project } from '@/types/user';

type Row = Record<string, unknown>;

function fakeClient() {
  const rows = new Map<string, Row>();

  const matching = (filters: Row) =>
    [...rows.values()].filter((row) =>
      Object.entries(filters).every(([key, value]) => row[key] === value));

  const client = {
    from(table: string) {
      if (table !== 'projects') throw new Error(`unexpected table: ${table}`);
      const filters: Row = {};
      let action: 'select' | 'update' | 'delete' = 'select';
      let updatePayload: Row = {};
      // Supabase's builder is thenable; this fake applies writes when awaited.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return builder;
        },
        order: async () => ({ data: matching(filters), error: null }),
        maybeSingle: async () => ({
          data: matching(filters)[0] ?? null,
          error: null,
        }),
        insert: async (payload: Row) => {
          const now = new Date().toISOString();
          rows.set(String(payload.id), {
            ...payload,
            created_at: now,
            updated_at: now,
          });
          return { data: null, error: null };
        },
        update: (payload: Row) => {
          action = 'update';
          updatePayload = payload;
          return builder;
        },
        delete: () => {
          action = 'delete';
          return builder;
        },
        then: (
          resolve: (value: { data: Array<{ id: unknown }>; error: null }) => unknown,
          reject: (reason: unknown) => unknown,
        ) => {
          try {
            const selected = matching(filters);
            if (action === 'update') {
              selected.forEach((row) => Object.assign(row, updatePayload));
            }
            if (action === 'delete') {
              selected.forEach((row) => rows.delete(String(row.id)));
            }
            return Promise.resolve({
              data: selected.map((row) => ({ id: row.id })),
              error: null,
            }).then(resolve, reject);
          } catch (error) {
            return Promise.reject(error).then(resolve, reject);
          }
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
  it('creates and loads a project in one row', async () => {
    const { client, rows } = fakeClient();
    const repository = new SupabaseProjectRepository(client);
    const project = makeProject();
    const config = {
      ...createFallbackConfig(),
      id: project.id,
      name: project.name,
    };

    await repository.createProject(project, config);

    expect(rows.get(project.id)).toEqual(expect.objectContaining({
      id: project.id,
      owner_id: project.userId,
      name: project.name,
      config,
    }));
    await expect(repository.load(project.id)).resolves.toEqual({
      status: 'ok',
      config,
    });
  });

  it('lists, updates, and saves the single project row', async () => {
    const { client } = fakeClient();
    const repository = new SupabaseProjectRepository(client);
    const project = makeProject();
    const config = { ...createFallbackConfig(), id: project.id, name: project.name };
    await repository.createProject(project, config);

    await repository.updateProject(project.id, { description: 'Updated description' });
    await repository.save(project.id, { ...config, name: 'Updated name' });

    await expect(repository.listProjects(project.userId)).resolves.toEqual([
      expect.objectContaining({
        id: project.id,
        name: 'Updated name',
        description: 'Updated description',
      }),
    ]);
  });

  it('rejects invalid documents before writing them', async () => {
    const { client } = fakeClient();
    const repository = new SupabaseProjectRepository(client);
    const config = { ...createFallbackConfig(), id: 'project-2' };

    await expect(repository.save(
      'project-2',
      { ...config, materials: [{ id: 'broken' }] } as typeof config,
    )).rejects.toThrow('Invalid project document');
  });

  it('fails the save when the target project row no longer exists', async () => {
    const { client } = fakeClient();
    const repository = new SupabaseProjectRepository(client);
    const config = { ...createFallbackConfig(), id: 'missing-project' };

    await expect(repository.save('missing-project', config)).rejects.toThrow('未写入任何数据');
  });

  it('fails the metadata update when the target project row no longer exists', async () => {
    const { client } = fakeClient();
    const repository = new SupabaseProjectRepository(client);

    await expect(repository.updateProject('missing-project', { name: '新名称' }))
      .rejects.toThrow('更新失败');
  });

  it('hard deletes a project', async () => {
    const { client, rows } = fakeClient();
    const repository = new SupabaseProjectRepository(client);
    const project = makeProject();
    const config = { ...createFallbackConfig(), id: project.id, name: project.name };
    await repository.createProject(project, config);

    await repository.remove(project.id);

    expect(rows.has(project.id)).toBe(false);
  });
});

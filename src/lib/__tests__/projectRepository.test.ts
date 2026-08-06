import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';
import { SupabaseProjectRepository } from '@/repositories/projectRepository';
import type { Project } from '@/types/user';

type Row = Record<string, unknown>;

function fakeClient() {
  const projects = new Map<string, Row>();
  const documents = new Map<string, Row>();
  const versions: Row[] = [];

  const result = (table: string, filters: Row): Row[] => {
    const rows = table === 'projects'
      ? [...projects.values()]
      : table === 'project_documents'
        ? [...documents.values()]
        : [...versions];
    return rows.filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
  };

  const client = {
    from(table: string) {
      const filters: Row = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: (key: string, value: unknown) => { filters[key] = value; return builder; },
        is: (key: string, value: unknown) => { filters[key] = value; return builder; },
        order: async () => ({ data: result(table, filters), error: null }),
        maybeSingle: async () => ({ data: result(table, filters)[0] ?? null, error: null }),
        insert: async (payload: Row) => {
          if (table === 'projects') projects.set(String(payload.id), { ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null });
          if (table === 'project_document_versions') versions.push({ ...payload, created_at: new Date().toISOString() });
          return { data: null, error: null };
        },
        upsert: async (payload: Row) => {
          if (table === 'project_documents') documents.set(String(payload.project_id), { ...payload });
          return { data: null, error: null };
        },
        update: (payload: Row) => {
          builder.updatePayload = payload;
          return builder;
        },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
          try {
            for (const row of result(table, filters)) Object.assign(row, builder.updatePayload ?? {});
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          } catch (error) {
            return Promise.reject(error).then(resolve, reject);
          }
        },
      };
      return builder;
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  } as unknown as SupabaseClient;

  return { client, projects, documents, versions };
}

function makeProject(): Project {
  return {
    id: 'project-1',
    userId: 'user-1',
    name: 'Test project',
    description: 'Repository test',
    harnessConfigId: 'project-1',
    createdAt: 1,
    updatedAt: 1,
    status: 'draft',
  };
}

describe('SupabaseProjectRepository', () => {
  it('creates, lists, saves, and loads project documents through Supabase tables', async () => {
    const { client } = fakeClient();
    const repository = new SupabaseProjectRepository(client);
    const config = { ...createFallbackConfig(), id: 'config-1' };

    await repository.createProject(makeProject(), config);

    await expect(repository.listProjects('user-1')).resolves.toEqual([
      expect.objectContaining({ id: 'project-1', userId: 'user-1' }),
    ]);
    await expect(repository.load('project-1')).resolves.toEqual({ status: 'ok', config });
  });

  it('rejects invalid documents before writing them', async () => {
    const { client } = fakeClient();
    const repository = new SupabaseProjectRepository(client);
    const config = { ...createFallbackConfig(), id: 'config-2' };

    await expect(repository.save('project-2', { ...config, materials: [{ id: 'broken' }] } as typeof config))
      .rejects.toThrow('Invalid project document');
  });

  it('stores immutable recovery versions and soft-deletes projects', async () => {
    const { client, versions } = fakeClient();
    const repository = new SupabaseProjectRepository(client);
    const original = { ...createFallbackConfig(), id: 'config-3', name: 'Original' };
    await repository.createProject(makeProject(), original);
    await repository.save('project-1', { ...original, name: 'Current', updatedAt: Date.now() + 1 });

    const points = await repository.listRecoveryPoints('project-1');
    expect(points).toHaveLength(2);
    expect(versions).toHaveLength(2);
    await repository.remove('project-1');
    await expect(repository.listProjects('user-1')).resolves.toEqual([]);
  });
});

import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { CatalogRepository, CatalogRepositoryError } from '@/lib/catalogRepository';

function fakeClient(
  tables: Record<string, unknown[]>,
  queries: string[] = [],
  signedUrl?: string,
): SupabaseClient {
  return {
    from(table: string) {
      queries.push(table);
      let rows = [...(tables[table] ?? [])] as Array<Record<string, unknown>>;
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          rows = rows.filter((item) => item[column] === value);
          return query;
        },
        order: () => query,
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return query;
    },
    storage: {
      from: () => ({
        createSignedUrl: async () => ({
          data: signedUrl ? { signedUrl } : null,
          error: signedUrl ? null : { message: 'image unavailable' },
        }),
      }),
    },
  } as unknown as SupabaseClient;
}

const common = {
  manufacturer: '',
  resource_group: '绘图资源',
  description: '',
  image_path: null,
  sort_order: 10,
};

describe('CatalogRepository', () => {
  it('loads only dynamic catalog items and merges static business options', async () => {
    const queries: string[] = [];
    const repository = new CatalogRepository(fakeClient({ catalog_items: [] }, queries));

    const snapshot = await repository.loadSnapshot();

    expect(queries).toEqual(['catalog_items', 'catalog_items', 'catalog_items']);
    expect(snapshot.wireColors).toHaveLength(14);
    expect(snapshot.leadTimeOptions.map((option) => option.id))
      .toEqual(['rush', 'standard', 'economy']);
    expect(snapshot).not.toHaveProperty('wireTypes');
    expect(snapshot).not.toHaveProperty('wireGauges');
  });

  it('loads wire catalog specs from a unified catalog item', async () => {
    const repository = new CatalogRepository(fakeClient({
      catalog_items: [{
        id: 'wire-1',
        kind: 'wire',
        code: 'ul1007-red-24',
        name: 'UL1007 24AWG 红线',
        model: 'UL1007-24-RED',
        ...common,
        spec: { kind: 'electronic', awg: 24, ulNumber: '1007', conductorColor: 'red' },
      }],
    }));

    await expect(repository.listWires()).resolves.toEqual([expect.objectContaining({
      id: 'ul1007-red-24',
      resourceItemId: 'wire-1',
      name: 'UL1007 24AWG 红线',
      spec: { kind: 'electronic', awg: 24, ulNumber: '1007', color: 'red' },
    })]);
  });

  it('signs an item image without dropping the catalog item on failure', async () => {
    const row = {
      id: 'connector-1',
      kind: 'connector',
      code: 'xh254-4p-f',
      name: 'XH2.54-4P',
      model: 'XH2.54-4P-F',
      ...common,
      image_path: 'connector/xh254.png',
      spec: { connectorType: 'female', pinCount: 4, pinLabels: ['1', '2', '3', '4'] },
    };
    const signed = new CatalogRepository(fakeClient({ catalog_items: [row] }, [], 'https://assets.example/xh254.png'));
    const failed = new CatalogRepository(fakeClient({ catalog_items: [row] }));

    await expect(signed.listConnectors()).resolves.toEqual([
      expect.objectContaining({ image: 'https://assets.example/xh254.png' }),
    ]);
    await expect(failed.listConnectors()).resolves.toEqual([
      expect.objectContaining({ id: 'xh254-4p-f', image: undefined }),
    ]);
  });

  it('rejects a wire resource without a valid spec', async () => {
    const repository = new CatalogRepository(fakeClient({
      catalog_items: [{
        id: 'wire-2',
        kind: 'wire',
        code: 'invalid',
        name: 'invalid',
        model: 'INVALID',
        ...common,
        spec: {},
      }],
    }));

    await expect(repository.listWires()).rejects.toThrow(CatalogRepositoryError);
  });
});

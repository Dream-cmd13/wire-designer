import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { CatalogRepository, CatalogRepositoryError } from '@/lib/catalogRepository';

function fakeClient(tables: Record<string, unknown[]>): SupabaseClient {
  return {
    from(table: string) {
      const result = Promise.resolve({ data: tables[table] ?? [], error: null });
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        order: () => query,
        then: result.then.bind(result),
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

describe('CatalogRepository wire catalog', () => {
  it('loads wire catalog specs with name and image', async () => {
    const repository = new CatalogRepository(fakeClient({
      resource_items: [{
        id: 'wire-1', legacy_key: 'ul1007-red-24', resource_name: 'UL1007 24AWG 红线',
        wires: {
          wire_kind: 'electronic', awg: 24, ul_number: '1007', conductor_color: 'red',
          jacket_material: null, jacket_color: null, core_count: null, is_shielded: false, core_colors: [],
        },
        resource_item_images: [], lifecycle_status: 'active', deleted_at: null,
      }],
    }));

    await expect(repository.listWires()).resolves.toEqual([expect.objectContaining({
      resourceItemId: 'wire-1', name: 'UL1007 24AWG 红线',
      spec: { kind: 'electronic', awg: 24, ulNumber: '1007', color: 'red' },
    })]);
  });

  it('rejects an active wire resource without a valid wire spec', async () => {
    const repository = new CatalogRepository(fakeClient({
      resource_items: [{ id: 'wire-2', resource_name: 'invalid', wires: null, resource_item_images: [] }],
    }));

    await expect(repository.listWires()).rejects.toThrow(CatalogRepositoryError);
  });
});

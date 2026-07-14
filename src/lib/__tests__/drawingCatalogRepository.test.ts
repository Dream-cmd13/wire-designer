import { describe, expect, it } from 'vitest';
import { DrawingCatalogError, DrawingCatalogRepository } from '@/lib/drawingCatalogRepository';

function fakeClient(tables: Record<string, unknown[]>, errors: Record<string, string> = {}) {
  return {
    from(table: string) {
      return {
        select: async () => ({ data: tables[table] ?? null, error: errors[table] ? { message: errors[table] } : null }),
      };
    },
  };
}

const connectorRow = {
  id: 'catalog-1', legacy_key: 'xh254-4p-f', item_type: 'connector', resource_name: 'XH2.54-4P', model: 'XH2.54-4P-F',
  short_description: '4PIN单排母头', display_order: 1, lifecycle_status: 'active', deleted_at: null,
  catalog_categories: { name: '线对板连接器' },
  connector_specs: { connector_type: 'female', series: 'XH2.54', pin_count: 4, row_count: 1, pitch_mm: 2.54 },
  catalog_item_images: [],
};

describe('DrawingCatalogRepository', () => {
  it('maps and applies all connector filters', async () => {
    const repository = new DrawingCatalogRepository(fakeClient({ catalog_items: [connectorRow] }));
    const rows = await repository.listResources({
      resourceType: 'connector', query: 'xh2.54', gender: 'female', pinCount: 4,
      rowCount: 1, pitchMm: 2.54, category: '线对板连接器', series: 'XH2.54',
    });
    expect(rows).toEqual([expect.objectContaining({
      id: 'xh254-4p-f', catalogItemId: 'catalog-1', name: 'XH2.54-4P',
      resourceType: 'connector', gender: 'female', pinCount: 4, rowCount: 1, pitchMm: 2.54,
    })]);
  });

  it('throws a stable catalog error when Supabase fails', async () => {
    const repository = new DrawingCatalogRepository(fakeClient({}, { catalog_items: 'network unavailable' }));
    await expect(repository.listResources({})).rejects.toEqual(expect.objectContaining<Partial<DrawingCatalogError>>({ message: 'network unavailable' }));
  });

  it('returns empty results and validates template schema version', async () => {
    const empty = new DrawingCatalogRepository(fakeClient({ catalog_items: [] }));
    await expect(empty.listResources({})).resolves.toEqual([]);

    const invalid = new DrawingCatalogRepository(fakeClient({ drawing_template_versions: [{ template_id: 't1', version_no: 1, schema_version: 2, drawing_json: {} }] }));
    await expect(invalid.loadTemplate('t1')).rejects.toThrow('模板版本不受支持');
  });
});

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
  id: 'catalog-1', legacy_key: 'xh254-4p-f', resource_type: 'connector', resource_name: 'XH2.54-4P', model: 'XH2.54-4P-F',
  short_description: '4PIN单排母头', display_order: 1, lifecycle_status: 'active', deleted_at: null,
  resource_group: '线对板连接器',
  connectors: { connector_type: 'female', series: 'XH2.54', pin_count: 4, row_count: 1, pitch_mm: 2.54 },
  resource_item_images: [],
};

describe('DrawingCatalogRepository', () => {
  it('maps and applies all connector filters', async () => {
    const repository = new DrawingCatalogRepository(fakeClient({ resource_items: [connectorRow] }));
    const rows = await repository.listResources({
      resourceType: 'connector', query: 'xh2.54', gender: 'female', pinCount: 4,
      rowCount: 1, pitchMm: 2.54, resourceGroup: '线对板连接器', series: 'XH2.54',
    });
    expect(rows).toEqual([expect.objectContaining({
      id: 'xh254-4p-f', resourceItemId: 'catalog-1', name: 'XH2.54-4P',
      resourceType: 'connector', gender: 'female', pinCount: 4, rowCount: 1, pitchMm: 2.54,
    })]);
  });

  it('maps wire_kind as the drawing resource specification', async () => {
    const repository = new DrawingCatalogRepository(fakeClient({
      resource_items: [{
        id: 'wire-1', legacy_key: 'shielded-4c', resource_type: 'wire',
        resource_name: '4芯屏蔽线', model: 'SHIELD-4C', resource_group: '绘图线材',
        short_description: '', display_order: 1, lifecycle_status: 'active', deleted_at: null,
        wires: { wire_kind: 'jacketed' }, resource_item_images: [],
      }],
    }));

    await expect(repository.listResources({ resourceType: 'wire' })).resolves.toEqual([
      expect.objectContaining({ resourceType: 'wire', specification: 'jacketed' }),
    ]);
  });

  it('maps only active heat-shrink protective sleeves', async () => {
    const repository = new DrawingCatalogRepository(fakeClient({
      resource_items: [
        {
          id: 'sleeve-1', legacy_key: 'heat-shrink-6', resource_type: 'protective_sleeve',
          resource_name: 'Φ6热缩套管', model: 'HS-6MM', resource_group: '绘图辅材',
          lifecycle_status: 'active', deleted_at: null,
          protective_sleeves: {
            material: 'polyolefin', color: 'black', sleeve_type: 'heat-shrink', shrink_ratio: 2,
            nominal_length_m: 1, inner_diameter_as_supplied_mm: 6,
            inner_diameter_recovered_mm: 3, recovered_wall_thickness_mm: 0.55,
          },
          resource_item_images: [],
        },
        {
          id: 'sleeve-2', legacy_key: 'braided-6', resource_type: 'protective_sleeve',
          resource_name: '编织套管', model: 'BRAID-6', resource_group: '绘图辅材',
          lifecycle_status: 'active', deleted_at: null,
          protective_sleeves: { sleeve_type: 'braided' }, resource_item_images: [],
        },
        {
          id: 'sleeve-3', legacy_key: 'inactive-6', resource_type: 'protective_sleeve',
          resource_name: '停用热缩套管', model: 'HS-INACTIVE', resource_group: '绘图辅材',
          lifecycle_status: 'inactive', deleted_at: null,
          protective_sleeves: { sleeve_type: 'heat-shrink' }, resource_item_images: [],
        },
        {
          id: 'sleeve-4', legacy_key: 'deleted-6', resource_type: 'protective_sleeve',
          resource_name: '已删除热缩套管', model: 'HS-DELETED', resource_group: '绘图辅材',
          lifecycle_status: 'active', deleted_at: '2026-08-17T00:00:00Z',
          protective_sleeves: { sleeve_type: 'heat-shrink' }, resource_item_images: [],
        },
      ],
    }));

    await expect(repository.listResources({ resourceType: 'protective_sleeve' })).resolves.toEqual([
      expect.objectContaining({
        resourceItemId: 'sleeve-1', resourceType: 'protective_sleeve', model: 'HS-6MM',
        specification: 'Φ6mm · 2:1 · polyolefin · black', unit: 'PCS',
      }),
    ]);
  });

  it('throws a stable catalog error when Supabase fails', async () => {
    const repository = new DrawingCatalogRepository(fakeClient({}, { resource_items: 'network unavailable' }));
    await expect(repository.listResources({})).rejects.toEqual(expect.objectContaining<Partial<DrawingCatalogError>>({ message: 'network unavailable' }));
  });

  it('signs catalog image storage paths without blocking resource data', async () => {
    const repository = new DrawingCatalogRepository({
      ...fakeClient({
        resource_items: [{
          ...connectorRow,
          resource_item_images: [{ storage_path: 'connectors/xh254.png', is_primary: true }],
        }],
      }),
      storage: {
        from: (bucket: string) => ({
          createSignedUrl: async (path: string) => ({
            data: { signedUrl: `https://assets.example/${bucket}/${path}` },
            error: null,
          }),
        }),
      },
    });

    await expect(repository.listResources()).resolves.toEqual([
      expect.objectContaining({ imageUrl: 'https://assets.example/catalog-assets/connectors/xh254.png' }),
    ]);

    const failedSigning = new DrawingCatalogRepository({
      ...fakeClient({ resource_items: [{ ...connectorRow, resource_item_images: [{ storage_path: 'connectors/xh254.png', is_primary: true }] }] }),
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: { message: 'image unavailable' } }) }) },
    });
    await expect(failedSigning.listResources()).resolves.toEqual([
      expect.objectContaining({ imageError: 'image unavailable' }),
    ]);
  });

  it('returns empty results and validates template schema version', async () => {
    const empty = new DrawingCatalogRepository(fakeClient({ resource_items: [] }));
    await expect(empty.listResources({})).resolves.toEqual([]);

    const invalid = new DrawingCatalogRepository(fakeClient({ drawing_template_versions: [{ template_id: 't1', version_no: 1, schema_version: 2, drawing_json: {} }] }));
    await expect(invalid.loadTemplate('t1')).rejects.toThrow('模板版本不受支持');

    const malformed = new DrawingCatalogRepository(fakeClient({ drawing_template_versions: [{ template_id: 't2', version_no: 1, schema_version: 1, drawing_json: { schemaVersion: 1, id: 'bad', name: 'bad', page: { width: 1200, height: 800 }, titleBlock: { title: 'bad' }, objects: [null] } }] }));
    await expect(malformed.loadTemplate('t2')).rejects.toThrow('模板版本不受支持');

    const unsafeTable = new DrawingCatalogRepository(fakeClient({ drawing_template_versions: [{ template_id: 't3', version_no: 1, schema_version: 1, drawing_json: { schemaVersion: 1, id: 'bad-table', name: 'bad', createdAt: 1, updatedAt: 1, page: { size: 'A4', orientation: 'landscape', width: 1200, height: 800 }, titleBlock: { title: 'bad', drawingNo: 'D-1', revision: 'A' }, revisionTable: [], techRequirements: [], objects: [{ id: 'table', kind: 'table', x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 1, locked: false, visible: true, style: { fill: '#fff', stroke: '#000', strokeWidth: 1, fontSize: 12, color: '#000' }, title: 'bad', columns: ['value'], rows: [{ value: 42 }] }] } }] }));
    await expect(unsafeTable.loadTemplate('t3')).rejects.toThrow('模板版本不受支持');
  });
});

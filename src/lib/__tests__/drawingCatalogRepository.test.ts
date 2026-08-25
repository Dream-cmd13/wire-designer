import { describe, expect, it } from 'vitest';
import { DrawingCatalogError, DrawingCatalogRepository } from '@/lib/drawingCatalogRepository';

function fakeClient(
  tables: Record<string, unknown[]>,
  errors: Record<string, string> = {},
  queries: string[] = [],
) {
  return {
    from(table: string) {
      queries.push(table);
      return {
        select: async () => ({
          data: tables[table] ?? null,
          error: errors[table] ? { message: errors[table] } : null,
        }),
      };
    },
  };
}

const common = {
  manufacturer: '',
  description: '',
  image_path: null,
  image_variants: {},
  sort_order: 10,
};

const connectorRow = {
  id: 'catalog-1',
  kind: 'connector',
  code: 'xh254-4p-f',
  name: 'XH2.54-4P',
  model: 'XH2.54-4P-F',
  resource_group: '线对板连接器',
  ...common,
  spec: {
    connectorType: 'female',
    series: 'XH2.54',
    pinCount: 4,
    rowCount: 1,
    pitchMm: 2.54,
    pinLabels: ['1', '2', '3', '4'],
  },
};

describe('DrawingCatalogRepository', () => {
  it('keeps static drawing resources available without Supabase', async () => {
    const repository = new DrawingCatalogRepository(null);

    await expect(repository.listTemplates()).resolves.toHaveLength(2);
    await expect(repository.listCommonPhrases()).resolves.toHaveLength(3);
    await expect(repository.listIcons()).resolves.toHaveLength(4);
    await expect(repository.listResources()).rejects.toThrow('Supabase 尚未配置');
  });

  it('loads templates, phrases, and icons without querying Supabase', async () => {
    const queries: string[] = [];
    const repository = new DrawingCatalogRepository(fakeClient({}, {}, queries));

    await expect(repository.listTemplates()).resolves.toHaveLength(2);
    await expect(repository.loadTemplate('template-single')).resolves.toEqual(
      expect.objectContaining({ id: 'template-single', name: '单头普通电子线模板' }),
    );
    await expect(repository.listCommonPhrases()).resolves.toHaveLength(3);
    await expect(repository.listIcons()).resolves.toHaveLength(4);
    await expect(repository.loadTemplate('missing')).rejects.toThrow('未找到图库模板');
    expect(queries).toEqual([]);
  });

  it('maps and applies all connector filters', async () => {
    const repository = new DrawingCatalogRepository(fakeClient({ catalog_items: [connectorRow] }));
    const rows = await repository.listResources({
      resourceType: 'connector',
      query: 'xh2.54',
      gender: 'female',
      pinCount: 4,
      rowCount: 1,
      pitchMm: 2.54,
      resourceGroup: '线对板连接器',
      series: 'XH2.54',
    });

    expect(rows).toEqual([expect.objectContaining({
      id: 'xh254-4p-f',
      resourceItemId: 'catalog-1',
      name: 'XH2.54-4P',
      resourceType: 'connector',
      gender: 'female',
      pinCount: 4,
      rowCount: 1,
      pitchMm: 2.54,
    })]);
  });

  it('maps wire kind as the drawing resource specification', async () => {
    const repository = new DrawingCatalogRepository(fakeClient({
      catalog_items: [{
        id: 'wire-1',
        kind: 'wire',
        code: 'shielded-4c',
        name: '4芯屏蔽线',
        model: 'SHIELD-4C',
        resource_group: '绘图线材',
        ...common,
        spec: {
          kind: 'jacketed',
          awg: 24,
          ulNumber: 'UL20276',
          jacketMaterial: 'PVC',
          jacketColor: 'black',
          coreCount: 4,
          shielded: true,
          coreColors: ['red', 'black', 'white', 'green'],
        },
      }],
    }));

    await expect(repository.listResources({ resourceType: 'wire' })).resolves.toEqual([
      expect.objectContaining({ resourceType: 'wire', specification: 'jacketed' }),
    ]);
  });

  it('maps only heat-shrink protective sleeves', async () => {
    const repository = new DrawingCatalogRepository(fakeClient({
      catalog_items: [
        {
          id: 'sleeve-1',
          kind: 'protective_sleeve',
          code: 'heat-shrink-6',
          name: 'Φ6热缩套管',
          model: 'HS-6MM',
          resource_group: '绘图辅材',
          ...common,
          spec: {
            sleeveType: 'heat-shrink',
            material: 'polyolefin',
            color: 'black',
            shrinkRatio: 2,
            suppliedInnerDiameterMm: 6,
          },
        },
        {
          id: 'sleeve-2',
          kind: 'protective_sleeve',
          code: 'braided-6',
          name: '编织套管',
          model: 'BRAID-6',
          resource_group: '绘图辅材',
          ...common,
          spec: { sleeveType: 'braided' },
        },
      ],
    }));

    await expect(repository.listResources({ resourceType: 'protective_sleeve' })).resolves.toEqual([
      expect.objectContaining({
        resourceItemId: 'sleeve-1',
        resourceType: 'protective_sleeve',
        model: 'HS-6MM',
        specification: 'Φ6mm · 2:1 · polyolefin · black',
        unit: 'PCS',
      }),
    ]);
  });

  it('throws a stable catalog error when Supabase fails', async () => {
    const repository = new DrawingCatalogRepository(
      fakeClient({}, { catalog_items: 'network unavailable' }),
    );
    await expect(repository.listResources({})).rejects.toEqual(
      expect.objectContaining<Partial<DrawingCatalogError>>({ message: 'network unavailable' }),
    );
  });

  it('signs catalog image paths without blocking resource data', async () => {
    const row = { ...connectorRow, image_path: 'connectors/xh254.png' };
    const repository = new DrawingCatalogRepository({
      ...fakeClient({ catalog_items: [row] }),
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
      expect.objectContaining({
        imageUrl: 'https://assets.example/catalog-assets/connectors/xh254.png',
      }),
    ]);

    const failedSigning = new DrawingCatalogRepository({
      ...fakeClient({ catalog_items: [row] }),
      storage: {
        from: () => ({
          createSignedUrl: async () => ({
            data: null,
            error: { message: 'image unavailable' },
          }),
        }),
      },
    });
    await expect(failedSigning.listResources()).resolves.toEqual([
      expect.objectContaining({ imageError: 'image unavailable' }),
    ]);
  });

  it('returns empty resource results', async () => {
    const repository = new DrawingCatalogRepository(fakeClient({ catalog_items: [] }));
    await expect(repository.listResources({})).resolves.toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  DrawingMaterialRepository,
  type DrawingMaterialCatalogGateway,
} from '@/lib/drawingMaterialRepository';
import type { CatalogItemInsert, CatalogItemRow } from '@/lib/catalogItem';

function accessory(overrides: Partial<Extract<CatalogItemRow, { kind: 'accessory' }>> = {}) {
  return {
    id: '1',
    kind: 'accessory',
    code: 'm-01',
    name: '插座',
    model: 'M-01',
    manufacturer: '',
    resource_group: '绘图辅材',
    description: '主件',
    image_path: null,
    sort_order: 10,
    spec: { specification: 'C20', unit: 'PCS' },
    ...overrides,
  } satisfies Extract<CatalogItemRow, { kind: 'accessory' }>;
}

function fakeGateway() {
  const inserted: CatalogItemInsert[] = [];
  const gateway: DrawingMaterialCatalogGateway = {
    async list() {
      return [accessory()];
    },
    async insert(input) {
      inserted.push(input);
      return accessory({
        id: 'new-id',
        code: input.code,
        name: input.name,
        model: input.model,
        description: input.description,
        spec: input.spec as { specification: string; unit: string },
      });
    },
  };
  return { inserted, gateway };
}

describe('drawing material repository', () => {
  it('lists company materials and searches all visible fields', async () => {
    const { gateway } = fakeGateway();
    const repository = new DrawingMaterialRepository(gateway);

    expect(await repository.list('C20')).toEqual([{
      id: '1',
      code: 'M-01',
      nameAndSpecification: '插座 / C20',
      unit: 'PCS',
      note: '主件',
    }]);
    expect(await repository.list('主件')).toHaveLength(1);
    expect(await repository.list('missing')).toEqual([]);
  });

  it('creates a company material with one atomic catalog insert', async () => {
    const { inserted, gateway } = fakeGateway();
    const repository = new DrawingMaterialRepository(gateway);

    const created = await repository.create({
      code: 'M-02',
      nameAndSpecification: '端子 2.8',
      unit: 'PCS',
      note: '压接件',
    });

    expect(created).toMatchObject({
      id: 'new-id',
      code: 'M-02',
      nameAndSpecification: '端子 2.8',
      unit: 'PCS',
      note: '压接件',
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toEqual(expect.objectContaining({
      kind: 'accessory',
      name: '端子 2.8',
      model: 'M-02',
      resource_group: '绘图辅材',
      description: '压接件',
      spec: { specification: '端子 2.8', unit: 'PCS' },
    }));
  });
});

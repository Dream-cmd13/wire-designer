import { describe, expect, it } from 'vitest';
import { DrawingMaterialRepository, type DrawingMaterialCatalogGateway } from '@/lib/drawingMaterialRepository';

function fakeGateway() {
  const calls: string[] = [];
  const gateway: DrawingMaterialCatalogGateway = {
    async listActive() {
      calls.push('list');
      return [
        { id: '1', model: 'M-01', resource_name: '插座', short_description: '主件', lifecycle_status: 'active', deleted_at: null, accessory_specs: { specification: 'C20', unit: 'PCS' } },
        { id: '2', model: 'OLD', resource_name: '旧物料', short_description: '', lifecycle_status: 'inactive', deleted_at: null, accessory_specs: { specification: '旧规格', unit: 'PCS' } },
      ];
    },
    async insertDraft(input) { calls.push(`draft:${input.model}:${input.resourceName}:${input.note}`); return 'new-id'; },
    async insertSpecification(id, input) { calls.push(`spec:${id}:${input.specification}:${input.unit}`); },
    async activate(id) { calls.push(`active:${id}`); },
  };
  return { calls, gateway };
}

describe('drawing material repository', () => {
  it('lists active company materials and searches all visible fields', async () => {
    const { gateway } = fakeGateway();
    const repository = new DrawingMaterialRepository(gateway);

    expect(await repository.list('C20')).toEqual([{ id: '1', code: 'M-01', nameAndSpecification: '插座 / C20', unit: 'PCS', note: '主件' }]);
    expect(await repository.list('主件')).toHaveLength(1);
    expect(await repository.list('OLD')).toEqual([]);
  });

  it('creates a draft, its specification, then activates the company material', async () => {
    const { calls, gateway } = fakeGateway();
    const repository = new DrawingMaterialRepository(gateway);

    const created = await repository.create({ code: 'M-02', nameAndSpecification: '端子 2.8', unit: 'PCS', note: '压接件' });

    expect(created).toMatchObject({ id: 'new-id', code: 'M-02', nameAndSpecification: '端子 2.8', unit: 'PCS', note: '压接件' });
    expect(calls).toEqual([
      'draft:M-02:端子 2.8:压接件',
      'spec:new-id:端子 2.8:PCS',
      'active:new-id',
    ]);
  });
});

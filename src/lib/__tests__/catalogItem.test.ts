import { describe, expect, it } from 'vitest';
import { CatalogItemError, parseCatalogItemRow } from '@/lib/catalogItem';

const connectorRow = {
  id: '1',
  kind: 'connector',
  code: 'xh254-4p-f',
  name: 'XH2.54-4P',
  model: 'XH2.54-4P-F',
  manufacturer: '',
  resource_group: '绘图连接器',
  description: '',
  image_path: null,
  image_variants: {},
  sort_order: 10,
  spec: {
    connectorType: 'female',
    pinCount: 4,
    pinLabels: ['1', '2', '3', '4'],
  },
};

describe('parseCatalogItemRow', () => {
  it('accepts a connector with a typed and isolated spec', () => {
    const parsed = parseCatalogItemRow(connectorRow);

    expect(parsed).toEqual(expect.objectContaining({
      kind: 'connector',
      code: 'xh254-4p-f',
    }));
    expect(parsed.spec).not.toBe(connectorRow.spec);
  });

  it('accepts an overmold with outerForm and optional innerMold spec', () => {
    const parsed = parseCatalogItemRow({
      id: 'om-1',
      kind: 'overmold',
      code: 'pvc-straight',
      name: 'PVC 45P 直头',
      model: 'PVC-45P-S',
      manufacturer: '',
      resource_group: '外模',
      description: '',
      image_path: null,
      sort_order: 1,
      spec: {
        outerMaterial: '黑色PVC',
        outerHardness: '45P',
        outerForm: 'straight',
        innerMaterial: '低密度透明PE',
        innerForm: 'straight',
      },
    });

    expect(parsed).toEqual(expect.objectContaining({
      kind: 'overmold',
      code: 'pvc-straight',
    }));
    expect(parsed.spec).toEqual({
      outerMaterial: '黑色PVC',
      outerHardness: '45P',
      outerForm: 'straight',
      innerMaterial: '低密度透明PE',
      innerForm: 'straight',
    });
  });

  it('accepts a TPE overmold without inner mold metadata', () => {
    const parsed = parseCatalogItemRow({
      id: 'om-2',
      kind: 'overmold',
      code: 'tpe-bent',
      name: 'TPE 弯头',
      model: 'TPE-BENT',
      manufacturer: '',
      resource_group: '外模',
      description: '',
      image_path: null,
      sort_order: 2,
      spec: {
        outerMaterial: '黑色TPE',
        outerForm: 'bent',
      },
    });

    expect(parsed.spec).toEqual({
      outerMaterial: '黑色TPE',
      outerForm: 'bent',
    });
  });

  it.each([
    { kind: 'unknown', spec: {} },
    { kind: 'connector', spec: { connectorType: 'female', pinCount: 0, pinLabels: [] } },
    { kind: 'wire', spec: { kind: 'jacketed', awg: 24, coreCount: 4, coreColors: [] } },
    { kind: 'overmold', spec: { outerMaterial: 'PVC', outerHardness: '45P', outerForm: 'straight' } },
    { kind: 'overmold', spec: { outerMaterial: '黑色PVC', outerHardness: '45P' } },
    { kind: 'overmold', spec: { outerMaterial: '黑色PVC', outerHardness: '40P', outerForm: 'straight' } },
    { kind: 'overmold', spec: { outerMaterial: '黑色TPE', outerHardness: '45P', outerForm: 'straight' } },
    { kind: 'overmold', spec: { outerMaterial: '黑色TPE', outerForm: 'invalid' } },
    { kind: 'overmold', spec: { outerMaterial: '黑色TPE', outerForm: 'straight', innerMaterial: 'PE', innerForm: 'straight' } },
    { kind: 'overmold', spec: { outerMaterial: '黑色TPE', outerForm: 'straight', innerForm: 'straight' } },
    { kind: 'overmold', spec: { outerMaterial: '黑色TPE', outerForm: 'straight', innerMaterial: '低密度透明PE', innerForm: 'bent' } },
    { kind: 'overmold', spec: { outerMaterial: '黑色TPE', outerForm: 'straight', innerMaterialOptional: true } },
  ])('rejects invalid catalog data %#', (patch) => {
    expect(() => parseCatalogItemRow({
      id: '1',
      code: 'bad',
      name: 'bad',
      model: 'bad',
      manufacturer: '',
      resource_group: '',
      description: '',
      image_path: null,
      sort_order: 0,
      ...patch,
    })).toThrow(CatalogItemError);
  });
});

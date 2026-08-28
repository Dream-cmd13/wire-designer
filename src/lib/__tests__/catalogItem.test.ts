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

  it('preserves real connector engineering attributes', () => {
    const parsed = parseCatalogItemRow({
      ...connectorRow,
      code: 'm12a04-07-068',
      model: 'M12A04-07-068',
      spec: {
        connectorType: 'male',
        series: 'M12 A-Coded',
        pinCount: 4,
        rowCount: 1,
        pinLabels: ['1', '2', '3', '4'],
        shielded: true,
        ratedVoltageV: 60,
        ratedCurrentA: 4,
        temperatureRangeC: { min: -40, max: 105 },
        ingressProtection: 'IP67',
        flammabilityRating: 'UL94V-0',
        matingCyclesMin: 500,
      },
    });

    expect(parsed.spec).toMatchObject({
      shielded: true,
      ratedVoltageV: 60,
      ratedCurrentA: 4,
      temperatureRangeC: { min: -40, max: 105 },
      ingressProtection: 'IP67',
      flammabilityRating: 'UL94V-0',
      matingCyclesMin: 500,
    });
  });

  it('preserves real wire engineering attributes and source conflict text', () => {
    const parsed = parseCatalogItemRow({
      id: 'wire-real',
      kind: 'wire',
      code: 'wl-htx-pvc-034',
      name: 'WL-HTX-PVC-034',
      model: 'WL-HTX-PVC-034',
      manufacturer: '',
      resource_group: '护套线',
      description: '',
      image_path: null,
      image_variants: {},
      sort_order: 1,
      spec: {
        kind: 'jacketed',
        ulNumber: 'UL2464',
        awg: 22,
        coreCount: 5,
        shielded: true,
        coreColors: ['棕色', '白色', '蓝色', '黑色', '灰色'],
        coreColorDescription: '棕白蓝黑灰',
        jacketMaterial: 'PVC',
        jacketColor: 'black',
        ratedVoltageV: 300,
        temperatureRangeC: { max: 80 },
        flameTest: 'VW-1',
        rohsCompliant: true,
        conductorMaterial: '镀锡铜丝',
        conductorStructure: '17/0.16TC',
        insulationMaterial: 'PVC',
        insulationDiameterMm: 1.3,
        insulationDiameterToleranceMm: 0.05,
        braidStructure: '16*5/0.10TC',
        braidStructureDescription: 'B16/6/0.10TC',
        shieldCoverageRatio: 0.6,
        shieldCoverageDescription: '65%',
        jacketHardnessP: 60,
        outerDiameterMm: 5.5,
        outerDiameterToleranceMm: 0.2,
        tensileStrengthPsi: 1500,
        elongationPercent: 100,
        conductorResistanceOhmPerKmAt20C: 59.4,
        insulationResistanceMOhmKm: 10,
      },
    });

    expect(parsed.spec).toMatchObject({
      kind: 'jacketed',
      outerDiameterMm: 5.5,
      shieldCoverageRatio: 0.6,
      shieldCoverageDescription: '65%',
      braidStructureDescription: 'B16/6/0.10TC',
      coreColors: ['棕色', '白色', '蓝色', '黑色', '灰色'],
    });
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
    { kind: 'connector', spec: { connectorType: 'female', pinCount: 2.5, pinLabels: ['1', '2'] } },
    { kind: 'connector', spec: { connectorType: 'female', pinCount: 2, pinLabels: ['1', '2'], temperatureRangeC: { min: 80, max: 20 } } },
    { kind: 'connector', spec: { connectorType: 'female', pinCount: 2, pinLabels: ['1', '2'], matingCyclesMin: 2.5 } },
    { kind: 'wire', spec: { kind: 'jacketed', awg: 24, coreCount: 4, coreColors: [] } },
    { kind: 'wire', spec: { kind: 'jacketed', awg: 24, coreCount: 4, shielded: false, coreColors: ['red', 'black', 'white', 'green'], temperatureRangeC: { min: 80, max: 20 } } },
    { kind: 'wire', spec: { kind: 'jacketed', awg: 24, coreCount: 4, shielded: false, coreColors: ['red', 'black', 'white', 'green'], outerDiameterMm: 0 } },
    { kind: 'wire', spec: { kind: 'jacketed', awg: 24, coreCount: 4, shielded: false, coreColors: ['red', 'black', 'white', 'green'], outerDiameterToleranceMm: -0.1 } },
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

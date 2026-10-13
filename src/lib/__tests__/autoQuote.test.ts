import { describe, expect, it } from 'vitest';
import {
  buildAutoQuoteConfig,
  isSupportedConnector,
  isSupportedOvermold,
  DEFAULT_AUTO_QUOTE_FORM,
  deriveAutoQuoteSelection,
  type AutoQuoteFormState,
} from '@/lib/autoQuote';
import { getQuoteMaterials } from '@/lib/quoteMaterials';
import type { CatalogSnapshot } from '@/types/catalog';
import type { OvermoldSpec } from '@/types/harness';
import type { MaterialPrice } from '@/repositories/priceRepository';
import { calculatePrice } from '../../../server/pricing';
import { parseHarnessConfig } from '@/lib/harnessConfigSchema';
// Exercise form construction together with the authoritative server calculator.
function evaluateAutoQuote(form: AutoQuoteFormState, prices: MaterialPrice[], catalog: CatalogSnapshot) {
  const built = buildAutoQuoteConfig(form, catalog);
  if (!built.config) return { ...built, status: 'incomplete', price: undefined };
  const result = calculatePrice(built.config, prices, catalog);
  return result.status === 'ready' ? { ...built, ...result, issues: [] } : { ...built, ...result, price: undefined };
}

/** 模拟迁移前遗留的 TPE 目录记录；类型已收紧，仅用于负向验证运行时拒绝。 */
function legacyTpeOvermold(): OvermoldSpec {
  return {
    id: 'mold-tpe-legacy',
    resourceItemId: 'res-mold-tpe-legacy',
    name: 'M12外模 TPE',
    outerMaterial: '黑色TPE',
    outerForm: 'straight',
  } as unknown as OvermoldSpec;
}

const mockCatalog: CatalogSnapshot = {
  connectors: [
    {
      id: 'conn-m12',
      resourceItemId: 'res-conn-m12',
      name: 'M12-4Pin-公头',
      series: 'M12',
      pinCount: 4,
      shielded: true,
      type: 'male',
      pinLabels: ['1', '2', '3', '4'],
    },
    {
      id: 'conn-m8',
      resourceItemId: 'res-conn-m8',
      name: 'M8-4Pin-母头',
      series: 'M8',
      pinCount: 4,
      shielded: true,
      type: 'female',
      pinLabels: ['1', '2', '3', '4'],
    },
    {
      id: 'conn-db9',
      resourceItemId: 'res-conn-db9',
      name: 'DB9串口',
      series: 'D-SUB',
      pinCount: 9,
      type: 'male',
      pinLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    },
  ],
  wires: [
    {
      id: 'wire-cat-1',
      resourceItemId: 'res-wire-1',
      name: 'UL2464 24AWG 4芯黑色护套线',
      model: 'UL2464',
      spec: {
        kind: 'jacketed',
        awg: 24,
        coreCount: 4,
        jacketMaterial: 'PVC',
        jacketColor: 'black',
        shielded: true,
        coreColors: ['黑色', '棕色', '蓝色', '白色'],
        outerDiameterMm: 5.0,
      },
    },
  ],
  overmolds: [
    {
      id: 'mold-pvc-1',
      resourceItemId: 'res-mold-1',
      name: 'M12外模 直头 黑色PVC 45P',
      outerMaterial: '黑色PVC',
      outerHardness: '45P',
      outerForm: 'straight',
      innerMaterial: '低密度透明PE',
      innerForm: 'straight',
    },
    {
      id: 'mold-pvc-2',
      resourceItemId: 'res-mold-2',
      name: 'M12外模 弯头 黑色PVC 45P',
      outerMaterial: '黑色PVC',
      outerHardness: '45P',
      outerForm: 'bent',
      innerMaterial: '低密度透明PE',
      innerForm: 'bent',
    },
  ],
  wireColors: [],
  protectionOptions: [],
  leadTimeOptions: [],
  pricingRules: [],
  quantityDiscountRules: [],
  loadedAt: Date.now(),
};

function createPrices(config: NonNullable<ReturnType<typeof buildAutoQuoteConfig>['config']>): MaterialPrice[] {
  return getQuoteMaterials(config, mockCatalog).map((row) => ({
    ...row,
    lengthMm: row.lengthMm,
    taxIncludedPrice: row.kind === 'wire' ? '4.50' : row.kind === 'connector' ? '2.80' : row.kind === 'inner-mold' ? '0.30' : '1.20',
  }));
}

describe('autoQuote', () => {
  it.each([true, false])('filters B and cable choices by A and preserves valid selections (shielded=%s)', (shielded) => {
    const wire = mockCatalog.wires[0];
    if (wire.spec.kind !== 'jacketed') throw new Error('Expected jacketed fixture');
    const catalog: CatalogSnapshot = {
      ...mockCatalog,
      connectors: [
        { ...mockCatalog.connectors[0], shielded },
        { ...mockCatalog.connectors[1], shielded },
        { ...mockCatalog.connectors[1], id: 'wrong-pins', pinCount: 5, shielded },
        { ...mockCatalog.connectors[1], id: 'wrong-shield', shielded: !shielded },
      ],
      wires: [
        { ...wire, spec: { ...wire.spec, shielded } },
        { ...wire, resourceItemId: 'wrong-pins', spec: { ...wire.spec, coreCount: 5, shielded } },
        { ...wire, resourceItemId: 'wrong-shield', spec: { ...wire.spec, shielded: !shielded } },
      ],
    };
    const form = { ...DEFAULT_AUTO_QUOTE_FORM, connectorAId: 'conn-m12', connectorBId: 'conn-m8', wireResourceId: 'res-wire-1' };
    const selected = deriveAutoQuoteSelection(form, catalog);
    expect(selected.connectorsB.map((item) => item.id)).toEqual(['conn-m12', 'conn-m8']);
    expect(selected.wires.map((item) => item.resourceItemId)).toEqual(['res-wire-1']);
    expect(selected.form).toMatchObject({ connectorBId: 'conn-m8', wireResourceId: 'res-wire-1' });

    const changed = deriveAutoQuoteSelection({ ...selected.form, connectorAId: 'wrong-shield' }, catalog);
    expect(changed.form).toMatchObject({ connectorBId: 'wrong-shield', wireResourceId: 'wrong-shield' });
  });

  it('leaves unavailable candidates empty instead of retaining mismatched selections', () => {
    const form = { ...DEFAULT_AUTO_QUOTE_FORM, connectorAId: 'conn-m12', connectorBId: 'conn-m8', wireResourceId: 'res-wire-1' };
    const noWires = deriveAutoQuoteSelection(form, { ...mockCatalog, wires: [] });
    expect(noWires.form.wireResourceId).toBe('');
    expect(evaluateAutoQuote(noWires.form, [], mockCatalog).status).toBe('incomplete');
    const unknown = deriveAutoQuoteSelection(form, { ...mockCatalog, connectors: mockCatalog.connectors.map((item) => ({ ...item, shielded: undefined })) });
    expect(unknown.connectorsB).toEqual([]);
    expect(unknown.wires).toEqual([]);
    expect(unknown.form).toMatchObject({ connectorBId: '', wireResourceId: '' });
    expect(deriveAutoQuoteSelection(form, null).form).toMatchObject({ connectorAId: '', connectorBId: '', wireResourceId: '' });
  });

  it.each(['connector', 'cut', 'strip-tin'] as const)('rejects missing outer molds for %s in form and server', (endpointBType) => {
    const form = { ...DEFAULT_AUTO_QUOTE_FORM, connectorAId: 'conn-m12', connectorBId: 'conn-m8', endpointBType,
      wireResourceId: 'res-wire-1', outerMoldSpecId: 'mold-pvc-1' };
    const invalid = { ...form, outerMoldSpecId: '' };
    expect(buildAutoQuoteConfig(invalid, mockCatalog)).toMatchObject({ config: null,
      issues: ['请选择黑色 PVC 45P 外模规格'] });
    const config = buildAutoQuoteConfig(form, mockCatalog).config!;
    const prices = createPrices(config);
    config.models = [];
    expect(calculatePrice(config, prices, mockCatalog)).toMatchObject({ status: 'blocked',
      issues: ['每个加工端必须有一个外模，外模个数须与加工端数一致'] });
  });

  it.each(['outer', 'inner'])('blocks asymmetric double-ended %s molds on the server', (kind) => {
    const form = { ...DEFAULT_AUTO_QUOTE_FORM, connectorAId: 'conn-m12', connectorBId: 'conn-m8',
      wireResourceId: 'res-wire-1', outerMoldSpecId: 'mold-pvc-1', innerMoldType: 'pe' as const };
    const config = buildAutoQuoteConfig(form, mockCatalog).config!;
    const prices = createPrices(config);
    if (kind === 'outer') { config.models.pop(); config.models[0].includeInnerMold = false; }
    else config.models[1].includeInnerMold = false;
    expect(calculatePrice(config, prices, mockCatalog)).toMatchObject({ status: 'blocked',
      issues: [kind === 'outer' ? '每个加工端必须有一个外模，外模个数须与加工端数一致' : '双端内模必须两端都有或两端都没有'] });
  });

  it.each([
    { pinCount: 3, shielded: true },
    { pinCount: 4, shielded: false },
    { pinCount: 4, shielded: undefined },
  ])('rejects incompatible B connectors: %j', (spec) => {
    const catalog = { ...mockCatalog, connectors: [mockCatalog.connectors[0], { ...mockCatalog.connectors[1], ...spec }] };
    const result = buildAutoQuoteConfig({ ...DEFAULT_AUTO_QUOTE_FORM, connectorAId: 'conn-m12', connectorBId: 'conn-m8', wireResourceId: 'res-wire-1', outerMoldSpecId: 'mold-pvc-1' }, catalog);
    expect(result.config).toBeNull();
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it.each([
    { coreCount: 3, shielded: true },
    { coreCount: 4, shielded: false },
  ])('rejects incompatible cable specifications: %j', (spec) => {
    const wire = mockCatalog.wires[0];
    if (wire.spec.kind !== 'jacketed') throw new Error('Expected jacketed fixture');
    const catalog = { ...mockCatalog, wires: [{ ...wire, spec: { ...wire.spec, ...spec } }] };
    const result = buildAutoQuoteConfig({ ...DEFAULT_AUTO_QUOTE_FORM, connectorAId: 'conn-m12', connectorBId: 'conn-m8', wireResourceId: 'res-wire-1', outerMoldSpecId: 'mold-pvc-1' }, catalog);
    expect(result.config).toBeNull();
  });

  it('requires a catalog specification when PVC molding is selected', () => {
    const result = buildAutoQuoteConfig({ ...DEFAULT_AUTO_QUOTE_FORM, connectorAId: 'conn-m12', endpointBType: 'cut', wireResourceId: 'res-wire-1', outerMoldSpecId: '' }, mockCatalog);
    expect(result.config).toBeNull();
  });
  it('identifies M8 and M12 connector support correctly', () => {
    expect(isSupportedConnector(mockCatalog.connectors[0])).toBe(true);
    expect(isSupportedConnector(mockCatalog.connectors[1])).toBe(true);
    expect(isSupportedConnector(mockCatalog.connectors[2])).toBe(false);
  });

  it('supports black PVC 45P overmolds and rejects legacy TPE records', () => {
    expect(isSupportedOvermold(mockCatalog.overmolds[0])).toBe(true);
    expect(isSupportedOvermold(mockCatalog.overmolds[1])).toBe(true);
    expect(isSupportedOvermold(legacyTpeOvermold())).toBe(false);
    const result = buildAutoQuoteConfig(
      { ...DEFAULT_AUTO_QUOTE_FORM, connectorAId: 'conn-m12', endpointBType: 'cut', wireResourceId: 'res-wire-1', outerMoldSpecId: 'mold-tpe-legacy' },
      { ...mockCatalog, overmolds: [...mockCatalog.overmolds, legacyTpeOvermold()] },
    );
    expect(result.config).toBeNull();
    expect(result.issues).toContain('外模须为目录中的黑色 PVC 45P');
  });

  it('reports incomplete status when required inputs are missing', () => {
    const form: AutoQuoteFormState = {
      connectorAId: '',
      endpointBType: 'connector',
      connectorBId: '',
      outerMoldSpecId: 'mold-pvc-1',
      innerMoldType: 'none',
      wireResourceId: '',
      lengthMm: 1000,
      quantity: 1000,
    };

    const evaluation = evaluateAutoQuote(form, [], mockCatalog);
    expect(evaluation.status).toBe('incomplete');
    expect(evaluation.issues).toContain('请选择 A 端连接器');
    expect(evaluation.issues).toContain('请选择 B 端连接器');
    expect(evaluation.issues).toContain('请选择线材物料');
  });

  it('quotes a tinned B end without B connector or mold', () => {
    const form: AutoQuoteFormState = {
      connectorAId: 'conn-m12',
      endpointBType: 'strip-tin',
      connectorBId: '',
      outerMoldSpecId: 'mold-pvc-1',
      innerMoldType: 'none',
      wireResourceId: 'res-wire-1',
      lengthMm: 1000,
      quantity: 1000,
    };

    const config = buildAutoQuoteConfig(form, mockCatalog).config!;
    expect(config.connectors).toHaveLength(1);
    expect(config.models).toHaveLength(1);
    const saved = parseHarnessConfig(JSON.parse(JSON.stringify(config)));
    expect(saved.success).toBe(true);
    if (saved.success) expect(saved.data.quotation?.endpointBType).toBe('strip-tin');
    const evaluation = evaluateAutoQuote(form, createPrices(config), mockCatalog);
    expect(evaluation.status).toBe('ready');
    expect(evaluation.price?.labor.find(row => row.name === '沾锡')).toMatchObject({ points: 5, amount: '0.25' });
  });

  it('quotes black PVC straight and bent overmolds and rejects legacy TPE selections', () => {
    const base: AutoQuoteFormState = {
      connectorAId: 'conn-m12',
      endpointBType: 'cut',
      connectorBId: '',
      outerMoldSpecId: 'mold-pvc-1',
      innerMoldType: 'none',
      wireResourceId: 'res-wire-1',
      lengthMm: 1000,
      quantity: 1000,
    };
    const straight = buildAutoQuoteConfig(base, mockCatalog).config!;
    expect(evaluateAutoQuote(base, createPrices(straight), mockCatalog).status).toBe('ready');

    const bentForm: AutoQuoteFormState = { ...base, outerMoldSpecId: 'mold-pvc-2', innerMoldType: 'pe' };
    const bent = buildAutoQuoteConfig(bentForm, mockCatalog).config!;
    expect(bent.models[0]).toMatchObject({ overmoldSpecId: 'mold-pvc-2', includeInnerMold: true });
    expect(evaluateAutoQuote(bentForm, createPrices(bent), mockCatalog).status).toBe('ready');

    const legacyCatalog = { ...mockCatalog, overmolds: [...mockCatalog.overmolds, legacyTpeOvermold()] };
    const rejected = buildAutoQuoteConfig({ ...base, outerMoldSpecId: 'mold-tpe-legacy' }, legacyCatalog);
    expect(rejected.config).toBeNull();
    expect(rejected.issues).toContain('外模须为目录中的黑色 PVC 45P');

    const formPe: AutoQuoteFormState = { ...base, outerMoldSpecId: '', innerMoldType: 'pe' };
    expect(evaluateAutoQuote(formPe, [], mockCatalog).status).toBe('incomplete');
  });
  it.each(['connector', 'cut', 'strip-tin'] as const)('quotes PE inner molds at 0.30 per molded end for %s', (endpointBType) => {
    const form: AutoQuoteFormState = {
      connectorAId: 'conn-m12', endpointBType, connectorBId: 'conn-m8',
      outerMoldSpecId: 'mold-pvc-1',
      innerMoldType: 'pe', wireResourceId: 'res-wire-1', lengthMm: 1000, quantity: 100,
    };
    const config = buildAutoQuoteConfig(form, mockCatalog).config!;
    const count = endpointBType === 'connector' ? 2 : 1;
    expect(config.models.map((model) => model.includeInnerMold)).toEqual(Array(count).fill(true));
    const result = evaluateAutoQuote(form, createPrices(config), mockCatalog);
    expect(result.status).toBe('ready');
    expect(result.price?.materials.find((row) => row.kind === 'inner-mold'))
      .toMatchObject({ points: count, unitPrice: '0.3', amount: count === 2 ? '0.6' : '0.3' });
    const withoutInnerMetadata = { ...mockCatalog, overmolds: mockCatalog.overmolds.map((mold) => ({ ...mold, innerMaterial: undefined, innerForm: undefined })) };
    expect(evaluateAutoQuote(form, createPrices(config), withoutInnerMetadata).status).toBe('incomplete');
  });

  it('calculates price successfully for single-end cut configuration (A 端 + B 端切断)', () => {
    const form: AutoQuoteFormState = {
      connectorAId: 'conn-m12',
      endpointBType: 'cut',
      connectorBId: '',
      outerMoldSpecId: 'mold-pvc-1',
      innerMoldType: 'none',
      wireResourceId: 'res-wire-1',
      lengthMm: 1000,
      quantity: 500,
    };

    const { config } = buildAutoQuoteConfig(form, mockCatalog);
    expect(config).not.toBeNull();
    expect(config?.connectors.length).toBe(1);
    expect(config?.quotation?.processingEnds).toBe(1);
    expect(config?.models.length).toBe(1);

    const prices = createPrices(config!);
    const evaluation = evaluateAutoQuote(form, prices, mockCatalog);
    expect(evaluation.status).toBe('ready');
    expect(evaluation.price).toBeDefined();
    expect(Number(evaluation.price?.unitPrice)).toBeGreaterThan(0);
    expect(Number(evaluation.price?.totalPrice)).toBeGreaterThan(0);
  });

  it('calculates price successfully for double-ended connector configuration (A/B 双端连接器)', () => {
    const form: AutoQuoteFormState = {
      connectorAId: 'conn-m12',
      endpointBType: 'connector',
      connectorBId: 'conn-m8',
      outerMoldSpecId: 'mold-pvc-1',
      innerMoldType: 'none',
      wireResourceId: 'res-wire-1',
      lengthMm: 1500,
      quantity: 1000,
    };

    const { config } = buildAutoQuoteConfig(form, mockCatalog);
    expect(config).not.toBeNull();
    expect(config?.connectors.length).toBe(2);
    expect(config?.quotation?.processingEnds).toBe(2);
    expect(config?.models.length).toBe(2);

    const prices = createPrices(config!);
    const evaluation = evaluateAutoQuote(form, prices, mockCatalog);
    expect(evaluation.status).toBe('ready');
    expect(evaluation.price).toBeDefined();
    expect(evaluation.price?.materials.length).toBeGreaterThan(0);
    expect(evaluation.price?.labor.length).toBeGreaterThan(0);
  });

  it('triggers manual review when wire length exceeds 5000mm', () => {
    const form: AutoQuoteFormState = {
      connectorAId: 'conn-m12',
      endpointBType: 'cut',
      connectorBId: '',
      outerMoldSpecId: 'mold-pvc-1',
      innerMoldType: 'none',
      wireResourceId: 'res-wire-1',
      lengthMm: 5001,
      quantity: 1000,
    };

    const { config } = buildAutoQuoteConfig(form, mockCatalog);
    const prices = createPrices(config!);
    const evaluation = evaluateAutoQuote(form, prices, mockCatalog);
    expect(evaluation.status).toBe('manual');
    expect(evaluation.issues).toContain('超过 5 米，需人工核价');
    expect(evaluation.price).toBeUndefined();
  });

  it('reports blocked when prices are missing', () => {
    const form: AutoQuoteFormState = {
      connectorAId: 'conn-m12',
      endpointBType: 'cut',
      connectorBId: '',
      outerMoldSpecId: 'mold-pvc-1',
      innerMoldType: 'none',
      wireResourceId: 'res-wire-1',
      lengthMm: 1000,
      quantity: 1000,
    };

    const evaluation = evaluateAutoQuote(form, [], mockCatalog);
    expect(evaluation.status).toBe('blocked');
    expect(evaluation.issues.some((issue) => issue.includes('缺少唯一匹配的含税价格'))).toBe(true);
  });
});

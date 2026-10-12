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
import type { MaterialPrice } from '@/repositories/priceRepository';
import { calculatePrice } from '../../../server/pricing';
// Exercise form construction together with the authoritative server calculator.
function evaluateAutoQuote(form: AutoQuoteFormState, prices: MaterialPrice[], catalog: CatalogSnapshot) {
  const built = buildAutoQuoteConfig(form, catalog);
  if (built.unsupportedIssues.length) return { ...built, status: 'unsupported', issues: built.unsupportedIssues, price: undefined };
  if (!built.config) return { ...built, status: 'incomplete', price: undefined };
  const result = calculatePrice(built.config, prices, catalog);
  return result.status === 'ready' ? { ...built, ...result, issues: [] } : { ...built, ...result, price: undefined };
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
      id: 'mold-tpe-1',
      resourceItemId: 'res-mold-tpe',
      name: 'M12外模 TPE',
      outerMaterial: '黑色TPE',
      outerHardness: '45P',
      outerForm: 'straight',
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

  it('rejects a runtime no-mold value and zero molding ends', () => {
    const form = { ...DEFAULT_AUTO_QUOTE_FORM, connectorAId: 'conn-m12', endpointBType: 'cut' as const, wireResourceId: 'res-wire-1', outerMoldSpecId: 'mold-pvc-1' };
    expect(buildAutoQuoteConfig({ ...form, outerMoldType: 'none' } as unknown as AutoQuoteFormState, mockCatalog).config).toBeNull();
    expect(buildAutoQuoteConfig({ ...form, outerMoldEnds: 0 } as unknown as AutoQuoteFormState, mockCatalog).config).toBeNull();
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

  it('requires an outer mold even without an inner mold', () => {
    const result = buildAutoQuoteConfig({ ...DEFAULT_AUTO_QUOTE_FORM, connectorAId: 'conn-m12', endpointBType: 'cut', wireResourceId: 'res-wire-1', outerMoldSpecId: '' }, mockCatalog);
    expect(result.config).toBeNull();
  });
  it('identifies M8 and M12 connector support correctly', () => {
    expect(isSupportedConnector(mockCatalog.connectors[0])).toBe(true);
    expect(isSupportedConnector(mockCatalog.connectors[1])).toBe(true);
    expect(isSupportedConnector(mockCatalog.connectors[2])).toBe(false);
  });

  it('identifies black PVC 45P overmold correctly', () => {
    expect(isSupportedOvermold(mockCatalog.overmolds[0])).toBe(true);
    expect(isSupportedOvermold(mockCatalog.overmolds[1])).toBe(false);
  });

  it('reports incomplete status when required inputs are missing', () => {
    const form: AutoQuoteFormState = {
      connectorAId: '',
      endpointBType: 'connector',
      connectorBId: '',
      outerMoldType: 'pvc-45p',
      outerMoldSpecId: 'mold-pvc-1',
      outerMoldEnds: 1,
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

  it('reports unsupported when B endpoint is strip-tin (剥皮沾锡)', () => {
    const form: AutoQuoteFormState = {
      connectorAId: 'conn-m12',
      endpointBType: 'strip-tin',
      connectorBId: '',
      outerMoldType: 'pvc-45p',
      outerMoldSpecId: 'mold-pvc-1',
      outerMoldEnds: 1,
      innerMoldType: 'none',
      wireResourceId: 'res-wire-1',
      lengthMm: 1000,
      quantity: 1000,
    };

    const evaluation = evaluateAutoQuote(form, [], mockCatalog);
    expect(evaluation.status).toBe('unsupported');
    expect(evaluation.issues[0]).toContain('剥皮沾锡工艺计费待支持');
    expect(evaluation.price).toBeUndefined();
  });

  it('keeps TPE unsupported and requires an outer mold for PE inner molds', () => {
    const formTpe: AutoQuoteFormState = {
      connectorAId: 'conn-m12',
      endpointBType: 'cut',
      connectorBId: '',
      outerMoldType: 'tpe',
      outerMoldSpecId: 'mold-tpe-1',
      outerMoldEnds: 1,
      innerMoldType: 'none',
      wireResourceId: 'res-wire-1',
      lengthMm: 1000,
      quantity: 1000,
    };
    expect(evaluateAutoQuote(formTpe, [], mockCatalog).status).toBe('unsupported');

    const formPe: AutoQuoteFormState = {
      ...formTpe,
      outerMoldType: 'pvc-45p',
      outerMoldSpecId: '',
      innerMoldType: 'pe',
    };
    expect(evaluateAutoQuote(formPe, [], mockCatalog).status).toBe('incomplete');
  });
  it.each(['connector', 'cut'] as const)('quotes PE inner molds at 0.30 per molded end for %s', (endpointBType) => {
    const form: AutoQuoteFormState = {
      connectorAId: 'conn-m12', endpointBType, connectorBId: 'conn-m8',
      outerMoldType: 'pvc-45p', outerMoldSpecId: 'mold-pvc-1', outerMoldEnds: 2,
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
      outerMoldType: 'pvc-45p',
      outerMoldSpecId: 'mold-pvc-1',
      outerMoldEnds: 1,
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
      outerMoldType: 'pvc-45p',
      outerMoldSpecId: 'mold-pvc-1',
      outerMoldEnds: 2,
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
      outerMoldType: 'pvc-45p',
      outerMoldSpecId: 'mold-pvc-1',
      outerMoldEnds: 1,
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
      outerMoldType: 'pvc-45p',
      outerMoldSpecId: 'mold-pvc-1',
      outerMoldEnds: 1,
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

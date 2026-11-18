import { describe, expect, it } from 'vitest';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';
import { getQuoteMaterials } from '@/lib/quoteMaterials';
import { canonicalizeQuote, quoteForRole } from '../../../server/quoteService';
import { DEFAULT_PRICING_SETTINGS } from '../../../server/pricing';
import type { CatalogSnapshot } from '@/types/catalog';
import type { HarnessConfig } from '@/types/harness';
import { createQuoteWorkbook } from '@/lib/quoteExport';
import { parseHarnessConfig } from '@/lib/harnessConfigSchema';
import * as XLSX from 'xlsx';

function fixture() {
  const connector = { id: 'c', resourceItemId: 'c-id', name: 'M12', series: 'M12', pinCount: 4, shielded: true, type: 'male' as const, pinLabels: ['1','2','3','4'] };
  const wire = { id: 'w', resourceItemId: 'w-id', name: 'wire', spec: { kind: 'jacketed' as const, awg: 24, coreCount: 4, shielded: true, jacketMaterial: 'PVC' as const, jacketColor: 'black' as const, coreColors: ['红色','黑色','绿色','白色'] as const, outerDiameterMm: 5 } };
  const catalog = { connectors: [connector], wires: [{ ...wire, spec: { ...wire.spec, coreColors: [...wire.spec.coreColors] } }], overmolds: [{ id: 'mold', resourceItemId: 'mold-id', name: '外模', outerMaterial: '黑色PVC', outerHardness: '45P', outerForm: 'straight' }], loadedAt: 0,
    wireColors: [], leadTimeOptions: [], protectionOptions: [], pricingRules: [], quantityDiscountRules: [] } satisfies CatalogSnapshot;
  const config: HarnessConfig = { ...createFallbackConfig(), quantity: 100, quotation: { processingEnds: 1, srPoints: 0, processingBasis: 'specification' },
    models: [{ id: 'm', kind: 'outer-box', overmoldSpecId: 'mold', includeInnerMold: false, position: { x: 0, y: 0 }, width: 30, height: 30 }],
    connectors: [{ id: 'a', connector, label: 'A', position: { x: 0, y: 0 }, jumpers: [] }],
    materials: [{ id: 'w', resourceItemId: 'w-id', name: 'wire', position: { x: 0, y: 0 }, width: 100, circuits: [], spec: {
      ...wire.spec, coreColors: [...wire.spec.coreColors], odMm: 5, lengthMm: 1000,
      endTreatment: { start: { stripped: false, termination: 'none' }, end: { stripped: false, termination: 'none' } },
    } }],
  };
  const prices = getQuoteMaterials(config, catalog).map(row => ({ ...row, taxIncludedPrice: row.kind === 'wire' ? '4' : '2' }));
  return { catalog, config, prices };
}
describe('server quote boundary', () => {
  it.each(['public', 'internal'] as const)('deduplicates endpoint codes case-insensitively in %s Excel while retaining distinct codes', mode => {
    const { config, catalog, prices } = fixture();
    const result = quoteForRole(config, catalog, prices, DEFAULT_PRICING_SETTINGS, 'engineer');
    if (!('price' in result)) throw new Error('not ready');
    config.connectors[0].connector = { ...config.connectors[0].connector, id: 'm12a04-07-093', model: 'M12A04-07-093', shielded: false };
    config.connectors.push({ ...config.connectors[0], id: 'b' });
    const exportRow = () => {
      const book = createQuoteWorkbook(config, result.price, mode, 'engineer');
      return XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]])[0];
    };
    const row = exportRow();
    expect(row['A端配置']).toBe('M12A04-07-093 · 4Pin · 公头 · 非屏蔽');
    expect(row['B端配置']).toBe(row['A端配置']);
    config.connectors[1].connector = { ...config.connectors[1].connector, id: 'CATALOG-42' };
    expect(exportRow()['B端配置']).toBe('CATALOG-42 · M12A04-07-093 · 4Pin · 公头 · 非屏蔽');
  });
  it('quotes and exports the tinned endpoint through the server boundary', () => {
    const { config, catalog, prices } = fixture();
    config.quotation!.endpointBType = 'strip-tin';
    const result = quoteForRole(config, catalog, prices, DEFAULT_PRICING_SETTINGS, 'engineer');
    if (!('price' in result)) throw new Error('not ready');
    expect(result.price.breakdown?.labor.find(row => row.name === '沾锡')).toMatchObject({ points: 5, amount: '0.25' });
    const book = createQuoteWorkbook(config, result.price);
    const row = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]])[0];
    expect(row['B端配置']).toBe('剥皮沾锡');
    expect(row).not.toHaveProperty('SR点数');
    config.quotation!.endpointBType = 'connector';
    expect(quoteForRole(config, catalog, prices, DEFAULT_PRICING_SETTINGS, 'engineer').status).toBe('blocked');
  });
  it('exports distinct configurations with server time and internal-only rule version', () => {
    const { catalog, config, prices } = fixture();
    const result = quoteForRole(config, catalog, prices, DEFAULT_PRICING_SETTINGS, 'engineer');
    if (!('price' in result)) throw new Error('not ready');
    const molds: CatalogSnapshot['overmolds'] = [{ id: 'MOLD-1', resourceItemId: 'private-mold-id', name: '直头外模', outerMaterial: '黑色PVC', outerHardness: '45P', outerForm: 'straight', innerMaterial: '低密度透明PE', innerForm: 'straight' }];
    config.models = [{ id: 'm', kind: 'outer-box', overmoldSpecId: 'MOLD-1', includeInnerMold: true, position: { x: 0, y: 0 }, width: 30, height: 30 }];
    const context = { catalog: { ...catalog, overmolds: molds }, calculatedAt: '2026-10-12T01:02:03Z', settingsVersion: 7 };
    const read = (mode: 'public' | 'internal') => {
      const book = createQuoteWorkbook(config, result.price, mode, 'engineer', 'unit', context);
      const restored = XLSX.read(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
      return XLSX.utils.sheet_to_json<Record<string, unknown>>(restored.Sheets[restored.SheetNames[0]])[0];
    };
    const first = read('public');
    expect(first['核价时间']).toBe('2026-10-12 09:02:03 (北京时间)');
    expect(first['B端配置']).toBe('切断端');
    expect(first['线材配置']).toContain('24AWG 屏蔽');
    expect(first['线材配置']).toContain('1m');
    expect(first['外模配置']).toContain('MOLD-1');
    expect(first['内模配置']).toContain('低密度透明PE');
    expect(first).not.toHaveProperty('计价规则版本');
    expect(first).not.toHaveProperty('产品含税成本');
    expect(JSON.stringify(first)).not.toContain('private-mold-id');
    expect(read('internal')['计价规则版本']).toBe(7);
    const wire = config.materials[0].spec;
    if (wire.kind !== 'jacketed') throw new Error('expected jacketed wire');
    wire.shielded = false;
    config.models[0].includeInnerMold = false;
    const second = read('public');
    expect(second['产品名称']).toBe(first['产品名称']);
    expect(second['线材配置']).toContain('非屏蔽');
    expect(second['线材配置']).not.toBe(first['线材配置']);
    expect(second['内模配置']).toBe('无');
  });
  it('returns only final amounts to sales and never includes cost fields or rules', () => {
    const { catalog, config, prices } = fixture();
    for (const role of ['sales']) {
      const result = quoteForRole(config, catalog, prices, DEFAULT_PRICING_SETTINGS, role);
      expect(result.status).toBe('ready');
      if (!('price' in result)) throw new Error('not ready');
      expect(Object.keys(result.price)).toEqual(['unitPrice', 'totalPrice']);
    }
  });
  it('refuses quotes when the role is unresolved or invalid', () => {
    const { catalog, config, prices } = fixture();
    for (const role of [undefined, null, '', 'owner']) {
      expect(() => quoteForRole(config, catalog, prices, DEFAULT_PRICING_SETTINGS, role)).toThrow('权限');
    }
  });
  it('returns full detail to engineers/admins and respects new pricing versions', () => {
    const { catalog, config, prices } = fixture();
    const initial = quoteForRole(config, catalog, prices, DEFAULT_PRICING_SETTINGS, 'engineer');
    const changed = quoteForRole(config, catalog, prices, { ...DEFAULT_PRICING_SETTINGS, version: 2, marginRate: '0.30' }, 'admin');
    expect('price' in initial && initial.price.breakdown?.cost).toBeTruthy();
    expect('price' in changed && changed.price.unitPrice).not.toBe('price' in initial && initial.price.unitPrice);
    expect('settingsVersion' in changed && changed.settingsVersion).toBe(2);
  });
  it('ignores forged connector/wire engineering facts and rejects unknown resources', () => {
    const { catalog, config, prices } = fixture();
    const initial = quoteForRole(config, catalog, prices, DEFAULT_PRICING_SETTINGS, 'sales');
    const forged = structuredClone(config);
    forged.connectors[0].connector.pinCount = 1;
    if (forged.materials[0].spec.kind === 'jacketed') {
      forged.materials[0].spec.coreCount = 1;
      forged.materials[0].spec.shielded = false;
    }
    expect(quoteForRole(forged, catalog, prices, DEFAULT_PRICING_SETTINGS, 'sales')).toMatchObject({ price: 'price' in initial ? initial.price : {} });
    forged.materials[0].resourceItemId = 'unknown';
    expect(quoteForRole(forged, catalog, prices, DEFAULT_PRICING_SETTINGS, 'sales')).toEqual({
      status: 'blocked', issues: ['线材不在物料目录中'],
    });
  });
  it.each([4, 6])('preserves a %s-core shielded cable with mixed 4/5-pin unshielded connectors', (coreCount) => {
    const { catalog, config } = fixture();
    catalog.connectors[0].shielded = false;
    const second = { ...catalog.connectors[0], id: 'c2', resourceItemId: 'c2-id', pinCount: 5 };
    catalog.connectors.push(second);
    catalog.wires[0].spec.coreCount = coreCount;
    config.connectors.push({ ...config.connectors[0], id: 'b', connector: second });
    const before = structuredClone(config);
    const canonical = canonicalizeQuote(config, catalog);
    expect(canonical.connectors.map(({ connector }) => [connector.pinCount, connector.shielded])).toEqual([[4, false], [5, false]]);
    expect(canonical.materials[0].spec).toMatchObject({ coreCount, shielded: true });
    expect(config).toEqual(before);
  });

  it('quotes mixed connector specifications without requiring molds', () => {
    const { catalog, config } = fixture();
    catalog.connectors[0].pinCount = 5;
    config.models = [];
    const prices = getQuoteMaterials(config, catalog).map(row => ({ ...row, taxIncludedPrice: '2' }));
    expect(quoteForRole(config, catalog, prices, DEFAULT_PRICING_SETTINGS, 'engineer').status).toBe('ready');
  });

  it('returns unsupported configurations as issues instead of throwing an API error', () => {
    const { catalog, config, prices } = fixture();
    config.materials = [];
    expect(quoteForRole(config, catalog, prices, DEFAULT_PRICING_SETTINGS, 'engineer')).toEqual({
      status: 'blocked', issues: ['配置超出自动报价支持范围'],
    });
  });

  it('still requires the selected connector shielding specification', () => {
    const { catalog, config, prices } = fixture();
    const incompleteCatalog = { ...catalog, connectors: [{ ...catalog.connectors[0], shielded: undefined }] };
    expect(quoteForRole(config, incompleteCatalog, prices, DEFAULT_PRICING_SETTINGS, 'engineer')).toEqual({
      status: 'blocked', issues: ['请在物料目录补全连接器的屏蔽属性'],
    });
  });

  it('estimates mixed specifications without requiring manually entered counts in specification mode', () => {
    const { catalog, config } = fixture();
    catalog.connectors[0].pinCount = 5;
    const prices = getQuoteMaterials(config, catalog).map(row => ({ ...row, taxIncludedPrice: '2' }));
    const result = quoteForRole(config, catalog, prices, DEFAULT_PRICING_SETTINGS, 'engineer');
    expect(result.status).toBe('ready');
    if ('price' in result) expect(result.price.breakdown?.labor.find(row => row.name === '焊接')?.points).toBe(5);
  });

  it('quotes a six-core cable with a five-pin head using actual processing counts and original materials', () => {
    const { catalog, config } = fixture();
    catalog.connectors[0].pinCount = 5;
    catalog.connectors[0].shielded = false;
    catalog.wires[0].spec.coreCount = 6;
    const before = structuredClone(config);
    const requested = { ...config, quotation: { ...config.quotation!, weldingPoints: 5, strippingPoints: 5 } };
    const canonical = canonicalizeQuote(requested, catalog);
    const prices = getQuoteMaterials(canonical, catalog).map(row => ({ ...row, taxIncludedPrice: '2' }));
    const result = quoteForRole(requested, catalog, prices, DEFAULT_PRICING_SETTINGS, 'engineer');
    expect(result.status).toBe('ready');
    if (!('price' in result)) throw new Error('Expected ready quote');
    expect(result.price.breakdown?.labor.find(row => row.name === '焊接')).toMatchObject({ points: 5, amount: '1' });
    expect(result.price.breakdown?.labor.find(row => row.name === '去皮')).toMatchObject({ points: 5, amount: '0.25' });
    expect(result.price.breakdown?.materials.map(row => row.kind)).toEqual(['connector', 'wire', 'outer-mold']);
    expect(config).toEqual(before);
  });

  it.each([-1, 0.5, 1001, NaN])('blocks invalid actual processing counts: %s', (points) => {
    const { catalog, config, prices } = fixture();
    const requested = { ...config, quotation: { ...config.quotation!, weldingPoints: points, strippingPoints: points } };
    expect(quoteForRole(requested, catalog, prices, DEFAULT_PRICING_SETTINGS, 'engineer').status).toBe('blocked');
    expect(parseHarnessConfig(requested).success).toBe(false);
  });

  it.each([0, 12, 1000])('uses actual counts independently of nominal core and pin totals: %s', points => {
    const { catalog, config, prices } = fixture();
    const requested = { ...config, quotation: { ...config.quotation!, weldingPoints: points, strippingPoints: points } };
    const result = quoteForRole(requested, catalog, prices, DEFAULT_PRICING_SETTINGS, 'engineer');
    expect(result.status).toBe('ready');
    if (!('price' in result)) throw new Error('Expected ready quote');
    expect(result.price.breakdown?.labor.find(row => row.name === '焊接')).toMatchObject({ points });
    expect(result.price.breakdown?.labor.find(row => row.name === '去皮')).toMatchObject({ points });
    expect(parseHarnessConfig(requested).success).toBe(true);
  });

  it('counts a branched core as two welds and keeps one crimp separate from welding', () => {
    const { catalog, config, prices } = fixture();
    const requested = { ...config, quotation: { ...config.quotation!, weldingPoints: 2, strippingPoints: 1, crimpingPoints: 1 } };
    const saved = parseHarnessConfig(JSON.parse(JSON.stringify(requested)));
    expect(saved.success).toBe(true);
    if (!saved.success) throw new Error('Invalid test configuration');
    expect(saved.data.quotation).toMatchObject({ weldingPoints: 2, strippingPoints: 1, crimpingPoints: 1 });
    const result = quoteForRole(saved.data, catalog, prices, DEFAULT_PRICING_SETTINGS, 'engineer');
    expect(result.status).toBe('ready');
    if (!('price' in result)) throw new Error('Expected ready quote');
    expect(result.price.breakdown?.labor.find(row => row.name === '焊接')).toMatchObject({ points: 2, amount: '0.4' });
    expect(result.price.breakdown?.labor.find(row => row.name === '压端子')).toBeUndefined();
  });

  it.each([-1, 0.5, 1001, NaN])('rejects invalid crimp counts: %s', (crimpingPoints) => {
    const { catalog, config, prices } = fixture();
    const requested = { ...config, quotation: { ...config.quotation!, crimpingPoints } };
    expect(quoteForRole(requested, catalog, prices, DEFAULT_PRICING_SETTINGS, 'engineer').status).toBe('blocked');
    expect(parseHarnessConfig(requested).success).toBe(false);
  });
  it('public Excel omits internal information even when an internal result was supplied', () => {
    const { catalog, config, prices } = fixture();
    const result = quoteForRole(config, catalog, prices, DEFAULT_PRICING_SETTINGS, 'engineer');
    if (!('price' in result)) throw new Error('not ready');
    const book = createQuoteWorkbook(config, result.price);
    const row = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]])[0];
    expect(Object.keys(row as object)).toEqual(['产品名称','订单数量','含税含运费单价','订单总价','A端配置','B端配置','线材配置','外模配置','内模配置','核价时间']);
    expect(() => createQuoteWorkbook(config, result.price, 'internal', 'sales')).toThrow('权限');
  });

  it.each(['public', 'internal'] as const)('unit-price %s Excel omits order fields and retains the quoted unit price', (mode) => {
    const { catalog, config, prices } = fixture();
    const result = quoteForRole(config, catalog, prices, DEFAULT_PRICING_SETTINGS, 'engineer');
    if (!('price' in result)) throw new Error('not ready');
    const book = createQuoteWorkbook(config, result.price, mode, 'engineer', 'unit');
    const serialized = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
    const restored = XLSX.read(serialized, { type: 'buffer' });
    const row = XLSX.utils.sheet_to_json<Record<string, unknown>>(restored.Sheets[restored.SheetNames[0]])[0];
    expect(row).not.toHaveProperty('交期');
    expect(row).not.toHaveProperty('订单数量');
    expect(row).not.toHaveProperty('订单总价');
    expect(row['含税含运费单价']).toBe(result.price.unitPrice);
    if (mode === 'internal') expect(row['产品含税成本']).toBe(result.price.breakdown?.cost);
    else expect(Object.keys(row)).toEqual(['产品名称', '含税含运费单价','A端配置','B端配置','线材配置','外模配置','内模配置','核价时间']);
  });
});

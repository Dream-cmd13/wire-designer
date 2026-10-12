import { describe, expect, it } from 'vitest';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';
import { getQuoteMaterials } from '@/lib/quoteMaterials';
import { quoteForRole } from '../../../server/quoteService';
import { DEFAULT_PRICING_SETTINGS } from '../../../server/pricing';
import type { CatalogSnapshot } from '@/types/catalog';
import type { HarnessConfig } from '@/types/harness';
import { createQuoteWorkbook } from '@/lib/quoteExport';
import * as XLSX from 'xlsx';

function fixture() {
  const connector = { id: 'c', resourceItemId: 'c-id', name: 'M12', series: 'M12', pinCount: 4, shielded: true, type: 'male' as const, pinLabels: ['1','2','3','4'] };
  const wire = { id: 'w', resourceItemId: 'w-id', name: 'wire', spec: { kind: 'jacketed' as const, awg: 24, coreCount: 4, shielded: true, jacketMaterial: 'PVC' as const, jacketColor: 'black' as const, coreColors: ['红色','黑色','绿色','白色'] as const, outerDiameterMm: 5 } };
  const catalog = { connectors: [connector], wires: [{ ...wire, spec: { ...wire.spec, coreColors: [...wire.spec.coreColors] } }], overmolds: [], loadedAt: 0,
    wireColors: [], leadTimeOptions: [], protectionOptions: [], pricingRules: [], quantityDiscountRules: [] } satisfies CatalogSnapshot;
  const config: HarnessConfig = { ...createFallbackConfig(), quantity: 100, quotation: { processingEnds: 1, srPoints: 0 },
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
    expect(() => quoteForRole(forged, catalog, prices, DEFAULT_PRICING_SETTINGS, 'sales')).toThrow('目录');
  });
  it('rejects mismatched connector and wire cores even in direct API requests', () => {
    const { catalog, config, prices } = fixture();
    catalog.connectors[0].pinCount = 3;
    expect(() => quoteForRole(config, catalog, prices, DEFAULT_PRICING_SETTINGS, 'sales')).toThrow('芯数');
  });
  it('public Excel omits internal information even when an internal result was supplied', () => {
    const { catalog, config, prices } = fixture();
    const result = quoteForRole(config, catalog, prices, DEFAULT_PRICING_SETTINGS, 'engineer');
    if (!('price' in result)) throw new Error('not ready');
    const book = createQuoteWorkbook(config, result.price);
    const row = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]])[0];
    expect(Object.keys(row as object)).toEqual(['产品名称','订单数量','交期','含税含运费单价','订单总价','A端配置','B端配置','线材配置','外模配置','内模配置','SR点数','核价时间']);
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
    expect(row).not.toHaveProperty('订单数量');
    expect(row).not.toHaveProperty('订单总价');
    expect(row['含税含运费单价']).toBe(result.price.unitPrice);
    if (mode === 'internal') expect(row['产品含税成本']).toBe(result.price.breakdown?.cost);
    else expect(Object.keys(row)).toEqual(['产品名称', '交期', '含税含运费单价','A端配置','B端配置','线材配置','外模配置','内模配置','SR点数','核价时间']);
  });
});

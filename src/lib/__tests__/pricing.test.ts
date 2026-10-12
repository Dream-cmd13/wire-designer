import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { formatQuoteMoney } from '@/lib/pricing';
import { calculatePrice, DEFAULT_PRICING_SETTINGS } from '../../../server/pricing';
import { formatMaterialSpecification, getPriceImportCandidates, getQuoteMaterials } from '@/lib/quoteMaterials';
import { createQuoteWorkbook } from '@/lib/quoteExport';
import { createPriceTemplate, parsePriceWorkbook } from '@/lib/priceImport';
import { DEFAULT_QUOTE_LEAD_TIME } from '@/data/catalogOptions';
import { validatePrices, type MaterialPrice } from '@/repositories/priceRepository';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';
import { parseHarnessConfig } from '@/lib/harnessConfigSchema';
import { generateBOM } from '@/lib/bom';
import type { HarnessConfig } from '@/types/harness';
import type { CatalogSnapshot } from '@/types/catalog';

const catalog = { overmolds: [{ id: 'mold', name: '外模', outerMaterial: '黑色PVC', outerHardness: '45P', outerForm: 'straight', innerMaterial: '低密度透明PE', innerForm: 'straight' }] } as CatalogSnapshot;
function fixture() {
  const config: HarnessConfig = { ...createFallbackConfig(), quantity: 100, quotation: { processingEnds: 2, srPoints: 2 },
    connectors: ['a', 'b'].map((id) => ({ id, label: id, position: { x: 0, y: 0 }, jumpers: [], connector: {
      id: 'connector', name: 'M12连接器', series: 'M12', pinCount: 4, type: 'male', pinLabels: ['1', '2', '3', '4'],
    } })),
    materials: [{ id: 'wire', resourceItemId: 'wire-resource', name: '线材', position: { x: 0, y: 0 }, width: 200, circuits: [],
      spec: { kind: 'jacketed', awg: 24, coreCount: 4, shielded: true, jacketMaterial: 'PVC', jacketColor: 'black', odMm: 5,
        coreColors: ['红色', '黑色', '绿色', '白色'], lengthMm: 600,
        endTreatment: { start: { stripped: false, termination: 'none' }, end: { stripped: false, termination: 'none' } } } }],
    models: ['a', 'b'].map((id) => ({ id, kind: 'outer-box', position: { x: 0, y: 0 }, width: 50, height: 50, overmoldSpecId: 'mold', includeInnerMold: true })),
  };
  const prices = pricesFor(config);
  return { config, prices };
}
function pricesFor(config: HarnessConfig): MaterialPrice[] {
  return getQuoteMaterials(config, catalog).map((row) => ({ ...row, taxIncludedPrice: row.kind === 'wire' ? '4' : row.kind === 'connector' ? '2' : row.kind === 'inner-mold' ? '0.3' : '1' }));
}
function ready(config: HarnessConfig, prices = pricesFor(config)) {
  const result = calculatePrice(config, prices, catalog);
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error(JSON.stringify(result));
  return result.price;
}
describe('M8/M12 quotation', () => {
  it.each([false, true])('charges a tinned B end separately from molded A (shielded=%s)', (shielded) => {
    const { config } = fixture();
    config.connectors.pop(); config.models.pop();
    config.quotation = { processingEnds: 1, srPoints: 1, endpointBType: 'strip-tin' };
    const spec = config.materials[0].spec;
    if (spec.kind !== 'jacketed') throw new Error('Expected jacketed cable');
    spec.shielded = shielded;
    const p = ready(config);
    const amount = (name: string) => p.labor.find(row => row.name === name)?.amount;
    expect(amount('去皮')).toBe('0.4');
    expect(amount('去外皮')).toBe('0.04');
    expect(amount('沾锡')).toBe(shielded ? '0.25' : '0.2');
    expect(amount('焊接')).toBe(shielded ? '1' : '0.8');
    expect(amount('处理编织')).toBe(shielded ? '0.2' : '0');
    expect(amount('热缩编织')).toBe(shielded ? '0.2' : '0');
    expect(amount('成型')).toBe('0.4');
    expect(p.materials.find(row => row.kind === 'outer-mold')?.points).toBe(1);
  });
  it('does not charge SR molding', () => {
    const { config } = fixture();
    const withSr = ready(config);
    config.quotation!.srPoints = 0;
    expect(ready(config)).toEqual(withSr);
    expect(withSr.labor.find(row => row.name === '成型')?.amount).toBe('0.8');
  });
  it.each([false, true])('charges only the selected molds at one molded end (inner=%s)', (includeInnerMold) => {
    const { config } = fixture();
    config.connectors.pop(); config.models.pop();
    config.models[0].includeInnerMold = includeInnerMold;
    config.quotation = { processingEnds: 1, srPoints: 1, endpointBType: 'strip-tin' };
    const prices = pricesFor(config).map(row => ['inner-mold', 'outer-mold'].includes(row.kind)
      ? { ...row, taxIncludedPrice: '0.30' } : row);
    const p = ready(config, prices);
    const materials = p.materials.filter(row => row.kind === 'inner-mold' || row.kind === 'outer-mold');
    expect(materials.map(row => row.amount)).toEqual(includeInnerMold ? ['0.3', '0.3'] : ['0.3']);
    expect(p.labor.find(row => row.name === '成型')?.amount).toBe(includeInnerMold ? '0.4' : '0.2');
  });
  it.each([
    [1, '0.05', '0.05', '0.05'], [500, '0.05', '0.05', '0.05'],
    [501, '0.10', '0.20', '0.10'], [1000, '0.10', '0.20', '0.10'],
    [1001, '0.10', '0.20', '0.20'], [2000, '0.10', '0.20', '0.20'],
    [2001, '0.10', '0.20', '0.20'], [3000, '0.10', '0.20', '0.20'],
    [3001, '0.10', '0.20', '0.30'], [5000, '0.10', '0.20', '0.30'],
  ])('charges finishing fees for %i mm using the next length tier', (length, electrical, appearance, packaging) => {
    const { config } = fixture();
    config.materials[0].spec.lengthMm = Number(length);
    const p = ready(config);
    for (const [index, rate] of [electrical, appearance, packaging].entries()) {
      expect(p.labor[index + 8]).toMatchObject({ points: 1, unitPrice: rate, amount: String(Number(rate)) });
    }
  });
  it('matches the authoritative example and rounds unit price before quantity', () => {
    const { config, prices } = fixture();
    const p = ready(config, prices);
    expect(p.labor.map((line) => line.points)).toEqual([2, 8, 2, 2, 2, 10, 4, 0, 1, 1, 1]);
    expect(p).toMatchObject({ materialSubtotal: '10.6', materialLoss: '0.318', laborSubtotal: '4.14', processingLoss: '0.207', cost: '15.265', sellingPrice: '19.08125', unitPrice: '19.65', totalPrice: '1965.00' });
  });
  it('uses database finishing prices at actual wire length regardless of the material price tier', () => {
    const { config, prices } = fixture();
    config.materials[0].spec.lengthMm = 500;
    const tierPrices = prices.map(row => row.kind === 'wire' ? { ...row, lengthMm: 5000 } : row);
    const parameters = { ...DEFAULT_PRICING_SETTINGS, laborRates: {
      ...DEFAULT_PRICING_SETTINGS.laborRates, 裁线: '0.07',
    }, finishingLaborRates: { ...DEFAULT_PRICING_SETTINGS.finishingLaborRates,
      '500': { 电测: '0.12', 外观: '0.23', 包装人工: '0.34' },
    } };
    const result = calculatePrice(config, tierPrices, catalog, parameters);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error(JSON.stringify(result));
    expect(result.price.labor.slice(-3).map(row => row.amount)).toEqual(['0.12', '0.23', '0.34']);
    expect(result.price.labor[0].amount).toBe('0.07');
    const original = ready(config, tierPrices);
    expect(Number(result.price.laborSubtotal) - Number(original.laborSubtotal)).toBeCloseTo(0.56);
    expect(Number(result.price.processingLoss) - Number(original.processingLoss)).toBeCloseTo(0.028);
  });
  it('blocks missing tier configuration instead of falling back to hardcoded prices', () => {
    const { config, prices } = fixture();
    const broken = { ...DEFAULT_PRICING_SETTINGS, finishingLaborRates: undefined };
    expect(calculatePrice(config, prices, catalog, broken as unknown as typeof DEFAULT_PRICING_SETTINGS).status).toBe('blocked');
  });
  it.each([0, 2])('charges %i inner molds using shared prices without changing outer mold costs', (count) => {
    const { config, prices } = fixture();
    config.models.forEach((model, index) => { model.includeInnerMold = index < count; });
    const p = ready(config, prices);
    const inner = p.materials.find((row) => row.kind === 'inner-mold');
    if (count === 0) expect(inner).toBeUndefined();
    else expect(inner).toMatchObject({ points: count, unitPrice: '0.3', amount: String(count * 0.3) });
    expect(p.materialSubtotal).toBe(String(10 + count * 0.3));
    expect(p.materials.find((row) => row.kind === 'outer-mold')?.amount).toBe('2');
    expect(p.labor.find((row) => row.name === '成型')?.points).toBe(2 + count);
  });
  it('blocks a single inner mold on a double-ended harness', () => {
    const { config, prices } = fixture();
    config.models[1].includeInnerMold = false;
    expect(calculatePrice(config, prices, catalog)).toEqual({
      status: 'blocked', issues: ['双端内模必须两端都有或两端都没有'],
    });
  });
  it('uses the database inner mold price and blocks missing prices instead of defaulting to 0.30', () => {
    const { config, prices } = fixture();
    const changed = prices.map((row) => row.kind === 'inner-mold' ? { ...row, taxIncludedPrice: '0.45' } : row);
    expect(ready(config, changed).materials.find((row) => row.kind === 'inner-mold'))
      .toMatchObject({ unitPrice: '0.45', amount: '0.9' });
    expect(calculatePrice(config, prices.filter((row) => row.kind !== 'inner-mold'), catalog).status).toBe('blocked');
  });
  it.each([[1, 1], [500, 1], [501, 2], [600, 2], [1000, 2], [5000, 10]])('rounds %i mm cutting to %i points without scaling cable price', (length, points) => {
    const { config } = fixture(); config.materials[0].spec.lengthMm = length;
    const p = ready(config);
    expect(p.labor[0].points).toBe(points);
    expect(p.materialSubtotal).toBe('10.6');
  });
  it('charges all nominal cores on a single nonshielded end', () => {
    const { config } = fixture(); config.connectors.pop(); config.models.pop(); config.quotation = { processingEnds: 1, srPoints: 0 };
    const spec = config.materials[0].spec;
    if (spec.kind === 'jacketed') { spec.shielded = false; spec.coreCount = 5; }
    expect(ready(config).labor.map((line) => line.points)).toEqual([2, 5, 1, 0, 0, 5, 2, 0, 1, 1, 1]);
  });
  it('requires manual pricing beyond 5m even when prices are missing', () => {
    const { config } = fixture(); config.materials[0].spec.lengthMm = 5001;
    expect(calculatePrice(config, [], catalog)).toEqual({ status: 'manual', issues: ['超过 5 米，需人工核价'] });
  });
  it('blocks missing, duplicate, wrong-length and changed-spec prices', () => {
    const { config, prices } = fixture();
    expect(calculatePrice(config, [], catalog).status).toBe('blocked');
    expect(calculatePrice(config, [...prices, prices[0]], catalog).status).toBe('blocked');
    config.materials[0].spec.lengthMm = 1000;
    expect(calculatePrice(config, prices, catalog).status).toBe('blocked');
    config.materials[0].spec.lengthMm = 600; config.materials[0].spec.awg = 26;
    expect(calculatePrice(config, prices, catalog).status).toBe('blocked');
  });
  it.each(['multi-wire', 'series', 'quantity', 'ends', 'sr', 'molds', 'unconfirmed'])('blocks invalid %s', (kind) => {
    const { config, prices } = fixture();
    if (kind === 'multi-wire') config.materials.push(config.materials[0]);
    if (kind === 'series') config.connectors[0].connector.series = 'M16';
    if (kind === 'quantity') config.quantity = 1.5;
    if (kind === 'ends') config.quotation!.processingEnds = 1;
    if (kind === 'sr') config.quotation!.srPoints = 3;
    if (kind === 'molds') config.models.push(config.models[0]);
    if (kind === 'unconfirmed') delete config.quotation;
    expect(calculatePrice(config, prices, catalog).status).toBe('blocked');
  });
  it('ignores lead time and has no quantity discounts', () => {
    const { config } = fixture(); const first = ready(config);
    config.leadTime = 'rush'; config.quantity = 10000;
    expect(ready(config).unitPrice).toBe(first.unitPrice);
  });
  it('blocks malformed purchase prices without throwing', () => {
    const { config, prices } = fixture(); prices[0].taxIncludedPrice = 'not-a-price';
    expect(calculatePrice(config, prices, catalog).status).toBe('blocked');
  });
  it('uses the next length tier and treats an exact boundary as the current tier', () => {
    const { config, prices } = fixture();
    const wire = prices.find((row) => row.kind === 'wire')!;
    const tier = (lengthMm: number, taxIncludedPrice: string) => ({ ...wire, lengthMm, taxIncludedPrice });
    const tierPrices = [...prices.filter((row) => row.kind !== 'wire'), tier(500, '3'), tier(1000, '4'), tier(2000, '8'), tier(5000, '20')];
    for (const [length, expected] of [[1, '3'], [499, '3'], [500, '3'], [501, '4'], [600, '4'],
      [999, '4'], [1000, '4'], [1001, '8'], [1500, '8'], [2000, '8'], [2001, '20'], [5000, '20']] as const) {
      config.materials[0].spec.lengthMm = length;
      const quote = ready(config, tierPrices);
      expect(quote.materials.find((row) => row.name === '线材')?.unitPrice).toBe(expected);
      expect(quote.labor[0].points).toBe(Math.ceil(length / 500));
    }
    config.materials[0].spec.lengthMm = 600;
    expect(calculatePrice(config, [...tierPrices, tier(1000, '99')], catalog).status).toBe('blocked');
  });
  it('uses decimal half-up formatting', () => { expect(formatQuoteMoney('1.005')).toBe('1.01'); });
  it('preserves quotation settings on project save/read and rejects invalid settings', () => {
    const { config } = fixture(); const parsed = parseHarnessConfig(JSON.parse(JSON.stringify(config)));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.quotation).toEqual(config.quotation);
    config.quotation!.srPoints = 3;
    expect(parseHarnessConfig(config).success).toBe(false);
  });
  it('removes demo prices from BOM', () => {
    expect(generateBOM(fixture().config).every((row) => row.unitPrice === undefined && row.totalPrice === undefined)).toBe(true);
  });
});

const bytes = (book: XLSX.WorkBook) => XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
describe('price workbook and repository', () => {
  it('round-trips a filled current-design template', () => {
    const { config, prices } = fixture();
    const result = parsePriceWorkbook(bytes(createPriceTemplate(getQuoteMaterials(config, catalog), prices)), getPriceImportCandidates(config, catalog));
    expect(result.map((row) => row.taxIncludedPrice)).toEqual(['2', '4', '1', '0.3']);
  });
  it('rejects empty prices, duplicate rows, wrong units and formulas', () => {
    const { config, prices } = fixture();
    expect(() => parsePriceWorkbook(bytes(createPriceTemplate(getQuoteMaterials(config, catalog), [])), getPriceImportCandidates(config, catalog))).toThrow();
    expect(() => validatePrices([...prices, prices[0]])).toThrow('重复');
    expect(() => validatePrices([{ ...prices[1], unit: '元/米' }])).toThrow();
    const book = createPriceTemplate(getQuoteMaterials(config, catalog), prices); book.Sheets['材料价格'].E2.f = '1+1';
    expect(() => parsePriceWorkbook(bytes(book), getPriceImportCandidates(config, catalog))).toThrow('公式');
  });
  it.each(['-1', '', 'NaN', 'Infinity', '1.1234567'])('rejects invalid price %s', (price) => {
    expect(() => validatePrices([{ ...fixture().prices[0], taxIncludedPrice: price }])).toThrow();
  });
  it('accepts explicit zero and six-decimal purchase prices', () => {
    for (const price of ['0', '0.123456']) expect(validatePrices([{ ...fixture().prices[0], taxIncludedPrice: price }])[0].taxIncludedPrice).toBe(price);
  });
  it('exports only five business columns, with readable length in specification and numeric prices', () => {
    const { config, prices } = fixture();
    const sheet = createPriceTemplate(getQuoteMaterials(config, catalog), prices).Sheets['材料价格'];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    expect(rows[0]).toEqual(['物料类型', '物料名称', '规格', '单位', '含税单价']);
    expect(rows[2][2]).toContain('4芯 24AWG 屏蔽 黑色 OD5mm');
    expect(rows[2][2]).toContain('0.6m');
    expect(rows[2][2]).not.toContain('"');
    expect(rows[2][4]).toBe(4);
  });
  it.each([' ', ',', '，'])('matches separator %s and assigns internal identity automatically', (separator) => {
    const { config, prices } = fixture(); const materials = getQuoteMaterials(config, catalog);
    const book = createPriceTemplate(materials, prices);
    book.Sheets['材料价格'].C3.v = formatMaterialSpecification(materials[1]).replace(/ /g, separator).replace('0.6m', '600mm');
    const result = parsePriceWorkbook(bytes(book), materials);
    expect(result[1]).toMatchObject({ resourceId: 'wire-resource', lengthMm: 600, taxIncludedPrice: '4', specification: materials[1].specification });
  });
  it('imports a new full-cable length without scaling the price', () => {
    const { config, prices } = fixture(); const materials = getQuoteMaterials(config, catalog);
    const book = createPriceTemplate(materials, prices);
    book.Sheets['材料价格'].C3.v = formatMaterialSpecification(materials[1]).replace('0.6m', '2米');
    const result = parsePriceWorkbook(bytes(book), materials);
    expect(result[1]).toMatchObject({ lengthMm: 2000, taxIncludedPrice: '4' });
  });
  it('round-trips every shared price including lengths not in the current design', () => {
    const { config, prices } = fixture();
    const wire = prices.find((row) => row.kind === 'wire')!;
    const shared = [...prices, { ...wire, lengthMm: 1000, taxIncludedPrice: '6.123456' },
      { ...wire, lengthMm: 5000, taxIncludedPrice: '25' }];
    const rows = shared.map((row) => ({ ...row, quantity: 1 }));
    const exported = createPriceTemplate(rows, shared);
    const imported = parsePriceWorkbook(bytes(exported), [...getPriceImportCandidates(config, catalog), ...rows]);
    expect(imported.map(({ lengthMm, taxIncludedPrice }) => ({ lengthMm, taxIncludedPrice })))
      .toEqual(shared.map(({ lengthMm, taxIncludedPrice }) => ({ lengthMm, taxIncludedPrice })));
    expect(imported).toHaveLength(6);
  });
  it('rejects unknown names, missing lengths, ambiguous materials and duplicate keys', () => {
    const { config, prices } = fixture(); const materials = getQuoteMaterials(config, catalog);
    let book = createPriceTemplate(materials, prices);
    book.Sheets['材料价格'].B2.v = 'unknown';
    expect(() => parsePriceWorkbook(bytes(book), materials)).toThrow('未匹配');
    book = createPriceTemplate(materials, prices);
    book.Sheets['材料价格'].C3.v = formatMaterialSpecification(materials[1], false);
    expect(() => parsePriceWorkbook(bytes(book), materials)).toThrow('末尾须有长度');
    book = createPriceTemplate(materials, prices);
    expect(() => parsePriceWorkbook(bytes(book), [...materials, { ...materials[0], resourceId: 'another-id' }])).toThrow('多个物料');
    book = createPriceTemplate([...materials, materials[0]], prices);
    expect(() => parsePriceWorkbook(bytes(book), materials)).toThrow('重复');
  });
  it('matches catalog-only materials not yet placed in the current design', () => {
    const { config, prices } = fixture();
    const populated = { ...catalog, connectors: config.connectors.map((row) => row.connector) };
    const candidates = getPriceImportCandidates({ ...config, connectors: [] }, populated);
    const book = createPriceTemplate(getQuoteMaterials(config, catalog), prices);
    expect(parsePriceWorkbook(bytes(book), candidates)[0].resourceId).toBe('connector');
  });
  it('exports one product cost-analysis row with no internal identifiers and correct rounded total', () => {
    const { config, prices } = fixture();
    const p = ready(config, prices);
    const result = XLSX.read(bytes(createQuoteWorkbook(config, { unitPrice: p.unitPrice, totalPrice: p.totalPrice, breakdown: p }, 'internal', 'engineer')), { type: 'array' });
    expect(result.SheetNames).toEqual(['成本分析']);
    const row = XLSX.utils.sheet_to_json<Record<string, unknown>>(result.Sheets[result.SheetNames[0]])[0];
    expect(row).toMatchObject({ '产品名称': config.name, '材料损耗': '0.318', '加工损耗': '0.207',
      '产品含税成本': '15.265', '含税含运费单价': '19.65', '订单总价': '1965.00', '交期': '7日' });
    expect(row['交期']).toBe(DEFAULT_QUOTE_LEAD_TIME);
    expect(JSON.stringify(row)).not.toContain('wire-resource');
    expect(() => createQuoteWorkbook(config, { unitPrice: p.unitPrice, totalPrice: p.totalPrice, breakdown: p }, 'internal', 'sales')).toThrow('权限');
  });
});

import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { calculatePrice, formatQuoteMoney } from '@/lib/pricing';
import { formatMaterialSpecification, getPriceImportCandidates, getQuoteMaterials } from '@/lib/quoteMaterials';
import { createQuoteWorkbook } from '@/lib/quoteExport';
import { createPriceTemplate, parsePriceWorkbook } from '@/lib/priceImport';
import { validatePrices, type MaterialPrice } from '@/repositories/priceRepository';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';
import { parseHarnessConfig } from '@/lib/harnessConfigSchema';
import { generateBOM } from '@/lib/bom';
import type { HarnessConfig } from '@/types/harness';
import type { CatalogSnapshot } from '@/types/catalog';

const catalog = { overmolds: [{ id: 'mold', name: '外模', outerMaterial: '黑色PVC', outerHardness: '45P', outerForm: 'straight' }] } as CatalogSnapshot;
function fixture() {
  const config: HarnessConfig = { ...createFallbackConfig(), quantity: 100, quotation: { processingEnds: 2, srPoints: 2 },
    connectors: ['a', 'b'].map((id) => ({ id, label: id, position: { x: 0, y: 0 }, jumpers: [], connector: {
      id: 'connector', name: 'M12连接器', series: 'M12', manufacturer: '', pinCount: 4, type: 'male', pinLabels: ['1', '2', '3', '4'],
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
  return getQuoteMaterials(config, catalog).map((row) => ({ ...row, taxIncludedPrice: row.kind === 'wire' ? '4' : row.kind === 'connector' ? '2' : '1' }));
}
function ready(config: HarnessConfig, prices = pricesFor(config)) {
  const result = calculatePrice(config, prices, catalog);
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error(JSON.stringify(result));
  return result.price;
}
describe('M8/M12 quotation', () => {
  it('matches the authoritative example and rounds unit price before quantity', () => {
    const { config, prices } = fixture();
    const p = ready(config, prices);
    expect(p.labor.map((line) => line.points)).toEqual([2, 8, 2, 2, 2, 10, 6, 1, 1, 1]);
    expect(p).toMatchObject({ materialSubtotal: '10', laborSubtotal: '4.35', processingLoss: '0.2175', cost: '14.8675', sellingPrice: '18.584375', unitPrice: '19.14', totalPrice: '1914.00' });
  });
  it.each([[1, 1], [500, 1], [501, 2], [600, 2], [1000, 2], [5000, 10]])('rounds %i mm cutting to %i points without scaling cable price', (length, points) => {
    const { config } = fixture(); config.materials[0].spec.lengthMm = length;
    const p = ready(config);
    expect(p.labor[0].points).toBe(points);
    expect(p.materialSubtotal).toBe('10');
  });
  it('charges all nominal cores on a single nonshielded end', () => {
    const { config } = fixture(); config.connectors.pop(); config.models.pop(); config.quotation = { processingEnds: 1, srPoints: 0 };
    const spec = config.materials[0].spec;
    if (spec.kind === 'jacketed') { spec.shielded = false; spec.coreCount = 5; }
    expect(ready(config).labor.map((line) => line.points)).toEqual([2, 5, 1, 0, 0, 5, 2, 1, 1, 1]);
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
    expect(result.map((row) => row.taxIncludedPrice)).toEqual(['2', '4', '1']);
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
    expect(imported).toHaveLength(5);
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
    const result = XLSX.read(bytes(createQuoteWorkbook(config, prices, catalog)), { type: 'array' });
    expect(result.SheetNames).toEqual(['成本分析-M12单线']);
    const row = XLSX.utils.sheet_to_json<Record<string, unknown>>(result.Sheets[result.SheetNames[0]])[0];
    expect(row).toMatchObject({ '产品名称': config.name, '连接器含税': 4, '线材含税': 4, '外模 黑色PVC 45P 含税': 2,
      '内模含税': 0, 'SR含税': 0, '材料损耗': 0.3, '加工损耗': 0.2175,
      '产品含税成本': 14.8675, '含税含运费单价': 19.14, '订单总价': 1914 });
    expect(row['线材规格']).toContain('0.6m');
    expect(JSON.stringify(row)).not.toContain('wire-resource');
    config.materials[0].spec.lengthMm = 5001;
    expect(() => createQuoteWorkbook(config, prices, catalog)).toThrow('人工核价');
  });
});

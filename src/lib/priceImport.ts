import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import { formatMaterialSpecification, materialPriceKey, type QuoteMaterial } from './quoteMaterials';
import { validatePrices, type MaterialPrice } from '@/repositories/priceRepository';

const HEADERS = ['物料类型', '物料名称', '规格', '单位', '含税单价'];
const KIND_LABEL = { connector: '连接器', wire: '线材', 'outer-mold': '外模' } as const;
export function createPriceTemplate(materials: QuoteMaterial[], prices: MaterialPrice[]) {
  const lookup = new Map(prices.map((row) => [materialPriceKey(row), row.taxIncludedPrice]));
  const rows = materials.filter((row) => row.specification).map((row) => {
    const price = lookup.get(materialPriceKey(row));
    return [KIND_LABEL[row.kind], row.name, formatMaterialSpecification(row), row.unit, price === undefined ? '' : Number(price)];
  });
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  sheet['!cols'] = [12, 35, 90, 12, 16].map((wch) => ({ wch }));
  sheet['!autofilter'] = { ref: `A1:E${rows.length + 1}` };
  rows.forEach((_, index) => { const cell = sheet[`E${index + 2}`]; if (cell?.t === 'n') cell.z = '0.00####'; });
  XLSX.utils.book_append_sheet(book, sheet, '材料价格');
  return book;
}
function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().replace(/[\s,，]+/g, ' ').toUpperCase();
}

function matchKey(kind: string, name: string, specification: string, unit: string): string {
  return JSON.stringify([kind, normalizeText(name), normalizeText(specification), unit]);
}

function splitWireLength(specification: string, rowNumber: number) {
  const tokens = normalizeText(specification).split(' ');
  const last = tokens.pop() || '';
  const match = /^(\d+(?:\.\d+)?)(MM|M|毫米|米)$/.exec(last);
  if (!match) throw new Error(`第 ${rowNumber} 行线材规格末尾须有长度，例如 0.6m 或 600mm`);
  const length = new Decimal(match[1]).mul(match[2] === 'M' || match[2] === '米' ? 1000 : 1);
  if (!length.isInteger() || length.lte(0) || length.gt(Number.MAX_SAFE_INTEGER)) throw new Error(`第 ${rowNumber} 行线长必须为正整数毫米`);
  return { specification: tokens.join(' '), lengthMm: length.toNumber() };
}

export function parsePriceWorkbook(data: ArrayBuffer, candidates: QuoteMaterial[]): MaterialPrice[] {
  if (data.byteLength > 5 * 1024 * 1024) throw new Error('价格文件不能超过 5 MB');
  const book = XLSX.read(data, { type: 'array', cellFormula: true });
  const sheet = book.Sheets['材料价格'];
  if (!sheet) throw new Error('缺少“材料价格”工作表，请使用简化价格模板；成本分析表仅用于报价导出');
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  if (range.e.r > 10000 || range.e.c > 4) throw new Error('模板最多 10000 条价格、5 列');
  for (const [address, cell] of Object.entries(sheet)) {
    if (!address.startsWith('!') && cell?.f) throw new Error('价格模板不能包含公式，请粘贴数值');
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
  if (JSON.stringify(rows[0]) !== JSON.stringify(HEADERS)) throw new Error('价格表头与模板不一致');
  const index = new Map<string, Map<string, QuoteMaterial>>();
  for (const candidate of candidates) {
    if (!candidate.resourceId || !candidate.specification) continue;
    const key = matchKey(candidate.kind, candidate.name, formatMaterialSpecification(candidate, false), candidate.unit);
    const matches = index.get(key) ?? new Map<string, QuoteMaterial>();
    matches.set(materialPriceKey({ ...candidate, lengthMm: 0 }), candidate);
    index.set(key, matches);
  }
  const result: MaterialPrice[] = [];
  rows.slice(1).forEach((row, offset) => {
    if (row.every((cell) => cell === '')) return;
    const rowNumber = offset + 2;
    const kind = Object.entries(KIND_LABEL).find(([, label]) => label === String(row[0]).trim())?.[0];
    if (!kind) throw new Error(`第 ${rowNumber} 行物料类型须为连接器、线材或外模`);
    const name = String(row[1] ?? '').trim();
    const rawSpec = String(row[2] ?? '').trim();
    const { specification, lengthMm } = kind === 'wire' ? splitWireLength(rawSpec, rowNumber) : { specification: rawSpec, lengthMm: 0 };
    const matches = index.get(matchKey(kind, name, specification, String(row[3]).trim()));
    if (!matches?.size) throw new Error(`第 ${rowNumber} 行“${name}”未匹配到目录物料，请核对名称、规格和单位`);
    if (matches.size !== 1) throw new Error(`第 ${rowNumber} 行“${name}”匹配到多个物料，请先在目录中区分名称或型号`);
    const candidate = [...matches.values()][0];
    result.push({ ...candidate, lengthMm, taxIncludedPrice: String(row[4] ?? '').trim() });
  });
  return validatePrices(result);
}

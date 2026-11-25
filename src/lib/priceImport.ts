import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import { formatMaterialSpecification, materialPriceKey, type QuoteMaterial } from './quoteMaterials';
import { UserFacingError } from './userErrorMessage';
import { assertZipWithinBudget } from './zipBudget';
import { validatePrices, type MaterialPrice } from '@/repositories/priceRepository';

const HEADERS = ['物料类型', '物料名称', '规格', '单位', '含税单价'];
export const PRICE_KIND_LABEL = {
  connector: '连接器',
  wire: '线材',
  'outer-mold': '外模',
  'inner-mold': '内模',
} as const;
const PRICE_PATTERN = /^\d{1,9}(\.\d{1,6})?$/;
const MAX_WIRE_AUTO_LENGTH_MM = 5000;
const MAX_REPORTED_ERRORS = 8;

export interface ParsedPriceWorkbook {
  prices: MaterialPrice[];
  skippedUnpricedCount: number;
  overMaxLengthCount: number;
}

export interface PriceImportDiffItem {
  kind: 'added' | 'updated';
  price: MaterialPrice;
  previousPrice?: string;
}

export interface PriceImportDiff {
  added: MaterialPrice[];
  updated: Array<{ next: MaterialPrice; previous: MaterialPrice }>;
  unchanged: MaterialPrice[];
  changes: MaterialPrice[];
  items: PriceImportDiffItem[];
}

export function createPriceTemplate(materials: QuoteMaterial[], prices: MaterialPrice[]) {
  const lookup = new Map(prices.map((row) => [materialPriceKey(row), row.taxIncludedPrice]));
  const rows = materials.filter((row) => row.specification).map((row) => {
    const price = lookup.get(materialPriceKey(row));
    return [PRICE_KIND_LABEL[row.kind], row.name, formatMaterialSpecification(row), row.unit, price === undefined ? '' : Number(price)];
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
  const normalized = normalizeText(specification);
  const match = /^(.*?)\s+(\d+(?:\.\d+)?)\s*(MM|M|毫米|米)$/.exec(normalized);
  if (!match) throw new UserFacingError(`第 ${rowNumber} 行线材规格末尾须有长度，例如 0.6m 或 600mm`);
  const length = new Decimal(match[2]).mul(match[3] === 'M' || match[3] === '米' ? 1000 : 1);
  if (!length.isInteger() || length.lte(0) || length.gt(Number.MAX_SAFE_INTEGER)) {
    throw new UserFacingError(`第 ${rowNumber} 行线长必须为正整数毫米`);
  }
  return { specification: match[1].trim(), lengthMm: length.toNumber() };
}

function normalizePriceCell(rawCell: unknown): string | null {
  if (rawCell === null || rawCell === undefined) return null;
  if (typeof rawCell === 'string') {
    const trimmed = rawCell.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof rawCell === 'number') {
    if (!Number.isFinite(rawCell) || rawCell < 0) return String(rawCell);
    const rawText = String(rawCell);
    if (PRICE_PATTERN.test(rawText)) return rawText;
    try {
      return new Decimal(rawCell.toPrecision(12)).toFixed();
    } catch {
      return rawText;
    }
  }
  const text = String(rawCell).trim();
  return text ? text : null;
}

export function parsePriceWorkbookDetailed(data: ArrayBuffer, candidates: QuoteMaterial[]): ParsedPriceWorkbook {
  if (data.byteLength > 5 * 1024 * 1024) throw new UserFacingError('价格文件不能超过 5 MB');
  assertZipWithinBudget(data);
  let book: XLSX.WorkBook;
  try {
    book = XLSX.read(data, { type: 'array', cellFormula: true });
  } catch {
    throw new UserFacingError('价格文件无法解析，文件可能已损坏。');
  }
  const sheet = book.Sheets['材料价格'];
  if (!sheet) throw new UserFacingError('缺少“材料价格”工作表，请使用简化价格模板；成本分析表仅用于报价导出');
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  if (range.e.r > 10000 || range.e.c > 4) throw new UserFacingError('模板最多 10000 条价格、5 列');
  for (const [address, cell] of Object.entries(sheet)) {
    if (!address.startsWith('!') && cell?.f) throw new UserFacingError('价格模板不能包含公式，请粘贴数值');
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
  if (JSON.stringify(rows[0]) !== JSON.stringify(HEADERS)) throw new UserFacingError('价格表头与模板不一致');

  const index = new Map<string, Map<string, QuoteMaterial>>();
  for (const candidate of candidates) {
    if (!candidate.resourceId || !candidate.specification) continue;
    const key = matchKey(candidate.kind, candidate.name, formatMaterialSpecification(candidate, false), candidate.unit);
    const matches = index.get(key) ?? new Map<string, QuoteMaterial>();
    matches.set(materialPriceKey({ ...candidate, lengthMm: 0 }), candidate);
    index.set(key, matches);
  }

  const result: MaterialPrice[] = [];
  const errors: string[] = [];
  const seenKeys = new Map<string, number>();
  let skippedUnpricedCount = 0;
  let overMaxLengthCount = 0;

  rows.slice(1).forEach((row, offset) => {
    if (row.every((cell) => String(cell ?? '').trim() === '')) return;
    const rowNumber = offset + 2;
    const priceText = normalizePriceCell(row[4]);
    if (priceText === null) {
      skippedUnpricedCount += 1;
      return;
    }

    const kind = Object.entries(PRICE_KIND_LABEL).find(([, label]) => label === String(row[0] ?? '').trim())?.[0];
    if (!kind) {
      errors.push(`第 ${rowNumber} 行物料类型须为连接器、线材、外模或内模`);
      return;
    }

    const name = String(row[1] ?? '').trim();
    const rawSpec = String(row[2] ?? '').trim();
    let specification: string;
    let lengthMm: number;
    try {
      ({ specification, lengthMm } = kind === 'wire' ? splitWireLength(rawSpec, rowNumber) : { specification: rawSpec, lengthMm: 0 });
    } catch (cause) {
      errors.push(cause instanceof UserFacingError ? cause.message : `第 ${rowNumber} 行线材规格无效`);
      return;
    }

    const unit = String(row[3] ?? '').trim();
    const matches = index.get(matchKey(kind, name, specification, unit));
    if (!matches?.size) {
      errors.push(`第 ${rowNumber} 行“${name}”未匹配到目录物料，请核对名称、规格和单位`);
      return;
    }
    if (matches.size !== 1) {
      errors.push(`第 ${rowNumber} 行“${name}”匹配到多个物料，请先在目录中区分名称或型号`);
      return;
    }

    const candidate = [...matches.values()][0];
    if (!PRICE_PATTERN.test(priceText)
      || !Number.isSafeInteger(lengthMm)
      || (candidate.kind === 'wire' ? lengthMm <= 0 || candidate.unit !== '元/条' : lengthMm !== 0 || candidate.unit !== '元/个')) {
      errors.push(`第 ${rowNumber} 行价格、单位、长度或物料信息无效（单价最多 6 位小数）`);
      return;
    }

    const key = materialPriceKey({ ...candidate, lengthMm });
    const firstRow = seenKeys.get(key);
    if (firstRow !== undefined) {
      errors.push(`第 ${rowNumber} 行与第 ${firstRow} 行记录重复`);
      return;
    }
    seenKeys.set(key, rowNumber);

    if (candidate.kind === 'wire' && lengthMm > MAX_WIRE_AUTO_LENGTH_MM) {
      overMaxLengthCount += 1;
    }
    result.push({ ...candidate, lengthMm, taxIncludedPrice: priceText });
  });

  if (errors.length === 1) throw new UserFacingError(errors[0]);
  if (errors.length > 1) {
    const preview = errors.slice(0, MAX_REPORTED_ERRORS).join('；');
    const suffix = errors.length > MAX_REPORTED_ERRORS ? `；另有 ${errors.length - MAX_REPORTED_ERRORS} 处错误` : '';
    throw new UserFacingError(`共发现 ${errors.length} 处错误：${preview}${suffix}`);
  }
  if (!result.length) {
    if (skippedUnpricedCount > 0) {
      throw new UserFacingError('表格中未填写任何含税单价，请至少填写 1 项后再导入');
    }
    validatePrices(result);
  }

  return {
    prices: validatePrices(result),
    skippedUnpricedCount,
    overMaxLengthCount,
  };
}

export function parsePriceWorkbook(data: ArrayBuffer, candidates: QuoteMaterial[]): MaterialPrice[] {
  return parsePriceWorkbookDetailed(data, candidates).prices;
}

export function diffImportedPrices(
  incoming: readonly MaterialPrice[],
  existing: readonly MaterialPrice[],
): PriceImportDiff {
  const existingMap = new Map<string, MaterialPrice>();
  for (const row of existing) {
    existingMap.set(materialPriceKey(row), row);
  }

  const added: MaterialPrice[] = [];
  const updated: Array<{ next: MaterialPrice; previous: MaterialPrice }> = [];
  const unchanged: MaterialPrice[] = [];
  const changes: MaterialPrice[] = [];
  const items: PriceImportDiffItem[] = [];

  for (const row of incoming) {
    const previous = existingMap.get(materialPriceKey(row));
    if (!previous) {
      added.push(row);
      changes.push(row);
      items.push({ kind: 'added', price: row });
      continue;
    }
    if (!new Decimal(row.taxIncludedPrice).eq(previous.taxIncludedPrice)) {
      updated.push({ next: row, previous });
      changes.push(row);
      items.push({ kind: 'updated', price: row, previousPrice: previous.taxIncludedPrice });
      continue;
    }
    unchanged.push(row);
  }

  return { added, updated, unchanged, changes, items };
}

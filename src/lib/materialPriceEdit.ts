import { materialPriceKey, materialPriceTierKey, type QuoteMaterial } from './quoteMaterials';
import type { MaterialPrice, MaterialPriceEdit } from '@/repositories/priceRepository';
import { UserFacingError } from './userErrorMessage';
export interface PriceDraft { kind: MaterialPrice['kind']; resourceId: string; name: string; specification: string; unit: MaterialPrice['unit']; length: string; price: string; original?: MaterialPrice; }
const pricePattern = /^\d{1,9}(\.\d{1,6})?$/;
export function createPriceDrafts(candidates: QuoteMaterial[], prices: MaterialPrice[]): PriceDraft[] {
  const rows: PriceDraft[] = [];
  for (const candidate of candidates) {
    const matches = prices.filter(p => materialPriceTierKey(p) === materialPriceTierKey(candidate)).sort((a, b) => a.lengthMm - b.lengthMm);
    if (matches.length) for (const p of matches) rows.push({ ...candidate, specification: p.specification, length: String(p.lengthMm), price: p.taxIncludedPrice, original: p });
    else rows.push({ ...candidate, length: String(candidate.lengthMm), price: '' });
  }
  return rows;
}
export function buildPriceEdits(rows: PriceDraft[]): MaterialPriceEdit[] {
  const keys = new Set<string>();
  const edits: MaterialPriceEdit[] = [];
  rows.forEach((row, index) => {
    if (!row.original && row.price.trim() === '') return;
    if (row.original && row.length !== String(row.original.lengthMm)) throw new UserFacingError('不能修改已有长度档位。');
    const lengthMm = Number(row.length);
    if (!pricePattern.test(row.price) || !Number.isSafeInteger(lengthMm) ||
      (row.kind === 'wire' ? lengthMm <= 0 || row.unit !== '元/条' : lengthMm !== 0 || row.unit !== '元/个')) {
      throw new UserFacingError(`第 ${index + 1} 项单价、长度或单位无效。`);
    }
    const result: MaterialPriceEdit = { kind: row.kind, resourceId: row.resourceId, name: row.name, specification: row.specification,
      lengthMm, unit: row.unit, taxIncludedPrice: row.price, expectedUpdatedAt: row.original?.updatedAt ?? null };
    const key = materialPriceKey(result);
    if (keys.has(key)) throw new UserFacingError(`第 ${index + 1} 项与其他长度档位重复。`);
    keys.add(key);
    if (row.original && Number(row.price) === Number(row.original.taxIncludedPrice)) return;
    if (row.original && !row.original.updatedAt) throw new UserFacingError('价格版本缺失，请关闭弹窗并刷新价格。');
    edits.push(result);
  });
  return edits;
}

/** Preserve small unit-price differences while keeping at least two decimal places. */
export function formatMaterialPrice(value: string): string {
  const [integer, fraction = ''] = value.split('.');
  return `${integer}.${fraction.replace(/0+$/, '').padEnd(2, '0')}`;
}

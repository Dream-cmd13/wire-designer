import { materialPriceKey, type QuoteMaterial } from '@/lib/quoteMaterials';

export interface MaterialPrice extends Omit<QuoteMaterial, 'quantity'> {
  taxIncludedPrice: string;
}
export interface PriceBook { importedAt: string; sourceName: string; prices: MaterialPrice[] }

export function validatePrices(value: unknown): MaterialPrice[] {
  if (!Array.isArray(value) || !value.length || value.length > 10000) throw new Error('价格记录必须为 1 至 10000 行');
  const keys = new Set<string>();
  return value.map((raw, index) => {
    const row = raw as MaterialPrice;
    if (!row || !['connector', 'wire', 'outer-mold'].includes(row.kind)
      || typeof row.resourceId !== 'string' || !row.resourceId.trim()
      || typeof row.name !== 'string' || !row.name.trim()
      || typeof row.specification !== 'string' || !row.specification.trim()
      || !Number.isSafeInteger(row.lengthMm)
      || (row.kind === 'wire' ? row.lengthMm <= 0 || row.unit !== '元/条' : row.lengthMm !== 0 || row.unit !== '元/个')
      || typeof row.taxIncludedPrice !== 'string'
      || !/^\d{1,9}(\.\d{1,6})?$/.test(row.taxIncludedPrice)) {
      throw new Error(`第 ${index + 2} 行价格、单位、长度或物料信息无效（单价最多 6 位小数）`);
    }
    const key = materialPriceKey(row);
    if (keys.has(key)) throw new Error(`第 ${index + 2} 行与前面记录重复`);
    keys.add(key);
    return { ...row };
  });
}
export interface PriceRepository {
  load(): Promise<PriceBook | null>;
  merge(prices: MaterialPrice[], sourceName: string): Promise<PriceBook>;
}
const STORAGE_KEY = 'harness-material-prices-v1';
export function createLocalPriceRepository(storage: Pick<Storage, 'getItem' | 'setItem'>): PriceRepository {
  const load = async (): Promise<PriceBook | null> => {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as PriceBook;
    if (typeof value.importedAt !== 'string' || typeof value.sourceName !== 'string') throw new Error('本机价格库格式无效');
    return { ...value, prices: validatePrices(value.prices) };
  };
  return { load, async merge(prices, sourceName) {
    const incoming = validatePrices(prices);
    const previous = await load();
    const merged = new Map((previous?.prices || []).map((row) => [materialPriceKey(row), row]));
    incoming.forEach((row) => merged.set(materialPriceKey(row), row));
    const book = { importedAt: new Date().toISOString(), sourceName, prices: validatePrices([...merged.values()]) };
    storage.setItem(STORAGE_KEY, JSON.stringify(book));
    return book;
  } };
}
// The future server implementation only replaces this storage boundary.
export const priceRepository: PriceRepository = {
  load: () => createLocalPriceRepository(window.localStorage).load(),
  merge: (prices, sourceName) => createLocalPriceRepository(window.localStorage).merge(prices, sourceName),
};

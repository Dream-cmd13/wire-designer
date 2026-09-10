import { materialPriceKey, type QuoteMaterial } from '@/lib/quoteMaterials';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

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
export function createDatabasePriceRepository(client: SupabaseClient | null): PriceRepository {
  const requireClient = () => {
    if (!client) throw new Error('数据库未配置，无法读取共享价格');
    return client;
  };
  const load = async (): Promise<PriceBook | null> => {
    const prices: MaterialPrice[] = [];
    let importedAt = '';
    let sourceName = '';
    // PostgREST caps each response; fetch every page before exporting or quoting.
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await requireClient().from('material_prices').select('*')
        .order('id').range(offset, offset + 499);
      if (error) throw new Error(`读取共享价格失败：${error.message}`);
      for (const row of data ?? []) {
        prices.push({ kind: row.kind, resourceId: row.resource_id, name: row.name,
          specification: row.specification, lengthMm: Number(row.length_mm), unit: row.unit,
          taxIncludedPrice: String(row.tax_included_price) });
        if (row.updated_at > importedAt) { importedAt = row.updated_at; sourceName = row.source_name; }
      }
      if ((data?.length ?? 0) < 500) break;
    }
    if (!prices.length) return null;
    // The 10000-row limit applies to each import, not to the accumulated shared library.
    for (let i = 0; i < prices.length; i += 10000) validatePrices(prices.slice(i, i + 10000));
    return { importedAt, sourceName, prices };
  };
  return { load, async merge(prices, sourceName) {
    const incoming = validatePrices(prices);
    if (!sourceName.trim() || sourceName.length > 255) throw new Error('价格文件名无效');
    const { error } = await requireClient().from('material_prices').upsert(incoming.map((row) => ({
      kind: row.kind, resource_id: row.resourceId, name: row.name, specification: row.specification,
      length_mm: row.lengthMm, unit: row.unit, tax_included_price: row.taxIncludedPrice, source_name: sourceName,
    })), { onConflict: 'kind,resource_id,specification,length_mm,unit' });
    if (error) throw new Error(`导入共享价格失败：${error.message}`);
    const book = await load();
    if (!book) throw new Error('价格已提交，但未能读取共享价格，请刷新重试');
    return book;
  } };
}
export const priceRepository = createDatabasePriceRepository(supabase);

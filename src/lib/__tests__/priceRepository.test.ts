import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createDatabasePriceRepository, type MaterialPrice } from '@/repositories/priceRepository';

const price: MaterialPrice = { kind: 'wire', resourceId: 'wire-id', name: '线材',
  specification: '["jacketed",24,4,false,"PVC","black",5,"",[]]',
  lengthMm: 1000, unit: '元/条', taxIncludedPrice: '1.123456' };
const row = { kind: price.kind, resource_id: price.resourceId, name: price.name,
  specification: price.specification, length_mm: 1000, unit: price.unit,
  tax_included_price: '1.123456', source_name: 'shared.xlsx', updated_at: '2026-09-10T00:00:00Z' };

function database(pages: unknown[][] = [[row]], failure: string | null = null) {
  const range = vi.fn();
  for (const data of pages) range.mockResolvedValueOnce({ data, error: null });
  const rpc = vi.fn().mockResolvedValue({ error: failure ? { message: failure } : null });
  const from = vi.fn().mockReturnValue({
    select: () => ({ order: () => ({ range }) }),
  });
  return { client: { from, rpc } as unknown as SupabaseClient, from, rpc, range };
}

describe('shared database prices', () => {
  it('reads all pages, preserving precise prices and length variants', async () => {
    const db = database([Array.from({ length: 500 }, (_, i) => ({ ...row, length_mm: i + 1 })), [row]]);
    const book = await createDatabasePriceRepository(db.client).load();
    expect(book?.prices).toHaveLength(501);
    expect(book?.prices[500]).toEqual(price);
    expect(db.range.mock.calls).toEqual([[0, 499], [500, 999]]);
  });
  it('submits the complete batch to the validated RPC once and reloads shared data', async () => {
    const db = database();
    const result = await createDatabasePriceRepository(db.client).merge([price, { ...price, lengthMm: 500 }], 'import.xlsx');
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith('import_material_prices', {
      price_rows: [price, { ...price, lengthMm: 500 }], source_name: 'import.xlsx',
    });
    expect(result.sourceName).toBe('shared.xlsx');
  });
  it('rejects invalid and duplicate batches before any database writes', async () => {
    const db = database();
    const repo = createDatabasePriceRepository(db.client);
    await expect(repo.merge([price, { ...price, taxIncludedPrice: '-1' }], 'bad')).rejects.toThrow();
    await expect(repo.merge([price, price], 'duplicate')).rejects.toThrow('重复');
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('reports failed writes and reads without using local prices', async () => {
    const db = database([], 'permission denied');
    const repo = createDatabasePriceRepository(db.client);
    await expect(repo.merge([price], 'import')).rejects.toThrow('permission denied');
    expect(db.range).not.toHaveBeenCalled();
    db.range.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await expect(repo.load()).rejects.toThrow('offline');
    await expect(createDatabasePriceRepository(null).load()).rejects.toThrow('数据库未配置');
  });
  it('returns null for an empty shared library', async () => {
    expect(await createDatabasePriceRepository(database([[]]).client).load()).toBeNull();
  });
});

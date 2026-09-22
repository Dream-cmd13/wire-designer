import { describe, expect, it, vi } from 'vitest';
import {
  FinishedHarnessMaterialRepository,
  FinishedHarnessMaterialRepositoryError,
  mapFinishedHarnessCostAnalysisRow,
  mapFinishedHarnessMaterialRow,
} from '@/repositories/finishedHarnessMaterialRepository';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('FinishedHarnessMaterialRepository', () => {
  it('throws error when Supabase client is not configured', async () => {
    const repo = new FinishedHarnessMaterialRepository(null);
    await expect(repo.list()).rejects.toThrow('Supabase 尚未配置，无法加载成品线束物料。');
  });

  it('maps raw row correctly and rejects invalid payload', () => {
    expect(() => mapFinishedHarnessMaterialRow(null)).toThrow(
      FinishedHarnessMaterialRepositoryError,
    );
    expect(() => mapFinishedHarnessMaterialRow({})).toThrow(
      FinishedHarnessMaterialRepositoryError,
    );
    expect(() =>
      mapFinishedHarnessMaterialRow({ id: '1' }),
    ).toThrow('成品线束物料缺少必填字段。');
    expect(
      mapFinishedHarnessMaterialRow({ id: '1', platform_no: 'WL-01', son_name: null }).sonName,
    ).toBe('');

    const valid = mapFinishedHarnessMaterialRow({
      id: 'uuid-123',
      source_material_id: 1001,
      source_goods_id: '2001',
      platform_no: 'WL-A',
      son_name: '成品线束A',
      supplier_id: 'sup-1',
      supplier: { supplier_no: 'A118' },
      file_2d: 'http://example.com/draw.pdf',
      packing_way: '箱装',
      packing: '10',
      son_unit: 'pcs',
      son_price_low: '12.500000',
      total_cost: '10.5000',
      sales_price: '15.0000',
      sample_price: '21.0000',
      quote_price: '16.0000',
      has_cost_analysis: true,
      source_excel_url: 'https://example.com/storage/cost.xlsx',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    });

    expect(valid.id).toBe('uuid-123');
    expect(valid.sourceMaterialId).toBe(1001);
    expect(valid.sourceGoodsId).toBe(2001);
    expect(valid.platformNo).toBe('WL-A');
    expect(valid.sonName).toBe('成品线束A');
    expect(valid.supplierId).toBe('sup-1');
    expect(valid.supplierNo).toBe('A118');
    expect(valid.supplier?.supplier_no).toBe('A118');
    expect(valid.file2d).toBe('http://example.com/draw.pdf');
    expect(valid.packingWay).toBe('箱装');
    expect(valid.packing).toBe(10);
    expect(valid.sonUnit).toBe('pcs');
    expect(valid.sonPriceLow).toBe(12.5);
    expect(valid.totalCost).toBe(10.5);
    expect(valid.salesPrice).toBe(15);
    expect(valid.samplePrice).toBe(21);
    expect(valid.quotePrice).toBe(16);
    expect(valid.hasCostAnalysis).toBe(true);
    expect(valid.sourceExcelUrl).toBe('https://example.com/storage/cost.xlsx');

    const withNullSourceId = mapFinishedHarnessMaterialRow({
      id: 'uuid-456',
      source_material_id: null,
      source_goods_id: null,
      platform_no: 'WL-B',
      son_name: '成品线束B',
    });
    expect(withNullSourceId.sourceMaterialId).toBeNull();
    expect(withNullSourceId.sourceGoodsId).toBeNull();
  });

  it('keeps missing cost analysis numbers as null instead of coercing to zero', () => {
    const mapped = mapFinishedHarnessCostAnalysisRow({
      id: 'ca-1',
      platform_no: 'WL-C',
      source_excel_file: 'x.xlsx',
      source_sheet_name: 'S1',
      material_cost: null,
      material_loss: '0',
      labor_cost: null,
      labor_loss: null,
      total_cost: '12.3400',
      tax_cost: null,
      sales_price: null,
      sample_price: null,
      quote_price: null,
    });

    expect(mapped.materialCost).toBeNull();
    expect(mapped.materialLoss).toBe(0);
    expect(mapped.laborCost).toBeNull();
    expect(mapped.laborLoss).toBeNull();
    expect(mapped.totalCost).toBe(12.34);
    expect(mapped.taxCost).toBeNull();
  });

  it('handles database table not exist error (42P01)', async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({
              data: null,
              error: { code: '42P01', message: 'relation "finished_harness_materials" does not exist' },
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const repo = new FinishedHarnessMaterialRepository(mockClient);
    await expect(repo.list()).rejects.toThrow(
      '数据库尚未执行初始化 SQL，找不到成品线束物料表 (finished_harness_materials)。',
    );
  });

  it('delegates search and listBySupplier to list method', async () => {
    const repo = new FinishedHarnessMaterialRepository({} as SupabaseClient);
    const listSpy = vi.spyOn(repo, 'list').mockResolvedValue([]);

    await repo.search('WL-01');
    expect(listSpy).toHaveBeenCalledWith({ query: 'WL-01' });

    await repo.listBySupplier('A118');
    expect(listSpy).toHaveBeenCalledWith({ supplierNo: 'A118' });
  });

  it('signs private bucket drawing paths and passes external links through', async () => {
    const createSignedUrl = vi.fn().mockImplementation(async (path: string) => ({
      data: { signedUrl: `https://signed.example/${path}` },
      error: null,
    }));
    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({
              data: [
                { id: '1', platform_no: 'WL-A', file_2d: 'WL-A.png' },
                { id: '2', platform_no: 'WL-B', file_2d: 'http://img.example.com/WL-B.pdf' },
              ],
              error: null,
            }),
          }),
        }),
      }),
      storage: {
        from: vi.fn().mockReturnValue({ createSignedUrl }),
      },
    } as unknown as SupabaseClient;

    const repo = new FinishedHarnessMaterialRepository(mockClient);
    const rows = await repo.list();

    expect(rows[0].file2d).toBe('https://signed.example/WL-A.png');
    expect(rows[1].file2d).toBe('http://img.example.com/WL-B.pdf');
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
  });
});

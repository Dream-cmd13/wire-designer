import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import type {
  FinishedHarnessCostAnalysis,
  FinishedHarnessMaterial,
} from '@/types/finishedHarnessMaterial';

export const FINISHED_HARNESS_MATERIAL_COLUMNS =
  'id,source_material_id,source_goods_id,platform_no,son_name,supplier_id,file_2d,packing_way,packing,son_unit,son_price_low,total_cost,sales_price,sample_price,quote_price,has_cost_analysis,source_excel_url,created_at,updated_at,supplier:suppliers(supplier_no)';

export const FINISHED_HARNESS_COST_ANALYSIS_COLUMNS =
  'id,harness_material_id,platform_no,source_excel_file,source_sheet_name,customer_name,customer_part_no,material_cost,material_loss,labor_cost,labor_loss,total_cost,tax_cost,sales_price,sample_price,quote_price,formula_config,calculation_steps,bom_items,labor_items,source_excel_url,source_excel_path,created_at,updated_at';

type Row = Record<string, unknown> & {
  supplier?: { supplier_no?: string | null } | null;
};

export class FinishedHarnessMaterialRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FinishedHarnessMaterialRepositoryError';
  }
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function mapFinishedHarnessMaterialRow(value: unknown): FinishedHarnessMaterial {
  if (!value || typeof value !== 'object') {
    throw new FinishedHarnessMaterialRepositoryError('成品线束物料数据无效。');
  }
  const row = value as Row;
  if (
    typeof row.id !== 'string' ||
    typeof row.platform_no !== 'string' ||
    typeof row.son_name !== 'string'
  ) {
    throw new FinishedHarnessMaterialRepositoryError('成品线束物料缺少必填字段。');
  }

  const supplierNo =
    row.supplier && typeof row.supplier.supplier_no === 'string' && row.supplier.supplier_no.trim()
      ? row.supplier.supplier_no.trim()
      : null;

  return {
    id: row.id,
    sourceMaterialId: row.source_material_id == null ? null : Number(row.source_material_id),
    sourceGoodsId: row.source_goods_id == null ? null : Number(row.source_goods_id),
    platformNo: row.platform_no,
    sonName: row.son_name,
    supplierId: typeof row.supplier_id === 'string' ? row.supplier_id : null,
    supplierNo,
    supplier: supplierNo ? { supplier_no: supplierNo } : null,
    file2d: typeof row.file_2d === 'string' && row.file_2d.trim() ? row.file_2d.trim() : null,
    packingWay:
      typeof row.packing_way === 'string' && row.packing_way.trim()
        ? row.packing_way.trim()
        : null,
    packing: numberOrNull(row.packing),
    sonUnit: typeof row.son_unit === 'string' && row.son_unit.trim() ? row.son_unit.trim() : null,
    sonPriceLow: numberOrNull(row.son_price_low),
    totalCost: numberOrNull(row.total_cost),
    salesPrice: numberOrNull(row.sales_price),
    samplePrice: numberOrNull(row.sample_price),
    quotePrice: numberOrNull(row.quote_price),
    hasCostAnalysis: Boolean(row.has_cost_analysis),
    sourceExcelUrl:
      typeof row.source_excel_url === 'string' && row.source_excel_url.trim()
        ? row.source_excel_url.trim()
        : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export function mapFinishedHarnessCostAnalysisRow(value: unknown): FinishedHarnessCostAnalysis {
  if (!value || typeof value !== 'object') {
    throw new FinishedHarnessMaterialRepositoryError('成本分析数据无效。');
  }
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id),
    harnessMaterialId: typeof row.harness_material_id === 'string' ? row.harness_material_id : null,
    platformNo: String(row.platform_no),
    sourceExcelFile: String(row.source_excel_file || ''),
    sourceSheetName: String(row.source_sheet_name || ''),
    customerName: typeof row.customer_name === 'string' ? row.customer_name : null,
    customerPartNo: typeof row.customer_part_no === 'string' ? row.customer_part_no : null,
    materialCost: Number(row.material_cost || 0),
    materialLoss: Number(row.material_loss || 0),
    laborCost: Number(row.labor_cost || 0),
    laborLoss: Number(row.labor_loss || 0),
    totalCost: Number(row.total_cost || 0),
    taxCost: Number(row.tax_cost || 0),
    salesPrice: numberOrNull(row.sales_price),
    samplePrice: numberOrNull(row.sample_price),
    quotePrice: numberOrNull(row.quote_price),
    formulaConfig: (row.formula_config as Record<string, unknown>) || {},
    calculationSteps: Array.isArray(row.calculation_steps) ? row.calculation_steps : [],
    bomItems: Array.isArray(row.bom_items) ? row.bom_items : [],
    laborItems: Array.isArray(row.labor_items) ? row.labor_items : [],
    sourceExcelUrl:
      typeof row.source_excel_url === 'string' && row.source_excel_url.trim()
        ? row.source_excel_url.trim()
        : null,
    sourceExcelPath:
      typeof row.source_excel_path === 'string' && row.source_excel_path.trim()
        ? row.source_excel_path.trim()
        : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export interface FinishedHarnessMaterialListOptions {
  query?: string;
  supplierNo?: string;
  hasDrawing?: boolean;
}

export class FinishedHarnessMaterialRepository {
  private readonly client: SupabaseClient | null;

  constructor(client: SupabaseClient | null = supabase) {
    this.client = client;
  }

  private requireClient(): SupabaseClient {
    if (!this.client) {
      throw new FinishedHarnessMaterialRepositoryError(
        'Supabase 尚未配置，无法加载成品线束物料。',
      );
    }
    return this.client;
  }

  private transformError(error: { code?: string; message?: string } | null): never {
    if (!error) {
      throw new FinishedHarnessMaterialRepositoryError('未知数据库操作错误。');
    }
    if (
      error.code === '42P01' ||
      (error.message && error.message.toLowerCase().includes('does not exist'))
    ) {
      throw new FinishedHarnessMaterialRepositoryError(
        '数据库尚未执行初始化 SQL，找不到成品线束物料表 (finished_harness_materials)。',
      );
    }
    throw new FinishedHarnessMaterialRepositoryError(
      `加载成品线束物料失败：${error.message ?? '未知错误'}`,
    );
  }

  async list(options: FinishedHarnessMaterialListOptions = {}): Promise<FinishedHarnessMaterial[]> {
    const client = this.requireClient();
    const rows: FinishedHarnessMaterial[] = [];

    for (let offset = 0; ; offset += 1000) {
      let request = client
        .from('finished_harness_materials')
        .select(FINISHED_HARNESS_MATERIAL_COLUMNS)
        .order('platform_no')
        .range(offset, offset + 999);

      if (options.query?.trim()) {
        const q = options.query.trim();
        request = request.or(`platform_no.ilike.%${q}%,son_name.ilike.%${q}%`);
      }

      if (options.hasDrawing === true) {
        request = request.not('file_2d', 'is', null);
      } else if (options.hasDrawing === false) {
        request = request.is('file_2d', null);
      }

      const { data, error } = await request;
      if (error) {
        this.transformError(error);
      }

      const currentBatch = (data ?? []).map(mapFinishedHarnessMaterialRow);
      rows.push(...currentBatch);

      if ((data?.length ?? 0) < 1000) {
        break;
      }
    }

    if (options.supplierNo) {
      return rows.filter((r) => r.supplierNo === options.supplierNo);
    }

    return rows;
  }

  async getById(id: string): Promise<FinishedHarnessMaterial | null> {
    const { data, error } = await this.requireClient()
      .from('finished_harness_materials')
      .select(FINISHED_HARNESS_MATERIAL_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      this.transformError(error);
    }

    return data ? mapFinishedHarnessMaterialRow(data) : null;
  }

  async getByPlatformNo(platformNo: string): Promise<FinishedHarnessMaterial | null> {
    const { data, error } = await this.requireClient()
      .from('finished_harness_materials')
      .select(FINISHED_HARNESS_MATERIAL_COLUMNS)
      .eq('platform_no', platformNo)
      .maybeSingle();

    if (error) {
      this.transformError(error);
    }

    return data ? mapFinishedHarnessMaterialRow(data) : null;
  }

  async getCostAnalysisByPlatformNo(platformNo: string): Promise<FinishedHarnessCostAnalysis | null> {
    const { data, error } = await this.requireClient()
      .from('finished_harness_cost_analyses')
      .select(FINISHED_HARNESS_COST_ANALYSIS_COLUMNS)
      .eq('platform_no', platformNo)
      .maybeSingle();

    if (error) {
      this.transformError(error);
    }

    return data ? mapFinishedHarnessCostAnalysisRow(data) : null;
  }

  async search(query: string): Promise<FinishedHarnessMaterial[]> {
    return this.list({ query });
  }

  async listBySupplier(supplierNo: string): Promise<FinishedHarnessMaterial[]> {
    return this.list({ supplierNo });
  }
}

export const finishedHarnessMaterialRepository = new FinishedHarnessMaterialRepository();

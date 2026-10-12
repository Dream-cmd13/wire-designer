import * as XLSX from 'xlsx';
import type { HarnessConfig } from '@/types/harness';
import type { QuotePrice } from './pricing';
import { canViewPricing } from './permissions';
import { DEFAULT_QUOTE_LEAD_TIME } from '@/data/catalogOptions';

/** Exports the displayed server snapshot without calculating a second price. */
export function createQuoteWorkbook(config: HarnessConfig, price: QuotePrice, mode: 'public' | 'internal' = 'public', role?: unknown, scope: 'unit' | 'order' = 'order') {
  const headers = scope === 'unit'
    ? ['产品名称', '交期', '含税含运费单价']
    : ['产品名称', '订单数量', '交期', '含税含运费单价', '订单总价'];
  const values: (string | number)[] = scope === 'unit'
    ? [config.name, DEFAULT_QUOTE_LEAD_TIME, price.unitPrice]
    : [config.name, config.quantity, DEFAULT_QUOTE_LEAD_TIME, price.unitPrice, price.totalPrice];
  if (mode === 'internal') {
    if (!canViewPricing(role) || !price.breakdown) throw new Error('无内部成本导出权限');
    const p = price.breakdown;
    for (const row of [...p.materials, ...p.labor]) {
      headers.push(row.name + ' 用量', row.name + ' 单价', row.name + ' 金额');
      values.push(row.points, row.unitPrice, row.amount);
    }
    headers.push('材料损耗', '加工损耗', '产品含税成本', '产品含税售价', '运费');
    values.push(p.materialLoss, p.processingLoss, p.cost, p.sellingPrice, p.freight);
  }
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers, values]);
  sheet['!cols'] = headers.map(() => ({ wch: 24 }));
  XLSX.utils.book_append_sheet(book, sheet, mode === 'internal' ? '成本分析' : '报价单');
  return book;
}

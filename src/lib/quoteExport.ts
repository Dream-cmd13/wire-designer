import * as XLSX from 'xlsx';
import type { HarnessConfig } from '@/types/harness';
import type { QuotePrice } from './pricing';
import { canViewPricing } from './permissions';
import type { CatalogSnapshot } from '@/types/catalog';
import { formatMaterialSpecification, getQuoteMaterials } from './quoteMaterials';

export function formatQuoteTime(value?: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '未提供';
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(value));
  return `${parts} (北京时间)`;
}

export interface QuoteExportContext {
  catalog: CatalogSnapshot | null;
  calculatedAt?: string;
  settingsVersion?: number;
}

/** Exports the displayed server snapshot without calculating a second price. */
export function createQuoteWorkbook(config: HarnessConfig, price: QuotePrice, mode: 'public' | 'internal' = 'public', role?: unknown, scope: 'unit' | 'order' = 'order', context?: QuoteExportContext) {
  const headers = scope === 'unit'
    ? ['产品名称', '含税含运费单价']
    : ['产品名称', '订单数量', '含税含运费单价', '订单总价'];
  const values: (string | number)[] = scope === 'unit'
    ? [config.name, price.unitPrice]
    : [config.name, config.quantity, price.unitPrice, price.totalPrice];
  const connectorLabel = (index: number) => {
    const c = config.connectors[index]?.connector;
    if (!c) return index === 1 && config.quotation?.endpointBType === 'strip-tin' ? '剥皮沾锡' : '切断端';
    const id = c.id.trim();
    const model = c.model?.trim() || c.name.trim();
    const identifier = id.toLowerCase() === model.toLowerCase()
      ? model : [id, model].filter(Boolean).join(' · ');
    return `${identifier} · ${c.pinCount}Pin · ${c.type === 'male' ? '公头' : c.type === 'female' ? '母头' : '插座'} · ${c.shielded === undefined ? '屏蔽属性未提供' : c.shielded ? '屏蔽' : '非屏蔽'}`;
  };
  const materials = getQuoteMaterials(config, context?.catalog ?? null);
  const describe = (kind: 'wire' | 'outer-mold' | 'inner-mold') => materials.filter(row => row.kind === kind)
    .map(row => {
      const code = kind === 'wire' ? context?.catalog?.wires.find(w => w.resourceItemId === row.resourceId)?.id
        : context?.catalog?.overmolds.find(m => (m.resourceItemId || m.id) === row.resourceId)?.id;
      return `${row.name}${code ? ` (${code})` : ''} · ${row.specification ? formatMaterialSpecification(row) : '规格未提供'} × ${row.quantity}${kind === 'wire' ? '条' : '个'}`;
    }).join('；') || '无';
  headers.push('A端配置', 'B端配置', '线材配置', '外模配置', '内模配置', '核价时间');
  values.push(connectorLabel(0), connectorLabel(1), describe('wire'), describe('outer-mold'), describe('inner-mold'), formatQuoteTime(context?.calculatedAt));
  if (mode === 'internal') {
    if (!canViewPricing(role) || !price.breakdown) throw new Error('无内部成本导出权限');
    const p = price.breakdown;
    headers.push('计价规则版本');
    values.push(context?.settingsVersion ?? '未提供');
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

import Decimal from 'decimal.js';
import type { HarnessConfig } from '@/types/harness';
import type { CatalogSnapshot } from '@/types/catalog';
import type { MaterialPrice } from '@/repositories/priceRepository';
import { getQuoteMaterials, materialPriceTierKey } from './quoteMaterials';

const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const formatQuoteMoney = (value: string) => new Money(value).toFixed(2);
export interface QuoteLine { name: string; points: number; unitPrice: string; amount: string }
export interface QuoteBreakdown {
  materials: QuoteLine[];
  labor: QuoteLine[];
  materialSubtotal: string;
  laborSubtotal: string;
  materialLoss: string;
  processingLoss: string;
  cost: string;
  sellingPrice: string;
  freight: string;
  unitPrice: string;
  totalPrice: string;
}
export type QuoteResult = { status: 'blocked' | 'manual'; issues: string[] } | { status: 'ready'; price: QuoteBreakdown };

export function calculatePrice(config: HarnessConfig, prices: MaterialPrice[], catalog: CatalogSnapshot | null): QuoteResult {
  const issues: string[] = [];
  const wire = config.materials[0];
  if (config.materials.length !== 1) issues.push('自动报价仅支持一根实体线材');
  if (!wire || !Number.isSafeInteger(wire.spec.lengthMm) || wire.spec.lengthMm <= 0) issues.push('线长必须为正整数毫米');
  if (!Number.isSafeInteger(config.quantity) || config.quantity < 1 || config.quantity > 1000000) issues.push('订单数量必须为 1 至 1000000 的整数');
  if (!config.connectors.length || config.connectors.length > 2) issues.push('第一版仅支持单头或双头连接器');
  if (config.connectors.some(({ connector: c }) => !/\bM(?:8|12)(?!\d)/i.test(c.series || c.name))) issues.push('自动报价仅支持 M8、M12 连接器');
  const settings = config.quotation;
  if (!settings || ![1, 2].includes(settings.processingEnds)) issues.push('请确认加工端数与 SR 点数');
  if (settings && (settings.processingEnds !== config.connectors.length
    || !Number.isInteger(settings.srPoints) || settings.srPoints < 0 || settings.srPoints > settings.processingEnds)) issues.push('加工端数须与连接器个数一致，SR 点数不能超过端数');
  if (settings && config.models.length > settings.processingEnds) issues.push('外模个数不能超过加工端数');
  for (const model of config.models) {
    const spec = catalog?.overmolds.find((entry) => entry.id === model.overmoldSpecId);
    if (!spec || spec.outerMaterial !== '黑色PVC' || spec.outerHardness !== '45P') issues.push('外模须为目录中的黑色 PVC 45P');
  }
  const cores = wire?.spec.kind === 'jacketed' ? wire.spec.coreCount : 1;
  if (!Number.isInteger(cores) || cores < 1 || cores > 100) issues.push('线材芯数必须为 1 至 100');
  if (issues.length) return { status: 'blocked', issues: [...new Set(issues)] };
  if (wire.spec.lengthMm > 5000) return { status: 'manual', issues: ['超过 5 米，需人工核价'] };
  const materialLines: QuoteLine[] = [];
  for (const row of getQuoteMaterials(config, catalog)) {
    const matches = prices.filter((price) => materialPriceTierKey(price) === materialPriceTierKey(row)
      && price.lengthMm >= row.lengthMm).sort((a, b) => a.lengthMm - b.lengthMm);
    const selectedLength = matches[0]?.lengthMm;
    const selected = matches.filter((price) => price.lengthMm === selectedLength);
    if (!row.resourceId || selected.length !== 1) { issues.push(`${row.name}：缺少唯一匹配的含税价格${row.kind === 'wire' ? `（实际 ${row.lengthMm}mm，需不小于该长度的价格档位）` : ''}`); continue; }
    if (!/^\d{1,9}(\.\d{1,6})?$/.test(selected[0].taxIncludedPrice)) { issues.push(`${row.name}：价格无效`); continue; }
    const amount = new Money(selected[0].taxIncludedPrice);
    if (!amount.isFinite() || amount.isNegative()) { issues.push(`${row.name}：价格无效`); continue; }
    materialLines.push({ name: row.name, points: row.quantity, unitPrice: amount.toString(), amount: amount.mul(row.quantity).toString() });
  }
  if (issues.length) return { status: 'blocked', issues };
  const ends = settings!.processingEnds;
  const shield = wire.spec.kind === 'jacketed' && wire.spec.shielded;
  const molding = config.models.length + config.models.filter((model) => model.includeInnerMold).length + settings!.srPoints;
  const laborInput: [string, number, string][] = [
    ['裁线', Math.ceil(wire.spec.lengthMm / 500), '0.05'], ['去皮', cores * ends, '0.02'],
    ['去外皮', ends, '0.02'], ['处理编织', shield ? ends : 0, '0.10'],
    ['热缩编织', shield ? ends : 0, '0.10'], ['焊接', (cores + (shield ? 1 : 0)) * ends, '0.20'],
    ['成型', molding, '0.20'], ['电测', 1, '0.05'], ['外观', 1, '0.20'], ['包装人工', 1, '0.20'],
  ];
  const labor = laborInput.map(([name, points, unitPrice]) => ({ name, points, unitPrice, amount: new Money(unitPrice).mul(points).toString() }));
  const sum = (lines: QuoteLine[]) => lines.reduce((total, row) => total.plus(row.amount), new Money(0));
  const m = sum(materialLines), p = sum(labor);
  const materialLoss = m.mul('0.03'), processingLoss = p.mul('0.05');
  const cost = m.plus(p).plus(materialLoss).plus(processingLoss);
  const sellingPrice = cost.div('0.8'), freight = sellingPrice.mul('0.03');
  const unitPrice = sellingPrice.plus(freight).toFixed(2);
  return { status: 'ready', price: {
    materials: materialLines, labor, materialSubtotal: m.toString(), laborSubtotal: p.toString(),
    materialLoss: materialLoss.toString(), processingLoss: processingLoss.toString(), cost: cost.toString(),
    sellingPrice: sellingPrice.toString(), freight: freight.toString(), unitPrice,
    totalPrice: new Money(unitPrice).mul(config.quantity).toFixed(2),
  } };
}

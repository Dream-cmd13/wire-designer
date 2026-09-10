import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import type { HarnessConfig } from '@/types/harness';
import type { CatalogSnapshot } from '@/types/catalog';
import type { MaterialPrice } from '@/repositories/priceRepository';
import { calculatePrice } from './pricing';
import { formatMaterialSpecification, getQuoteMaterials } from './quoteMaterials';

/** Snapshot export: formulas and rounding are owned by the tested quote calculator. */
export function createQuoteWorkbook(config: HarnessConfig, prices: MaterialPrice[], catalog: CatalogSnapshot | null) {
  const result = calculatePrice(config, prices, catalog);
  if (result.status !== 'ready') throw new Error(result.issues.join('；'));
  const p = result.price;
  const materials = getQuoteMaterials(config, catalog);
  const wire = materials.find((row) => row.kind === 'wire')!;
  const materialCost = (kind: string) => p.materials.reduce((sum, row, index) => materials[index].kind === kind ? sum.plus(row.amount) : sum, new Decimal(0)).toNumber();
  const headers = ['产品名称', '连接器规格', '线材规格', '芯线颜色', '线材外被材质', '订单数量',
    '连接器含税', '线材含税', '外模 黑色PVC 45P 含税', '内模含税', 'SR含税', '材料损耗',
    ...p.labor.map((row) => row.name), '加工损耗', '产品含税成本', '产品含税售价 20%', '运费 3%', '含税含运费单价', '订单总价'];
  const spec = config.materials[0].spec;
  const values = [config.name,
    materials.filter((row) => row.kind === 'connector').map((row) => `${row.name} ${formatMaterialSpecification(row)} × ${row.quantity}`).join('；'),
    formatMaterialSpecification(wire), spec.kind === 'jacketed' ? spec.coreColors.join(' ') : spec.color,
    spec.kind === 'jacketed' ? `${spec.jacketColor === 'black' ? '黑色' : '绿色'}${spec.jacketMaterial}` : '', config.quantity,
    materialCost('connector'), materialCost('wire'), materialCost('outer-mold'), 0, 0, Number(p.materialLoss),
    ...p.labor.map((row) => Number(row.amount)), Number(p.processingLoss), Number(p.cost), Number(p.sellingPrice), Number(p.freight), Number(p.unitPrice), Number(p.totalPrice)];
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers, values]);
  sheet['!cols'] = headers.map((_, index) => ({ wch: index === 1 || index === 2 ? 80 : index === 0 ? 30 : 20 }));
  for (let column = 6; column < headers.length; column++) sheet[XLSX.utils.encode_cell({ r: 1, c: column })].z = '0.00';
  sheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}2` };
  XLSX.utils.book_append_sheet(book, sheet, config.connectors.every(({ connector }) => /M8(?!\d)/i.test(connector.series || connector.name)) ? '成本分析-M8单线' : '成本分析-M12单线');
  return book;
}

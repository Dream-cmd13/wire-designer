import { describe, expect, it } from 'vitest';
import { appendDrawingMaterial, renumberDrawingMaterials } from '@/lib/drawingMaterials';
import { createBlankDrawingDocument } from '@/lib/drawingDocument';
import type { DrawingBomTableObject } from '@/types/drawing';

describe('drawing materials', () => {
  it('appends trimmed material rows immutably and grows the table', () => {
    const drawing = createBlankDrawingDocument('BOM test');
    const source = drawing.objects.find((object): object is DrawingBomTableObject => object.kind === 'bom-table')!;
    const first = appendDrawingMaterial(source, { code: ' M-01 ', nameAndSpecification: ' 插座 C20 ', unit: ' PCS ', quantity: ' 2 ', note: ' 主件 ' });
    const second = appendDrawingMaterial(first, { code: 'W-02', nameAndSpecification: 'UL1007', unit: 'M', quantity: '1.5', note: '' });

    expect(source.rows).toEqual([]);
    expect(second.rows).toEqual([
      { 序号: '1', 物料编码: 'M-01', '物料名称/规格': '插座 C20', 单位: 'PCS', 用量: '2', 备注: '主件' },
      { 序号: '2', 物料编码: 'W-02', '物料名称/规格': 'UL1007', 单位: 'M', 用量: '1.5', 备注: '' },
    ]);
    expect(second.height).toBeGreaterThan(source.height);
    expect(second.rowHeights).toHaveLength(2);
  });

  it('renumbers arbitrary material rows from one', () => {
    expect(renumberDrawingMaterials([
      { 序号: '9', 物料编码: 'A' },
      { 序号: '', 物料编码: 'B' },
    ])).toEqual([
      { 序号: '1', 物料编码: 'A' },
      { 序号: '2', 物料编码: 'B' },
    ]);
  });
});

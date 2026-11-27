import { describe, expect, it } from 'vitest';
import {
  appendDrawingMaterial,
  moveDrawingMaterial,
  removeDrawingMaterial,
  renumberDrawingMaterials,
  updateDrawingMaterial,
} from '@/lib/drawingMaterials';
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
    expect(first.y + first.height).toBe(source.y + source.height);
    expect(second.y + second.height).toBe(source.y + source.height);
    expect(second.y + second.height).toBeLessThanOrEqual(780);
  });

  it('keeps a bottom-placed material table inside the page when rows grow', () => {
    const drawing = createBlankDrawingDocument('BOM boundary test');
    const source = drawing.objects.find((object): object is DrawingBomTableObject => object.kind === 'bom-table')!;
    const nearBottom = { ...source, y: 770 };
    const next = appendDrawingMaterial(nearBottom, { code: 'M-01', nameAndSpecification: 'UL1007', unit: 'M', quantity: '1', note: '' });

    expect(next.y).toBe(738);
    expect(next.y + next.height).toBe(780);
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

  it('updates, reorders, and removes material rows while keeping bottom anchored', () => {
    const drawing = createBlankDrawingDocument('BOM edit test');
    const source = drawing.objects.find((object): object is DrawingBomTableObject => object.kind === 'bom-table')!;
    const added = appendDrawingMaterial(
      appendDrawingMaterial(source, { code: 'M-01', nameAndSpecification: '端子A', unit: 'PCS', quantity: '1', note: '' }),
      { code: 'W-02', nameAndSpecification: '线材B', unit: 'M', quantity: '2', note: '' },
    );

    const moved = moveDrawingMaterial(added, 1, 'up');
    expect(moved.rows.map((row) => `${row.序号}:${row.物料编码}`)).toEqual(['1:W-02', '2:M-01']);

    const updated = updateDrawingMaterial(moved, 0, { code: 'W-02X', nameAndSpecification: '线材B改', unit: 'MM', quantity: '200', note: '已改' });
    expect(updated.rows[0]).toMatchObject({ 序号: '1', 物料编码: 'W-02X', '物料名称/规格': '线材B改', 单位: 'MM', 用量: '200', 备注: '已改' });

    const removed = removeDrawingMaterial(updated, 0);
    expect(removed.rows).toHaveLength(1);
    expect(removed.rows[0]).toMatchObject({ 序号: '1', 物料编码: 'M-01' });
    expect(removed.y + removed.height).toBe(source.y + source.height);
  });
});

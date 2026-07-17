import { describe, expect, it } from 'vitest';
import { createBlankDrawingDocument, DRAWING_PAGE, DRAWING_PAGE_INSET, formatDrawingDate } from '@/lib/drawingDocument';

describe('drawing workbench default tables', () => {
  it('formats the local creation date without explanatory text', () => {
    expect(formatDrawingDate(new Date(2026, 6, 15))).toBe('2026.07.15');
  });

  it('creates exactly the three visible default tables for a new drawing', () => {
    const drawing = createBlankDrawingDocument('测试图纸', new Date(2026, 6, 15));
    const visible = drawing.objects.filter((object) => object.visible);
    const tables = visible.filter((object) => object.kind === 'table' || object.kind === 'bom-table' || object.kind === 'wiring-table');

    expect(visible).toHaveLength(3);
    expect(tables.map((table) => table.tableRole)).toEqual(['bom', 'revision', 'title-block']);

    const bom = tables.find((table) => table.tableRole === 'bom')!;
    expect(bom.kind).toBe('bom-table');
    expect(bom.columns).toEqual(['序号', '物料编码', '物料名称/规格', '单位', '用量', '备注']);
    expect(bom.rows).toEqual([]);
    expect(bom.showTitleRow).toBe(false);

    const revision = tables.find((table) => table.tableRole === 'revision')!;
    expect(revision.columns).toEqual(['版本', '变更内容', '日期', '变更者']);
    expect(revision.rows).toEqual([
      { 版本: 'A', 变更内容: '新版发行', 日期: '2026.07.15', 变更者: '' },
      { 版本: '', 变更内容: '', 日期: '', 变更者: '' },
    ]);

    const title = tables.find((table) => table.tableRole === 'title-block')!;
    expect(title.columns).toHaveLength(9);
    expect(title.rows).toHaveLength(4);
    expect(title.mergedCells).toEqual([
      { rowIndex: -1, columnIndex: 0, rowSpan: 1, columnSpan: 5 },
      { rowIndex: -1, columnIndex: 5, rowSpan: 1, columnSpan: 4 },
      { rowIndex: 0, columnIndex: 6, rowSpan: 1, columnSpan: 3 },
      { rowIndex: 1, columnIndex: 6, rowSpan: 1, columnSpan: 3 },
      { rowIndex: 2, columnIndex: 0, rowSpan: 2, columnSpan: 2 },
      { rowIndex: 3, columnIndex: 3, rowSpan: 1, columnSpan: 2 },
      { rowIndex: 3, columnIndex: 6, rowSpan: 1, columnSpan: 3 },
    ]);
    expect(title.projectionCellKey).toBe('row-2-column-0');
    expect(title.x + title.width).toBeLessThanOrEqual(DRAWING_PAGE.width - DRAWING_PAGE_INSET);
    expect(title.y + title.height).toBeLessThanOrEqual(DRAWING_PAGE.height - DRAWING_PAGE_INSET);
    expect(title.rows[3].C4).toBe('');
    expect(title.rows[3]).toMatchObject({ C3: '工程图号', C6: '页次', C7: '1 of 1' });
  });
});

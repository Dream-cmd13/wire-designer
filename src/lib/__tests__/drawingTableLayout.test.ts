import { describe, expect, it } from 'vitest';
import { createDrawingTableObject, defaultDrawingObjectStyle } from '@/lib/drawingDocument';
import { getDrawingTableTargetObject, resizeDrawingTableCell, resizeDrawingTableText, resolveDrawingTableCells, resolveDrawingTableLayout, scaleDrawingTable } from '@/lib/drawingTableLayout';
import type { DrawingTableObject } from '@/types/drawing';

const legacyTable: DrawingTableObject = {
  id: 'table-1', kind: 'table', x: 100, y: 80, width: 300, height: 120,
  rotation: 0, zIndex: 1, locked: false, visible: true, style: defaultDrawingObjectStyle,
  title: '表格', columns: ['A', 'B', 'C'], rows: [{ A: '', B: '', C: '' }, { A: '', B: '', C: '' }],
};

describe('drawing table layout', () => {
  it('resolves legacy tables without stored layout', () => {
    const layout = resolveDrawingTableLayout(legacyTable);
    expect(layout.showTitleRow).toBe(true);
    expect(layout.columnWidths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(legacyTable.width);
    expect(layout.rowHeights).toHaveLength(legacyTable.rows.length);
  });

  it('resizes a cell by changing its whole column and row', () => {
    const patch = resizeDrawingTableCell(legacyTable, { rowIndex: 1, columnIndex: 0 }, { width: 140, height: 32 });
    expect(patch.columnWidths?.[0]).toBe(140);
    expect(patch.rowHeights?.[1]).toBe(32);
    expect(patch.width).toBeGreaterThan(legacyTable.width);
  });

  it('scales table layout and text around the table center', () => {
    const table = { ...legacyTable, columnWidths: [100, 100, 100], rowHeights: [20, 20], textOffsets: { title: { x: 4, y: 2 } } };
    const patch = scaleDrawingTable(table, 2);
    expect(patch).toMatchObject({ x: -50, y: 20, width: 600, height: 240 });
    expect(patch.columnWidths).toEqual([200, 200, 200]);
    expect(patch.style?.fontSize).toBe(table.style.fontSize * 2);
    expect(patch.textOffsets?.title).toEqual({ x: 8, y: 4 });
  });

  it('creates parameterized tables and resolves cell and text target bounds', () => {
    const table = createDrawingTableObject({ x: 10, y: 20 }, { rowCount: 3, columnCount: 4, showTitleRow: false });
    expect(table.columns).toEqual(['列1', '列2', '列3', '列4']);
    expect(table.rows).toHaveLength(3);
    expect(table.showTitleRow).toBe(false);
    const cell = getDrawingTableTargetObject(table, { kind: 'table-cell', objectId: table.id, key: 'row-0-column-1', rowIndex: 0, columnIndex: 1 });
    const text = getDrawingTableTargetObject(table, { kind: 'table-text', objectId: table.id, key: 'row-0-column-1', rowIndex: 0, columnIndex: 1 });
    expect(cell.width).toBeCloseTo(table.width / 4);
    expect(text.width).toBeLessThan(cell.width);
    expect(resizeDrawingTableText(table, 'row-0-column-1', { width: 60, height: 16, fontSize: 10 }).textSizes?.['row-0-column-1']).toEqual({ width: 60, height: 16, fontSize: 10 });
  });

  it('resolves merged header and body cells without covered duplicates', () => {
    const table: DrawingTableObject = {
      ...legacyTable,
      height: 76,
      columnWidths: [100, 100, 100],
      headerRowHeight: 20,
      rowHeights: [24, 32],
      showTitleRow: false,
      mergedCells: [
        { rowIndex: -1, columnIndex: 0, rowSpan: 1, columnSpan: 2 },
        { rowIndex: 0, columnIndex: 0, rowSpan: 2, columnSpan: 1 },
      ],
    };

    const cells = resolveDrawingTableCells(table);
    expect(cells).toHaveLength(7);
    expect(cells.find((cell) => cell.key === 'column-0')).toMatchObject({ width: 200, height: 20, rowSpan: 1, columnSpan: 2 });
    expect(cells.find((cell) => cell.key === 'row-0-column-0')).toMatchObject({ width: 100, height: 56, rowSpan: 2, columnSpan: 1 });
    expect(cells.some((cell) => cell.key === 'column-1')).toBe(false);
    expect(cells.some((cell) => cell.key === 'row-1-column-0')).toBe(false);
  });
});

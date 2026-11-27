import { DEFAULT_TABLE_ROW_HEIGHT, resolveDrawingTableLayout } from '@/lib/drawingTableLayout';
import { DRAWING_PAGE, DRAWING_PAGE_INSET } from '@/lib/drawingDocument';
import type { DrawingBomTableObject, DrawingTableRow } from '@/types/drawing';

export type DrawingMaterialInput = {
  code: string;
  nameAndSpecification: string;
  unit: string;
  quantity: string;
  note: string;
};

export function renumberDrawingMaterials(rows: DrawingTableRow[]): DrawingTableRow[] {
  return rows.map((row, index) => ({ ...row, 序号: String(index + 1) }));
}

function finalizeBomRows(
  table: DrawingBomTableObject,
  nextRows: DrawingTableRow[],
  nextRowHeights: number[],
): DrawingBomTableObject {
  const layout = resolveDrawingTableLayout(table);
  const rows = renumberDrawingMaterials(nextRows);
  const rowHeights = Array.from({ length: rows.length }, (_, index) => nextRowHeights[index] ?? DEFAULT_TABLE_ROW_HEIGHT);
  const height = (layout.showTitleRow ? layout.titleRowHeight : 0)
    + layout.headerRowHeight
    + rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0);
  const bottom = Math.min(table.y + table.height, DRAWING_PAGE.height - DRAWING_PAGE_INSET);
  return {
    ...table,
    y: Math.max(DRAWING_PAGE_INSET, bottom - height),
    rows,
    rowHeights,
    height,
  };
}

function materialRowFromInput(input: DrawingMaterialInput): DrawingTableRow {
  return {
    序号: '',
    物料编码: input.code.trim(),
    '物料名称/规格': input.nameAndSpecification.trim(),
    单位: input.unit.trim(),
    用量: input.quantity.trim(),
    备注: input.note.trim(),
  };
}

export function appendDrawingMaterial(table: DrawingBomTableObject, input: DrawingMaterialInput): DrawingBomTableObject {
  const layout = resolveDrawingTableLayout(table);
  return finalizeBomRows(
    table,
    [...table.rows, materialRowFromInput(input)],
    [...layout.rowHeights, DEFAULT_TABLE_ROW_HEIGHT],
  );
}

export function updateDrawingMaterial(
  table: DrawingBomTableObject,
  rowIndex: number,
  input: DrawingMaterialInput,
): DrawingBomTableObject {
  if (rowIndex < 0 || rowIndex >= table.rows.length) return table;
  const layout = resolveDrawingTableLayout(table);
  return finalizeBomRows(
    table,
    table.rows.map((row, index) => (index === rowIndex ? materialRowFromInput(input) : row)),
    layout.rowHeights,
  );
}

export function moveDrawingMaterial(
  table: DrawingBomTableObject,
  rowIndex: number,
  direction: 'up' | 'down',
): DrawingBomTableObject {
  const targetIndex = direction === 'up' ? rowIndex - 1 : rowIndex + 1;
  if (rowIndex < 0 || rowIndex >= table.rows.length || targetIndex < 0 || targetIndex >= table.rows.length) {
    return table;
  }
  const layout = resolveDrawingTableLayout(table);
  const rows = [...table.rows];
  const rowHeights = [...layout.rowHeights];
  [rows[rowIndex], rows[targetIndex]] = [rows[targetIndex], rows[rowIndex]];
  [rowHeights[rowIndex], rowHeights[targetIndex]] = [rowHeights[targetIndex] ?? DEFAULT_TABLE_ROW_HEIGHT, rowHeights[rowIndex] ?? DEFAULT_TABLE_ROW_HEIGHT];
  return finalizeBomRows(table, rows, rowHeights);
}

export function removeDrawingMaterial(table: DrawingBomTableObject, rowIndex: number): DrawingBomTableObject {
  if (rowIndex < 0 || rowIndex >= table.rows.length) return table;
  const layout = resolveDrawingTableLayout(table);
  return finalizeBomRows(
    table,
    table.rows.filter((_, index) => index !== rowIndex),
    layout.rowHeights.filter((_, index) => index !== rowIndex),
  );
}

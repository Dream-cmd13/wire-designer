import { DEFAULT_TABLE_ROW_HEIGHT, resolveDrawingTableLayout } from '@/lib/drawingTableLayout';
import { DRAWING_PAGE } from '@/lib/drawingDocument';
import type { DrawingBomTableObject, DrawingTableRow } from '@/types/drawing';

export type DrawingMaterialInput = {
  code: string;
  nameAndSpecification: string;
  unit: string;
  quantity: string;
  note: string;
};

const DRAWING_PAGE_INSET = 20;

export function renumberDrawingMaterials(rows: DrawingTableRow[]): DrawingTableRow[] {
  return rows.map((row, index) => ({ ...row, 序号: String(index + 1) }));
}

export function appendDrawingMaterial(table: DrawingBomTableObject, input: DrawingMaterialInput): DrawingBomTableObject {
  const layout = resolveDrawingTableLayout(table);
  const rows = renumberDrawingMaterials([...table.rows, {
    序号: '',
    物料编码: input.code.trim(),
    '物料名称/规格': input.nameAndSpecification.trim(),
    单位: input.unit.trim(),
    用量: input.quantity.trim(),
    备注: input.note.trim(),
  }]);
  const rowHeights = Array.from({ length: rows.length }, (_, index) => layout.rowHeights[index] ?? DEFAULT_TABLE_ROW_HEIGHT);
  const height = (layout.showTitleRow ? layout.titleRowHeight : 0) + layout.headerRowHeight + rowHeights.reduce((sum, height) => sum + height, 0);
  const bottom = Math.min(table.y + table.height, DRAWING_PAGE.height - DRAWING_PAGE_INSET);
  return {
    ...table,
    y: Math.max(DRAWING_PAGE_INSET, bottom - height),
    rows,
    rowHeights,
    height,
  };
}

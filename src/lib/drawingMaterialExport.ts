import * as XLSX from 'xlsx';
import { safeFilename } from '@/lib/designFile';
import type { DrawingBomTableObject, DrawingDocument } from '@/types/drawing';

const MATERIAL_COLUMNS = ['序号', '物料编码', '物料名称/规格', '单位', '用量', '备注'] as const;

export function createDrawingMaterialWorkbook(table: DrawingBomTableObject): XLSX.WorkBook {
  const rows = [
    [...MATERIAL_COLUMNS],
    ...table.rows.map((row) => MATERIAL_COLUMNS.map((column) => row[column] ?? '')),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 8 }, { wch: 18 }, { wch: 36 }, { wch: 10 }, { wch: 10 }, { wch: 24 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, '物料表');
  return workbook;
}

export function getDrawingMaterialExportFilename(drawing: DrawingDocument): string {
  return `${safeFilename(drawing.titleBlock.drawingNo || drawing.name)}-物料表.xlsx`;
}

export function downloadDrawingMaterialXlsx(drawing: DrawingDocument, table: DrawingBomTableObject) {
  XLSX.writeFile(createDrawingMaterialWorkbook(table), getDrawingMaterialExportFilename(drawing), { compression: true });
}

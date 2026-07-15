import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { createBlankDrawingDocument } from '@/lib/drawingDocument';
import { createDrawingMaterialWorkbook, getDrawingMaterialExportFilename } from '@/lib/drawingMaterialExport';
import type { DrawingBomTableObject } from '@/types/drawing';

describe('drawing material XLSX export', () => {
  it('creates the fixed material headers and current rows', () => {
    const drawing = createBlankDrawingDocument('导出物料');
    const table = drawing.objects.find((object): object is DrawingBomTableObject => object.kind === 'bom-table')!;
    const populated = { ...table, rows: [{ 序号: '1', 物料编码: 'M-01', '物料名称/规格': '插座 C20', 单位: 'PCS', 用量: '2', 备注: '主件' }] };

    const workbook = createDrawingMaterialWorkbook(populated);
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets['物料表'], { header: 1 });

    expect(workbook.SheetNames).toEqual(['物料表']);
    expect(rows).toEqual([
      ['序号', '物料编码', '物料名称/规格', '单位', '用量', '备注'],
      ['1', 'M-01', '插座 C20', 'PCS', '2', '主件'],
    ]);
  });

  it('keeps the header in an empty workbook and builds a safe default filename', () => {
    const drawing = createBlankDrawingDocument('测试/图纸');
    const table = drawing.objects.find((object): object is DrawingBomTableObject => object.kind === 'bom-table')!;
    const workbook = createDrawingMaterialWorkbook(table);

    expect(XLSX.utils.sheet_to_json<string[]>(workbook.Sheets['物料表'], { header: 1 })).toEqual([
      ['序号', '物料编码', '物料名称/规格', '单位', '用量', '备注'],
    ]);
    expect(getDrawingMaterialExportFilename(drawing)).toBe('WH-NEW-物料表.xlsx');
    expect(getDrawingMaterialExportFilename({ ...drawing, titleBlock: { ...drawing.titleBlock, drawingNo: '' } })).toBe('测试-图纸-物料表.xlsx');
  });
});

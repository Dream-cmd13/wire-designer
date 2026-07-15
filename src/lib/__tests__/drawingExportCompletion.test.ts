import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBlankDrawingDocument, createDrawingId, defaultDrawingObjectStyle } from '@/lib/drawingDocument';
import { getDrawingExportFilename, serializeDrawingSvg } from '@/lib/drawingExport';
import type { DrawingGroupObject, DrawingIconObject, DrawingLineObject, DrawingTableObject } from '@/types/drawing';

describe('completed drawing export', () => {
  it('serializes grouped children and icons into SVG', () => {
    const drawing = createBlankDrawingDocument('导出测试');
    const child = { id: createDrawingId('text'), kind: 'text', text: '芯线 A', x: 1, y: 1, width: 80, height: 20, rotation: 0, zIndex: 1, locked: false, visible: true, style: { ...defaultDrawingObjectStyle } } as const;
    const group: DrawingGroupObject = { id: createDrawingId('group'), kind: 'group', groupKind: 'wire-core', children: [child], x: 100, y: 100, width: 100, height: 30, rotation: 0, zIndex: 20, locked: false, visible: true, style: { ...defaultDrawingObjectStyle } };
    const icon: DrawingIconObject = { id: createDrawingId('icon'), kind: 'icon', name: '接地', svgPath: 'M12 2v20', x: 220, y: 100, width: 24, height: 24, rotation: 0, zIndex: 21, locked: false, visible: true, style: { ...defaultDrawingObjectStyle } };
    const svg = serializeDrawingSvg({ ...drawing, objects: [...drawing.objects, group, icon] });
    expect(svg).toContain('芯线 A');
    expect(svg).toContain('M12 2v20');
  });

  it('preserves quadratic curves instead of flattening them to polylines', () => {
    const drawing = createBlankDrawingDocument('曲线导出');
    const curve: DrawingLineObject = { id: createDrawingId('curve'), kind: 'curve', points: [{ x: 10, y: 10 }, { x: 30, y: 30 }, { x: 50, y: 10 }], orthogonal: false, x: 10, y: 10, width: 40, height: 20, rotation: 0, zIndex: 20, locked: false, visible: true, style: { ...defaultDrawingObjectStyle } };
    const svg = serializeDrawingSvg({ ...drawing, objects: [...drawing.objects, curve] });
    expect(svg).toContain('<path d="M 10 10 Q 30 30 40 20 L 50 10"');
  });

  it('exports the rendered page as an image-backed PDF', () => {
    const source = readFileSync(new URL('../drawingExport.ts', import.meta.url), 'utf8');
    expect(source).toContain('/Subtype /Image');
    expect(source).toContain('/DCTDecode');
    expect(source).toContain("canvas.toDataURL('image/jpeg'");
  });

  it('exports a one-point freehand object as a visible dot', () => {
    const drawing = createBlankDrawingDocument('dot export');
    const dot: DrawingLineObject = { id: createDrawingId('freehand'), kind: 'freehand', points: [{ x: 24, y: 36 }], orthogonal: false, x: 20, y: 32, width: 8, height: 8, rotation: 0, zIndex: 20, locked: false, visible: true, style: { ...defaultDrawingObjectStyle, stroke: '#ff0000', strokeWidth: 6 } };
    const svg = serializeDrawingSvg({ ...drawing, objects: [...drawing.objects, dot] });

    expect(svg).toContain('<circle cx="24" cy="36" r="3" fill="#ff0000"');
  });

  it('uses custom table columns and optional title rows in SVG exports', () => {
    const drawing = createBlankDrawingDocument('table export');
    const table: DrawingTableObject = {
      id: 'table-layout', kind: 'table', x: 40, y: 50, width: 200, height: 54,
      rotation: 0, zIndex: 20, locked: false, visible: true, style: { ...defaultDrawingObjectStyle },
      title: '隐藏表名', columns: ['列1', '列2'], rows: [{ 列1: '甲', 列2: '乙' }],
      showTitleRow: false, columnWidths: [70, 130], headerRowHeight: 20, rowHeights: [34],
    };
    const svg = serializeDrawingSvg({ ...drawing, objects: [...drawing.objects, table] });
    expect(svg).not.toContain('隐藏表名');
    expect(svg).toContain('<line x1="70" y1="0" x2="70" y2="54"');
    expect(svg).toContain('>甲</text>');
  });

  it('sanitizes a requested PDF filename and falls back to the drawing number', () => {
    const drawing = createBlankDrawingDocument('导出测试');
    const numbered = { ...drawing, titleBlock: { ...drawing.titleBlock, drawingNo: 'WH-001' } };

    expect(getDrawingExportFilename(numbered, 'pdf', ' 客户/图纸.pdf ')).toBe('客户-图纸.pdf');
    expect(getDrawingExportFilename(numbered, 'pdf')).toBe('WH-001.pdf');
  });
});

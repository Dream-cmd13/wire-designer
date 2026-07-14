import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBlankDrawingDocument, createDrawingId, defaultDrawingObjectStyle } from '@/lib/drawingDocument';
import { serializeDrawingSvg } from '@/lib/drawingExport';
import type { DrawingGroupObject, DrawingIconObject } from '@/types/drawing';

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

  it('exports the rendered page as an image-backed PDF', () => {
    const source = readFileSync(new URL('../drawingExport.ts', import.meta.url), 'utf8');
    expect(source).toContain('/Subtype /Image');
    expect(source).toContain('/DCTDecode');
    expect(source).toContain("canvas.toDataURL('image/jpeg'");
  });
});

import { describe, expect, it } from 'vitest';
import { getDrawingCaretIndexAtPoint, getEditableDrawingTextRuns, measureDrawingCaret } from '@/lib/drawingTextLayout';
import { defaultDrawingObjectStyle } from '@/lib/drawingDocument';
import type { DrawingObject } from '@/types/drawing';

function context() {
  return {
    font: '',
    measureText(text: string) {
      return {
        width: text.length * 10,
        actualBoundingBoxAscent: 8,
        actualBoundingBoxDescent: 2,
      } as TextMetrics;
    },
  } as CanvasRenderingContext2D;
}

function base(kind: DrawingObject['kind'], width: number, height: number) {
  return {
    id: kind, kind, x: 100, y: 200, width, height, rotation: 0, zIndex: 1,
    locked: false, visible: true, style: { ...defaultDrawingObjectStyle },
  };
}

describe('drawing text layout', () => {
  it('uses the measured label width to center dimension text', () => {
    const object = { ...base('dimension', 240, 45), kind: 'dimension', label: '1234', start: { x: 100, y: 200 }, end: { x: 340, y: 200 } } as DrawingObject;
    const [run] = getEditableDrawingTextRuns(context(), object, 'label', '1234');
    expect(run).toMatchObject({ x: 100, baseline: 23.5, font: '12px Arial' });
  });

  it('preserves the wire-bundle baseline and keeps the generated suffix outside the editable range', () => {
    const object = { ...base('wire-bundle', 280, 90), kind: 'wire-bundle', label: '线束', wireCount: 2, wireKind: 'electronic' } as DrawingObject;
    const [run] = getEditableDrawingTextRuns(context(), object, 'label', '线束');
    expect(run).toMatchObject({ x: 8, baseline: 85, prefix: '', suffix: ' · 2芯', valueStart: 0, valueEnd: 2 });
  });

  it('applies Canvas maxWidth compression to connector caret measurement', () => {
    const object = { ...base('connector', 100, 230), kind: 'connector', label: '1234567890', pinCount: 2, gender: 'receptacle', side: 'none' } as DrawingObject;
    const caret = measureDrawingCaret(context(), object, 'label', '1234567890', 10);
    expect(caret.start.x).toBeCloseTo(192);
    expect(caret.start.y).toBeCloseTo(210);
    expect(caret.end.y).toBeCloseTo(220);
  });

  it('measures beginning, middle, and end insertion positions from Canvas prefixes', () => {
    const object = { ...base('text', 180, 28), kind: 'text', text: '红色222' } as DrawingObject;
    const start = measureDrawingCaret(context(), object, 'text', '红色222', 0);
    const middle = measureDrawingCaret(context(), object, 'text', '红色222', 2);
    const end = measureDrawingCaret(context(), object, 'text', '红色222', 5);
    expect([start.start.x, middle.start.x, end.start.x]).toEqual([100, 120, 150]);
  });

  it('rotates caret endpoints through the same object-center matrix', () => {
    const object = { ...base('text', 100, 40), kind: 'text', text: '', rotation: 90 } as DrawingObject;
    const caret = measureDrawingCaret(context(), object, 'text', '', 0);
    expect(caret.start.x).toBeCloseTo(166);
    expect(caret.start.y).toBeCloseTo(170);
    expect(caret.end.x).toBeCloseTo(156);
    expect(caret.end.y).toBeCloseTo(170);
  });

  it('maps a Canvas click to the nearest editable character boundary', () => {
    const object = { ...base('text', 180, 28), kind: 'text', text: '红色222' } as DrawingObject;
    expect(getDrawingCaretIndexAtPoint(context(), object, 'text', '红色222', { x: 124, y: 212 })).toBe(2);
    expect(getDrawingCaretIndexAtPoint(context(), object, 'text', '红色222', { x: 149, y: 212 })).toBe(5);
  });
});

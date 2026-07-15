import { describe, expect, it } from 'vitest';
import { applyDrawingLineProperties, getDrawingPathLength } from '@/lib/drawingLineProperties';
import { defaultDrawingObjectStyle } from '@/lib/drawingDocument';
import type { DrawingLineObject } from '@/types/drawing';

const source: DrawingLineObject = {
  id: 'line-1', kind: 'polyline', name: '线1', points: [{ x: 0, y: 0 }, { x: 3, y: 4 }],
  orthogonal: false, x: 0, y: 0, width: 3, height: 4, rotation: 0, zIndex: 1,
  locked: false, visible: true, style: { ...defaultDrawingObjectStyle },
};

describe('drawing line properties', () => {
  it('measures path length and scales then aligns around the first point', () => {
    expect(getDrawingPathLength(source.points)).toBe(5);
    const horizontal = applyDrawingLineProperties(source, {
      name: '主线', alignment: 'horizontal', color: '#ef4444', strokeWidth: 6, length: 10,
    });

    expect(horizontal).toMatchObject({ name: '主线', rotation: 0, x: 0, y: 0, width: 10, height: 1 });
    expect(horizontal.points[0]).toEqual({ x: 0, y: 0 });
    expect(horizontal.points[1].x).toBeCloseTo(10);
    expect(horizontal.points[1].y).toBeCloseTo(0);
    expect(horizontal.style).toMatchObject({ stroke: '#ef4444', strokeWidth: 6 });
  });

  it('supports vertical alignment without changing a polyline shape', () => {
    const polyline = { ...source, points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }] };
    const result = applyDrawingLineProperties(polyline, {
      name: '线2', alignment: 'vertical', color: '#111827', strokeWidth: 2, length: 7,
    });

    expect(getDrawingPathLength(result.points)).toBeCloseTo(7);
    expect(result.points.at(-1)?.x).toBeCloseTo(0);
    expect(result.points.at(-1)?.y).toBeGreaterThan(0);
  });
});

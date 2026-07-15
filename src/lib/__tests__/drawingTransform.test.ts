import { describe, expect, it } from 'vitest';
import { defaultDrawingObjectStyle } from '@/lib/drawingDocument';
import { clampDrawingZoom, containsDrawingPoint, getDrawingTransformObject, getTransformFrame, getTransformHandlePoints, getWheelScaleFactor, localToWorldPoint, moveDrawingObject, resizeDrawingObject, rotateDrawingObject, scaleDrawingObjectFromCenter, worldToLocalPoint } from '@/lib/drawingTransform';
import type { DrawingObject } from '@/types/drawing';

const object = { id: 'text-1', kind: 'text', text: 'A', x: 100, y: 200, width: 80, height: 40, rotation: 90, zIndex: 1, locked: false, visible: true, style: defaultDrawingObjectStyle } as DrawingObject;

describe('drawing transform geometry', () => {
  it('round-trips local and world coordinates and returns rotated corners', () => {
    const world = localToWorldPoint(object, { x: 0, y: 0 });
    expect(world).toEqual({ x: 160, y: 180 });
    const local = worldToLocalPoint(object, world);
    expect(local.x).toBeCloseTo(0);
    expect(local.y).toBeCloseTo(0);
    expect(getTransformFrame(object).corners).toEqual([{ x: 160, y: 180 }, { x: 160, y: 260 }, { x: 120, y: 260 }, { x: 120, y: 180 }]);
  });

  it('keeps the rotation stem at 24 CSS pixels for each zoom', () => {
    for (const zoom of [0.5, 1, 1.5, 2]) {
      const points = getTransformHandlePoints(object, zoom);
      expect(Math.hypot((points.rotate.x - points.n.x) * zoom, (points.rotate.y - points.n.y) * zoom)).toBeCloseTo(24);
    }
  });

  it('hit-tests the rotated local frame', () => {
    expect(containsDrawingPoint(object, { x: 140, y: 181 })).toBe(true);
    expect(containsDrawingPoint(object, { x: 101, y: 201 })).toBe(false);
  });

  it('moves point arrays with their frame and constrains the resulting position', () => {
    const line = { ...object, kind: 'polyline', x: 10, y: 20, width: 100, height: 50, points: [{ x: 10, y: 20 }, { x: 110, y: 70 }], orthogonal: false } as DrawingObject;
    expect(moveDrawingObject(line, { x: 10, y: -5 })).toMatchObject({ x: 20, y: 15, points: [{ x: 20, y: 15 }, { x: 120, y: 65 }] });
    expect(moveDrawingObject(object, { x: -500, y: 900 }, { width: 1200, height: 800, inset: 20 })).toMatchObject({ x: 20, y: 740 });
  });

  it('tightens loose line bounds without changing rendered world points', () => {
    const line = {
      ...object,
      kind: 'line',
      x: 100,
      y: 200,
      width: 200,
      height: 60,
      rotation: 30,
      points: [{ x: 100, y: 230 }, { x: 300, y: 230 }],
      orthogonal: false,
    } as DrawingObject;
    const before = 'points' in line
      ? line.points.map((point) => localToWorldPoint(line, { x: point.x - line.x, y: point.y - line.y }))
      : [];
    const normalized = getDrawingTransformObject(line);
    const after = 'points' in normalized
      ? normalized.points.map((point) => localToWorldPoint(normalized, { x: point.x - normalized.x, y: point.y - normalized.y }))
      : [];

    expect(normalized.width).toBeCloseTo(200);
    expect(normalized.height).toBe(8);
    expect(after).toHaveLength(before.length);
    after.forEach((point, index) => {
      expect(point.x).toBeCloseTo(before[index].x);
      expect(point.y).toBeCloseTo(before[index].y);
    });
  });

  it('keeps the opposite anchor fixed while resizing and mirrors crossed point arrays', () => {
    const start = { ...object, rotation: 30 } as DrawingObject;
    const fixedBefore = localToWorldPoint(start, { x: 0, y: 0 });
    const result = resizeDrawingObject(start, 'se', localToWorldPoint(start, { x: 120, y: 70 }), false);
    const resized = { ...start, ...result.patch } as DrawingObject;
    const fixedAfter = localToWorldPoint(resized, { x: 0, y: 0 });
    expect(fixedAfter.x).toBeCloseTo(fixedBefore.x);
    expect(fixedAfter.y).toBeCloseTo(fixedBefore.y);
    expect(result.patch.width).toBeCloseTo(120);
    expect(result.patch.height).toBeCloseTo(70);
    const line = { ...object, kind: 'line', rotation: 0, points: [{ x: 100, y: 200 }, { x: 180, y: 240 }], orthogonal: false } as DrawingObject;
    const flipped = resizeDrawingObject(line, 'e', { x: 80, y: 220 }, false);
    expect(flipped.activeHandle).toBe('w');
    expect(flipped.patch.width).toBeGreaterThanOrEqual(8);
    expect(flipped.patch.points![0].x).toBeGreaterThan(flipped.patch.points![1].x);
  });

  it('rotates continuously and snaps to 15 degrees with Shift', () => {
    const start = { ...object, rotation: 10 } as DrawingObject;
    const center = { x: 140, y: 220 };
    expect(rotateDrawingObject(start, { x: center.x, y: center.y - 100 }, { x: center.x + 100, y: center.y }, false)).toEqual({ rotation: 100 });
    expect(rotateDrawingObject(start, { x: center.x, y: center.y - 100 }, { x: center.x + 100, y: center.y }, true)).toEqual({ rotation: 105 });
  });

  it('clamps canvas zoom and converts wheel direction to ten-percent factors', () => {
    expect(clampDrawingZoom(0.1)).toBe(0.25);
    expect(clampDrawingZoom(3.4)).toBe(3);
    expect(getWheelScaleFactor(-100)).toBe(1.1);
    expect(getWheelScaleFactor(100)).toBeCloseTo(1 / 1.1);
  });

  it('scales an object around its center and scales line points', () => {
    expect(scaleDrawingObjectFromCenter(object, 1.5)).toMatchObject({ x: 80, y: 190, width: 120, height: 60 });
    const line = { ...object, kind: 'line', rotation: 0, points: [{ x: 100, y: 200 }, { x: 180, y: 240 }], orthogonal: false } as DrawingObject;
    expect(scaleDrawingObjectFromCenter(line, 2)).toMatchObject({
      x: 60, y: 180, width: 160, height: 80,
      points: [{ x: 60, y: 180 }, { x: 220, y: 260 }],
    });
  });
});

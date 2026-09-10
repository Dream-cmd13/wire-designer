import { describe, expect, it } from 'vitest';
import {
  lengthMmToCanvasWidth,
  MIN_CANVAS_WIRE_WIDTH,
  MAX_CANVAS_WIRE_WIDTH,
  MAX_CANVAS_WIRE_LENGTH_MM,
} from '@/lib/canvasMaterials';

describe('lengthMmToCanvasWidth scaling function', () => {
  it('returns MIN_CANVAS_WIRE_WIDTH for zero, negative or invalid inputs', () => {
    expect(lengthMmToCanvasWidth(0)).toBe(MIN_CANVAS_WIRE_WIDTH);
    expect(lengthMmToCanvasWidth(-50)).toBe(MIN_CANVAS_WIRE_WIDTH);
    expect(lengthMmToCanvasWidth(Number.NaN)).toBe(MIN_CANVAS_WIRE_WIDTH);
  });

  it('strictly increases from 0 to 10000mm with smooth sub-linear curve', () => {
    const lengths = [0, 50, 100, 300, 500, 1000, 2000, 3000, 5000, 8000, 10000];
    const widths = lengths.map((len) => lengthMmToCanvasWidth(len));

    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeGreaterThan(widths[i - 1]);
    }
  });

  it('clamps to MAX_CANVAS_WIRE_WIDTH when length exceeds 10000mm', () => {
    const widthAt10000 = lengthMmToCanvasWidth(MAX_CANVAS_WIRE_LENGTH_MM);
    expect(widthAt10000).toBe(MAX_CANVAS_WIRE_WIDTH);
    expect(lengthMmToCanvasWidth(12000)).toBe(MAX_CANVAS_WIRE_WIDTH);
    expect(lengthMmToCanvasWidth(20000)).toBe(MAX_CANVAS_WIRE_WIDTH);
    expect(lengthMmToCanvasWidth(100000)).toBe(MAX_CANVAS_WIRE_WIDTH);
  });

  it('produces expected pixel widths for key milestones', () => {
    expect(lengthMmToCanvasWidth(0)).toBe(120);
    expect(lengthMmToCanvasWidth(100)).toBe(156);
    expect(lengthMmToCanvasWidth(500)).toBe(200);
    expect(lengthMmToCanvasWidth(1000)).toBe(234);
    expect(lengthMmToCanvasWidth(3000)).toBe(317);
    expect(lengthMmToCanvasWidth(5000)).toBe(375);
    expect(lengthMmToCanvasWidth(10000)).toBe(480);
  });

  it('guarantees max width stays within acceptable bounds (380-600px)', () => {
    expect(MAX_CANVAS_WIRE_WIDTH).toBeGreaterThanOrEqual(380);
    expect(MAX_CANVAS_WIRE_WIDTH).toBeLessThanOrEqual(600);
  });
});

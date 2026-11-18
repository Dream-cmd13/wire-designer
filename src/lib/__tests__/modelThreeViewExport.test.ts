import { describe, expect, it } from 'vitest';
import { MODEL_FRONT_DIRECTIONS, getModelThreeViewLayout, getModelThreeViewFilename } from '@/lib/models/modelThreeViewExport';
import { normalizeMeshes, STL_UNIT_SCALE } from '@/lib/models/modelTypes';

describe('model three-view projection', () => {
  const bounds = { min: [1000, 2000, -30], max: [1040, 2020, -20] } as Parameters<typeof getModelThreeViewLayout>[0];

  it('matches the viewer axes, puts +Y on the right, and fits all views at one scale', () => {
    const { views: { front, top, right }, center, pixelsPerMm } = getModelThreeViewLayout(bounds, '-Y');
    expect(center).toEqual([1020, 2010, -25]);
    expect([front.direction, front.up, top.direction, top.up, right.direction, right.up]).toEqual([
      [0,-1,0], [0,0,1], [0,0,1], [0,1,0], [1,0,0], [0,0,1],
    ]);
    expect([front.horizontal, top.horizontal, right.horizontal]).toEqual([[1,0,0], [1,0,0], [0,1,0]]);
    expect([front.sizeMm, top.sizeMm, right.sizeMm]).toEqual([[40,10], [40,20], [20,10]]);
    expect(pixelsPerMm).toBe(Math.min(...[front, top, right].flatMap(({ sizeMm: [w, h], rect }) => [(rect.width - 8) / w, (rect.height - 8) / h])));
    expect(front.rect.x).toBe(top.rect.x);
    expect(front.rect.y).toBe(right.rect.y);
    expect(right.rect.x).toBeLessThan(front.rect.x);
    expect(top.rect.y).toBeGreaterThan(front.rect.y);
  });

  it('reorients all views for a +Z front without flipping the shared axes', () => {
    const { views: { front, top, right } } = getModelThreeViewLayout(bounds, '+Z');
    expect([front.direction, front.up, top.direction, top.up, right.direction, right.up]).toEqual([
      [0,0,1], [0,1,0], [0,1,0], [0,0,-1], [1,0,0], [0,1,0],
    ]);
    expect([front.sizeMm, top.sizeMm, right.sizeMm]).toEqual([[40,20], [40,10], [10,20]]);
    for (const direction of Object.keys(MODEL_FRONT_DIRECTIONS) as (keyof typeof MODEL_FRONT_DIRECTIONS)[]) {
      const { views } = getModelThreeViewLayout(bounds, direction);
      expect(views.front.horizontal).toEqual(views.top.horizontal);
      expect(views.front.up).toEqual(views.right.up);
      expect(views.right.direction).toEqual(views.front.horizontal);
    }
  });

  it('skips zero extents when fitting a long thin assembly', () => {
    const { views, pixelsPerMm } = getModelThreeViewLayout({ min: [1e6, 0, 4], max: [2e6, 0.1, 4] }, '-X');
    expect(views.top.sizeMm).toEqual([0.1, 1e6]);
    expect(pixelsPerMm).toBe((views.top.rect.height - 8) / 1e6);
    expect(() => getModelThreeViewLayout({ min: [1, 1, 1], max: [1, 1, 1] }, '-Y')).toThrow();
  });

  it('uses normalized STL millimeters without converting again', () => {
    const model = normalizeMeshes([{ name: 'inches', positions: new Float32Array([0,0,0, 2,0,0, 0,1,0, 0,0,0.5]), indices: new Uint32Array([0,1,2, 0,1,3]) }], STL_UNIT_SCALE.inch);
    const { views } = getModelThreeViewLayout(model.boundsMm, '-Y');
    expect(views.front.sizeMm[0]).toBeCloseTo(50.8);
    expect(views.front.sizeMm[1]).toBeCloseTo(12.7);
    expect(views.right.sizeMm[0]).toBeCloseTo(25.4);
  });

  it('removes only the source extension and sanitizes the name', () => {
    expect(getModelThreeViewFilename('连接器.v2?.STP')).toBe('连接器.v2-_三视图.pdf');
    expect(getModelThreeViewFilename('  .stl  ')).toBe('模型_三视图.pdf');
  });
});

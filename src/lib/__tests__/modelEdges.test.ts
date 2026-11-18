import { describe, expect, it } from 'vitest';
import { extractSurfaceEdges, attachSurfaceEdges, extractStlCreaseEdges } from '../models/modelEdges';
import { normalizeMeshes, type ParsedMesh } from '../models/modelTypes';

const square = (): ParsedMesh => ({ name: 'square', positions: new Float32Array([0,0,0, 1,0,0, 1,1,0, 0,1,0]), indices: new Uint32Array([0,1,2, 0,2,3]) });
const face = [{ first: 0, last: 1 }];
describe('mesh-derived surface boundaries', () => {
  it('uses inclusive triangle ranges and removes the internal diagonal of a quad', () => {
    const edges = extractSurfaceEdges(square(), face);
    expect(edges.length).toBe(24);
    const lengths = Array.from({ length: 4 }, (_, i) => Math.hypot(...[0,1,2].map((axis) => edges[i*6+axis]-edges[i*6+3+axis])));
    expect(lengths).toEqual([1,1,1,1]);
  });
  it('keeps the boundary between tangent faces but deduplicates their reversed shared segment', () => {
    expect(extractSurfaceEdges(square(), [{ first: 0, last: 0 }, { first: 1, last: 1 }]).length).toBe(30);
  });
  it('produces seam candidates before position deduplication on a periodic face', () => {
    const mesh = square();
    mesh.positions = new Float32Array([0,0,0, 1,0,0, 0,1,0, 0,0,0, 0,1,0, -1,0,0]);
    mesh.indices = new Uint32Array([0,1,2,3,4,5]);
    // Shared geometric edge uses distinct indices: keep one seam, not zero.
    expect(extractSurfaceEdges(mesh, face).length).toBe(30);
  });
  it('preserves a millimeter-scale gap and discards zero-length segments', () => {
    const mesh = square();
    mesh.positions = new Float32Array([0,0,0, 1,0,0, 0,1,0, 0,0.001,0, 1,0.001,0, 0,-1,0]);
    mesh.indices = new Uint32Array([0,1,2,3,4,5]);
    expect(extractSurfaceEdges(mesh, face).length).toBe(36);
    mesh.positions = new Float32Array([0,0,0,0,0,0,1,0,0]); mesh.indices = new Uint32Array([0,1,2]);
    expect(extractSurfaceEdges(mesh, [{ first: 0, last: 0 }]).length).toBe(6);
  });
  it.each([[], [{ first: -1, last: 1 }], [{ first: 0.5, last: 1 }], [{ first: 0, last: 2 }], [{ first: 1, last: 0 }], [{ first: 0, last: 1 }, { first: 1, last: 1 }]].map((faces) => ({ faces })))('rejects missing or invalid face ranges without corrupting the solid: $faces', ({ faces }) => {
    expect(() => extractSurfaceEdges(square(), faces)).toThrow();
    const model = normalizeMeshes([square()]); attachSurfaceEdges(model, [faces]);
    expect(model.meshes[0].surfaceEdges).toBeUndefined(); expect(model.triangleCount).toBe(2);
    expect(model.surfaceEdgeWarning).toContain('特征边');
  });
  it('limits cumulative output across meshes, falls back atomically, and does not deduplicate separate solids', () => {
    const model = normalizeMeshes([square(), square()]); attachSurfaceEdges(model, [face, face], 8);
    expect(model.meshes.map((mesh) => mesh.surfaceEdges?.length)).toEqual([24,24]);
    attachSurfaceEdges(model, [face, face], 7);
    expect(model.meshes.every((mesh) => !mesh.surfaceEdges)).toBe(true);
    expect(model.surfaceEdgeWarning).toContain('预算'); expect(model.triangleCount).toBe(4);
  });
  it('validates and scales optional segment arrays using the same units, falling back on invalid data', () => {
    const mesh = { ...square(), surfaceEdges: new Float32Array([0,0,0,1,0,0]) };
    expect(normalizeMeshes([mesh], 25.4).meshes[0].surfaceEdges![3]).toBeCloseTo(25.4);
    for (const array of [[0,0,0,1], [0,0,0,NaN,0,0]]) {
      const model = normalizeMeshes([{ ...square(), surfaceEdges: new Float32Array(array) }]);
      expect(model.meshes[0].surfaceEdges).toBeUndefined(); expect(model.surfaceEdgeWarning).toBeTruthy();
    }
  });
});
describe('STL export creases', () => {
  const extract = (triangles: number[][], budget?: number) => {
    const positions = new Float32Array(triangles.flat());
    return extractStlCreaseEdges({ positions, indices: Uint32Array.from({ length: positions.length / 3 }, (_, i) => i) }, budget);
  };
  const first = [0,0,0, 2,0,0, 0,2,0];

  it('does not mark a coplanar T-junction or a reversed coplanar face', () => {
    expect(extract([first, [0,0,0, 0,-2,0, 1,0,0], [1,0,0, 2,0,0, 0,-2,0]])).toHaveLength(0);
    expect(extract([first, [0,0,0, 2,0,0, 0,-2,0]])).toHaveLength(0);
  });

  it('keeps only confirmed geometric folds and rejects ambiguous or over-budget lines', () => {
    const fold = [0,0,0, 2,0,0, 0,0,2];
    expect(Array.from(extract([first, fold]))).toEqual([0,0,0, 2,0,0]);
    expect(extract([first, fold, [2,0,0, 0,0,0, 0,-2,0]])).toHaveLength(0);
    expect(extract([first, fold], 0)).toHaveLength(0);
  });

  it('keeps a 90-degree fold when only one face subdivides an oblique shared edge', () => {
    const triangles = [
      [0,0,0, 4,4,0, 0,4,0],
      [0,0,0, 2,2,0, 4,4,3],
      [4,4,3, 4,4,0, 2,2,0],
    ];
    expect(Array.from(extract(triangles))).toEqual([0,0,0, 2,2,0, 2,2,0, 4,4,0]);
  });

  it('matches both pieces when the intermediate STL vertex is rounded to float32', () => {
    const a = [0,0,0], b = [10,3,0], mid = [0.7,0.21,0], c = [10,3,3];
    const triangles = [[...a, ...b, 0,3,0], [...a, ...mid, ...c], [...b, ...mid, ...c]];
    expect(extract(triangles)).toEqual(new Float32Array([...a, ...mid, ...mid, ...b]));
  });

  it('retains a narrow wedge even when either incident triangle is reversed', () => {
    const a = [0,0,0], b = [2,0,0], c = [0,2,0], d = [0,2,0.1];
    for (const left of [[...a, ...b, ...c], [...b, ...a, ...c]]) {
      for (const right of [[...a, ...b, ...d], [...b, ...a, ...d]]) {
        const edge = Array.from(extract([left, right]));
        expect([edge.slice(0, 3), edge.slice(3)].sort((p, q) => p[0] - q[0])).toEqual([a, b]);
      }
    }
    expect(extract([first, [...b, ...a, ...c]])).toHaveLength(0);
  });
});

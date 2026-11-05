import { describe, expect, it } from 'vitest';
import { extractSurfaceEdges, attachSurfaceEdges } from '../models/modelEdges';
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

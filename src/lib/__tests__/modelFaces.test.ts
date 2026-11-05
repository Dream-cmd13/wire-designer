import { describe, expect, it } from 'vitest';
import { normalizeFaceRanges, findFaceRange, extractFaceMesh } from '../models/modelFaces';
import { attachSurfaceEdges } from '../models/modelEdges';
import { normalizeMeshes, type ParsedMesh } from '../models/modelTypes';

const source = [{first:0,last:1},{first:2,last:2}];
function mesh(): ParsedMesh {
  // Vertex 4 shares coordinates with 0 but has a distinct seam identity/normal.
  return {name:'seam',positions:new Float32Array([0,0,0,1,0,0,1,1,0,0,1,0,0,0,0]),
    normals:new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1,0,1,0]),indices:new Uint32Array([0,1,2,0,2,3,4,3,2])};
}
describe('CAD face ranges', () => {
  it('keeps inclusive triangle ranges and mesh-local face ids through structured clone', () => {
    const ranges = normalizeFaceRanges(source,3)!;
    expect(ranges).toEqual([{faceId:0,firstTriangle:0,lastTriangle:1},{faceId:1,firstTriangle:2,lastTriangle:2}]);
    expect(findFaceRange(ranges,0)?.faceId).toBe(0); expect(findFaceRange(ranges,1)?.faceId).toBe(0);
    expect(findFaceRange(ranges,2)?.faceId).toBe(1); expect(findFaceRange(ranges,3)).toBeUndefined();
    expect(findFaceRange(ranges,-1)).toBeUndefined(); expect(findFaceRange(ranges,0.5)).toBeUndefined();
    expect(normalizeFaceRanges([{first:0,last:0}],1)?.[0].faceId).toBe(0);
    const original = {...mesh(),faceRanges:ranges}; const cloned = structuredClone(original);
    expect(cloned.faceRanges).toEqual(ranges); expect(cloned.indices).toEqual(original.indices);
    expect(cloned.indices.buffer).not.toBe(original.indices.buffer);
  });
  it.each([undefined,[],[{first:1,last:2}],[{first:0,last:1}],[{first:0,last:1},{first:1,last:2}],
    [{first:0,last:0},{first:2,last:2}],[{first:0,last:3}],[{first:-1,last:2}],
    [{first:0,last:0.5},{first:1.5,last:2}],[{first:0,last:NaN}],[{first:0,last:-1}]])('omits invalid optional face data: %j', (ranges) => {
    expect(normalizeFaceRanges(ranges,3)).toBeUndefined();
  });
  it('copies only referenced vertices, preserves seam identity/normals and never changes source arrays', () => {
    const original = mesh(); const snapshot = structuredClone(original);
    const compact = extractFaceMesh(original,{faceId:7,firstTriangle:1,lastTriangle:2});
    expect(Array.from(compact.indices)).toEqual([0,1,2,3,2,1]);
    expect(Array.from(compact.positions)).toEqual([0,0,0,1,1,0,0,1,0,0,0,0]);
    expect(Array.from(compact.normals!)).toEqual([0,0,1,0,0,1,0,0,1,0,1,0]);
    expect(original).toEqual(snapshot); expect(compact.positions.buffer).not.toBe(original.positions.buffer);
    expect(extractFaceMesh({...original,normals:undefined},{faceId:0,firstTriangle:2,lastTriangle:2}).normals).toBeUndefined();
  });
  it('retains valid face selection when whole-model edges exceed budget', () => {
    const original = {...mesh(),faceRanges:normalizeFaceRanges(source,3)};
    const model = normalizeMeshes([original]); attachSurfaceEdges(model,[source],0);
    expect(model.surfaceEdgeWarning).toBeTruthy(); expect(original.surfaceEdges).toBeUndefined();
    expect(original.faceRanges).toHaveLength(2);
  });
});

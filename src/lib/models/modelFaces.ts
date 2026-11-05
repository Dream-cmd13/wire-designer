import type { ModelFaceRange, ParsedMesh } from './modelTypes';

export function normalizeFaceRanges(source: readonly { first: number; last: number }[] | undefined, triangleCount: number): ModelFaceRange[] | undefined {
  if (!source?.length || !Number.isInteger(triangleCount) || triangleCount <= 0) return undefined;
  const ranges: ModelFaceRange[] = []; let next = 0;
  for (const [faceId, { first, last }] of source.entries()) {
    if (!Number.isInteger(first) || !Number.isInteger(last) || first !== next || last < first || last >= triangleCount) return undefined;
    ranges.push({faceId,firstTriangle:first,lastTriangle:last}); next = last + 1;
  }
  return next === triangleCount ? ranges : undefined;
}

export function findFaceRange(ranges: readonly ModelFaceRange[], triangleIndex: number): ModelFaceRange | undefined {
  if (!Number.isInteger(triangleIndex) || triangleIndex < 0) return undefined;
  let low = 0; let high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1; const range = ranges[middle];
    if (triangleIndex < range.firstTriangle) high = middle - 1;
    else if (triangleIndex > range.lastTriangle) low = middle + 1;
    else return range;
  }
  return undefined;
}

/** Copy by vertex identity, never coordinate-weld periodic seams. GPU ownership is independent. */
export function extractFaceMesh(mesh: ParsedMesh, range: ModelFaceRange): ParsedMesh {
  const {firstTriangle:first,lastTriangle:last} = range;
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last < first || last >= mesh.indices.length / 3) throw new Error('曲面分组范围无效');
  const remap = new Map<number,number>(); const positions: number[] = []; const normals: number[] = [];
  const indices = new Uint32Array((last-first+1)*3);
  for (let i = first*3; i < (last+1)*3; i++) {
    const original = mesh.indices[i]; let local = remap.get(original);
    if (local === undefined) {
      local = remap.size; remap.set(original,local);
      for (let axis = 0; axis < 3; axis++) {
        positions.push(mesh.positions[original*3+axis]);
        if (mesh.normals) normals.push(mesh.normals[original*3+axis]);
      }
    }
    indices[i-first*3] = local;
  }
  return {name:mesh.name,positions:new Float32Array(positions),indices,...(mesh.normals ? {normals:new Float32Array(normals)} : {})};
}

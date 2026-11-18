import { MODEL_LIMITS, type ParsedMesh, type ParsedModel } from './modelTypes';

export interface SurfaceFace { first: number; last: number; color?: unknown }

/** Worker-only; return confirmed folds, not unmatched tessellation edges. */
export function extractStlCreaseEdges({ positions, indices }: Pick<ParsedMesh, 'positions' | 'indices'>, budget: number = MODEL_LIMITS.maxSurfaceSegments) {
  const count = positions.length / 3;
  const representatives = new Map<string, number>();
  const vertex = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const key = `${positions[i*3]},${positions[i*3+1]},${positions[i*3+2]}`;
    const first = representatives.get(key);
    if (first === undefined) representatives.set(key, i);
    vertex[i] = first ?? i;
  }
  const normals = new Float32Array(indices.length);
  const firstFace = new Map<number, number>();
  const creases = new Set<number>();
  const threshold = Math.cos(Math.PI / 6);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]*3, b = indices[i+1]*3, c = indices[i+2]*3;
    const ux = positions[b] - positions[a], uy = positions[b+1] - positions[a+1], uz = positions[b+2] - positions[a+2];
    const vx = positions[c] - positions[a], vy = positions[c+1] - positions[a+1], vz = positions[c+2] - positions[a+2];
    const x = uy*vz - uz*vy, y = uz*vx - ux*vz, z = ux*vy - uy*vx;
    const length = Math.hypot(x, y, z);
    if (!length) continue;
    normals[i] = x/length; normals[i+1] = y/length; normals[i+2] = z/length;
    for (let j = 0; j < 3; j++) {
      const from = vertex[indices[i+j]], to = vertex[indices[i+(j+1)%3]];
      const key = Math.min(from, to)*count + Math.max(from, to);
      const neighbour = firstFace.get(key);
      if (neighbour === undefined) firstFace.set(key, i);
      else if (neighbour === -1) creases.delete(key); // More than two faces: ambiguous.
      else {
        firstFace.set(key, -1);
        // Ignore winding; coplanar facets can be reversed in STL.
        const dot = normals[i]*normals[neighbour] + normals[i+1]*normals[neighbour+1] + normals[i+2]*normals[neighbour+2];
        if (Math.abs(dot) <= threshold) creases.add(key);
      }
    }
  }
  // The shaded solid still provides its silhouette if feature data exceeds the budget.
  if (creases.size > budget) return new Float32Array();
  const edges = new Float32Array(creases.size * 6);
  let offset = 0;
  for (const edge of creases) {
    const a = Math.floor(edge/count)*3, b = (edge%count)*3;
    edges.set(positions.subarray(a, a+3), offset);
    edges.set(positions.subarray(b, b+3), offset+3);
    offset += 6;
  }
  return edges;
}

/** Mesh-derived display lines, not exact CAD topology. last is inclusive in OCCT 0.0.23. */
export function extractSurfaceEdges(mesh: Pick<ParsedMesh, 'positions' | 'indices'>, faces: readonly SurfaceFace[], budget: number = MODEL_LIMITS.maxSurfaceSegments): Float32Array {
  const { positions, indices } = mesh;
  if (!faces?.length) throw new Error('缺少曲面分组');
  let next = 0;
  for (const face of faces) {
    if (!Number.isInteger(face.first) || !Number.isInteger(face.last) || face.first !== next || face.last < face.first || face.last >= indices.length / 3) throw new Error('曲面分组范围无效');
    next = face.last + 1;
  }
  if (next !== indices.length / 3) throw new Error('曲面分组不完整');
  const min = [Infinity,Infinity,Infinity]; const max = [-Infinity,-Infinity,-Infinity];
  for (let i = 0; i < positions.length; i++) {
    if (!Number.isFinite(positions[i])) throw new Error('曲面边界坐标无效');
    const axis = i % 3; min[axis] = Math.min(min[axis], positions[i]); max[axis] = Math.max(max[axis], positions[i]);
  }
  const tolerance = Math.max(1e-7, Math.hypot(...max.map((value, axis) => value - min[axis])) * 1e-8);
  const vertexKey = (index: number) => [0,1,2].map((axis) => Math.round((positions[index * 3 + axis] - min[axis]) / tolerance)).join(',');
  const seen = new Set<string>(); const output: number[] = [];
  const vertexCount = positions.length / 3;
  for (const face of faces) {
    // Index identity first: coordinate welding here would erase periodic seams.
    const counts = new Map<number, { a: number; b: number; count: number }>();
    for (let triangle = face.first; triangle <= face.last; triangle++) {
      for (let side = 0; side < 3; side++) {
        const a = indices[triangle * 3 + side]; const b = indices[triangle * 3 + (side + 1) % 3];
        if (a >= vertexCount || b >= vertexCount) throw new Error('曲面边界索引无效');
        const key = Math.min(a,b) * vertexCount + Math.max(a,b);
        const entry = counts.get(key);
        if (entry) entry.count++; else counts.set(key, { a, b, count: 1 });
      }
    }
    for (const { a,b,count } of counts.values()) {
      if (count !== 1) continue;
      const ka = vertexKey(a); const kb = vertexKey(b);
      if (ka === kb) continue;
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (seen.has(key)) continue;
      if (output.length / 6 >= budget) throw new Error('曲面边界超过累计线段显示预算');
      seen.add(key);
      for (const index of [a,b]) for (let axis = 0; axis < 3; axis++) output.push(positions[index * 3 + axis]);
    }
  }
  if (!output.length) throw new Error('无有效曲面边界');
  return new Float32Array(output);
}

/** Optional display data failure must never make the solid unavailable. Worker-only caller. */
export function attachSurfaceEdges(model: ParsedModel, faces: readonly (readonly SurfaceFace[] | undefined)[], budget: number = MODEL_LIMITS.maxSurfaceSegments) {
  let remaining = budget;
  try {
    for (const [index, mesh] of model.meshes.entries()) {
      mesh.surfaceEdges = extractSurfaceEdges(mesh, faces[index] ?? [], remaining);
      remaining -= mesh.surfaceEdges.length / 6;
    }
    delete model.surfaceEdgeWarning;
  } catch (error) {
    model.meshes.forEach((mesh) => { delete mesh.surfaceEdges; });
    model.surfaceEdgeWarning = `曲面边界不可用，已回退特征边：${error instanceof Error ? error.message : '无法提取'}。`;
  }
}

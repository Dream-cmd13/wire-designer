import { MODEL_LIMITS, type ParsedMesh, type ParsedModel } from './modelTypes';

export interface SurfaceFace { first: number; last: number; color?: unknown }

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

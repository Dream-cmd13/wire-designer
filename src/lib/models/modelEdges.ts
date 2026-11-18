import { MODEL_LIMITS, type ParsedMesh, type ParsedModel } from './modelTypes';

export interface SurfaceFace { first: number; last: number; color?: unknown }

const creaseThreshold = Math.cos(Math.PI / 6);
type EdgeSpan = { start: number; end: number; lo: number; hi: number; edge: number; sign: number };

function isCrease(normals: Float32Array, first: number, second: number, orientation: number) {
  const a = first - first % 3, b = second - second % 3;
  const ax = normals[a], ay = normals[a+1], az = normals[a+2];
  const bx = normals[b], by = normals[b+1], bz = normals[b+2];
  // Opposite edge traversal is smooth when the two faces lie on opposite sides of a flat edge.
  const dot = (ax*bx + ay*by + az*bz) * orientation;
  if (dot > creaseThreshold) return false;
  // Exclude coincident, coplanar flaps; a real acute wedge has nonparallel normals.
  return dot >= 0 || Math.hypot(ay*bz - az*by, az*bx - ax*bz, ax*by - ay*bx) > 1e-9;
}

function sameSupportingLine(positions: Float32Array, a: EdgeSpan, b: EdgeSpan) {
  const dx = positions[a.end] - positions[a.start];
  const dy = positions[a.end+1] - positions[a.start+1];
  const dz = positions[a.end+2] - positions[a.start+2];
  const length = Math.hypot(dx, dy, dz);
  const tolerance = length * Math.min(a.hi - a.lo, b.hi - b.lo) * 1e-7;
  const onLine = (vertex: number) => {
    const x = positions[vertex] - positions[a.start], y = positions[vertex+1] - positions[a.start+1], z = positions[vertex+2] - positions[a.start+2];
    return Math.hypot(dy*z - dz*y, dz*x - dx*z, dx*y - dy*x) <= tolerance;
  };
  return onLine(b.start) && onLine(b.end);
}

/** Worker-only; return confirmed folds, not unmatched tessellation edges. */
export function extractStlCreaseEdges({ positions, indices }: Pick<ParsedMesh, 'positions' | 'indices'>, budget: number = MODEL_LIMITS.maxSurfaceSegments) {
  const count = positions.length / 3;
  const representatives = new Map<string, number>();
  const vertex = new Uint32Array(count);
  let extent = 0;
  for (let i = 0; i < count; i++) {
    const x = positions[i*3], y = positions[i*3+1], z = positions[i*3+2];
    const key = `${x},${y},${z}`;
    const first = representatives.get(key);
    if (first === undefined) {
      representatives.set(key, i);
      extent = Math.max(extent, Math.abs(x - positions[0]), Math.abs(y - positions[1]), Math.abs(z - positions[2]));
    }
    vertex[i] = first ?? i;
  }
  const normals = new Float32Array(indices.length);
  const firstEdge = new Map<number, number>();
  const creases = new Set<number>();
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
      const neighbour = firstEdge.get(key);
      if (neighbour === undefined) firstEdge.set(key, i+j);
      else if (neighbour === -1) creases.delete(key); // More than two faces: ambiguous.
      else {
        firstEdge.set(key, -1);
        const orientation = vertex[indices[neighbour]] === from ? -1 : 1;
        if (isCrease(normals, neighbour, i+j, orientation)) creases.add(key);
      }
    }
  }
  // The shaded solid still provides its silhouette if feature data exceeds the budget.
  if (creases.size > budget) return new Float32Array();
  const edges: number[] = [];
  const append = (a: number, b: number) => {
    edges.push(positions[a], positions[a+1], positions[a+2], positions[b], positions[b+1], positions[b+2]);
  };
  for (const edge of creases) {
    append(Math.floor(edge/count)*3, (edge%count)*3);
  }

  // Exact endpoint pairs cover ordinary STL. Only loose edges need interval matching
  // on a supporting line, where one face may subdivide a fold differently from the other.
  const lines = new Map<string, EdgeSpan | EdgeSpan[]>();
  for (const [key, edge] of firstEdge) {
    if (edge === -1) continue;
    const a = Math.floor(key/count)*3, b = key%count*3;
    const delta = [positions[b] - positions[a], positions[b+1] - positions[a+1], positions[b+2] - positions[a+2]];
    const max = Math.max(...delta.map(Math.abs));
    const axis = delta.findIndex(value => Math.abs(value) >= max * (1 - 1e-7));
    const start = delta[axis] > 0 ? a : b, end = start === a ? b : a;
    const offsets = [0,1,2].filter(i => i !== axis);
    const slopes = offsets.map(i => delta[i] / delta[axis]);
    const intercepts = offsets.map((i, at) => positions[a+i] - positions[i] - slopes[at] * (positions[a+axis] - positions[axis]));
    // Quantization only finds candidates; the sweep still checks geometric collinearity.
    const lineKey = `${axis}:${slopes.map(value => Math.round(value * 1e7))}:${intercepts.map(value => Math.round(value / extent * 1e7))}`;
    const span = { start, end, lo: positions[start+axis], hi: positions[end+axis], edge, sign: vertex[indices[edge]] * 3 === start ? 1 : -1 };
    const line = lines.get(lineKey);
    if (Array.isArray(line)) line.push(span);
    else lines.set(lineKey, line ? [line, span] : span);
  }
  for (const line of lines.values()) {
    if (!Array.isArray(line)) continue;
    const events = line.flatMap(span => [{ at: span.lo, vertex: span.start, span, entering: true }, { at: span.hi, vertex: span.end, span, entering: false }]);
    events.sort((a, b) => a.at - b.at);
    const active = new Set<EdgeSpan>();
    for (let i = 0; i < events.length; i++) {
      const event = events[i], next = events[i+1];
      if (event.entering) active.add(event.span); else active.delete(event.span);
      if (!next || next.at === event.at || active.size !== 2) continue;
      const [a,b] = active;
      if (sameSupportingLine(positions, a, b) && isCrease(normals, a.edge, b.edge, -a.sign*b.sign)) {
        if (edges.length / 6 >= budget) return new Float32Array();
        append(event.vertex, next.vertex);
      }
    }
  }
  return new Float32Array(edges);
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

export type ModelFormat = 'step' | 'stl';
export type StlUnit = 'mm' | 'cm' | 'm' | 'inch';
export type Vec3 = [number, number, number];
export type ModelViewPreset = 'iso' | 'front' | 'top' | 'right';
export const MODEL_LIMITS = { maxBytes: 20 * 1024 * 1024, timeoutMs: 60_000, maxTriangles: 1_000_000 } as const;
export const STL_UNIT_SCALE: Record<StlUnit, number> = { mm: 1, cm: 10, m: 1000, inch: 25.4 };
export const STEP_OPTIONS = { linearUnit: 'millimeter', linearDeflectionType: 'absolute_value', linearDeflection: 0.05, angularDeflection: 0.3 } as const;
export interface ParsedMesh { name: string; positions: Float32Array; normals?: Float32Array; indices: Uint32Array }
export interface ParsedModel { meshes: ParsedMesh[]; boundsMm: { min: Vec3; max: Vec3 }; triangleCount: number }
export type ParsePhase = 'reading' | 'engine' | 'parsing';
export interface ParseRequest { requestId: number; buffer: ArrayBuffer; format: ModelFormat; stlUnit: StlUnit; assetBase: string }
export type ParseReply = { requestId: number } & (
  | { type: 'phase'; phase: ParsePhase }
  | { type: 'result'; model: ParsedModel }
  | { type: 'error'; message: string }
);

/** Only display-mesh AABB; never an authoritative CAD measurement. */
export function normalizeMeshes(meshes: ParsedMesh[], scale = 1): ParsedModel {
  if (!meshes.length) throw new Error('模型为空，请选择包含实体的模型。');
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  let triangleCount = 0;
  for (const mesh of meshes) {
    if (!mesh.positions.length || mesh.positions.length % 3) throw new Error('模型坐标结构无效。');
    if (!mesh.indices.length || mesh.indices.length % 3) throw new Error('模型三角形结构无效。');
    triangleCount += mesh.indices.length / 3;
    if (triangleCount > MODEL_LIMITS.maxTriangles) throw new Error('模型超过 1,000,000 个三角形上限，请简化模型后重试。');
    const count = mesh.positions.length / 3;
    for (const index of mesh.indices) if (index >= count) throw new Error('模型索引无效，请检查文件。');
    for (let i = 0; i < mesh.positions.length; i++) {
      const value = mesh.positions[i] * scale;
      if (!Number.isFinite(value) || Math.abs(value) > 3.4e38) throw new Error('模型包含无效坐标。');
      mesh.positions[i] = value;
    }
    // Bounds of referenced vertices only, preserving every mesh's world position.
    for (const index of mesh.indices) for (let axis = 0; axis < 3; axis++) {
      const value = mesh.positions[index * 3 + axis];
      min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
    }
    if (mesh.normals && (mesh.normals.length !== mesh.positions.length || !mesh.normals.every(Number.isFinite))) {
      throw new Error('模型法线结构无效。');
    }
  }
  if (max.every((value, axis) => value === min[axis])) throw new Error('模型为空或尺寸为零。');
  return { meshes, boundsMm: { min, max }, triangleCount };
}

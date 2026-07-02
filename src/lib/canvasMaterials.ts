import type {
  CanvasWireMaterial,
  CanvasWireSpec,
  CorrugatedMaterial,
  JacketCoreCount,
  JacketUlNumber,
  ProtectiveSleeve,
  ProtectiveSleeveType,
} from '@/types/harness';

export const JACKET_CORE_COUNTS: JacketCoreCount[] = [1, 2, 3, 4, 5, 6, 8, 12, 17];

/** Allowed UL numbers for jacketed wires (single-select, may be absent). */
export const JACKET_UL_NUMBERS: JacketUlNumber[] = ['UL2464', 'UL20276'];

const CORE_COLOR_SEQUENCE = [
  '红色',
  '黑色',
  '白色',
  '绿色',
  '黄色',
  '蓝色',
  '棕色',
  '橙色',
  '灰色',
  '紫色',
  '粉色',
  '浅蓝色',
  '黄绿色',
  '米白色',
  '深蓝色',
  '浅绿色',
  '透明',
];

export const PROTECTIVE_SLEEVE_LABELS: Record<ProtectiveSleeveType, string> = {
  'acetate-cloth': '醋酸布',
  fleece: '绒布',
  'heat-shrink': '热缩管',
  braided: '编织网管',
  corrugated: '波纹管',
};

export const PROTECTIVE_SLEEVE_PRICE_PER_METER: Record<ProtectiveSleeveType, number> = {
  'acetate-cloth': 2.2,
  fleece: 2.8,
  'heat-shrink': 1.67,
  braided: 3.33,
  corrugated: 4.0,
};

export const CORRUGATED_MATERIAL_LABELS: Record<CorrugatedMaterial, string> = {
  PP: 'PP（聚丙烯）',
  PA: 'PA（尼龙）',
  'stainless-steel': '不锈钢',
};

export const CORRUGATED_MATERIAL_SHORT_LABELS: Record<CorrugatedMaterial, string> = {
  PP: 'PP',
  PA: 'PA',
  'stainless-steel': '不锈钢',
};

export const CORRUGATED_MATERIAL_PRICE_MULTIPLIER: Record<CorrugatedMaterial, number> = {
  PP: 1.0,
  PA: 1.4,
  'stainless-steel': 3.2,
};

/**
 * Unified display name for a protective sleeve.
 * Corrugated sleeves include their material (e.g. "PA波纹管").
 * All UI surfaces (canvas, BOM, quote) should use this function.
 */
export function getProtectiveSleeveDisplayName(sleeve: ProtectiveSleeve): string {
  if (sleeve.type !== 'corrugated') {
    return PROTECTIVE_SLEEVE_LABELS[sleeve.type];
  }
  const materialLabel = sleeve.corrugatedMaterial
    ? CORRUGATED_MATERIAL_SHORT_LABELS[sleeve.corrugatedMaterial]
    : '未指定材质';
  return `${materialLabel}波纹管`;
}

export const CANVAS_MATERIAL_HEIGHT = 22;
export const CANVAS_MATERIAL_STRIP_TOP = 0;
export const CANVAS_MATERIAL_STRIP_PADDING_Y = 6;
export const CANVAS_MATERIAL_STRIP_HEIGHT = 10;
// Shared with WireMaterialNode so the sleeve snaps to the exact visual center of the strip.
export const CANVAS_MATERIAL_SLEEVE_CENTER_Y =
  CANVAS_MATERIAL_STRIP_TOP + CANVAS_MATERIAL_STRIP_PADDING_Y + CANVAS_MATERIAL_STRIP_HEIGHT / 2;
export const PROTECTIVE_SLEEVE_HEIGHT = 36;

/** Unified mm → canvas-px scale used by both wire materials and protective sleeves. */
export function lengthMmToCanvasWidth(lengthMm: number): number {
  return Math.max(40, Math.min(600, lengthMm * 0.6));
}

/**
 * Position an attached sleeve around the visual center line of a material.
 * This is the single source of truth for create, resize, move, and edit flows.
 */
export function centerSleeveOnMaterial(
  material: Pick<CanvasWireMaterial, 'position' | 'width'>,
  sleeveWidth: number,
): { x: number; y: number } {
  return {
    x: material.position.x + (material.width - sleeveWidth) / 2,
    y: material.position.y + CANVAS_MATERIAL_SLEEVE_CENTER_Y - PROTECTIVE_SLEEVE_HEIGHT / 2,
  };
}

/** @deprecated Use lengthMmToCanvasWidth */
export function sleeveLengthToCanvasWidth(lengthMm: number): number {
  return lengthMmToCanvasWidth(lengthMm);
}

export function calculateProtectiveSleevePrice(sleeve: ProtectiveSleeve): number {
  const pricePerMeter = PROTECTIVE_SLEEVE_PRICE_PER_METER[sleeve.type] ?? 0;
  const materialMultiplier =
    sleeve.type === 'corrugated' && sleeve.corrugatedMaterial
      ? (CORRUGATED_MATERIAL_PRICE_MULTIPLIER[sleeve.corrugatedMaterial] ?? 1)
      : 1;
  return pricePerMeter * materialMultiplier * (sleeve.lengthMm / 1000);
}

export function getCoreColors(coreCount: JacketCoreCount): string[] {
  return CORE_COLOR_SEQUENCE.slice(0, coreCount);
}

export function calculateCableOd(awg: number, coreCount: JacketCoreCount, shielded: boolean): number {
  const safeAwg = Math.min(40, Math.max(4, awg));
  const conductorDiameter = 0.127 * Math.pow(92, (36 - safeAwg) / 39);
  const insulatedCoreDiameter = conductorDiameter * 1.35 + 0.45;
  const bundleDiameter = insulatedCoreDiameter * Math.sqrt(coreCount) * 1.12;
  const estimatedOd = bundleDiameter + 0.8 + (shielded ? 0.35 : 0);
  return Math.round(estimatedOd * 100) / 100;
}

export function createDefaultWireSpec(): CanvasWireSpec {
  return {
    kind: 'electronic',
    color: 'red',
    lengthMm: 300,
    awg: 26,
    ulNumber: '1007',
    endTreatment: { stripped: false },
  };
}

export function createDefaultCanvasMaterial(
  id: string,
  position: { x: number; y: number },
): CanvasWireMaterial {
  const spec = createDefaultWireSpec();
  return {
    id,
    name: '新线材',
    position,
    width: lengthMmToCanvasWidth(spec.lengthMm),
    spec,
    circuits: [],
    expandedByDefault: true,
  };
}

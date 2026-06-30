import type {
  CanvasWireMaterial,
  CanvasWireSpec,
  JacketCoreCount,
  ProtectiveSleeveType,
} from '@/types/harness';

export const JACKET_CORE_COUNTS: JacketCoreCount[] = [1, 2, 3, 4, 5, 6, 8, 12, 17];

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

export const CANVAS_MATERIAL_HEIGHT = 76;
export const CANVAS_MATERIAL_STRIP_TOP = 46;
export const CANVAS_MATERIAL_STRIP_PADDING_Y = 6;
export const CANVAS_MATERIAL_STRIP_HEIGHT = 10;
// Shared with WireMaterialNode so the sleeve snaps to the exact visual center of the strip.
export const CANVAS_MATERIAL_SLEEVE_CENTER_Y =
  CANVAS_MATERIAL_STRIP_TOP + CANVAS_MATERIAL_STRIP_PADDING_Y + CANVAS_MATERIAL_STRIP_HEIGHT / 2;
export const PROTECTIVE_SLEEVE_HEIGHT = 24;

export function sleeveLengthToCanvasWidth(lengthMm: number): number {
  return Math.max(64, Math.min(260, lengthMm * 0.6));
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
  return {
    id,
    name: '新线材',
    position,
    width: 260,
    spec: createDefaultWireSpec(),
  };
}

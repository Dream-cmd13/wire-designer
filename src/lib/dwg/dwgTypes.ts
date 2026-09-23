export interface DwgPoint {
  x: number;
  y: number;
}

export interface DwgBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface DwgHatchPath {
  points: DwgPoint[];
}

export type DwgTextAlign = 'left' | 'center' | 'right';

export type DwgTextBaseline = 'top' | 'middle' | 'bottom';

export interface DwgTextPrimitive {
  kind: 'text';
  lines: string[];
  position: DwgPoint;
  height: number;
  rotation: number;
  align: DwgTextAlign;
  baseline: DwgTextBaseline;
  color: string;
  bold: boolean;
}

export interface DwgEntityMeta {
  /** 图元所属图层（已按随块规则解析）。 */
  layer: string;
  /** 图元包围盒，用于视口裁剪。 */
  bounds: DwgBounds;
}

export type DwgGeometry =
  | { kind: 'line'; a: DwgPoint; b: DwgPoint; color: string }
  | { kind: 'polyline'; points: DwgPoint[]; bulges: number[]; closed: boolean; color: string }
  | { kind: 'circle'; center: DwgPoint; radius: number; color: string }
  | { kind: 'arc'; center: DwgPoint; radius: number; startAngle: number; endAngle: number; color: string }
  | { kind: 'solid'; points: DwgPoint[]; color: string }
  | { kind: 'hatch'; paths: DwgHatchPath[]; solid: boolean; color: string }
  | DwgTextPrimitive;

export type DwgRenderEntity = DwgGeometry & DwgEntityMeta;

export interface DwgLayerInfo {
  name: string;
  colorIndex: number;
  color: string;
}

export interface DwgDrawingStats {
  total: number;
  rendered: number;
  text: number;
  skipped: Record<string, number>;
}

export interface DwgDrawing {
  fileName: string;
  version: string;
  units: number | null;
  bounds: DwgBounds;
  layers: DwgLayerInfo[];
  entities: DwgRenderEntity[];
  stats: DwgDrawingStats;
}

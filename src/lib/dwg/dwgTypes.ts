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

/** HATCH 图案定义线（已应用图案比例与块变换）。 */
export interface DwgHatchPatternLine {
  /** 图案线方向（弧度）。 */
  angle: number;
  /** 图案基准点（世界单位）。 */
  base: DwgPoint;
  /** 相邻图案线的偏移向量（世界单位）。 */
  offset: DwgPoint;
  /** 图案线自身的虚线段（世界单位、正数交替实段/空段）；空数组为实线。 */
  dashes: number[];
}

/** 线型虚线段（世界单位、正数交替实段/空段）；缺省为实线。 */
export interface DwgStrokeStyle {
  dash?: number[];
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
  /** MTEXT 参考框宽度（世界单位，已折行）；渲染时用于把整段文字兜底压缩回框内。 */
  wrapWidth?: number;
  /** 水平缩放（TEXT 宽度因子、Aligned/Fit 拉伸），参与包围盒与渲染。 */
  widthScale?: number;
  /** 垂直缩放（仅 Aligned 等比拉伸使用）。 */
  heightScale?: number;
}

export interface DwgEntityMeta {
  /** 图元所属图层（已按随块规则解析）。 */
  layer: string;
  /** 图元包围盒，用于视口裁剪。 */
  bounds: DwgBounds;
}

export type DwgGeometry =
  | ({ kind: 'line'; a: DwgPoint; b: DwgPoint; color: string } & DwgStrokeStyle)
  | ({ kind: 'polyline'; points: DwgPoint[]; bulges: number[]; closed: boolean; color: string } & DwgStrokeStyle)
  | ({ kind: 'circle'; center: DwgPoint; radius: number; color: string } & DwgStrokeStyle)
  | ({ kind: 'arc'; center: DwgPoint; radius: number; startAngle: number; endAngle: number; color: string } & DwgStrokeStyle)
  | { kind: 'solid'; points: DwgPoint[]; color: string }
  | { kind: 'hatch'; paths: DwgHatchPath[]; solid: boolean; color: string; pattern?: DwgHatchPatternLine[] }
  | DwgTextPrimitive;

export type DwgRenderEntity = DwgGeometry & DwgEntityMeta;

export interface DwgLayerInfo {
  name: string;
  colorIndex: number;
  color: string;
  /** 图层关闭（OFF）或冻结（FROZEN），默认不显示，可在图层面板中重新打开。 */
  off?: boolean;
  frozen?: boolean;
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
  /** 默认隐藏的图层（图纸中处于关闭/冻结状态）。 */
  hiddenLayers: string[];
  entities: DwgRenderEntity[];
  stats: DwgDrawingStats;
}

import { Dwg_File_Type, LibreDwg, type DwgDatabase, type DwgEntity } from '@mlightcad/libredwg-web';
import { aciToRgb, rgbFromTrueColor, rgbToHex, type Rgb } from '@/lib/dwg/aciColor';
import {
  IDENTITY_AFFINE,
  applyAffine,
  multiplyAffine,
  rotationAffine,
  scaleAffine,
  similarityOf,
  translationAffine,
  type Affine,
} from '@/lib/dwg/affine';
import { flattenBulges, sampleArcRange } from '@/lib/dwg/bulge';
import { decodePercentCodes, parseMText } from '@/lib/dwg/mtextFormat';
import type {
  DwgBounds,
  DwgDrawing,
  DwgGeometry,
  DwgHatchPath,
  DwgLayerInfo,
  DwgPoint,
  DwgRenderEntity,
  DwgTextAlign,
  DwgTextBaseline,
} from '@/lib/dwg/dwgTypes';

export type DwgParsePhase = 'engine' | 'parsing';

export interface ParseDwgOptions {
  fileName?: string;
  /** wasm 所在目录（浏览器中为 `${BASE_URL}libredwg`）；Node 环境可省略。 */
  wasmBase?: string;
  onProgress?: (phase: DwgParsePhase) => void;
}

interface BlockDefinition {
  base: DwgPoint;
  entities: DwgEntity[];
}

interface ConvertContext {
  transform: Affine;
  layerColors: Map<string, Rgb>;
  blocks: Map<string, BlockDefinition>;
  /** 随块颜色（来自外层 INSERT），用于解析块内 BYBLOCK 图元。 */
  blockColor: Rgb | null;
  /** 块内图层 "0" 图元继承的外层图层。 */
  blockLayer: string | null;
  depth: number;
}

const DEFAULT_LAYER = '0';
const BY_LAYER_INDEXES = new Set([0, 256]);
const MAX_BLOCK_DEPTH = 8;
const MODEL_SPACE_NAME = '*MODEL_SPACE';
/** 文字高度（大写字母高度）与字宽的近似比例，用于估算文字包围盒。 */
const TEXT_WIDTH_RATIO = 0.7;
const TEXT_LINE_SPACING = 1.66;

/**
 * DWG 文件头版本标识检查（AC1.2 ~ AC1032 均以 AC + 数字开头）。
 */
export function hasDwgHeader(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 6) return false;
  const header = new TextDecoder('latin1').decode(new Uint8Array(buffer, 0, 6));
  return /^AC\d/.test(header);
}

let enginePromise: Promise<Awaited<ReturnType<typeof LibreDwg.create>>> | null = null;

function loadEngine(wasmBase?: string) {
  enginePromise ??= LibreDwg.create(wasmBase).catch((error: unknown) => {
    enginePromise = null;
    throw error;
  });
  return enginePromise;
}

function toPoint(point: { x: number; y: number } | undefined): DwgPoint | null {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return { x: point.x, y: point.y };
}

function resolveLayerName(entity: DwgEntity, context: ConvertContext): string {
  const layer = entity.layer || DEFAULT_LAYER;
  if (layer === DEFAULT_LAYER && context.blockLayer) return context.blockLayer;
  return layer;
}

function resolveEntityRgb(entity: DwgEntity, context: ConvertContext): Rgb {
  if (typeof entity.color === 'number' && entity.color > 0) {
    return rgbFromTrueColor(entity.color);
  }
  const index = entity.colorIndex;
  if (index === 0 && context.blockColor) {
    return context.blockColor;
  }
  // 负数索引表示图层被关闭，颜色仍按随层解析
  if (index === undefined || index < 0 || BY_LAYER_INDEXES.has(index)) {
    return context.layerColors.get(resolveLayerName(entity, context)) ?? aciToRgb(7);
  }
  return aciToRgb(index);
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function cross(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

/**
 * 依据拉伸方向（任意轴算法）构造 OCS -> WCS 的 2D 变换；默认方向 (0,0,1) 返回 null。
 */
function ocsAffine(extrusion?: { x?: number; y?: number; z?: number } | null): Affine | null {
  if (!extrusion) return null;
  const x = extrusion.x ?? 0;
  const y = extrusion.y ?? 0;
  const z = extrusion.z ?? 0;
  if (x === 0 && y === 0 && (z === 0 || z === 1)) return null;

  const length = Math.hypot(x, y, z);
  if (length === 0) return null;
  const az: Vec3 = { x: x / length, y: y / length, z: z / length };
  const rawAx = Math.abs(az.x) < 1 / 64 && Math.abs(az.y) < 1 / 64
    ? cross({ x: 0, y: 1, z: 0 }, az)
    : cross({ x: 0, y: 0, z: 1 }, az);
  const axLength = Math.hypot(rawAx.x, rawAx.y, rawAx.z);
  if (axLength === 0) return null;
  const ax: Vec3 = { x: rawAx.x / axLength, y: rawAx.y / axLength, z: rawAx.z / axLength };
  const ay = cross(az, ax);
  return { a: ax.x, b: ax.y, c: ay.x, d: ay.y, e: 0, f: 0 };
}

function clampedKnots(controlPointCount: number, degree: number): number[] {
  const spans = Math.max(1, controlPointCount - degree);
  const knots: number[] = [];
  for (let index = 0; index <= controlPointCount + degree; index += 1) {
    if (index <= degree) knots.push(0);
    else if (index >= controlPointCount) knots.push(1);
    else knots.push((index - degree) / spans);
  }
  return knots;
}

function deBoor(controlPoints: DwgPoint[], knots: number[], degree: number, t: number): DwgPoint {
  const lastIndex = controlPoints.length - 1;
  let span = degree;
  while (span < lastIndex && t >= knots[span + 1]) span += 1;

  const points: DwgPoint[] = [];
  for (let index = 0; index <= degree; index += 1) {
    points[index] = controlPoints[span - degree + index];
  }

  for (let level = 1; level <= degree; level += 1) {
    for (let index = degree; index >= level; index -= 1) {
      const knotIndex = span - degree + index;
      const denominator = knots[knotIndex + degree - level + 1] - knots[knotIndex];
      const alpha = denominator === 0 ? 0 : (t - knots[knotIndex]) / denominator;
      const previous = points[index - 1];
      const current = points[index];
      points[index] = {
        x: (1 - alpha) * previous.x + alpha * current.x,
        y: (1 - alpha) * previous.y + alpha * current.y,
      };
    }
  }

  return points[degree];
}

function sampleSpline(
  controlPoints: DwgPoint[],
  fitPoints: DwgPoint[],
  degree: number,
  knots: number[],
): DwgPoint[] {
  if (controlPoints.length < 2) return fitPoints;
  const safeDegree = Math.max(1, Math.min(degree, controlPoints.length - 1));
  const safeKnots = knots.length >= controlPoints.length + safeDegree + 1
    ? knots
    : clampedKnots(controlPoints.length, safeDegree);
  const start = safeKnots[safeDegree];
  const end = safeKnots[controlPoints.length];
  const samples = Math.max(8, controlPoints.length * 8);
  const points: DwgPoint[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const t = start + ((end - start) * index) / samples;
    points.push(deBoor(controlPoints, safeKnots, safeDegree, t));
  }
  return points;
}

function sampleEllipse(center: DwgPoint, major: DwgPoint, minor: DwgPoint, start: number, end: number): DwgPoint[] {
  let sweep = end - start;
  while (sweep <= 0) sweep += Math.PI * 2;
  const steps = Math.max(8, Math.ceil((sweep / (Math.PI * 2)) * 64));
  const points: DwgPoint[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = start + (sweep * index) / steps;
    points.push({
      x: center.x + major.x * Math.cos(t) + minor.x * Math.sin(t),
      y: center.y + major.y * Math.cos(t) + minor.y * Math.sin(t),
    });
  }
  return points;
}

interface BoundaryEdgeLike {
  type: number;
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  center?: { x: number; y: number };
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  degree?: number;
  knots?: number[];
  controlPoints?: Array<{ x: number; y: number }>;
  lengthOfMinorAxis?: number;
}

function convertBoundaryPath(path: {
  isClosed?: boolean;
  vertices?: Array<{ x: number; y: number; bulge?: number }>;
  edges?: BoundaryEdgeLike[];
}): DwgHatchPath | null {
  const points: DwgPoint[] = [];

  if (path.vertices?.length) {
    const vertices = path.vertices
      .map((vertex) => toPoint(vertex))
      .filter((point): point is DwgPoint => point !== null);
    const bulges = path.vertices.map((vertex) => vertex.bulge ?? 0);
    const hasBulge = bulges.some((bulge) => bulge !== 0);
    points.push(...(hasBulge ? flattenBulges(vertices, bulges, path.isClosed === true) : vertices));
  } else if (path.edges?.length) {
    for (const edge of path.edges) {
      if (edge.type === 1 && edge.start && edge.end) {
        const start = toPoint(edge.start);
        const end = toPoint(edge.end);
        if (start && end) points.push(start, end);
      } else if (edge.type === 2 && edge.center && edge.radius && edge.startAngle !== undefined && edge.endAngle !== undefined) {
        const center = toPoint(edge.center);
        if (center) points.push(...sampleArcRange(center, edge.radius, edge.startAngle, edge.endAngle, true));
      } else if (edge.type === 3 && edge.center && edge.end && edge.lengthOfMinorAxis !== undefined) {
        const center = toPoint(edge.center);
        const end = toPoint(edge.end);
        if (center && end) {
          const major = { x: end.x - center.x, y: end.y - center.y };
          const majorLength = Math.hypot(major.x, major.y);
          if (majorLength > 0) {
            const ratio = edge.lengthOfMinorAxis / majorLength;
            const minor = { x: -major.y * ratio, y: major.x * ratio };
            points.push(...sampleEllipse(center, major, minor, 0, Math.PI * 2));
          }
        }
      } else if (edge.type === 4 && edge.controlPoints?.length) {
        const controlPoints = edge.controlPoints.map(toPoint).filter((point): point is DwgPoint => point !== null);
        points.push(...sampleSpline(controlPoints, [], edge.degree ?? 3, edge.knots ?? []));
      }
    }
  }

  if (points.length < 2) return null;
  return { points };
}

function mtextPlacement(attachment: number): { align: DwgTextAlign; baseline: DwgTextBaseline } {
  const column = (attachment - 1) % 3;
  const row = Math.floor((attachment - 1) / 3);
  return {
    align: column === 1 ? 'center' : column === 2 ? 'right' : 'left',
    baseline: row === 0 ? 'top' : row === 1 ? 'middle' : 'bottom',
  };
}

function textPlacement(halign: number, valign: number): { align: DwgTextAlign; baseline: DwgTextBaseline } {
  return {
    align: halign === 1 ? 'center' : halign === 2 ? 'right' : 'left',
    baseline: valign === 3 ? 'top' : valign === 2 ? 'middle' : 'bottom',
  };
}

interface TextLike {
  text: string;
  startPoint: DwgPoint;
  textHeight: number;
  rotation?: number;
  halign?: number;
  valign?: number;
}

function convertTextLike(text: TextLike, transform: Affine, color: string): DwgGeometry[] {
  const rawPosition = toPoint(text.startPoint);
  if (!rawPosition || !text.text) return [];
  const similarity = similarityOf(transform);
  const height = text.textHeight * (similarity?.scale ?? 1);
  if (!(height > 0)) return [];
  const placement = textPlacement(text.halign ?? 0, text.valign ?? 0);
  return [{
    kind: 'text',
    lines: [decodePercentCodes(text.text).replace(/\s+$/, '')],
    position: applyAffine(transform, rawPosition),
    height,
    rotation: (text.rotation ?? 0) + (similarity?.rotation ?? 0),
    align: placement.align,
    baseline: placement.baseline,
    color,
    bold: false,
  }];
}

function expandInsert(entity: DwgEntity, context: ConvertContext, transform: Affine): DwgGeometry[] {
  if (context.depth >= MAX_BLOCK_DEPTH) return [];
  const insert = entity as DwgEntity & {
    name: string;
    insertionPoint: DwgPoint;
    xScale?: number;
    yScale?: number;
    rotation?: number;
    columnCount?: number;
    rowCount?: number;
    columnSpacing?: number;
    rowSpacing?: number;
  };
  const block = context.blocks.get(insert.name);
  const insertion = toPoint(insert.insertionPoint);
  if (!block || block.entities.length === 0 || !insertion) return [];

  const childContext: ConvertContext = {
    transform: IDENTITY_AFFINE,
    layerColors: context.layerColors,
    blocks: context.blocks,
    blockColor: resolveEntityRgb(entity, context),
    blockLayer: resolveLayerName(entity, context),
    depth: context.depth + 1,
  };

  const columnCount = Math.max(1, Math.round(insert.columnCount ?? 1));
  const rowCount = Math.max(1, Math.round(insert.rowCount ?? 1));
  const result: DwgGeometry[] = [];

  for (let column = 0; column < columnCount; column += 1) {
    for (let row = 0; row < rowCount; row += 1) {
      let instance = multiplyAffine(transform, translationAffine(insertion.x, insertion.y));
      instance = multiplyAffine(instance, rotationAffine(insert.rotation ?? 0));
      instance = multiplyAffine(instance, translationAffine(column * (insert.columnSpacing ?? 0), row * (insert.rowSpacing ?? 0)));
      instance = multiplyAffine(instance, scaleAffine(insert.xScale ?? 1, insert.yScale ?? 1));
      instance = multiplyAffine(instance, translationAffine(-block.base.x, -block.base.y));
      const instanceContext = { ...childContext, transform: instance };
      for (const child of block.entities) {
        result.push(...convertEntity(child, instanceContext));
      }
    }
  }

  // 顶层 INSERT 的属性文字已由转换器并入 db.entities，避免重复绘制；嵌套块的属性文字在此展开
  if (context.depth > 0) {
    const attribs = (entity as DwgEntity & { attribs?: DwgEntity[] }).attribs ?? [];
    for (const attrib of attribs) {
      result.push(...convertEntity(attrib, context));
    }
  }

  return result;
}

function convertEntity(entity: DwgEntity, context: ConvertContext): DwgGeometry[] {
  const extrusion = (entity as DwgEntity & { extrusionDirection?: { x?: number; y?: number; z?: number } }).extrusionDirection;
  const ocs = ocsAffine(extrusion);
  const transform = ocs ? multiplyAffine(context.transform, ocs) : context.transform;
  const similarity = similarityOf(transform);
  const color = rgbToHex(resolveEntityRgb(entity, context));

  switch (entity.type) {
    case 'LINE': {
      const line = entity as DwgEntity & { startPoint: DwgPoint; endPoint: DwgPoint };
      const a = toPoint(line.startPoint);
      const b = toPoint(line.endPoint);
      return a && b ? [{ kind: 'line', a: applyAffine(transform, a), b: applyAffine(transform, b), color }] : [];
    }
    case 'LWPOLYLINE': {
      const polyline = entity as DwgEntity & {
        flag: number;
        vertices: Array<{ x: number; y: number; bulge?: number }>;
      };
      const points: DwgPoint[] = [];
      const bulges: number[] = [];
      for (const vertex of polyline.vertices ?? []) {
        const point = toPoint(vertex);
        if (!point) continue;
        points.push(point);
        bulges.push(vertex.bulge ?? 0);
      }
      if (points.length < 2) return [];
      const closed = (polyline.flag & 1) === 1;
      if (similarity) {
        return [{
          kind: 'polyline',
          points: points.map((point) => applyAffine(transform, point)),
          bulges: similarity.mirrored ? bulges.map((bulge) => -bulge) : bulges,
          closed,
          color,
        }];
      }
      const flattened = flattenBulges(points, bulges, closed).map((point) => applyAffine(transform, point));
      return [{ kind: 'polyline', points: flattened, bulges: flattened.map(() => 0), closed, color }];
    }
    case 'CIRCLE': {
      const circle = entity as DwgEntity & { center: DwgPoint; radius: number };
      const center = toPoint(circle.center);
      if (!center || !(circle.radius > 0)) return [];
      if (similarity) {
        return [{ kind: 'circle', center: applyAffine(transform, center), radius: circle.radius * similarity.scale, color }];
      }
      const points = sampleArcRange(center, circle.radius, 0, Math.PI * 2, true).map((point) => applyAffine(transform, point));
      return [{ kind: 'polyline', points, bulges: points.map(() => 0), closed: true, color }];
    }
    case 'ARC': {
      const arc = entity as DwgEntity & { center: DwgPoint; radius: number; startAngle: number; endAngle: number };
      const center = toPoint(arc.center);
      if (!center || !(arc.radius > 0)) return [];
      if (similarity) {
        const { scale, rotation, mirrored } = similarity;
        return [{
          kind: 'arc',
          center: applyAffine(transform, center),
          radius: arc.radius * scale,
          startAngle: mirrored ? rotation - arc.endAngle : rotation + arc.startAngle,
          endAngle: mirrored ? rotation - arc.startAngle : rotation + arc.endAngle,
          color,
        }];
      }
      const points = sampleArcRange(center, arc.radius, arc.startAngle, arc.endAngle, true).map((point) => applyAffine(transform, point));
      return [{ kind: 'polyline', points, bulges: points.map(() => 0), closed: false, color }];
    }
    case 'ELLIPSE': {
      const ellipse = entity as DwgEntity & {
        center: DwgPoint;
        majorAxisEndPoint: DwgPoint;
        axisRatio: number;
        startAngle: number;
        endAngle: number;
      };
      const center = toPoint(ellipse.center);
      const major = toPoint(ellipse.majorAxisEndPoint);
      if (!center || !major) return [];
      const ratio = Number.isFinite(ellipse.axisRatio) ? ellipse.axisRatio : 1;
      const minor = { x: -major.y * ratio, y: major.x * ratio };
      const start = Number.isFinite(ellipse.startAngle) ? ellipse.startAngle : 0;
      const end = Number.isFinite(ellipse.endAngle) ? ellipse.endAngle : Math.PI * 2;
      const closed = Math.abs(end - start) >= Math.PI * 2 - 1e-6;
      const points = sampleEllipse(center, major, minor, start, end).map((point) => applyAffine(transform, point));
      return [{ kind: 'polyline', points, bulges: points.map(() => 0), closed, color }];
    }
    case 'SOLID': {
      const solid = entity as DwgEntity & { corner1: DwgPoint; corner2: DwgPoint; corner3: DwgPoint; corner4?: DwgPoint };
      const corners = [solid.corner1, solid.corner2, solid.corner4 ?? solid.corner3, solid.corner3]
        .map(toPoint)
        .filter((point): point is DwgPoint => point !== null);
      return corners.length >= 3
        ? [{ kind: 'solid', points: corners.map((point) => applyAffine(transform, point)), color }]
        : [];
    }
    case 'SPLINE': {
      const spline = entity as DwgEntity & {
        degree: number;
        knots?: number[];
        controlPoints?: DwgPoint[];
        fitPoints?: DwgPoint[];
      };
      const controlPoints = (spline.controlPoints ?? []).map(toPoint).filter((point): point is DwgPoint => point !== null);
      const fitPoints = (spline.fitPoints ?? []).map(toPoint).filter((point): point is DwgPoint => point !== null);
      const points = sampleSpline(controlPoints, fitPoints, spline.degree ?? 3, spline.knots ?? [])
        .map((point) => applyAffine(transform, point));
      return points.length >= 2 ? [{ kind: 'polyline', points, bulges: points.map(() => 0), closed: false, color }] : [];
    }
    case 'HATCH': {
      const hatch = entity as DwgEntity & {
        solidFill?: number;
        boundaryPaths?: Array<{ vertices?: Array<{ x: number; y: number; bulge?: number }>; edges?: BoundaryEdgeLike[] }>;
      };
      const paths = (hatch.boundaryPaths ?? [])
        .map(convertBoundaryPath)
        .filter((path): path is DwgHatchPath => path !== null)
        .map((path) => ({ points: path.points.map((point) => applyAffine(transform, point)) }));
      return paths.length > 0 ? [{ kind: 'hatch', paths, solid: hatch.solidFill === 1, color }] : [];
    }
    case 'MTEXT': {
      const mtext = entity as DwgEntity & {
        text: string;
        insertionPoint: DwgPoint;
        textHeight: number;
        rotation?: number;
        attachmentPoint?: number;
        colorIndex?: number;
      };
      const rawPosition = toPoint(mtext.insertionPoint);
      if (!rawPosition || !mtext.text) return [];
      const content = parseMText(mtext.text);
      if (content.lines.every((line) => line.length === 0)) return [];
      const similarityText = similarityOf(transform);
      const height = mtext.textHeight * (similarityText?.scale ?? 1);
      if (!(height > 0)) return [];
      const placement = mtextPlacement(mtext.attachmentPoint ?? 1);
      const inlineColor = content.colorIndex !== null && !BY_LAYER_INDEXES.has(content.colorIndex)
        ? rgbToHex(aciToRgb(content.colorIndex))
        : color;
      return [{
        kind: 'text',
        lines: content.lines,
        position: applyAffine(transform, rawPosition),
        height,
        rotation: (mtext.rotation ?? 0) + (similarityText?.rotation ?? 0),
        align: placement.align,
        baseline: placement.baseline,
        color: inlineColor,
        bold: content.bold,
      }];
    }
    case 'TEXT': {
      const text = entity as DwgEntity & TextLike;
      return convertTextLike(text, transform, color);
    }
    case 'ATTRIB': {
      const attrib = entity as DwgEntity & { flags?: number; text?: TextLike };
      if ((attrib.flags ?? 0) & 1) return [];
      return attrib.text ? convertTextLike(attrib.text, transform, color) : [];
    }
    case 'INSERT':
      return expandInsert(entity, context, transform);
    default:
      return [];
  }
}

function extendBounds(bounds: DwgBounds | null, x: number, y: number): DwgBounds {
  if (!bounds) return { minX: x, minY: y, maxX: x, maxY: y };
  return {
    minX: Math.min(bounds.minX, x),
    minY: Math.min(bounds.minY, y),
    maxX: Math.max(bounds.maxX, x),
    maxY: Math.max(bounds.maxY, y),
  };
}

function geometryBounds(geometry: DwgGeometry): DwgBounds {
  const includePoints = (points: DwgPoint[], initial: DwgBounds | null = null) => (
    points.reduce((bounds, point) => extendBounds(bounds, point.x, point.y), initial)
  );
  switch (geometry.kind) {
    case 'line':
      return extendBounds(extendBounds(null, geometry.a.x, geometry.a.y), geometry.b.x, geometry.b.y);
    case 'polyline':
    case 'solid':
      return includePoints(geometry.points) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    case 'hatch':
      return includePoints(geometry.paths.flatMap((path) => path.points)) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    case 'circle':
    case 'arc':
      return includePoints([
        { x: geometry.center.x - geometry.radius, y: geometry.center.y - geometry.radius },
        { x: geometry.center.x + geometry.radius, y: geometry.center.y + geometry.radius },
      ]) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    case 'text': {
      // 文字包围盒按最长行宽与行数保守估算（旋转文字也包含在内），避免视口边缘误裁剪
      const maxLineLength = geometry.lines.reduce((max, line) => Math.max(max, line.length), 1);
      const estimatedWidth = maxLineLength * geometry.height * TEXT_WIDTH_RATIO;
      const estimatedHeight = geometry.lines.length * geometry.height * TEXT_LINE_SPACING;
      const radius = estimatedWidth + estimatedHeight;
      const bounds = includePoints([geometry.position]);
      return extendBounds(extendBounds(bounds, geometry.position.x + radius, geometry.position.y + radius), geometry.position.x - radius, geometry.position.y - radius);
    }
    default:
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
}

/**
 * 将 libredwg 的 DwgDatabase 归一化为可直接渲染的图元列表（纯函数，便于测试）。
 */
export function normalizeDwgDatabase(db: DwgDatabase, fileName: string): DwgDrawing {
  const layerColors = new Map<string, Rgb>();
  const layers: DwgLayerInfo[] = [];
  const hiddenLayers: string[] = [];
  for (const layer of db.tables?.LAYER?.entries ?? []) {
    const rgb = typeof layer.color === 'number' && layer.color > 0
      ? rgbFromTrueColor(layer.color)
      : aciToRgb(layer.colorIndex ?? 7);
    layerColors.set(layer.name, rgb);
    const off = layer.off === true;
    const frozen = layer.frozen === true;
    if (off || frozen) hiddenLayers.push(layer.name);
    layers.push({ name: layer.name, colorIndex: layer.colorIndex ?? 7, color: rgbToHex(rgb), off, frozen });
  }

  const blocks = new Map<string, BlockDefinition>();
  let modelSpaceEntities: DwgEntity[] | null = null;
  for (const record of db.tables?.BLOCK_RECORD?.entries ?? []) {
    blocks.set(record.name, {
      base: toPoint(record.basePoint) ?? { x: 0, y: 0 },
      entities: record.entities ?? [],
    });
    if (record.name?.toUpperCase() === MODEL_SPACE_NAME && (record.entities?.length ?? 0) > 0) {
      modelSpaceEntities = record.entities;
    }
  }

  const context: ConvertContext = {
    transform: IDENTITY_AFFINE,
    layerColors,
    blocks,
    blockColor: null,
    blockLayer: null,
    depth: 0,
  };

  const entities: DwgRenderEntity[] = [];
  const skipped: Record<string, number> = {};
  let textCount = 0;
  let bounds: DwgBounds | null = null;
  // 优先取模型空间块内容，避免把图纸空间（布局/视口）图元叠加到模型空间上
  const allEntities = modelSpaceEntities
    ?? (db.entities ?? []).filter((entity) => entity.isInPaperSpace !== true);

  for (const entity of allEntities) {
    if (entity.isInPaperSpace === true) continue;
    const geometries = convertEntity(entity, context);
    if (geometries.length === 0) {
      skipped[entity.type] = (skipped[entity.type] ?? 0) + 1;
      continue;
    }
    const layer = resolveLayerName(entity, context);
    for (const geometry of geometries) {
      const entityBounds = geometryBounds(geometry);
      if (geometry.kind === 'text') textCount += 1;
      bounds = extendBounds(bounds, entityBounds.minX, entityBounds.minY);
      bounds = extendBounds(bounds, entityBounds.maxX, entityBounds.maxY);
      entities.push({ ...geometry, layer, bounds: entityBounds });
    }
  }

  const headerMin = toPoint(db.header?.EXTMIN);
  const headerMax = toPoint(db.header?.EXTMAX);
  if (headerMin && headerMax && headerMax.x > headerMin.x && headerMax.y > headerMin.y) {
    bounds = bounds
      ? {
          minX: Math.min(bounds.minX, headerMin.x),
          minY: Math.min(bounds.minY, headerMin.y),
          maxX: Math.max(bounds.maxX, headerMax.x),
          maxY: Math.max(bounds.maxY, headerMax.y),
        }
      : { minX: headerMin.x, minY: headerMin.y, maxX: headerMax.x, maxY: headerMax.y };
  }

  return {
    fileName,
    version: db.header?.ACADVER ?? '',
    units: db.header?.INSUNITS ?? null,
    bounds: bounds ?? { minX: 0, minY: 0, maxX: 100, maxY: 100 },
    layers,
    hiddenLayers,
    entities,
    stats: {
      total: allEntities.length,
      rendered: entities.length,
      text: textCount,
      skipped,
    },
  };
}

/**
 * 在浏览器内解析 DWG 文件，输出可直接渲染的归一化图元。
 */
export async function parseDwg(buffer: ArrayBuffer, options: ParseDwgOptions = {}): Promise<DwgDrawing> {
  const { fileName = 'drawing.dwg', wasmBase, onProgress } = options;

  if (!hasDwgHeader(buffer)) {
    throw new Error('该文件不是有效的 DWG 图纸（文件头校验失败）');
  }

  onProgress?.('engine');
  const lib = await loadEngine(wasmBase);

  onProgress?.('parsing');
  const dataPointer = lib.dwg_read_data(buffer, Dwg_File_Type.DWG);
  if (!dataPointer) {
    throw new Error('无法解析该 DWG 文件');
  }

  let db: DwgDatabase;
  try {
    db = lib.convert(dataPointer);
  } finally {
    try {
      lib.dwg_free(dataPointer);
    } catch {
      // 释放失败不影响解析结果
    }
  }

  const drawing = normalizeDwgDatabase(db, fileName);
  if (drawing.layers.length === 0) {
    throw new Error('无法解析该 DWG 图纸（文件已损坏或格式不受支持）');
  }
  return drawing;
}

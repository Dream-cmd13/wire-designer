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
import { TEXT_LINE_SPACING, TEXT_SIZE_RATIO, isWideChar, textWidthOf } from '@/lib/dwg/textMetrics';
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
  /**
   * 阶段回调；可返回 Promise，解析会等待其完成后继续，
   * 便于调用方在同步解析前先绘制加载遮罩。
   */
  onProgress?: (phase: DwgParsePhase) => void | Promise<void>;
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
const PAPER_SPACE_PREFIX = '*PAPER_SPACE';

/**
 * 折行单元：CJK 字符可独立断行（接线图的“切断”在窄参考宽下折成上下两行，
 * 这就是原图的“从上到下”显示来源）；西文单词/数字串视为整体，不从中断开。
 */
function breakUnits(line: string): string[] {
  const units: string[] = [];
  let token = '';
  for (const char of line) {
    if (isWideChar(char) || char === ' ') {
      if (token) {
        units.push(token);
        token = '';
      }
      units.push(char);
    } else {
      token += char;
    }
  }
  if (token) units.push(token);
  return units;
}

/**
 * 按 MTEXT 定义宽度（DXF 组码 41）折行；AutoCAD 会在该宽度处自动换行，
 * 放不下的西文单词整体溢出而不是逐字断行（与 `10` 这类窄框数字串的实测一致）。
 */
function wrapMTextLines(lines: string[], width: number, height: number): string[] {
  if (!(width > 0) || !(height > 0)) return lines;
  const wrapped: string[] = [];
  for (const line of lines) {
    let current = '';
    let currentWidth = 0;
    for (const unit of breakUnits(line)) {
      const unitWidth = textWidthOf(unit, height);
      if (current && currentWidth + unitWidth > width) {
        wrapped.push(current.replace(/\s+$/, ''));
        current = unit.replace(/^\s+/, '');
        currentWidth = current ? textWidthOf(current, height) : 0;
        continue;
      }
      current += unit;
      currentWidth += unitWidth;
    }
    wrapped.push(current.replace(/\s+$/, ''));
  }
  return wrapped;
}

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

function sampleEllipse(
  center: DwgPoint,
  major: DwgPoint,
  minor: DwgPoint,
  start: number,
  end: number,
  counterClockwise: boolean,
): DwgPoint[] {
  let sweep = end - start;
  if (counterClockwise) {
    while (sweep <= 0) sweep += Math.PI * 2;
  } else {
    while (sweep >= 0) sweep -= Math.PI * 2;
  }
  const steps = Math.max(8, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * 64));
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
  isCCW?: boolean;
  degree?: number;
  knots?: number[];
  controlPoints?: Array<{ x: number; y: number }>;
  /** 椭圆边：短轴/长轴比例（DXF 组码 40）。 */
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
        if (center) {
          points.push(...sampleArcRange(center, edge.radius, edge.startAngle, edge.endAngle, edge.isCCW !== false));
        }
      } else if (edge.type === 3 && edge.center && edge.end) {
        const center = toPoint(edge.center);
        // 长轴端点相对中心（DXF 组码 11），组码 40 为短轴/长轴比例
        const major = toPoint(edge.end);
        if (center && major) {
          const ratio = typeof edge.lengthOfMinorAxis === 'number' && Number.isFinite(edge.lengthOfMinorAxis)
            ? edge.lengthOfMinorAxis
            : 1;
          const minor = { x: -major.y * ratio, y: major.x * ratio };
          const start = edge.startAngle ?? 0;
          const end = edge.endAngle ?? Math.PI * 2;
          points.push(...sampleEllipse(center, major, minor, start, end, edge.isCCW !== false));
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
  // halign 4（Middle）是水平与垂直都居中的特殊对齐，与 valign 无关
  if (halign === 4) return { align: 'center', baseline: 'middle' };
  return {
    align: halign === 1 ? 'center' : halign === 2 ? 'right' : 'left',
    baseline: valign === 3 ? 'top' : valign === 2 ? 'middle' : 'bottom',
  };
}

interface TextLike {
  text: string;
  startPoint: DwgPoint;
  endPoint?: DwgPoint;
  textHeight: number;
  rotation?: number;
  halign?: number;
  valign?: number;
  xScale?: number;
}

function convertTextLike(text: TextLike, transform: Affine, color: string): DwgGeometry[] {
  if (!text.text) return [];
  const similarity = similarityOf(transform);
  const height = text.textHeight * (similarity?.scale ?? 1);
  if (!(height > 0)) return [];

  const halign = text.halign ?? 0;
  const valign = text.valign ?? 0;
  const start = toPoint(text.startPoint);
  const end = toPoint(text.endPoint);
  // DXF 约定：对齐方式非“左/基线”时第一个对齐点被忽略，锚点取第二个对齐点；
  // Aligned/Fit（3/5）由两点连线拉伸，锚点仍是第一点
  const stretch = halign === 3 || halign === 5;
  const rawPosition = stretch ? start : (halign !== 0 || valign !== 0 ? end ?? start : start);
  if (!rawPosition) return [];

  const line = decodePercentCodes(text.text).replace(/\s+$/, '');
  const placement = textPlacement(halign, valign);
  const widthFactor = Number.isFinite(text.xScale) && (text.xScale ?? 0) > 0 ? text.xScale as number : 1;
  let widthScale = widthFactor;
  let heightScale = 1;
  let rotation = (text.rotation ?? 0) + (similarity?.rotation ?? 0);

  if (stretch && start && end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    const natural = textWidthOf(line, height) * widthFactor;
    if (length > 0 && natural > 0) {
      widthScale = length / natural;
      // ALIGNED 等比缩放，FIT 只压宽度
      if (halign === 3) heightScale = widthScale;
    }
    rotation = Math.atan2(dy, dx) + (similarity?.rotation ?? 0);
  }

  return [{
    kind: 'text',
    lines: [line],
    position: applyAffine(transform, rawPosition),
    height,
    rotation,
    align: placement.align,
    baseline: placement.baseline,
    color,
    bold: false,
    widthScale: widthScale === 1 ? undefined : widthScale,
    heightScale: heightScale === 1 ? undefined : heightScale,
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
  const result: DwgGeometry[] = [];

  if (block && insertion && block.entities.length > 0) {
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
  }

  // 属性文字（ATTRIB）随 INSERT 展开；顶层 INSERT 的 context.transform 为单位阵，
  // 正好还原其 WCS 位置。转换器额外并入 db.entities 的同一批属性由调用方按 handle 去重。
  const attribs = (entity as DwgEntity & { attribs?: DwgEntity[] }).attribs ?? [];
  for (const attrib of attribs) {
    result.push(...convertEntity(attrib, context));
  }

  return result;
}

/**
 * DIMENSION 的几何（尺寸线、箭头、标注文字）存放在其匿名标注块（*D…）中，
 * 块内图元与标注处于同一坐标系，展开时只需按块基点平移并继承图层与颜色。
 */
function expandDimensionBlock(entity: DwgEntity, context: ConvertContext, transform: Affine): DwgGeometry[] {
  if (context.depth >= MAX_BLOCK_DEPTH) return [];
  const dimension = entity as DwgEntity & { name?: string };
  const block = dimension.name ? context.blocks.get(dimension.name) : undefined;
  if (!block || block.entities.length === 0) return [];

  const childContext: ConvertContext = {
    transform: multiplyAffine(transform, translationAffine(-block.base.x, -block.base.y)),
    layerColors: context.layerColors,
    blocks: context.blocks,
    blockColor: resolveEntityRgb(entity, context),
    blockLayer: resolveLayerName(entity, context),
    depth: context.depth + 1,
  };

  const result: DwgGeometry[] = [];
  for (const child of block.entities) {
    result.push(...convertEntity(child, childContext));
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
      // ELLIPSE 的中心与长轴端点是 WCS 坐标（DXF 组码 10/11），拉伸方向只决定短轴方向（N × 长轴）；
      // 不能再叠加 OCS 镜像，否则法线为 -Z 的椭圆会被错误地镜像到负坐标并撑大图纸范围。
      const normal = { x: extrusion?.x ?? 0, y: extrusion?.y ?? 0, z: extrusion?.z ?? 1 };
      const minor = { x: -normal.z * major.y * ratio, y: normal.z * major.x * ratio };
      const start = Number.isFinite(ellipse.startAngle) ? ellipse.startAngle : 0;
      const end = Number.isFinite(ellipse.endAngle) ? ellipse.endAngle : Math.PI * 2;
      const closed = Math.abs(end - start) >= Math.PI * 2 - 1e-6;
      const points = sampleEllipse(center, major, minor, start, end, true).map((point) => applyAffine(context.transform, point));
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
        direction?: DwgPoint;
        attachmentPoint?: number;
        colorIndex?: number;
        rectWidth?: number;
      };
      const rawPosition = toPoint(mtext.insertionPoint);
      if (!rawPosition || !mtext.text) return [];
      const content = parseMText(mtext.text);
      if (content.lines.every((line) => line.length === 0)) return [];
      const similarityText = similarityOf(transform);
      // 内联字高优先于实体字高：标注块 MTEXT 依赖 \H0.8x; 缩到实际字号
      const baseHeight = content.height
        ? content.height.relative ? mtext.textHeight * content.height.value : content.height.value
        : mtext.textHeight;
      const height = baseHeight * (similarityText?.scale ?? 1);
      if (!(height > 0)) return [];
      const placement = mtextPlacement(mtext.attachmentPoint ?? 1);
      const inlineColor = content.colorIndex !== null && !BY_LAYER_INDEXES.has(content.colorIndex)
        ? rgbToHex(aciToRgb(content.colorIndex))
        : color;
      // DWG 只存文字方向的 X 轴向量（rotation 字段通常为 0），必须用它还原旋转：
      // 竖直标注文字（direction=(0,1)）此前会被画成水平，造成叠字/出框
      const direction = mtext.direction;
      const directionAngle = direction && Number.isFinite(direction.x) && Number.isFinite(direction.y)
        && (direction.x !== 0 || direction.y !== 0)
        ? Math.atan2(direction.y, direction.x)
        : null;
      const rectWidth = (mtext.rectWidth ?? 0) * (similarityText?.scale ?? 1);
      return [{
        kind: 'text',
        lines: wrapMTextLines(content.lines, rectWidth, height),
        position: applyAffine(transform, rawPosition),
        height,
        rotation: (directionAngle ?? mtext.rotation ?? 0) + (similarityText?.rotation ?? 0),
        align: placement.align,
        baseline: placement.baseline,
        color: inlineColor,
        bold: content.bold,
        // 参考框窄于一个字宽时不做折行（部分 PDF 转出的图纸数值不可靠），也不做兜底压缩
        wrapWidth: rectWidth >= height * TEXT_SIZE_RATIO ? rectWidth : undefined,
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
    case 'DIMENSION':
      return expandDimensionBlock(entity, context, transform);
    case 'LEADER': {
      const leader = entity as DwgEntity & { vertices?: DwgPoint[] };
      const points = (leader.vertices ?? [])
        .map(toPoint)
        .filter((point): point is DwgPoint => point !== null)
        .map((point) => applyAffine(transform, point));
      return points.length >= 2
        ? [{ kind: 'polyline', points, bulges: points.map(() => 0), closed: false, color }]
        : [];
    }
    case 'IMAGE': {
      // 光栅图像通常是外部参照，浏览器读不到源文件；仅绘制图像边框，保持版面完整
      const image = entity as DwgEntity & {
        position?: DwgPoint;
        uPixel?: DwgPoint;
        vPixel?: DwgPoint;
        imageSize?: DwgPoint;
      };
      const origin = toPoint(image.position);
      const u = toPoint(image.uPixel);
      const v = toPoint(image.vPixel);
      const width = image.imageSize?.x ?? 0;
      const height = image.imageSize?.y ?? 0;
      if (!origin || !u || !v || !(width > 0) || !(height > 0)) return [];
      const corners = [
        origin,
        { x: origin.x + u.x * width, y: origin.y + u.y * width },
        { x: origin.x + u.x * width + v.x * height, y: origin.y + u.y * width + v.y * height },
        { x: origin.x + v.x * height, y: origin.y + v.y * height },
      ].map((point) => applyAffine(transform, point));
      return [{ kind: 'polyline', points: corners, bulges: corners.map(() => 0), closed: true, color }];
    }
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
      return includePoints([
        { x: geometry.center.x - geometry.radius, y: geometry.center.y - geometry.radius },
        { x: geometry.center.x + geometry.radius, y: geometry.center.y + geometry.radius },
      ]) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    case 'arc':
      // 按扫掠范围取包围盒；大半径小夹角的圆弧若按 center ± radius 计算会撑大整图范围
      return includePoints(
        sampleArcRange(geometry.center, geometry.radius, geometry.startAngle, geometry.endAngle, true),
      ) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    case 'text': {
      // 文字盒按对齐/基线确定相对锚点的位置（锚点位于盒的 left/center/right × top/middle/bottom），
      // 再按旋转角求轴对齐包围盒，避免用半径膨胀导致整图范围被撑大、适应窗口后图框过小
      const width = geometry.lines.reduce((max, line) => Math.max(max, textWidthOf(line, geometry.height)), 0)
        * (geometry.widthScale ?? 1);
      const height = ((Math.max(1, geometry.lines.length) - 1) * geometry.height * TEXT_LINE_SPACING + geometry.height)
        * (geometry.heightScale ?? 1);
      const left = geometry.align === 'center' ? -width / 2 : geometry.align === 'right' ? -width : 0;
      const top = geometry.baseline === 'top' ? -height : geometry.baseline === 'middle' ? -height / 2 : 0;
      const cos = Math.cos(geometry.rotation);
      const sin = Math.sin(geometry.rotation);
      const corners: DwgPoint[] = [];
      for (const x of [left, left + width]) {
        for (const y of [top, top + height]) {
          corners.push({
            x: geometry.position.x + x * cos - y * sin,
            y: geometry.position.y + x * sin + y * cos,
          });
        }
      }
      return includePoints(corners) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
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
  const paperSpaceHandles = new Set<string>();
  let modelSpaceEntities: DwgEntity[] | null = null;
  for (const record of db.tables?.BLOCK_RECORD?.entries ?? []) {
    blocks.set(record.name, {
      base: toPoint(record.basePoint) ?? { x: 0, y: 0 },
      entities: record.entities ?? [],
    });
    const upperName = record.name?.toUpperCase() ?? '';
    if (upperName === MODEL_SPACE_NAME && (record.entities?.length ?? 0) > 0) {
      modelSpaceEntities = record.entities;
    } else if (upperName.startsWith(PAPER_SPACE_PREFIX)) {
      paperSpaceHandles.add(record.handle);
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
  // 优先取模型空间块内容，避免把图纸空间（布局/视口）图元叠加到模型空间上；
  // 回退路径按 ownerBlockRecordSoftId 排除图纸空间块（libredwg-web 不填 isInPaperSpace）
  const allEntities = modelSpaceEntities
    ?? (db.entities ?? []).filter((entity) => (
      entity.isInPaperSpace !== true && !paperSpaceHandles.has(entity.ownerBlockRecordSoftId ?? '')
    ));

  // 顶层 INSERT 的属性文字由 INSERT 展开绘制；转换器并入 db.entities 的同一批属性按 handle 跳过，避免重复
  const expandedAttribHandles = new Set<string>();
  for (const entity of allEntities) {
    if (entity.type !== 'INSERT') continue;
    for (const attrib of (entity as DwgEntity & { attribs?: DwgEntity[] }).attribs ?? []) {
      if (attrib.handle) expandedAttribHandles.add(attrib.handle);
    }
  }

  for (const entity of allEntities) {
    if (entity.isInPaperSpace === true) continue;
    if (entity.type === 'ATTRIB' && entity.handle && expandedAttribHandles.has(entity.handle)) continue;
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

  // 只有没有任何可渲染图元时才回退到图纸头范围：部分图纸（如 M12A05-08-085）
  // 的 EXTMIN/EXTMAX 是过期的历史值，并入会把适应窗口缩小成正常尺寸的几分之一
  if (!bounds) {
    const headerMin = toPoint(db.header?.EXTMIN);
    const headerMax = toPoint(db.header?.EXTMAX);
    if (headerMin && headerMax && headerMax.x > headerMin.x && headerMax.y > headerMin.y) {
      bounds = { minX: headerMin.x, minY: headerMin.y, maxX: headerMax.x, maxY: headerMax.y };
    }
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

  // 仅在引擎尚未创建时提示引擎加载，已就绪时直接进入解析阶段
  if (!enginePromise) {
    await onProgress?.('engine');
  }
  const lib = await loadEngine(wasmBase);

  // 等待回调完成绘制后再开始同步解析，避免遮罩来不及显示就阻塞主线程
  await onProgress?.('parsing');
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

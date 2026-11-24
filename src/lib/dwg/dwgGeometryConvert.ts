import type { DwgEntity } from '@mlightcad/libredwg-web';
import { aciToRgb, rgbFromTrueColor, rgbToHex, type Rgb } from '@/lib/dwg/aciColor';
import {
  IDENTITY_AFFINE,
  applyAffine,
  applyAffineVector,
  multiplyAffine,
  rotationAffine,
  scaleAffine,
  similarityOf,
  translationAffine,
  type Affine,
} from '@/lib/dwg/affine';
import { flattenBulges, sampleArcRange } from '@/lib/dwg/bulge';
import type { TextMeasure } from '@/lib/dwg/dwgBounds';
import type {
  DwgExternalImage,
  DwgGeometry,
  DwgHatchPath,
  DwgHatchPatternLine,
  DwgPoint,
  DwgTextAlign,
  DwgTextBaseline,
} from '@/lib/dwg/dwgTypes';
import { decodePercentCodes, parseMText } from '@/lib/dwg/mtextFormat';
import { TEXT_SIZE_RATIO, isWideChar, textWidthOf } from '@/lib/dwg/textMetrics';

export interface BlockDefinition {
  base: DwgPoint;
  entities: DwgEntity[];
}

export interface ConvertContext {
  transform: Affine;
  layerColors: Map<string, Rgb>;
  blocks: Map<string, BlockDefinition>;
  /** 随块颜色（来自外层 INSERT），用于解析块内 BYBLOCK 图元。 */
  blockColor: Rgb | null;
  /** 块内图层 "0" 图元继承的外层图层。 */
  blockLayer: string | null;
  /** 随块线型（来自外层 INSERT），用于解析块内 BYBLOCK 图元。 */
  blockLineType: string | null;
  /** LTYPE 表：线型名 -> 虚线段（正数交替实段/空段，图纸单位）。 */
  linePatterns: Map<string, number[]>;
  /** LAYER 表：图层名 -> 线型名。 */
  layerLineTypes: Map<string, string>;
  /** 全局线型比例（LTSCALE 头变量）。 */
  lineTypeScale: number;
  /** IMAGEDEF 表：句柄 -> 图片路径（缺失图片时在边框内显示）。 */
  imageDefPaths: Map<string, string>;
  /** 缺失的外部参照图片，随转换收集供页面提示。 */
  externalImages: DwgExternalImage[];
  /** 真实字体测量函数；缺省用内置估算。 */
  measureText: TextMeasure | null;
  depth: number;
}

export const DEFAULT_LAYER = '0';
export const BY_LAYER_INDEXES = new Set([0, 256]);
const MAX_BLOCK_DEPTH = 8;

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
export function wrapMTextLines(
  lines: string[],
  width: number,
  height: number,
  measureText: TextMeasure | null,
): string[] {
  if (!(width > 0) || !(height > 0)) return lines;
  const widthOf = (text: string) => measureText?.(text, height) ?? textWidthOf(text, height);
  const wrapped: string[] = [];
  for (const line of lines) {
    let current = '';
    let currentWidth = 0;
    for (const unit of breakUnits(line)) {
      const unitWidth = widthOf(unit);
      if (current && currentWidth + unitWidth > width) {
        wrapped.push(current.replace(/\s+$/, ''));
        current = unit.replace(/^\s+/, '');
        currentWidth = current ? widthOf(current) : 0;
        continue;
      }
      current += unit;
      currentWidth += unitWidth;
    }
    wrapped.push(current.replace(/\s+$/, ''));
  }
  return wrapped;
}

export function toPoint(point: { x: number; y: number } | undefined): DwgPoint | null {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return { x: point.x, y: point.y };
}

export function resolveLayerName(entity: DwgEntity, context: ConvertContext): string {
  const layer = entity.layer || DEFAULT_LAYER;
  if (layer === DEFAULT_LAYER && context.blockLayer) return context.blockLayer;
  return layer;
}

/** 解析实体线型名：BYBLOCK 继承外层 INSERT，空值与 BYLAYER 取所在图层。 */
function resolveLineTypeName(entity: DwgEntity, context: ConvertContext): string | null {
  const name = (entity as DwgEntity & { lineType?: string }).lineType;
  if (!name || name === 'ByBlock') return context.blockLineType;
  if (name === 'ByLayer') return context.layerLineTypes.get(resolveLayerName(entity, context)) ?? null;
  return name;
}

/** MTEXT/标注块内实体线型取自 LTYPE 表的虚线段，按实体比例、LTSCALE 与块缩放换算为世界单位。 */
function resolveEntityDash(entity: DwgEntity, context: ConvertContext, transformScale: number): number[] | undefined {
  const name = resolveLineTypeName(entity, context);
  if (!name) return undefined;
  const pattern = context.linePatterns.get(name);
  if (!pattern) return undefined;
  const entityScale = (entity as DwgEntity & { lineTypeScale?: number }).lineTypeScale;
  const scale = (typeof entityScale === 'number' && entityScale > 0 ? entityScale : 1)
    * context.lineTypeScale
    * transformScale;
  if (!(scale > 0)) return undefined;
  return pattern.map((length) => length * scale);
}

function applyDash(geometries: DwgGeometry[], dash: number[] | undefined): DwgGeometry[] {
  if (!dash) return geometries;
  return geometries.map((geometry) => (
    geometry.kind === 'line' || geometry.kind === 'polyline' || geometry.kind === 'circle' || geometry.kind === 'arc'
      ? { ...geometry, dash }
      : geometry
  ));
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
  /** 转换器实际返回 1/0（数字）或布尔值，需按真值判断。 */
  isClosed?: boolean | number;
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
    // 闭合段由最后一个顶点的 bulge 定义（如 2 顶点 + 两个 bulge=1 = 整圆）；
    // 这里若用 `=== true` 严格比较，转换器返回的数字 1 会被当成未闭合而丢掉闭合段
    const closed = path.isClosed === true || path.isClosed === 1;
    points.push(...(hasBulge ? flattenBulges(vertices, bulges, closed) : vertices));
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

function convertTextLike(
  text: TextLike,
  transform: Affine,
  color: string,
  measureText: TextMeasure | null,
): DwgGeometry[] {
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
    const natural = (measureText?.(line, height) ?? textWidthOf(line, height)) * widthFactor;
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
      blockLineType: resolveLineTypeName(entity, context),
      linePatterns: context.linePatterns,
      layerLineTypes: context.layerLineTypes,
      lineTypeScale: context.lineTypeScale,
      imageDefPaths: context.imageDefPaths,
      externalImages: context.externalImages,
      measureText: context.measureText,
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
    blockLineType: resolveLineTypeName(entity, context),
    linePatterns: context.linePatterns,
    layerLineTypes: context.layerLineTypes,
    lineTypeScale: context.lineTypeScale,
    imageDefPaths: context.imageDefPaths,
    externalImages: context.externalImages,
    measureText: context.measureText,
    depth: context.depth + 1,
  };

  const result: DwgGeometry[] = [];
  for (const child of block.entities) {
    for (const geometry of convertEntity(child, childContext)) {
      result.push(geometry.kind === 'text' ? { ...geometry, isDimension: true } : geometry);
    }
  }
  return result;
}

/**
 * 将 HATCH 图案定义线换算到世界坐标：方向/基准/偏移走仿射变换，虚线长度按线方向缩放。
 * 库返回的 offset/dashLengths 已包含图案比例（patternScale），无需再次相乘。
 */
function convertHatchPattern(
  definitionLines: Array<{ angle?: number; base?: DwgPoint; offset?: DwgPoint; dashLengths?: number[] }> | undefined,
  transform: Affine,
): DwgHatchPatternLine[] | undefined {
  const lines: DwgHatchPatternLine[] = [];
  for (const line of definitionLines ?? []) {
    const angle = line.angle;
    if (typeof angle !== 'number' || !Number.isFinite(angle)) continue;
    const base = toPoint(line.base);
    const offset = toPoint(line.offset);
    if (!base || !offset) continue;
    const direction = applyAffineVector(transform, { x: Math.cos(angle), y: Math.sin(angle) });
    const directionLength = Math.hypot(direction.x, direction.y);
    const worldOffset = applyAffineVector(transform, offset);
    if (!(directionLength > 0) || !(Math.hypot(worldOffset.x, worldOffset.y) > 0)) continue;
    lines.push({
      angle: Math.atan2(direction.y, direction.x),
      base: applyAffine(transform, base),
      offset: worldOffset,
      dashes: (line.dashLengths ?? []).map((value) => Math.abs(value) * directionLength),
    });
  }
  return lines.length > 0 ? lines : undefined;
}

export function convertEntity(entity: DwgEntity, context: ConvertContext): DwgGeometry[] {
  const extrusion = (entity as DwgEntity & { extrusionDirection?: { x?: number; y?: number; z?: number } }).extrusionDirection;
  const ocs = ocsAffine(extrusion);
  const transform = ocs ? multiplyAffine(context.transform, ocs) : context.transform;
  const similarity = similarityOf(transform);
  const color = rgbToHex(resolveEntityRgb(entity, context));

  const geometries = convertEntityGeometries(entity, context, transform, similarity, color);
  // INSERT/DIMENSION 展开出的子图元已按各自线型附加虚线，不能再用外层线型覆盖
  if (entity.type === 'INSERT' || entity.type === 'DIMENSION') return geometries;
  return applyDash(geometries, resolveEntityDash(entity, context, similarity?.scale ?? 1));
}

function convertEntityGeometries(
  entity: DwgEntity,
  context: ConvertContext,
  transform: Affine,
  similarity: ReturnType<typeof similarityOf>,
  color: string,
): DwgGeometry[] {
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
      const extrusion = (entity as DwgEntity & { extrusionDirection?: { x?: number; y?: number; z?: number } }).extrusionDirection;
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
        definitionLines?: Array<{ angle?: number; base?: DwgPoint; offset?: DwgPoint; dashLengths?: number[] }>;
      };
      const paths = (hatch.boundaryPaths ?? [])
        .map(convertBoundaryPath)
        .filter((path): path is DwgHatchPath => path !== null)
        .map((path) => ({ points: path.points.map((point) => applyAffine(transform, point)) }));
      if (paths.length === 0) return [];
      return [{
        kind: 'hatch',
        paths,
        solid: hatch.solidFill === 1,
        color,
        pattern: hatch.solidFill === 1 ? undefined : convertHatchPattern(hatch.definitionLines, transform),
      }];
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
        lines: wrapMTextLines(content.lines, rectWidth, height, context.measureText),
        sourceLines: content.lines,
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
      return convertTextLike(text, transform, color, context.measureText);
    }
    case 'ATTRIB': {
      const attrib = entity as DwgEntity & { flags?: number; text?: TextLike };
      if ((attrib.flags ?? 0) & 1) return [];
      return attrib.text ? convertTextLike(attrib.text, transform, color, context.measureText) : [];
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
      // 光栅图像通常是外部参照，浏览器读不到源文件：绘制图像边框，并在框内居中显示
      // 图片路径（与 CAD 打开缺失图片时的占位表现一致）
      const image = entity as DwgEntity & {
        position?: DwgPoint;
        uPixel?: DwgPoint;
        vPixel?: DwgPoint;
        imageSize?: DwgPoint;
        imageDefHandle?: string;
      };
      const origin = toPoint(image.position);
      const u = toPoint(image.uPixel);
      const v = toPoint(image.vPixel);
      const width = image.imageSize?.x ?? 0;
      const height = image.imageSize?.y ?? 0;
      if (!origin || !u || !v || !(width > 0) || !(height > 0)) return [];
      const imagePath = image.imageDefHandle ? context.imageDefPaths.get(image.imageDefHandle) : undefined;
      context.externalImages.push({ path: imagePath ?? null });
      const corners = [
        origin,
        { x: origin.x + u.x * width, y: origin.y + u.y * width },
        { x: origin.x + u.x * width + v.x * height, y: origin.y + u.y * width + v.y * height },
        { x: origin.x + v.x * height, y: origin.y + v.y * height },
      ].map((point) => applyAffine(transform, point));
      const geometries: DwgGeometry[] = [
        { kind: 'polyline', points: corners, bulges: corners.map(() => 0), closed: true, color },
      ];

      if (imagePath) {
        const axisU = applyAffineVector(transform, u);
        const axisV = applyAffineVector(transform, v);
        const frameWidth = Math.hypot(axisU.x, axisU.y) * width;
        const frameHeight = Math.hypot(axisV.x, axisV.y) * height;
        const unitWidth = textWidthOf(imagePath, 1);
        const textHeight = Math.min(frameHeight / 5, (frameWidth * 0.9) / Math.max(unitWidth, 1));
        if (textHeight > 0) {
          geometries.push({
            kind: 'text',
            lines: [imagePath],
            position: applyAffine(transform, {
              x: origin.x + (u.x * width + v.x * height) / 2,
              y: origin.y + (u.y * width + v.y * height) / 2,
            }),
            height: textHeight,
            rotation: Math.atan2(axisU.y, axisU.x),
            align: 'center',
            baseline: 'middle',
            color,
            bold: false,
            wrapWidth: frameWidth * 0.92,
          });
        }
      }
      return geometries;
    }
    default:
      return [];
  }
}

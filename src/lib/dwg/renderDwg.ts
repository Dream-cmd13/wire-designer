import { inkHex, isDarkColor } from '@/lib/dwg/aciColor';
import { bulgeToArc } from '@/lib/dwg/bulge';
import { worldToScreen } from '@/lib/dwg/dwgView';
import { TEXT_LINE_SPACING, TEXT_SIZE_RATIO } from '@/lib/dwg/textMetrics';
import type { DwgBounds, DwgDrawing, DwgPoint, DwgRenderEntity, DwgTextPrimitive } from '@/lib/dwg/dwgTypes';

type FillEntity = Extract<DwgRenderEntity, { kind: 'hatch' | 'solid' }>;
type HatchEntity = Extract<DwgRenderEntity, { kind: 'hatch' }>;
type StrokeEntity = Extract<DwgRenderEntity, { kind: 'line' | 'polyline' | 'circle' | 'arc' }>;

export interface DwgRenderOptions {
  /** 画布像素 / 图纸单位 */
  scale: number;
  offsetX: number;
  offsetY: number;
  /** 线宽（画布像素） */
  lineWidth: number;
  background?: string;
  fontFamily?: string;
  /** 隐藏的图层集合。 */
  hiddenLayers?: ReadonlySet<string>;
}

const DEFAULT_FONT_FAMILY = '"SimSun", "宋体", "STSong", "Songti SC", serif';

function boundsIntersect(left: DwgBounds, right: DwgBounds): boolean {
  return left.minX <= right.maxX && left.maxX >= right.minX && left.minY <= right.maxY && left.maxY >= right.minY;
}

/**
 * 依据视图变换计算图纸坐标系下的可见范围，用于视口裁剪。
 */
export function visibleWorldBounds(options: DwgRenderOptions, width: number, height: number): DwgBounds {
  const { scale, offsetX, offsetY } = options;
  return {
    minX: -offsetX / scale,
    maxX: (width - offsetX) / scale,
    maxY: offsetY / scale,
    minY: (offsetY - height) / scale,
  };
}

function traceSegment(
  context: CanvasRenderingContext2D,
  from: DwgPoint,
  to: DwgPoint,
  bulge: number,
): void {
  const arc = bulgeToArc(from, to, bulge);
  if (!arc) {
    context.lineTo(to.x, to.y);
    return;
  }
  context.arc(arc.center.x, arc.center.y, arc.radius, arc.startAngle, arc.endAngle, arc.counterClockwise);
}

function tracePolygon(context: CanvasRenderingContext2D, points: DwgPoint[]): void {
  if (points.length < 2) return;
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.closePath();
}

function firstBaselineOffset(entity: DwgTextPrimitive, scale: number): number {
  const capHeight = entity.height * scale;
  const lineHeight = entity.height * TEXT_LINE_SPACING * scale;
  const blockHeight = (entity.lines.length - 1) * lineHeight + capHeight;
  if (entity.baseline === 'top') return capHeight;
  if (entity.baseline === 'middle') return -blockHeight / 2 + capHeight;
  return -blockHeight + capHeight;
}

function renderText(
  context: CanvasRenderingContext2D,
  entity: DwgTextPrimitive,
  options: DwgRenderOptions,
  darkBackground: boolean,
): void {
  const fontSize = entity.height * options.scale * TEXT_SIZE_RATIO;
  if (!Number.isFinite(fontSize) || fontSize <= 0) return;

  const screen = worldToScreen(options, entity.position);
  const lineHeight = entity.height * TEXT_LINE_SPACING * options.scale;
  const firstBaseline = firstBaselineOffset(entity, options.scale);

  context.save();
  context.translate(screen.x, screen.y);
  if (entity.rotation) context.rotate(-entity.rotation);
  context.font = `${entity.bold ? 'bold ' : ''}${fontSize.toFixed(2)}px ${options.fontFamily ?? DEFAULT_FONT_FAMILY}`;
  context.fillStyle = inkHex(darkBackground);
  context.textAlign = entity.align;
  context.textBaseline = 'alphabetic';

  // 参考框约束：字体度量与解析估算存在偏差或字体回退时，把整段文字水平压缩回框内
  let widthScale = entity.widthScale ?? 1;
  const wrapWidth = entity.wrapWidth ?? 0;
  if (wrapWidth > 0 && entity.lines.length > 0) {
    const widest = entity.lines.reduce(
      (max, line) => (line ? Math.max(max, context.measureText(line).width) : max),
      0,
    );
    const limit = wrapWidth * options.scale;
    if (widest > limit) widthScale *= limit / widest;
  }

  const heightScale = entity.heightScale ?? 1;
  if (widthScale !== 1 || heightScale !== 1) context.scale(widthScale, heightScale);

  entity.lines.forEach((line, index) => {
    if (!line) return;
    context.fillText(line, 0, firstBaseline + index * lineHeight);
  });
  context.restore();
}

/**
 * 按图案定义线绘制 HATCH：以边界路径裁剪平行线族，支持图案线自身的虚线。
 * k 范围为相邻线偏移的整数倍，覆盖图元包围盒即可。
 */
function strokeHatchPattern(context: CanvasRenderingContext2D, entity: HatchEntity, color: string): void {
  const pattern = entity.pattern;
  if (!pattern || pattern.length === 0) return;
  const bounds = entity.bounds;
  const diagonal = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) + 1;
  if (!(diagonal > 0) || !Number.isFinite(diagonal)) return;

  const corners: DwgPoint[] = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.minX, y: bounds.maxY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
  ];

  context.save();
  context.beginPath();
  for (const path of entity.paths) tracePolygon(context, path.points);
  context.clip('evenodd');
  context.strokeStyle = color;

  for (const line of pattern) {
    const direction = { x: Math.cos(line.angle), y: Math.sin(line.angle) };
    const normal = { x: -direction.y, y: direction.x };
    const spacing = line.offset.x * normal.x + line.offset.y * normal.y;
    if (!(Math.abs(spacing) > 1e-9)) continue;

    let minK = Infinity;
    let maxK = -Infinity;
    for (const corner of corners) {
      const projection = (corner.x - line.base.x) * normal.x + (corner.y - line.base.y) * normal.y;
      const k = projection / spacing;
      minK = Math.min(minK, k);
      maxK = Math.max(maxK, k);
    }
    // 异常图案比例下的段数保护：正常图案在包围盒内只有几十条
    if (!Number.isFinite(minK) || !Number.isFinite(maxK) || maxK - minK > 2048) continue;
    const startK = Math.floor(minK) - 1;
    const endK = Math.ceil(maxK) + 1;

    context.setLineDash(line.dashes);
    context.beginPath();
    for (let k = startK; k <= endK; k += 1) {
      const originX = line.base.x + line.offset.x * k;
      const originY = line.base.y + line.offset.y * k;
      context.moveTo(originX - direction.x * diagonal, originY - direction.y * diagonal);
      context.lineTo(originX + direction.x * diagonal, originY + direction.y * diagonal);
    }
    context.stroke();
  }
  context.restore();
}

/**
 * 将归一化后的 DWG 图元以黑白二色绘制到 canvas；按背景色选取墨色，并裁剪视口外图元。
 */
export function renderDwgToCanvas(
  context: CanvasRenderingContext2D,
  drawing: DwgDrawing,
  options: DwgRenderOptions,
): void {
  const { scale, offsetX, offsetY, hiddenLayers } = options;
  const background = options.background ?? '#ffffff';
  const darkBackground = isDarkColor(background);
  const canvas = context.canvas;

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const world = visibleWorldBounds(options, canvas.width, canvas.height);
  const fills: FillEntity[] = [];
  const strokes: StrokeEntity[] = [];
  const texts: DwgTextPrimitive[] = [];
  for (const entity of drawing.entities) {
    if (hiddenLayers?.has(entity.layer)) continue;
    if (!boundsIntersect(entity.bounds, world)) continue;
    if (entity.kind === 'text') texts.push(entity);
    else if (entity.kind === 'hatch' || entity.kind === 'solid') fills.push(entity);
    else strokes.push(entity);
  }

  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.setTransform(scale, 0, 0, -scale, offsetX, offsetY);

  const strokeColor = inkHex(darkBackground);
  context.lineWidth = Math.max(options.lineWidth, 0.75) / scale;

  for (const entity of fills) {
    const color = inkHex(darkBackground);
    if (entity.kind === 'hatch' && !entity.solid) {
      if (entity.pattern && entity.pattern.length > 0) {
        strokeHatchPattern(context, entity, color);
      } else {
        context.beginPath();
        for (const path of entity.paths) tracePolygon(context, path.points);
        context.strokeStyle = color;
        context.stroke();
      }
      continue;
    }
    context.beginPath();
    if (entity.kind === 'solid') {
      tracePolygon(context, entity.points);
    } else {
      for (const path of entity.paths) tracePolygon(context, path.points);
    }
    context.fillStyle = color;
    context.fill('evenodd');
  }

  for (const entity of strokes) {
    context.setLineDash(entity.dash ?? []);
    context.beginPath();
    context.strokeStyle = strokeColor;
    switch (entity.kind) {
      case 'line':
        context.moveTo(entity.a.x, entity.a.y);
        context.lineTo(entity.b.x, entity.b.y);
        break;
      case 'polyline': {
        if (entity.points.length < 2) continue;
        context.moveTo(entity.points[0].x, entity.points[0].y);
        for (let index = 0; index < entity.points.length - 1; index += 1) {
          traceSegment(context, entity.points[index], entity.points[index + 1], entity.bulges[index] ?? 0);
        }
        if (entity.closed) {
          const last = entity.points.length - 1;
          traceSegment(context, entity.points[last], entity.points[0], entity.bulges[last] ?? 0);
        }
        break;
      }
      case 'circle':
        context.arc(entity.center.x, entity.center.y, entity.radius, 0, Math.PI * 2);
        break;
      case 'arc':
        context.arc(entity.center.x, entity.center.y, entity.radius, entity.startAngle, entity.endAngle, false);
        break;
      default:
        continue;
    }
    context.stroke();
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  for (const entity of texts) {
    renderText(context, entity, options, darkBackground);
  }
}

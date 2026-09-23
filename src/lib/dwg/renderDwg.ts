import { isDarkColor, resolveDisplayHex, hexToRgb } from '@/lib/dwg/aciColor';
import { bulgeToArc } from '@/lib/dwg/bulge';
import { worldToScreen } from '@/lib/dwg/dwgView';
import type { DwgBounds, DwgDrawing, DwgPoint, DwgRenderEntity, DwgTextPrimitive } from '@/lib/dwg/dwgTypes';

type FillEntity = Extract<DwgRenderEntity, { kind: 'hatch' | 'solid' }>;
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
/** 浅色背景下文字统一使用黑色，忽略图纸中的文字颜色。 */
const TEXT_INK_COLOR = '#000000';
/** 图纸文字高度为大写字母高度，转换为 canvas 字号需要放大。 */
const TEXT_SIZE_RATIO = 1.35;
const TEXT_LINE_SPACING = 1.66;

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
  context.fillStyle = darkBackground
    ? resolveDisplayHex(hexToRgb(entity.color), true)
    : TEXT_INK_COLOR;
  context.textAlign = entity.align;
  context.textBaseline = 'alphabetic';
  entity.lines.forEach((line, index) => {
    if (!line) return;
    context.fillText(line, 0, firstBaseline + index * lineHeight);
  });
  context.restore();
}

/**
 * 将归一化后的 DWG 图元绘制到 canvas；按背景色解析线色，并裁剪视口外图元。
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

  for (const entity of fills) {
    context.beginPath();
    if (entity.kind === 'solid') {
      tracePolygon(context, entity.points);
    } else {
      for (const path of entity.paths) tracePolygon(context, path.points);
    }
    const color = resolveDisplayHex(hexToRgb(entity.color), darkBackground);
    if (entity.kind === 'hatch' && !entity.solid) {
      context.strokeStyle = color;
      context.lineWidth = Math.max(options.lineWidth, 0.75) / scale;
      context.stroke();
    } else {
      context.fillStyle = color;
      context.fill('evenodd');
    }
  }

  context.lineWidth = Math.max(options.lineWidth, 0.75) / scale;
  for (const entity of strokes) {
    context.beginPath();
    context.strokeStyle = resolveDisplayHex(hexToRgb(entity.color), darkBackground);
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

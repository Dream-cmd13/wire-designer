import { sampleArcRange } from '@/lib/dwg/bulge';
import type { DwgBounds, DwgGeometry, DwgPoint } from '@/lib/dwg/dwgTypes';
import { TEXT_LINE_SPACING, textWidthOf } from '@/lib/dwg/textMetrics';

/** 文本测量函数：返回指定字高下文本的宽度（世界单位）；缺省使用内置估算。 */
export type TextMeasure = (text: string, height: number) => number;

export function extendBounds(bounds: DwgBounds | null, x: number, y: number): DwgBounds {
  if (!bounds) return { minX: x, minY: y, maxX: x, maxY: y };
  return {
    minX: Math.min(bounds.minX, x),
    minY: Math.min(bounds.minY, y),
    maxX: Math.max(bounds.maxX, x),
    maxY: Math.max(bounds.maxY, y),
  };
}

export function geometryBounds(geometry: DwgGeometry, measureText: TextMeasure | null): DwgBounds {
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
      // 再按旋转角求轴对齐包围盒，避免用半径膨胀导致整图范围被撑大、适应窗口后图框过小。
      // 宽度必须与折行/拉伸使用同一套度量：真实字体度量与估算不一致时，
      // 若包围盒按估算计算，视口移动到文字中段会把整段文字当作视口外剔除。
      const width = geometry.lines.reduce(
        (max, line) => Math.max(max, measureText?.(line, geometry.height) ?? textWidthOf(line, geometry.height)),
        0,
      ) * (geometry.widthScale ?? 1);
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

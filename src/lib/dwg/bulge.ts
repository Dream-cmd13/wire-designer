import type { DwgPoint } from '@/lib/dwg/dwgTypes';

export interface BulgeArc {
  center: DwgPoint;
  radius: number;
  startAngle: number;
  endAngle: number;
  counterClockwise: boolean;
}

/**
 * 将多段线的凸度段（bulge = tan(包含角/4)）转换为圆弧参数。
 */
export function bulgeToArc(from: DwgPoint, to: DwgPoint, bulge: number): BulgeArc | null {
  const chord = Math.hypot(to.x - from.x, to.y - from.y);
  if (chord === 0 || bulge === 0) return null;
  const sweep = 4 * Math.atan(bulge);
  const radius = chord / (2 * Math.sin(Math.abs(sweep) / 2));
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const offset = Math.sqrt(Math.max(0, radius * radius - (chord / 2) * (chord / 2)));
  const leftX = -(to.y - from.y) / chord;
  const leftY = (to.x - from.x) / chord;
  const direction = bulge > 0 ? 1 : -1;
  const center = {
    x: mid.x + leftX * offset * direction,
    y: mid.y + leftY * offset * direction,
  };
  return {
    center,
    radius,
    startAngle: Math.atan2(from.y - center.y, from.x - center.x),
    endAngle: Math.atan2(to.y - center.y, to.x - center.x),
    counterClockwise: bulge < 0,
  };
}

/** 按角度范围采样圆弧（含首尾端点），每整圈约 48 段。 */
export function sampleArcRange(
  center: DwgPoint,
  radius: number,
  startAngle: number,
  endAngle: number,
  counterClockwise: boolean,
): DwgPoint[] {
  let sweep = endAngle - startAngle;
  if (counterClockwise) {
    while (sweep <= 0) sweep += Math.PI * 2;
  } else {
    while (sweep >= 0) sweep -= Math.PI * 2;
  }
  const steps = Math.max(2, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * 48));
  const points: DwgPoint[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = startAngle + (sweep * index) / steps;
    points.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
  }
  return points;
}

/** 将带凸度的多段线展开为纯折线点列（用于无法保留圆弧的场景，如非等比变换）。 */
export function flattenBulges(points: DwgPoint[], bulges: number[], closed: boolean): DwgPoint[] {
  if (points.length < 2) return points;
  const result: DwgPoint[] = [points[0]];
  const segmentCount = closed ? points.length : points.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    const arc = bulgeToArc(from, to, bulges[index] ?? 0);
    if (arc) {
      result.push(...sampleArcRange(arc.center, arc.radius, arc.startAngle, arc.endAngle, arc.counterClockwise).slice(1));
    } else {
      result.push(to);
    }
  }
  return result;
}

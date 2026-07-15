import type { DrawingLineObject, DrawingPoint } from '@/types/drawing';

export type DrawingLineAlignment = 'current' | 'horizontal' | 'vertical';

export type DrawingLinePropertiesInput = {
  name: string;
  alignment: DrawingLineAlignment;
  color: string;
  strokeWidth: number;
  length: number;
};

export function getDrawingPathLength(points: DrawingPoint[]) {
  return points.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
}

function renderedPoints(object: DrawingLineObject): DrawingPoint[] {
  if (!object.rotation) return object.points.map((point) => ({ ...point }));
  const radians = object.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const center = { x: object.x + object.width / 2, y: object.y + object.height / 2 };
  return object.points.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return { x: center.x + dx * cosine - dy * sine, y: center.y + dx * sine + dy * cosine };
  });
}

function bounds(points: DrawingPoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(1, Math.max(...xs) - minX), height: Math.max(1, Math.max(...ys) - minY) };
}

export function applyDrawingLineProperties(object: DrawingLineObject, input: DrawingLinePropertiesInput): DrawingLineObject {
  const style = { ...object.style, stroke: input.color, strokeWidth: Math.max(1, input.strokeWidth) };
  if (object.points.length < 2) return { ...object, name: input.name.trim(), style };

  let points = renderedPoints(object);
  const origin = points[0];
  const currentLength = getDrawingPathLength(points);
  if (currentLength > 0 && input.length > 0) {
    const scale = input.length / currentLength;
    points = points.map((point) => ({ x: origin.x + (point.x - origin.x) * scale, y: origin.y + (point.y - origin.y) * scale }));
  }

  if (input.alignment !== 'current') {
    const last = points.at(-1)!;
    const currentAngle = Math.atan2(last.y - origin.y, last.x - origin.x);
    const targetAngle = input.alignment === 'horizontal'
      ? (last.x >= origin.x ? 0 : Math.PI)
      : (last.y >= origin.y ? Math.PI / 2 : -Math.PI / 2);
    const delta = targetAngle - currentAngle;
    const cosine = Math.cos(delta);
    const sine = Math.sin(delta);
    points = points.map((point) => {
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      return { x: origin.x + dx * cosine - dy * sine, y: origin.y + dx * sine + dy * cosine };
    });
  }

  return { ...object, ...bounds(points), name: input.name.trim(), rotation: 0, points, style };
}

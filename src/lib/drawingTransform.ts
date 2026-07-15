import type { DrawingObject, DrawingPoint } from '@/types/drawing';

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type TransformHandle = ResizeHandle | 'rotate';
export type TransformFrame = {
  center: DrawingPoint;
  corners: [DrawingPoint, DrawingPoint, DrawingPoint, DrawingPoint];
  edgeMidpoints: Record<'n' | 'e' | 's' | 'w', DrawingPoint>;
};
export type DrawingTransformPatch = Partial<DrawingObject> & { points?: DrawingPoint[] };
export type DrawingMoveBounds = { width: number; height: number; inset: number };
export type DrawingResizeResult = { patch: DrawingTransformPatch; activeHandle: ResizeHandle };

export const HANDLE_SIZE_CSS = 8;
export const HANDLE_HIT_SIZE_CSS = 16;
export const ROTATION_HANDLE_SIZE_CSS = 10;
export const ROTATION_OFFSET_CSS = 24;
export const MIN_OBJECT_SIZE = 8;

const lineKinds = new Set<DrawingObject['kind']>(['line', 'polyline', 'curve', 'freehand']);
const handleAxes: Record<ResizeHandle, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  nw: { x: -1, y: -1 }, n: { x: 0, y: -1 }, ne: { x: 1, y: -1 }, e: { x: 1, y: 0 },
  se: { x: 1, y: 1 }, s: { x: 0, y: 1 }, sw: { x: -1, y: 1 }, w: { x: -1, y: 0 },
};

export function getObjectCenter(object: DrawingObject): DrawingPoint {
  return { x: object.x + object.width / 2, y: object.y + object.height / 2 };
}

function rotateVector(point: DrawingPoint, degrees: number): DrawingPoint {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return { x: point.x * cosine - point.y * sine, y: point.x * sine + point.y * cosine };
}

export function localToWorldPoint(object: DrawingObject, local: DrawingPoint): DrawingPoint {
  const center = getObjectCenter(object);
  const rotated = rotateVector({ x: local.x - object.width / 2, y: local.y - object.height / 2 }, object.rotation);
  return { x: center.x + rotated.x, y: center.y + rotated.y };
}

export function worldToLocalPoint(object: DrawingObject, world: DrawingPoint): DrawingPoint {
  const center = getObjectCenter(object);
  const local = rotateVector({ x: world.x - center.x, y: world.y - center.y }, -object.rotation);
  return { x: local.x + object.width / 2, y: local.y + object.height / 2 };
}

const midpoint = (left: DrawingPoint, right: DrawingPoint): DrawingPoint => ({ x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 });

export function getTransformFrame(object: DrawingObject): TransformFrame {
  const nw = localToWorldPoint(object, { x: 0, y: 0 });
  const ne = localToWorldPoint(object, { x: object.width, y: 0 });
  const se = localToWorldPoint(object, { x: object.width, y: object.height });
  const sw = localToWorldPoint(object, { x: 0, y: object.height });
  return { center: getObjectCenter(object), corners: [nw, ne, se, sw], edgeMidpoints: { n: midpoint(nw, ne), e: midpoint(ne, se), s: midpoint(sw, se), w: midpoint(nw, sw) } };
}

export function getTransformHandlePoints(object: DrawingObject, zoom: number): Record<TransformHandle, DrawingPoint> {
  const frame = getTransformFrame(object);
  const outward = rotateVector({ x: 0, y: -ROTATION_OFFSET_CSS / zoom }, object.rotation);
  return { nw: frame.corners[0], n: frame.edgeMidpoints.n, ne: frame.corners[1], e: frame.edgeMidpoints.e, se: frame.corners[2], s: frame.edgeMidpoints.s, sw: frame.corners[3], w: frame.edgeMidpoints.w, rotate: { x: frame.edgeMidpoints.n.x + outward.x, y: frame.edgeMidpoints.n.y + outward.y } };
}

const resizeCursors = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'] as const;
export function getResizeCursor(handle: ResizeHandle, rotation: number): string {
  const base = { n: 0, ne: 1, e: 2, se: 3, s: 0, sw: 1, w: 2, nw: 3 }[handle];
  return resizeCursors[((base + Math.round(rotation / 45)) % 4 + 4) % 4];
}

export function containsDrawingPoint(object: DrawingObject, point: DrawingPoint): boolean {
  if (!object.visible || object.width <= 0 || object.height <= 0) return false;
  const local = worldToLocalPoint(object, point);
  return local.x >= 0 && local.x <= object.width && local.y >= 0 && local.y <= object.height;
}

function isLineLike(object: DrawingObject): object is Extract<DrawingObject, { kind: 'line' | 'polyline' | 'curve' | 'freehand' }> {
  return lineKinds.has(object.kind);
}

export function getDrawingTransformObject(object: DrawingObject): DrawingObject {
  if (!isLineLike(object) || object.points.length === 0) return object;
  const localPoints = object.points.map((point) => ({ x: point.x - object.x, y: point.y - object.y }));
  const minX = Math.min(...localPoints.map((point) => point.x));
  const maxX = Math.max(...localPoints.map((point) => point.x));
  const minY = Math.min(...localPoints.map((point) => point.y));
  const maxY = Math.max(...localPoints.map((point) => point.y));
  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;
  const width = Math.max(MIN_OBJECT_SIZE, contentWidth);
  const height = Math.max(MIN_OBJECT_SIZE, contentHeight);
  const left = minX - (width - contentWidth) / 2;
  const top = minY - (height - contentHeight) / 2;
  const center = localToWorldPoint(object, { x: left + width / 2, y: top + height / 2 });
  const x = center.x - width / 2;
  const y = center.y - height / 2;
  return {
    ...object,
    x,
    y,
    width,
    height,
    points: localPoints.map((point) => ({ x: x + point.x - left, y: y + point.y - top })),
  };
}

export function moveDrawingObject(object: DrawingObject, delta: DrawingPoint, bounds?: DrawingMoveBounds): DrawingTransformPatch {
  const x = bounds ? Math.min(bounds.width - bounds.inset - object.width, Math.max(bounds.inset, object.x + delta.x)) : object.x + delta.x;
  const y = bounds ? Math.min(bounds.height - bounds.inset - object.height, Math.max(bounds.inset, object.y + delta.y)) : object.y + delta.y;
  const patch: DrawingTransformPatch = { x, y };
  return isLineLike(object) ? { ...patch, points: object.points.map((point) => ({ x: point.x + x - object.x, y: point.y + y - object.y })) } : patch;
}

export const normalizeRotation = (rotation: number) => ((rotation % 360) + 360) % 360;

export function rotateDrawingObject(object: DrawingObject, startPointer: DrawingPoint, pointer: DrawingPoint, snap: boolean): DrawingTransformPatch {
  const center = getObjectCenter(object);
  const angle = (value: DrawingPoint) => Math.atan2(value.y - center.y, value.x - center.x) * 180 / Math.PI;
  const rotation = normalizeRotation(object.rotation + angle(pointer) - angle(startPointer));
  return { rotation: snap ? normalizeRotation(Math.round(rotation / 15) * 15) : rotation };
}

function handleFromAxes(x: -1 | 0 | 1, y: -1 | 0 | 1): ResizeHandle {
  return ({ '-1,-1': 'nw', '0,-1': 'n', '1,-1': 'ne', '1,0': 'e', '1,1': 'se', '0,1': 's', '-1,1': 'sw', '-1,0': 'w' } as Record<string, ResizeHandle>)[`${x},${y}`];
}

export function resizeDrawingObject(object: DrawingObject, handle: ResizeHandle, pointer: DrawingPoint, preserveAspectRatio: boolean): DrawingResizeResult {
  const axes = handleAxes[handle];
  const fixedLocal = { x: axes.x < 0 ? object.width : axes.x > 0 ? 0 : object.width / 2, y: axes.y < 0 ? object.height : axes.y > 0 ? 0 : object.height / 2 };
  const fixedWorld = localToWorldPoint(object, fixedLocal);
  const delta = rotateVector({ x: pointer.x - fixedWorld.x, y: pointer.y - fixedWorld.y }, -object.rotation);
  let signedWidth = axes.x === 0 ? object.width : delta.x * axes.x;
  let signedHeight = axes.y === 0 ? object.height : delta.y * axes.y;
  if (preserveAspectRatio && axes.x !== 0 && axes.y !== 0) {
    const ratio = object.width / object.height;
    if (Math.abs(signedWidth) / object.width >= Math.abs(signedHeight) / object.height) signedHeight = Math.sign(signedHeight || axes.y) * Math.abs(signedWidth) / ratio;
    else signedWidth = Math.sign(signedWidth || axes.x) * Math.abs(signedHeight) * ratio;
  }
  const flipX = axes.x !== 0 && signedWidth < 0;
  const flipY = axes.y !== 0 && signedHeight < 0;
  const width = axes.x === 0 ? object.width : Math.max(MIN_OBJECT_SIZE, Math.abs(signedWidth));
  const height = axes.y === 0 ? object.height : Math.max(MIN_OBJECT_SIZE, Math.abs(signedHeight));
  const centerOffset = rotateVector({ x: axes.x === 0 ? 0 : Math.sign(signedWidth || 1) * axes.x * width / 2, y: axes.y === 0 ? 0 : Math.sign(signedHeight || 1) * axes.y * height / 2 }, object.rotation);
  const patch: DrawingTransformPatch = { x: fixedWorld.x + centerOffset.x - width / 2, y: fixedWorld.y + centerOffset.y - height / 2, width, height };
  if (isLineLike(object)) patch.points = object.points.map((point) => {
    const sourceX = (point.x - object.x) / object.width;
    const sourceY = (point.y - object.y) / object.height;
    return { x: patch.x! + (flipX ? 1 - sourceX : sourceX) * width, y: patch.y! + (flipY ? 1 - sourceY : sourceY) * height };
  });
  return { patch, activeHandle: handleFromAxes(flipX ? -axes.x as -1 | 0 | 1 : axes.x, flipY ? -axes.y as -1 | 0 | 1 : axes.y) };
}

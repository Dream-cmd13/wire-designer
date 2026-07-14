import { createDrawingId, defaultDrawingObjectStyle } from '@/lib/drawingDocument';
import type { DrawingDocument, DrawingLayerAction, DrawingLineObject, DrawingObject, DrawingPoint } from '@/types/drawing';

export type { DrawingLayerAction } from '@/types/drawing';

function updated(document: DrawingDocument, objects: DrawingObject[]): DrawingDocument {
  return { ...document, objects, updatedAt: Date.now() };
}

function normalizeLayers(objects: DrawingObject[]): DrawingObject[] {
  const base = objects.filter((object) => object.kind === 'title-block');
  const editable = objects.filter((object) => object.kind !== 'title-block').sort((left, right) => left.zIndex - right.zIndex);
  const start = Math.max(0, ...base.map((object) => object.zIndex)) + 1;
  const normalized = new Map(editable.map((object, index) => [object.id, { ...object, zIndex: start + index }]));
  return objects.map((object) => normalized.get(object.id) ?? object) as DrawingObject[];
}

export function clearDrawingCanvas(document: DrawingDocument): DrawingDocument {
  const objects = document.objects.filter((object) => object.kind === 'title-block');
  return objects.length === document.objects.length ? document : updated(document, objects);
}

export function toggleDrawingLocks(document: DrawingDocument, objectIds: string[]): DrawingDocument {
  const selected = new Set(objectIds);
  const candidates = document.objects.filter((object) => selected.has(object.id));
  if (candidates.length === 0) return document;
  const nextLocked = candidates.some((object) => !object.locked);
  return updated(document, document.objects.map((object) => selected.has(object.id) ? { ...object, locked: nextLocked } : object));
}

export function moveDrawingLayers(document: DrawingDocument, objectIds: string[], action: DrawingLayerAction): DrawingDocument {
  const selected = new Set(objectIds);
  const editable = document.objects.filter((object) => object.kind !== 'title-block').sort((left, right) => left.zIndex - right.zIndex);
  const movable = (object: DrawingObject) => selected.has(object.id) && !object.locked;
  if (!editable.some(movable)) return document;
  let ordered = [...editable];
  if (action === 'front') ordered = [...ordered.filter((object) => !movable(object)), ...ordered.filter(movable)];
  if (action === 'back') ordered = [...ordered.filter(movable), ...ordered.filter((object) => !movable(object))];
  if (action === 'forward') {
    for (let index = ordered.length - 2; index >= 0; index -= 1) {
      if (movable(ordered[index]) && !movable(ordered[index + 1])) [ordered[index], ordered[index + 1]] = [ordered[index + 1], ordered[index]];
    }
  }
  if (action === 'backward') {
    for (let index = 1; index < ordered.length; index += 1) {
      if (movable(ordered[index]) && !movable(ordered[index - 1])) [ordered[index], ordered[index - 1]] = [ordered[index - 1], ordered[index]];
    }
  }
  const order = new Map(ordered.map((object, index) => [object.id, index + 1]));
  return updated(document, normalizeLayers(document.objects.map((object) => order.has(object.id) ? { ...object, zIndex: order.get(object.id)! } : object)));
}

export function setDrawingLayer(document: DrawingDocument, objectIds: string[], target: number): DrawingDocument {
  const selected = new Set(objectIds);
  const patched = document.objects.map((object) => selected.has(object.id) && !object.locked && object.kind !== 'title-block'
    ? { ...object, zIndex: Math.max(1, Math.round(target)) }
    : object);
  if (patched.every((object, index) => object === document.objects[index])) return document;
  return updated(document, normalizeLayers(patched));
}

function pageChild(parent: DrawingObject, child: DrawingObject, zIndex: number): DrawingObject {
  const pointsPatch = (child.kind === 'line' || child.kind === 'polyline' || child.kind === 'curve' || child.kind === 'freehand')
    ? { points: child.points.map((point) => ({ x: point.x + parent.x, y: point.y + parent.y })) }
    : {};
  return {
    ...child,
    ...pointsPatch,
    id: child.id || createDrawingId(child.kind),
    x: child.x + parent.x,
    y: child.y + parent.y,
    zIndex,
    locked: parent.locked || child.locked,
    visible: parent.visible && child.visible,
  } as DrawingObject;
}

export function splitDrawingObjects(document: DrawingDocument, objectIds: string[]): { document: DrawingDocument; changed: boolean; replacementIds: string[] } {
  const selected = new Set(objectIds);
  const replacementIds: string[] = [];
  let changed = false;
  const objects = document.objects.flatMap((object) => {
    if (!selected.has(object.id) || object.locked || object.kind !== 'group') return [object];
    changed = true;
    const children = object.children.map((child, index) => pageChild(object, child, object.zIndex + index));
    replacementIds.push(...children.map((child) => child.id));
    return children;
  });
  return { document: changed ? updated(document, normalizeLayers(objects)) : document, changed, replacementIds };
}

export function getObjectsInSelectionRect(document: DrawingDocument, rect: { x: number; y: number; width: number; height: number }): string[] {
  return document.objects.filter((object) => object.visible && object.kind !== 'title-block'
    && object.x < rect.x + rect.width && object.x + object.width > rect.x
    && object.y < rect.y + rect.height && object.y + object.height > rect.y)
    .sort((left, right) => left.zIndex - right.zIndex).map((object) => object.id);
}

export function snapOrthogonalPoint(origin: DrawingPoint, point: DrawingPoint): DrawingPoint {
  return Math.abs(point.x - origin.x) >= Math.abs(point.y - origin.y) ? { x: point.x, y: origin.y } : { x: origin.x, y: point.y };
}

export function normalizeDrawingRect(start: DrawingPoint, end: DrawingPoint) {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}

export function sampleFreehandPoint(points: DrawingPoint[], point: DrawingPoint, minimumDistance = 2): DrawingPoint[] {
  const previous = points.at(-1);
  return previous && Math.hypot(point.x - previous.x, point.y - previous.y) < minimumDistance ? points : [...points, point];
}

export function createDrawingLineObject(kind: DrawingLineObject['kind'], points: DrawingPoint[], orthogonal = false): DrawingLineObject {
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return { id: createDrawingId(kind), kind, x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY), rotation: 0, zIndex: 10, locked: false, visible: true, style: { ...defaultDrawingObjectStyle }, points, orthogonal };
}

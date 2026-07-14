import { describe, expect, it } from 'vitest';
import {
  clearDrawingCanvas, finalizeDrawingDraft, getObjectsInSelectionRect, moveDrawingLayers,
  patchDrawingObjects, placeDrawingCopiesAtPoint, snapOrthogonalPoint, splitDrawingObjects,
  splitDrawingPathAtPoint, toggleDrawingLocks,
} from '@/lib/drawingCommands';
import { defaultDrawingObjectStyle } from '@/lib/drawingDocument';
import type { DrawingDocument, DrawingLineObject, DrawingObject } from '@/types/drawing';

const base = (id: string, kind: DrawingObject['kind'], x: number, zIndex: number) => ({
  id, kind, x, y: 10, width: 20, height: 20, rotation: 0, zIndex,
  locked: false, visible: true, style: { ...defaultDrawingObjectStyle },
});

function documentWith(objects: DrawingObject[]): DrawingDocument {
  return {
    schemaVersion: 1, id: 'doc', name: 'commands', createdAt: 0, updatedAt: 0,
    page: { size: 'A4', orientation: 'landscape', width: 1200, height: 800 }, objects,
    titleBlock: { title: 'commands', drawingNo: 'D-1', revision: 'A' }, revisionTable: [], techRequirements: [],
  };
}

const title = { ...base('title', 'title-block', 0, 0), kind: 'title-block' as const, title: 'T', drawingNo: 'D-1', revision: 'A' };
const line = (id: string, x: number, zIndex: number) => ({ ...base(id, 'line', x, zIndex), kind: 'line' as const, points: [{ x, y: 10 }, { x: x + 20, y: 10 }], orthogonal: false });

describe('drawing document commands', () => {
  it('clears editable objects while preserving the title block', () => {
    expect(clearDrawingCanvas(documentWith([title, line('a', 10, 1)])).objects).toEqual([title]);
  });

  it('locks selections and moves unlocked objects to the front with normalized layers', () => {
    const locked = toggleDrawingLocks(documentWith([title, line('a', 10, 1), line('b', 40, 2)]), ['a', 'b']);
    expect(locked.objects.filter((object) => object.id !== 'title').every((object) => object.locked)).toBe(true);
    const unlocked = toggleDrawingLocks(locked, ['a', 'b']);
    const moved = moveDrawingLayers(unlocked, ['a'], 'front');
    expect(moved.objects.filter((object) => object.kind !== 'title-block').sort((a, b) => a.zIndex - b.zIndex).at(-1)?.id).toBe('a');
  });

  it('progressively splits a bundle into core groups and then primitives', () => {
    const core = { ...base('core-1', 'group', 0, 1), kind: 'group' as const, groupKind: 'wire-core' as const, children: [line('primitive', 0, 1)] };
    const bundle = { ...base('bundle', 'group', 100, 1), kind: 'group' as const, groupKind: 'wire-bundle' as const, children: [core] };
    const first = splitDrawingObjects(documentWith([title, bundle]), ['bundle']);
    expect(first.changed).toBe(true);
    expect(first.document.objects.some((object) => object.kind === 'group' && object.groupKind === 'wire-core')).toBe(true);
    const second = splitDrawingObjects(first.document, first.replacementIds);
    expect(second.document.objects.some((object) => object.kind === 'line')).toBe(true);
  });

  it('does not split locked groups and supports box selection and orthogonal snapping', () => {
    const lockedGroup = { ...base('locked', 'group', 100, 1), kind: 'group' as const, groupKind: 'wire-bundle' as const, locked: true, children: [line('child', 0, 1)] };
    expect(splitDrawingObjects(documentWith([title, lockedGroup]), ['locked']).changed).toBe(false);
    expect(getObjectsInSelectionRect(documentWith([title, line('a', 10, 1), line('b', 80, 2)]), { x: 5, y: 5, width: 40, height: 40 })).toEqual(['a']);
    expect(snapOrthogonalPoint({ x: 0, y: 0 }, { x: 20, y: 7 })).toEqual({ x: 20, y: 0 });
  });

  it('finishes valid path drafts and cancels without creating an object', () => {
    const points = [{ x: 10, y: 10 }, { x: 40, y: 30 }];
    expect(finalizeDrawingDraft('polyline', points, 'finish', false)?.kind).toBe('polyline');
    expect(finalizeDrawingDraft('curve', points, 'cancel', false)).toBeNull();
    expect(finalizeDrawingDraft('curve', [points[0]], 'finish', false)).toBeNull();
  });

  it('patches only unlocked selections and preserves each object style', () => {
    const first = { ...line('a', 10, 1), style: { ...defaultDrawingObjectStyle, stroke: '#111111', fontSize: 12 } };
    const second = { ...line('b', 40, 2), locked: true, style: { ...defaultDrawingObjectStyle, stroke: '#222222', fontSize: 18 } };
    const patched = patchDrawingObjects(documentWith([title, first, second]), ['a', 'b'], {}, { fill: '#ff0000' });
    expect(patched.objects.find((object) => object.id === 'a')?.style).toEqual(expect.objectContaining({ fill: '#ff0000', stroke: '#111111', fontSize: 12 }));
    expect(patched.objects.find((object) => object.id === 'b')?.style).toEqual(second.style);
    expect(patchDrawingObjects(patched, ['a', 'b'], { locked: false }).objects.filter((object) => object.id !== 'title').every((object) => !object.locked)).toBe(true);
  });

  it('splits a path at the closest projected point and preserves its style', () => {
    const source = { ...line('a', 10, 1), style: { ...defaultDrawingObjectStyle, stroke: '#ef4444', strokeWidth: 3 } };
    const result = splitDrawingPathAtPoint(documentWith([title, source]), 'a', { x: 20, y: 16 });

    expect(result.changed).toBe(true);
    expect(result.replacementIds).toHaveLength(2);
    const paths = result.document.objects.filter((object): object is DrawingLineObject => object.kind === 'line');
    expect(paths).toHaveLength(2);
    expect(paths.map((path) => path.points)).toEqual([
      [{ x: 10, y: 10 }, { x: 20, y: 10 }],
      [{ x: 20, y: 10 }, { x: 30, y: 10 }],
    ]);
    expect(paths.every((path) => path.style.stroke === '#ef4444' && path.style.strokeWidth === 3)).toBe(true);
  });

  it('splits a polyline on the nearest segment', () => {
    const polyline = { ...line('path', 10, 1), kind: 'polyline' as const, width: 40, height: 30, points: [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 40 }] };
    const result = splitDrawingPathAtPoint(documentWith([title, polyline]), 'path', { x: 47, y: 25 });
    const paths = result.document.objects.filter((object): object is DrawingLineObject => object.kind === 'polyline');

    expect(paths.map((path) => path.points)).toEqual([
      [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 25 }],
      [{ x: 50, y: 25 }, { x: 50, y: 40 }],
    ]);
  });

  it('splits a rotated path in its rendered world position', () => {
    const rotated = { ...line('rotated', 10, 1), height: 1, rotation: 90 };
    const result = splitDrawingPathAtPoint(documentWith([title, rotated]), 'rotated', { x: 20.5, y: 10.5 });
    const paths = result.document.objects.filter((object): object is DrawingLineObject => object.kind === 'line');

    expect(result.changed).toBe(true);
    expect(paths.every((path) => path.rotation === 0)).toBe(true);
    expect(paths.map((path) => path.points)).toEqual([
      [{ x: 20.5, y: 0.5 }, { x: 20.5, y: 10.5 }],
      [{ x: 20.5, y: 10.5 }, { x: 20.5, y: 20.5 }],
    ]);
  });

  it('rejects endpoint, locked, and non-path crop requests', () => {
    const source = line('a', 10, 1);
    const locked = { ...line('locked', 40, 2), locked: true };
    const text = { ...base('text', 'text', 70, 3), kind: 'text' as const, text: '不可裁剪' };
    const document = documentWith([title, source, locked, text]);

    expect(splitDrawingPathAtPoint(document, 'a', { x: 10.5, y: 10 }).changed).toBe(false);
    expect(splitDrawingPathAtPoint(document, 'locked', { x: 50, y: 10 }).changed).toBe(false);
    expect(splitDrawingPathAtPoint(document, 'text', { x: 75, y: 15 }).changed).toBe(false);
  });

  it('places copied objects at the context point while preserving relative geometry', () => {
    const sourceLine = line('a', 10, 1);
    const sourceText = { ...base('text', 'text', 40, 2), kind: 'text' as const, text: 'A' };
    const copies = placeDrawingCopiesAtPoint([sourceLine, sourceText], { x: 300, y: 240 }, 7);

    expect(copies.map((object) => ({ x: object.x, y: object.y, zIndex: object.zIndex }))).toEqual([
      { x: 300, y: 240, zIndex: 7 },
      { x: 330, y: 240, zIndex: 8 },
    ]);
    expect(copies.map((object) => object.id)).not.toEqual(['a', 'text']);
    expect(copies[0].kind === 'line' && copies[0].points).toEqual([{ x: 300, y: 240 }, { x: 320, y: 240 }]);
  });

  it('protects the title block from locking and copied placement', () => {
    const sourceLine = line('a', 10, 1);
    const locked = toggleDrawingLocks(documentWith([title, sourceLine]), ['title', 'a']);
    const copies = placeDrawingCopiesAtPoint([title, sourceLine], { x: 300, y: 240 }, 7);

    expect(locked.objects.find((object) => object.id === 'title')?.locked).toBe(false);
    expect(locked.objects.find((object) => object.id === 'a')?.locked).toBe(true);
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ kind: 'line', x: 300, y: 240 });
  });
});

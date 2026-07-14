import { describe, expect, it } from 'vitest';
import {
  clearDrawingCanvas, getObjectsInSelectionRect, moveDrawingLayers,
  snapOrthogonalPoint, splitDrawingObjects, toggleDrawingLocks,
} from '@/lib/drawingCommands';
import { defaultDrawingObjectStyle } from '@/lib/drawingDocument';
import type { DrawingDocument, DrawingObject } from '@/types/drawing';

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
});

import { describe, expect, it } from 'vitest';
import {
  createBlankDrawingDocument,
  DRAWING_DEFAULT_TABLE_POSITIONS,
  migrateLegacyDrawingTablePositions,
} from '@/lib/drawingDocument';
import type { DrawingDocument, DrawingTableRole } from '@/types/drawing';

function getTable(document: DrawingDocument, role: DrawingTableRole) {
  return document.objects.find((object) => (
    (object.kind === 'table' || object.kind === 'bom-table' || object.kind === 'wiring-table')
    && object.tableRole === role
  ))!;
}

describe('drawing table positions', () => {
  it('places the default tables against the drawing page inset', () => {
    const drawing = createBlankDrawingDocument('position test');

    expect(getTable(drawing, 'bom')).toMatchObject({ ...DRAWING_DEFAULT_TABLE_POSITIONS.bom, width: 720, height: 24 });
    expect(getTable(drawing, 'revision')).toMatchObject({ ...DRAWING_DEFAULT_TABLE_POSITIONS.revision, width: 320, height: 60 });
    expect(getTable(drawing, 'title-block')).toMatchObject({ ...DRAWING_DEFAULT_TABLE_POSITIONS['title-block'], width: 360, height: 124 });
  });

  it('migrates legacy defaults without moving manually repositioned tables', () => {
    const drawing = createBlankDrawingDocument('migration test');
    const revision = getTable(drawing, 'revision');
    const legacy = {
      ...drawing,
      objects: drawing.objects.map((object) => {
        if (object.id === getTable(drawing, 'bom').id) return { ...object, x: 40, y: 740 };
        if (object.id === revision.id) return { ...object, x: 700, y: 100 };
        if (object.id === getTable(drawing, 'title-block').id) return { ...object, x: 820, y: 640 };
        return object;
      }),
    };

    const migrated = migrateLegacyDrawingTablePositions(legacy);
    expect(getTable(migrated, 'bom')).toMatchObject(DRAWING_DEFAULT_TABLE_POSITIONS.bom);
    expect(getTable(migrated, 'revision')).toMatchObject({ x: 700, y: 100 });
    expect(getTable(migrated, 'title-block')).toMatchObject(DRAWING_DEFAULT_TABLE_POSITIONS['title-block']);
  });
});

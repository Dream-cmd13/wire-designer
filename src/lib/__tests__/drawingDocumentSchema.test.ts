import { describe, expect, it } from 'vitest';
import { createBlankDrawingDocument, defaultDrawingObjectStyle } from '@/lib/drawingDocument';
import { isDrawingDocument } from '@/lib/drawingDocumentSchema';
import type { DrawingTableObject } from '@/types/drawing';

const baseObject = {
  id: 'object-1',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  rotation: 0,
  zIndex: 1,
  locked: false,
  visible: true,
  style: { ...defaultDrawingObjectStyle },
};

function documentWith(objects: unknown[]) {
  return { ...createBlankDrawingDocument('结构校验'), objects };
}

function blankTable(): DrawingTableObject {
  const document = createBlankDrawingDocument('结构校验');
  const table = document.objects.find((object): object is DrawingTableObject => object.kind === 'table');
  if (!table) throw new Error('blank drawing table missing');
  return table;
}

describe('drawing document schema', () => {
  it('accepts a blank document and well-formed optional table fields', () => {
    const table = blankTable();
    const withOptionals = {
      ...table,
      showTitleRow: true,
      titleRowHeight: 22,
      headerRowHeight: 18,
      columnWidths: [50, 50],
      rowHeights: [18],
      columnKeys: ['A', 'B'],
      tableRole: 'bom',
      mergedCells: [{ rowIndex: 0, columnIndex: 0, rowSpan: 1, columnSpan: 2 }],
      textSizes: { 'row-0-column-0': { width: 10, height: 10, fontSize: 12 } },
      textOffsets: { 'row-0-column-0': { x: 1, y: 2 } },
      projectionCellKey: 'row-0-column-0',
    };

    expect(isDrawingDocument(createBlankDrawingDocument('结构校验'))).toBe(true);
    expect(isDrawingDocument(documentWith([withOptionals]))).toBe(true);
  });

  it.each(['line', 'polyline', 'curve', 'freehand'])('validates the optional name of a %s', (kind) => {
    const object = {
      ...baseObject,
      kind,
      name: '线1',
      points: [{ x: 0, y: 0 }, { x: 5, y: 5 }],
      orthogonal: false,
    };

    expect(isDrawingDocument(documentWith([object]))).toBe(true);
    expect(isDrawingDocument(documentWith([{ ...object, name: undefined }]))).toBe(true);

    const numericName = { ...object, name: 123 };
    expect(isDrawingDocument(documentWith([numericName]))).toBe(false);
  });

  it.each<[string, unknown[]]>([
    ['a null object', [null]],
    ['an object without geometry', [{ ...baseObject, kind: 'text', text: 'hi', x: undefined }]],
    ['an unknown object kind', [{ ...baseObject, kind: 'unknown' }]],
    ['a line without points', [{ ...baseObject, kind: 'line', points: [], orthogonal: false }]],
    ['a group with a corrupt child', [{ ...baseObject, kind: 'group', groupKind: 'wire-core', children: [null] }]],
  ])('rejects an object list with %s', (_label, objects) => {
    expect(isDrawingDocument(documentWith(objects))).toBe(false);
  });

  it.each<[string, Record<string, unknown>]>([
    ['a null merge cell', { mergedCells: [null] }],
    ['a merge cell missing spans', { mergedCells: [{ rowIndex: 0, columnIndex: 0 }] }],
    ['a null text size', { textSizes: { 'row-0-column-0': null } }],
    ['a text size missing fontSize', { textSizes: { 'row-0-column-0': { width: 10, height: 10 } } }],
    ['a text offset without y', { textOffsets: { 'row-0-column-0': { x: 1 } } }],
    ['a non-numeric column width', { columnWidths: [null] }],
    ['an invalid table role', { tableRole: 'unknown' }],
    ['a non-string column key', { columnKeys: [1] }],
  ])('rejects a table with %s', (_label, patch) => {
    expect(isDrawingDocument(documentWith([{ ...blankTable(), ...patch }]))).toBe(false);
  });
});

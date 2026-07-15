import { describe, expect, it } from 'vitest';
import { resolveTableDoubleClickAction, resolveTablePointerAction } from '../drawingTableInteraction';

const text = { kind: 'table-text', objectId: 'table-1', key: 'row-0-column-0', rowIndex: 0, columnIndex: 0 } as const;
const otherText = { ...text, key: 'row-0-column-1', columnIndex: 1 } as const;

describe('drawing table interaction policy', () => {
  it('routes every interior pointer hit to whole-table movement while whole-selected', () => {
    expect(resolveTablePointerAction(true, null, 'table')).toBe('move-table');
    expect(resolveTablePointerAction(true, null, 'cell')).toBe('move-table');
    expect(resolveTablePointerAction(true, null, 'text')).toBe('move-table');
  });

  it('preserves local cell selection and text movement after entering local mode', () => {
    expect(resolveTablePointerAction(true, text, 'cell')).toBe('select-cell');
    expect(resolveTablePointerAction(true, text, 'text')).toBe('move-text');
  });

  it('selects a local target on the first double-click and edits only the same selected text', () => {
    expect(resolveTableDoubleClickAction(null, text)).toBe('select-local');
    expect(resolveTableDoubleClickAction(text, text)).toBe('edit-text');
    expect(resolveTableDoubleClickAction(text, otherText)).toBe('select-local');
  });
});

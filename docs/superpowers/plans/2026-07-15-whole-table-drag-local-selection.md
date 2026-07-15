# Whole-Table Drag and Local Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a whole-selected table draggable from any interior point while requiring a two-stage double-click to select and then edit local table text.

**Architecture:** Add a small pure interaction-policy module that decides whether a table pointer gesture moves the whole table, selects a cell, moves text, selects a local target, or edits text. Wire the existing DOM table layer to this policy and clear local table targets when marquee selection restores whole-table selection.

**Tech Stack:** React 18, TypeScript, Vitest, existing drawing-table types and transform overlay.

## Global Constraints

- Preserve the existing drawing object schema and `tableTarget === null` whole-table state.
- Do not alter selection or transform behavior for non-table drawing objects.
- Do not add shortcuts, toolbar controls, or unrelated refactors.
- Use the existing eight-handle selection overlay for both whole and local targets.

---

### Task 1: Define and test table gesture policy

**Files:**
- Create: `src/lib/drawingTableInteraction.ts`
- Create: `src/lib/__tests__/drawingTableInteraction.test.ts`

**Interfaces:**
- Consumes: `DrawingTableLocalTarget` from `src/types/drawing.ts`.
- Produces: `resolveTablePointerAction(selected, activeTarget, hit)` and `resolveTableDoubleClickAction(activeTarget, target)`.

- [ ] **Step 1: Write the failing policy tests**

```ts
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
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingTableInteraction.test.ts`

Expected: FAIL because `drawingTableInteraction.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure policy**

```ts
import type { DrawingTableLocalTarget } from '../types/drawing';

export type DrawingTablePointerHit = 'table' | 'cell' | 'text';
export type DrawingTablePointerAction = 'move-table' | 'select-cell' | 'move-text';

export function resolveTablePointerAction(
  selected: boolean,
  activeTarget: DrawingTableLocalTarget | null,
  hit: DrawingTablePointerHit,
): DrawingTablePointerAction {
  if ((selected && !activeTarget) || hit === 'table') return 'move-table';
  return hit === 'text' ? 'move-text' : 'select-cell';
}

export function resolveTableDoubleClickAction(
  activeTarget: DrawingTableLocalTarget | null,
  target: DrawingTableLocalTarget,
): 'select-local' | 'edit-text' {
  const isSameText = target.kind === 'table-text'
    && activeTarget?.kind === 'table-text'
    && activeTarget.objectId === target.objectId
    && activeTarget.key === target.key;
  return isSameText ? 'edit-text' : 'select-local';
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd test -- src/lib/__tests__/drawingTableInteraction.test.ts`

Expected: 1 test file passes with 3 tests.

- [ ] **Step 5: Commit the policy and tests**

```bash
git add src/lib/drawingTableInteraction.ts src/lib/__tests__/drawingTableInteraction.test.ts
git commit -m "test: define table gesture priority"
```

### Task 2: Route DOM table gestures by whole or local selection state

**Files:**
- Modify: `src/components/drawings/standalone/StandaloneDrawingCanvas.tsx:139-307`
- Modify: `src/lib/__tests__/drawingCanvasTemplates.test.ts:132-142`

**Interfaces:**
- Consumes: `resolveTablePointerAction`, `resolveTableDoubleClickAction`, and the current `activeTarget` for each table layer.
- Produces: whole-table interior dragging, first-double-click local selection, and second-double-click same-text editing.

- [ ] **Step 1: Add failing integration-source assertions**

Extend the existing table target test with:

```ts
expect(canvasSource).toContain('resolveTablePointerAction(selected, activeTarget');
expect(canvasSource).toContain('resolveTableDoubleClickAction(activeTarget, localTarget)');
expect(canvasSource).toContain('activeTarget={activeTableTarget?.objectId === object.id ? activeTableTarget : null}');
```

- [ ] **Step 2: Run the focused integration test and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingCanvasTemplates.test.ts`

Expected: FAIL because the table layer does not yet consume the policy or active target.

- [ ] **Step 3: Wire the policy into the table layer**

Import the policy, add `activeTarget: DrawingTableLocalTarget | null` to `DrawingTableLayer`, and route events as follows:

```ts
const handleTextPointerDown = (
  event: React.PointerEvent<HTMLElement>,
  target: DrawingTableLocalTarget,
) => {
  const action = resolveTablePointerAction(selected, activeTarget, 'text');
  if (action === 'move-table') beginDrag(event, 'table');
  else {
    onSelectTarget(target);
    beginDrag(event, 'text', target.key);
  }
};

const handleLocalDoubleClick = (
  event: React.MouseEvent<HTMLElement>,
  target: DrawingTableLocalTarget,
  editTarget?: TableEditTarget,
) => {
  event.preventDefault();
  event.stopPropagation();
  onSelect();
  if (editTarget && resolveTableDoubleClickAction(activeTarget, target) === 'edit-text') {
    beginEdit(event, editTarget);
    return;
  }
  onSelectTarget(target);
};
```

For cell pointer-down, call `beginDrag(event, 'table')` when the pointer policy returns `move-table`; otherwise keep cell selection. Add a cell double-click handler that selects the cell target, while the nested text double-click stops propagation and selects or edits text. Remove the single-click transition from whole-table state to local text selection.

Pass the active target into each table layer:

```tsx
activeTarget={activeTableTarget?.objectId === object.id ? activeTableTarget : null}
```

- [ ] **Step 4: Run focused policy and integration tests**

Run: `npm.cmd test -- src/lib/__tests__/drawingTableInteraction.test.ts src/lib/__tests__/drawingCanvasTemplates.test.ts`

Expected: both test files pass.

- [ ] **Step 5: Commit DOM gesture routing**

```bash
git add src/components/drawings/standalone/StandaloneDrawingCanvas.tsx src/lib/__tests__/drawingCanvasTemplates.test.ts
git commit -m "fix: prioritize whole-table dragging"
```

### Task 3: Restore whole-table mode after marquee selection

**Files:**
- Modify: `src/components/drawings/standalone/StandaloneDrawingCanvas.tsx:603-619`
- Modify: `src/lib/__tests__/drawingCanvasInteraction.test.ts:8-90`

**Interfaces:**
- Consumes: existing marquee-selected IDs and `tableObjectIds`.
- Produces: clearing of `tableTarget` whenever a marquee selection includes a table.

- [ ] **Step 1: Add a failing marquee-state assertion**

```ts
it('restores whole-table mode when marquee selection includes a table', () => {
  expect(canvasSource).toContain('if (ids.some((id) => tableObjectIds.has(id))) setTableTarget(null)');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingCanvasInteraction.test.ts`

Expected: FAIL because marquee completion currently preserves the previous local table target.

- [ ] **Step 3: Clear the local target on table marquee selection**

After computing `ids` in `endDrag`, add:

```ts
if (ids.some((id) => tableObjectIds.has(id))) setTableTarget(null);
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm.cmd test -- src/lib/__tests__/drawingCanvasInteraction.test.ts src/lib/__tests__/drawingTableInteraction.test.ts src/lib/__tests__/drawingCanvasTemplates.test.ts`

Expected: all focused tests pass.

- [ ] **Step 5: Run complete verification**

Run: `npm.cmd test`

Expected: all test files and tests pass.

Run: `npm.cmd run lint`

Expected: exit code 0 with no lint errors.

Run: `npm.cmd run build`

Expected: exit code 0; the existing bundle-size warning is acceptable.

- [ ] **Step 6: Perform browser acceptance walkthrough**

At `http://localhost:5173/drawing-workbench`, verify: marquee selection and border click show whole-table handles; dragging title, header, cell, and text areas moves the whole table; first double-click shows local handles; second double-click on the same text enters editing; and double-clicking another target switches local handles without editing.

- [ ] **Step 7: Commit marquee restoration and verification tests**

```bash
git add src/components/drawings/standalone/StandaloneDrawingCanvas.tsx src/lib/__tests__/drawingCanvasInteraction.test.ts
git commit -m "fix: restore whole-table mode after marquee selection"
```

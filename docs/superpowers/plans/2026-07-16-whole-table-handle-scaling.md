# Whole-Table Handle Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all eight whole-table resize handles scale the complete table proportionally around the required fixed opposite edge or corner.

**Architecture:** Add one pure table-resize function in `drawingTableLayout.ts`. It derives a uniform factor from the active handle and pointer, reuses `scaleDrawingTable` for all internal dimensions, then repositions the scaled table so the opposite edge or corner remains fixed in world space; the canvas routes only whole-table resize interactions through it.

**Tech Stack:** TypeScript, React pointer interactions, Vitest.

## Global Constraints

- Whole-table edge and corner handles always preserve the table aspect ratio.
- The opposite edge or opposite corner remains fixed.
- Column widths, row heights, text sizes, text offsets, font size, and line width use the same scale factor.
- Local cell/text resize behavior remains unchanged.
- Mouse-wheel table scaling remains center-based.
- Non-table objects keep the current generic resize behavior.
- Rotated tables use local-axis geometry.
- Use minimal changes and do not touch unrelated project, authentication, SQL, or catalog files.

---

### Task 1: Pure Anchored Whole-Table Scaling Geometry

**Files:**
- Modify: `src/lib/drawingTableLayout.ts`
- Modify: `src/lib/__tests__/drawingTableLayout.test.ts`

**Interfaces:**
- Consumes: `DrawingTableObject`, `ResizeHandle`, `DrawingPoint`, `resizeDrawingObject`, `localToWorldPoint`, and `scaleDrawingTable`.
- Produces:

```ts
export type DrawingTableResizeResult = {
  patch: DrawingTablePatch;
  activeHandle: ResizeHandle;
};

export function resizeDrawingTableFromHandle(
  table: DrawingTableObject,
  handle: ResizeHandle,
  pointer: DrawingPoint,
): DrawingTableResizeResult;
```

- [ ] **Step 1: Add failing edge-handle tests**

Create a table with explicit layout fields:

```ts
const table = {
  ...createBlankDrawingDocument('表格缩放', new Date(2026, 6, 16))
    .objects.find((object) => object.tableRole === 'revision')!,
  x: 100,
  y: 100,
  width: 320,
  height: 60,
  rotation: 0,
  style: { ...defaultDrawingObjectStyle, fontSize: 10, strokeWidth: 2 },
  textOffsets: { 'row-0-column-0': { x: 4, y: 2 } },
  textSizes: { 'row-0-column-0': { width: 30, height: 12, fontSize: 8 } },
} as DrawingTableObject;
```

Add:

```ts
it('scales the whole table from the right edge while keeping the left edge fixed', () => {
  const result = resizeDrawingTableFromHandle(table, 'e', { x: 580, y: 130 });
  const next = { ...table, ...result.patch };

  expect(next.x).toBeCloseTo(100);
  expect(next.width).toBeCloseTo(480);
  expect(next.height).toBeCloseTo(90);
  expect(next.y).toBeCloseTo(85);
  expect(next.columnWidths).toEqual(table.columnWidths!.map((value) => value * 1.5));
  expect(next.rowHeights).toEqual(table.rowHeights!.map((value) => value * 1.5));
  expect(next.style.fontSize).toBeCloseTo(15);
  expect(next.style.strokeWidth).toBeCloseTo(3);
  expect(next.textOffsets!['row-0-column-0']).toEqual({ x: 6, y: 3 });
  expect(next.textSizes!['row-0-column-0']).toEqual({ width: 45, height: 18, fontSize: 12 });
});

it('scales from the left edge while keeping the right edge fixed', () => {
  const result = resizeDrawingTableFromHandle(table, 'w', { x: 260, y: 130 });
  const next = { ...table, ...result.patch };
  expect(next.x + next.width).toBeCloseTo(table.x + table.width);
  expect(next.width / table.width).toBeCloseTo(next.height / table.height);
});
```

Narrow the `tableRole` lookup to table-like objects so TypeScript does not read that field from unrelated union members.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
& 'C:\Users\Redmi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules\vitest\vitest.mjs run src/lib/__tests__/drawingTableLayout.test.ts
```

Expected: FAIL because `resizeDrawingTableFromHandle` does not exist.

- [ ] **Step 3: Add failing corner and rotation tests**

Add assertions that:

```ts
it('keeps the opposite corner fixed for a rotated table', () => {
  const rotated = { ...table, rotation: 30 };
  const fixedBefore = localToWorldPoint(rotated, { x: 0, y: 0 });
  const pointer = localToWorldPoint(rotated, { x: 480, y: 90 });
  const result = resizeDrawingTableFromHandle(rotated, 'se', pointer);
  const next = { ...rotated, ...result.patch } as DrawingTableObject;
  const fixedAfter = localToWorldPoint(next, { x: 0, y: 0 });

  expect(fixedAfter.x).toBeCloseTo(fixedBefore.x);
  expect(fixedAfter.y).toBeCloseTo(fixedBefore.y);
  expect(next.width / rotated.width).toBeCloseTo(next.height / rotated.height);
});
```

Also cover `n` and `s` handles so horizontal size expands around the original center while the opposite horizontal edge remains fixed.

- [ ] **Step 4: Implement uniform factor derivation**

Import:

```ts
import {
  localToWorldPoint,
  resizeDrawingObject,
  type ResizeHandle,
} from '@/lib/drawingTransform';
```

Use the generic resize result only to derive the requested primary-axis dimension and flipped `activeHandle`:

```ts
const horizontal = handle === 'e' || handle === 'w';
const corner = handle.length === 2;
const frame = resizeDrawingObject(table, handle, pointer, corner);
const factor = horizontal
  ? (frame.patch.width ?? table.width) / table.width
  : (frame.patch.height ?? table.height) / table.height;
const patch = scaleDrawingTable(table, factor);
```

For corner handles, use `frame.patch.x/y` because the generic aspect-ratio resize already keeps the opposite corner fixed. For edge handles, calculate the original fixed edge midpoint with `localToWorldPoint`, calculate the corresponding opposite-edge midpoint in the scaled local frame based on `frame.activeHandle`, rotate the local center offset by `table.rotation`, and derive the new `x/y` that maps it back to the same world point.

Keep the small rotation-vector helper private to `drawingTableLayout.ts`; do not duplicate table dimension scaling.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
& 'C:\Users\Redmi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules\vitest\vitest.mjs run src/lib/__tests__/drawingTableLayout.test.ts src/lib/__tests__/drawingTransform.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit Task 1**

```powershell
git add src/lib/drawingTableLayout.ts src/lib/__tests__/drawingTableLayout.test.ts
git commit -m "feat: add anchored whole-table scaling"
```

---

### Task 2: Route Whole-Table Handles Through Table Scaling

**Files:**
- Modify: `src/components/drawings/standalone/StandaloneDrawingCanvas.tsx`
- Modify: `src/lib/__tests__/drawingCanvasInteraction.test.ts`
- Modify: `src/lib/__tests__/drawingWorkbenchUi.test.ts`

**Interfaces:**
- Consumes: `resizeDrawingTableFromHandle`.
- Preserves: existing `table-resize` local-target branch.

- [ ] **Step 1: Add failing canvas wiring assertions**

In the canvas interaction/source contract tests, assert:

```ts
expect(canvasSource).toContain('resizeDrawingTableFromHandle');
expect(canvasSource).toContain("interaction.kind === 'resize'");
expect(canvasSource).toContain("interaction.object.kind === 'table'");
expect(canvasSource).toContain("interaction.object.kind === 'bom-table'");
expect(canvasSource).toContain("interaction.object.kind === 'wiring-table'");
```

Retain the existing assertions for `resizeDrawingTableCell` and `resizeDrawingTableText` so the local branch cannot be removed.

- [ ] **Step 2: Run focused UI tests and verify RED**

Run:

```powershell
& 'C:\Users\Redmi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules\vitest\vitest.mjs run src/lib/__tests__/drawingCanvasInteraction.test.ts src/lib/__tests__/drawingWorkbenchUi.test.ts
```

Expected: FAIL because whole-table resize still submits only `resizeDrawingObject(...).patch`.

- [ ] **Step 3: Implement the whole-table resize branch**

Import `resizeDrawingTableFromHandle`. In `updateTransform`, keep `interaction.kind === 'table-resize'` unchanged. Before the generic move/resize/rotate expression, add:

```ts
if (
  interaction.kind === 'resize'
  && (
    interaction.object.kind === 'table'
    || interaction.object.kind === 'bom-table'
    || interaction.object.kind === 'wiring-table'
  )
) {
  const result = resizeDrawingTableFromHandle(
    interaction.object,
    interaction.handle,
    point,
  );
  onUpdateObject(interaction.object.id, result.patch as Partial<DrawingObject>);
  return;
}
```

Whole-table resize begins only when `activeTableTarget` is null, because the existing `beginResize` local-target branch continues to create `table-resize`.

- [ ] **Step 4: Run focused interaction tests and verify GREEN**

Run:

```powershell
& 'C:\Users\Redmi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules\vitest\vitest.mjs run src/lib/__tests__/drawingTableLayout.test.ts src/lib/__tests__/drawingCanvasInteraction.test.ts src/lib/__tests__/drawingWorkbenchUi.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit Task 2**

```powershell
git add src/components/drawings/standalone/StandaloneDrawingCanvas.tsx src/lib/__tests__/drawingCanvasInteraction.test.ts src/lib/__tests__/drawingWorkbenchUi.test.ts
git commit -m "fix: scale full table from resize handles"
```

---

### Task 3: Full Verification and Interaction Acceptance

**Files:**
- Verify Task 1-2 files.

**Interfaces:**
- Produces: automated and manual evidence.

- [ ] **Step 1: Run complete automated verification**

Run:

```powershell
& 'C:\Users\Redmi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules\vitest\vitest.mjs run
& 'C:\Users\Redmi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules\eslint\bin\eslint.js .
& 'C:\Users\Redmi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules\typescript\bin\tsc -b --pretty false
& 'C:\Users\Redmi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules\vite\bin\vite.js build
git diff --check
```

Expected: all commands exit zero; the existing Vite large-chunk warning may remain.

- [ ] **Step 2: Verify whole-table handles in the browser**

On `localhost`, select an entire default table and drag each edge handle. Verify the opposite edge remains fixed, both dimensions scale proportionally, and the grid/text fill the frame without blank space. Repeat with corners and one rotated table.

- [ ] **Step 3: Verify local table targets and other objects**

Double-click a table cell/text target and verify its local handles still adjust only that target. Resize a non-table object and confirm existing behavior is unchanged. Wheel-scale a table and confirm it remains center-based.

- [ ] **Step 4: Review scope**

Run `git status --short` and confirm unrelated `package.json`, SQL, authentication, `.claude/`, and old plan changes were not staged or committed.


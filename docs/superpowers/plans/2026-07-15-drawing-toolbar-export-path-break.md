# Drawing Toolbar, PDF Filename, and Path Break Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify layer controls, separate selected/global locking, prompt for PDF filenames, and break active drawing paths before unrelated actions.

**Architecture:** Keep document mutations in `drawingCommands.ts`, UI state in `DrawingWorkbenchPage.tsx`, toolbar presentation in `DrawingWorkbenchToolbar.tsx`, and draft finalization in `StandaloneDrawingCanvas.tsx`. Reuse the existing `drawingAction` event boundary and history flow so each new behavior remains undoable without restructuring the workbench.

**Tech Stack:** React 19, TypeScript 6, Tailwind CSS 4, lucide-react, Zustand, Vitest.

## Global Constraints

- Apply minimal changes and preserve the existing project structure, code style, and technology stack.
- Do not add dependencies.
- The toast copy must be exactly `请先选择一个对象。`.
- Global lock/unlock must exclude `title-block` objects.
- Path breaking must preserve valid draft geometry and keep the current drawing tool active.

---

### Task 1: Locking and filename command contracts

**Files:**
- Modify: `src/lib/drawingCommands.ts`
- Modify: `src/lib/drawingExport.ts`
- Test: `src/lib/__tests__/drawingCommands.test.ts`
- Test: `src/lib/__tests__/drawingExportCompletion.test.ts`

**Interfaces:**
- Produces: `toggleAllDrawingLocks(document: DrawingDocument): DrawingDocument`.
- Produces: `downloadDrawingPdf(drawing: DrawingDocument, requestedFilename?: string): Promise<void>`.

- [ ] **Step 1: Write failing command tests**

```ts
it('locks and unlocks every editable object while preserving the title block', () => {
  const source = documentWith([title, line('a', 10, 1), { ...line('b', 20, 2), locked: true }]);
  const locked = toggleAllDrawingLocks(source);
  expect(locked.objects.find((item) => item.id === 'a')?.locked).toBe(true);
  expect(locked.objects.find((item) => item.id === 'b')?.locked).toBe(true);
  expect(locked.objects.find((item) => item.id === 'title')?.locked).toBe(title.locked);
  expect(toggleAllDrawingLocks(locked).objects.filter((item) => item.kind !== 'title-block').every((item) => !item.locked)).toBe(true);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/lib/__tests__/drawingCommands.test.ts src/lib/__tests__/drawingExportCompletion.test.ts`
Expected: FAIL because `toggleAllDrawingLocks` and the requested filename contract do not exist.

- [ ] **Step 3: Implement minimal command and export changes**

```ts
export function toggleAllDrawingLocks(document: DrawingDocument): DrawingDocument {
  const editable = document.objects.filter((object) => object.kind !== 'title-block');
  if (!editable.length) return document;
  const locked = editable.some((object) => !object.locked);
  return updated(document, document.objects.map((object) => object.kind === 'title-block' ? object : { ...object, locked }));
}
```

Update PDF download naming to sanitize `requestedFilename?.replace(/\.pdf$/i, '')` through `safeFilename`, falling back to the current drawing-derived name.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/lib/__tests__/drawingCommands.test.ts src/lib/__tests__/drawingExportCompletion.test.ts`
Expected: PASS.

### Task 2: Toolbar popover, toast, and PDF dialog

**Files:**
- Modify: `src/components/drawings/standalone/DrawingWorkbenchToolbar.tsx`
- Create: `src/components/drawings/standalone/DrawingPdfExportDialog.tsx`
- Modify: `src/pages/DrawingWorkbenchPage.tsx`
- Test: `src/lib/__tests__/drawingWorkbenchUi.test.ts`

**Interfaces:**
- Toolbar consumes: `onToggleSelectionLock`, `onToggleAllLocks`, `allObjectsLocked`, `onBeforeAction`.
- Dialog consumes: `open`, `defaultFilename`, `exporting`, `onConfirm(filename)`, `onClose()`.
- Page produces: one selection warning Toast and one PDF dialog instance.

- [ ] **Step 1: Write failing UI contract tests**

```ts
expect(toolbarSource).toContain('图层操作');
expect(toolbarSource).toContain('上移');
expect(toolbarSource).toContain('下移');
expect(pageSource).toContain('请先选择一个对象。');
expect(pageSource).toContain('DrawingPdfExportDialog');
expect(pageSource).toContain('toggleAllDrawingLocks');
```

- [ ] **Step 2: Run UI tests and verify RED**

Run: `npm test -- src/lib/__tests__/drawingWorkbenchUi.test.ts`
Expected: FAIL because the popover, global command, toast, and dialog are absent.

- [ ] **Step 3: Implement the minimal accessible UI**

Add a relative layer button wrapper with an absolute three-button popover, outside-click/Escape closing, and keep layer actions clickable without selection. Add a lightweight controlled PDF dialog with a labeled input, empty-name validation, Escape cancellation, and Enter submission. In the page, route selection-required actions through a helper that shows `ActionToast`, route global locking through `toggleAllDrawingLocks`, and keep export errors/retry behavior using the confirmed filename.

- [ ] **Step 4: Run UI tests and verify GREEN**

Run: `npm test -- src/lib/__tests__/drawingWorkbenchUi.test.ts`
Expected: PASS.

### Task 3: Explicit path break boundaries

**Files:**
- Modify: `src/components/drawings/standalone/StandaloneDrawingCanvas.tsx`
- Modify: `src/pages/DrawingWorkbenchPage.tsx`
- Test: `src/lib/__tests__/drawingCanvasInteraction.test.ts`
- Test: `src/lib/__tests__/drawingWorkbenchUi.test.ts`

**Interfaces:**
- Page produces: `breakDrawingPath(): void`, which increments `drawingAction` with type `finish` without changing `toolMode`.
- Canvas consumes: `drawingAction` and finalizes `draftKind`/`draftPoints` through existing `finalizeDrawingDraft`.

- [ ] **Step 1: Write failing path-boundary tests**

```ts
expect(canvasSource).toContain("type: 'finish'");
expect(canvasSource).toContain('handleContextMenu');
expect(pageSource).toContain('breakDrawingPath');
expect(pageSource).toContain('onBeforeAction={breakDrawingPath}');
```

- [ ] **Step 2: Run interaction tests and verify RED**

Run: `npm test -- src/lib/__tests__/drawingCanvasInteraction.test.ts src/lib/__tests__/drawingWorkbenchUi.test.ts`
Expected: FAIL because right-click and toolbar actions do not share an explicit break boundary.

- [ ] **Step 3: Implement path interruption**

Before reporting a canvas context menu, finalize the current valid draft and clear draft state without adding the right-click point. In the page, call `breakDrawingPath` before toolbar/resource/layer/lock/PDF operations. Keep `toolMode` unchanged so the next left click starts a fresh draft.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/lib/__tests__/drawingCanvasInteraction.test.ts src/lib/__tests__/drawingWorkbenchUi.test.ts`
Expected: PASS.

### Task 4: Full verification

**Files:**
- Verify all modified source and test files.

**Interfaces:**
- Consumes all contracts from Tasks 1–3.
- Produces a verified build with no new dependencies.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`
Expected: all tests pass with zero failures.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: exit code 0.

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check` and `git diff -- src/components/drawings/standalone src/pages/DrawingWorkbenchPage.tsx src/lib/drawingCommands.ts src/lib/drawingExport.ts src/lib/__tests__ docs/superpowers`
Expected: no whitespace errors and only scoped changes.

### Task 5: Freehand dots and line properties

**Files:**
- Modify: `src/components/drawings/standalone/StandaloneDrawingCanvas.tsx`
- Test: `src/lib/__tests__/drawingCanvasInteraction.test.ts`

**Interfaces:**
- A freehand pointer-up always creates an object; one sampled point renders as a dot.
- Path objects own an optional persisted `name` for backward compatibility.
- `DrawingLinePropertiesDialog` sends one validated property payload to the page.
- Geometry transforms scale and rotate the full path around its first point.

- [x] **Step 1: Add failing interaction and geometry tests**

Cover one-click dots, dot rendering/export, selection-only handles, property-dialog routing, path length, alignment, and style updates.

- [x] **Step 2: Run focused tests and verify RED**

Expected failures: old click anchor remains; dot geometry/rendering and line-properties modules are absent.

- [x] **Step 3: Implement dot creation and rendering**

Create a one-point freehand object on click, retain sampled drag paths, give dots a selectable hit box, and render/export them as filled circles.

- [x] **Step 4: Implement line naming and property editing**

Assign default sequential names, hide transform controls outside selection mode, route path double-clicks to the dialog, and apply name/style/length/alignment as one undoable update.

- [x] **Step 5: Run full verification**

Run: `npm.cmd test -- src/lib/__tests__/drawingCanvasInteraction.test.ts`, `npm.cmd test`, `npm.cmd run lint`, and `npm.cmd run build`.
Expected: all commands exit 0.

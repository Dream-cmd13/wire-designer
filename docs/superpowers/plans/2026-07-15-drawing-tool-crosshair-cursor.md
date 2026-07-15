# Drawing Tool Crosshair Cursor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a crosshair cursor on the drawing canvas whenever line, polyline, curve, or freehand mode is active, while preserving the selection-mode cursor.

**Architecture:** Keep cursor behavior local to the existing canvas element. Derive the Tailwind class directly from the existing `toolMode` prop, with no new state, stylesheet, dependency, or event behavior.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest

## Global Constraints

- Only the canvas cursor changes; toolbar, panels, dialogs, drawing events, selection, right-click, and double-click behavior remain unchanged.
- `select` mode retains the existing cursor; all four drawing modes use `cursor-crosshair`.
- Follow the existing component and source-contract test style.

---

### Task 1: Conditional canvas crosshair cursor

**Files:**
- Modify: `src/lib/__tests__/drawingCanvasInteraction.test.ts`
- Modify: `src/components/drawings/standalone/StandaloneDrawingCanvas.tsx`

**Interfaces:**
- Consumes: existing `toolMode: DrawingToolMode` prop.
- Produces: a canvas `className` that conditionally contains `cursor-crosshair` when `toolMode !== 'select'`.

- [x] **Step 1: Write the failing interaction contract test**

```ts
it('uses a crosshair cursor only while a drawing tool is active', () => {
  expect(canvasSource).toContain("toolMode !== 'select' ? 'cursor-crosshair' : ''");
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingCanvasInteraction.test.ts`

Expected: FAIL because the canvas does not yet conditionally include `cursor-crosshair`.

- [x] **Step 3: Add the minimal conditional Tailwind class**

```tsx
className={`block bg-white shadow-lg touch-none ${toolMode !== 'select' ? 'cursor-crosshair' : ''}`}
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd test -- src/lib/__tests__/drawingCanvasInteraction.test.ts`

Expected: all tests in the file pass.

- [x] **Step 5: Run full verification**

Run: `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`.

Expected: all commands exit with code 0; the existing build chunk-size advisory may remain.

- [ ] **Step 6: Prepare the implementation commit**

```bash
git add src/lib/__tests__/drawingCanvasInteraction.test.ts src/components/drawings/standalone/StandaloneDrawingCanvas.tsx docs/superpowers/plans/2026-07-15-drawing-tool-crosshair-cursor.md
git commit -m "feat: use crosshair cursor for drawing tools"
```

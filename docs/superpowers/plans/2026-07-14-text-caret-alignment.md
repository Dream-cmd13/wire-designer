# Text Caret Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the native editing caret exactly with standalone drawing text and label glyphs.

**Architecture:** Replace the transparent native input for `text` and `label` objects with a visible DOM `contentEditable` overlay while temporarily omitting that object from Canvas rendering. Keep typography and transforms synchronized from one editor descriptor and retain the existing data/update flow.

**Tech Stack:** React 19, TypeScript 6, Canvas 2D, DOM Selection/Range, Vitest.

## Global Constraints

- Apply minimal changes only to standalone drawing text and label editing.
- Do not add selection, resize, or rotation controls.
- Preserve current project structure, styling, and object persistence.

---

### Task 1: Add a caret-alignment regression test

**Files:**
- Modify: `src/lib/__tests__/drawingCanvasTemplates.test.ts`

**Interfaces:**
- Consumes: `StandaloneDrawingCanvas.tsx` source contract.
- Produces: a regression test for `contentEditable`, font readiness, Canvas hiding, and rotation synchronization.

- [ ] **Step 1: Write the failing test** asserting the new editor contract.
- [ ] **Step 2: Run `npm test -- src/lib/__tests__/drawingCanvasTemplates.test.ts` and confirm the new assertion fails because the old transparent input is still present.**

### Task 2: Implement synchronized DOM text editing

**Files:**
- Modify: `src/components/drawings/standalone/StandaloneDrawingCanvas.tsx`
- Modify: `src/lib/drawingRenderer.ts`

**Interfaces:**
- Consumes: `EditTarget`, `renderDrawingCanvas`, and drawing object rotation/style.
- Produces: a focused `contentEditable` overlay and `hiddenObjectIds` containing only the actively edited text/label object.

- [ ] **Step 1: Add an editor ref and focus it after `document.fonts.ready`, collapsing the DOM selection at the text end.**
- [ ] **Step 2: Render visible Arial text with synchronized font size, line height, position, zoom, transform origin, and rotation.**
- [ ] **Step 3: Update object text from `textContent` and omit the edited text/label object from Canvas rendering.**
- [ ] **Step 4: Run the targeted test and confirm it passes.**

### Task 3: Verify the regression and UI

**Files:**
- Test: `src/lib/__tests__/drawingCanvasTemplates.test.ts`

**Interfaces:**
- Consumes: completed implementation.
- Produces: fresh automated and browser verification evidence.

- [ ] **Step 1: Run `npm test -- src/lib/__tests__/drawingCanvasTemplates.test.ts`.**
- [ ] **Step 2: Run `npm test`, `npm run lint`, and `npm run build`.**
- [ ] **Step 3: Verify `红色222` at 72%, another zoom level, and a rotated angle on `http://localhost:5173`.**

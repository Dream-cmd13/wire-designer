# Direct Canvas Caret Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep every non-table Canvas text glyph visible and place the editing caret through the exact same text layout and transforms.

**Architecture:** Introduce pure shared text-run and caret geometry helpers. Refactor Canvas text drawing to consume the shared runs, retain transparent form controls for input/IME, and render only the caret as an SVG overlay.

**Tech Stack:** React 19, TypeScript 6, Canvas 2D TextMetrics, SVG, Vitest.

## Global Constraints

- Do not replace or hide Canvas text while editing.
- Do not use fixed corrective offsets.
- Do not change table editing or add transform handles.
- Keep DPR out of CSS-coordinate caret conversion.

---

### Task 1: Specify shared text layout and caret geometry

**Files:**
- Create: `src/lib/__tests__/drawingTextLayout.test.ts`
- Create: `src/lib/drawingTextLayout.ts`

- [ ] Write failing tests for dimension centering, wire-bundle baseline/suffix, connector max-width scaling, caret insertion index, and rotation.
- [ ] Run the targeted test and verify it fails because the module does not exist.
- [ ] Implement `getEditableDrawingTextRuns`, `measureDrawingCaret`, and `getDrawingCaretIndexAtPoint` minimally.
- [ ] Run the targeted test and verify it passes.

### Task 2: Make Canvas rendering consume shared runs

**Files:**
- Modify: `src/lib/drawingRenderer.ts`
- Modify: `src/lib/__tests__/drawingCanvasTemplates.test.ts`

- [ ] Add a failing renderer/source regression test.
- [ ] Replace duplicated editable text coordinates with shared text runs while leaving non-editable pin text unchanged.
- [ ] Run the renderer tests and verify they pass.

### Task 3: Render a measured caret over original Canvas text

**Files:**
- Modify: `src/components/drawings/standalone/StandaloneDrawingCanvas.tsx`
- Modify: `src/lib/__tests__/drawingCanvasTemplates.test.ts`

- [ ] Add a failing regression test that rejects Canvas text hiding and DOM replacement text.
- [ ] Track `selectionStart`, use the shared hit-test helper on double click, and hide the native form-control caret.
- [ ] Render measured SVG caret endpoints after object rotation and zoom.
- [ ] Wait for `document.fonts.ready` before drawing and measuring.

### Task 4: Verify

- [ ] Run targeted tests, all tests, changed-file lint, TypeScript, and production build.
- [ ] Browser-check beginning/middle/end caret positions for text, dimension, wire bundle, and connector at 50%, 100%, 150%, 200%, including rotation.

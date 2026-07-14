# Drawing Canvas Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the browser context menu on the drawing canvas with icon-led paste and entity commands, including point-based path splitting.

**Architecture:** `StandaloneDrawingCanvas` only converts the context-menu event into a canvas hit request. `DrawingWorkbenchPage` owns selection, clipboard and document mutations, while a focused `DrawingCanvasContextMenu` renders the menu. Pure helpers in `drawingCommands.ts` implement path splitting and click-position paste placement so geometry is independently testable.

**Tech Stack:** React 19, TypeScript 6, Canvas 2D, Zustand drawing store, lucide-react, Vitest, ESLint, Vite.

## Global Constraints

- Replace the browser context menu only inside the drawing canvas.
- Blank canvas shows only Paste; entity menu shows Copy, Delete, Crop, Bring to Front, Send to Back and Lock/Unlock.
- Every item uses a lucide-react icon before its Chinese label.
- Crop supports only `line`, `polyline`, `curve` and `freehand`; text and all other kinds remain unsupported.
- Locked objects cannot be deleted or cropped.
- Preserve the existing `Ctrl+X` progressive-split behavior.
- Do not add dependencies or refactor unrelated drawing code.

---

### Task 1: Pure crop and paste geometry commands

**Files:**
- Modify: `src/lib/drawingCommands.ts`
- Modify: `src/lib/__tests__/drawingCommands.test.ts`

**Interfaces:**
- Consumes: `DrawingDocument`, `DrawingLineObject`, `DrawingObject`, `DrawingPoint` from `src/types/drawing.ts`.
- Produces: `splitDrawingPathAtPoint(document, objectId, point): { document: DrawingDocument; changed: boolean; replacementIds: string[] }`.
- Produces: `placeDrawingCopiesAtPoint(objects, point, firstZIndex): DrawingObject[]`.

- [ ] **Step 1: Write failing path-split tests**

Add tests that split a two-point line at `{ x: 50, y: 10 }`, split a polyline on its nearest segment, and reject text, locked paths and points within two canvas units of either endpoint:

```ts
const result = splitDrawingPathAtPoint(documentWith([title, line('a', 10, 1)]), 'a', { x: 20, y: 10 });
expect(result.changed).toBe(true);
expect(result.document.objects.filter((item) => item.kind === 'line')).toHaveLength(2);
expect(result.replacementIds).toHaveLength(2);
```

- [ ] **Step 2: Run the path tests and verify RED**

Run: `npm test -- src/lib/__tests__/drawingCommands.test.ts`

Expected: FAIL because `splitDrawingPathAtPoint` is not exported.

- [ ] **Step 3: Implement nearest-segment projection and path replacement**

Add a projection helper and split the absolute point array at the nearest valid projection:

```ts
export function splitDrawingPathAtPoint(
  document: DrawingDocument,
  objectId: string,
  point: DrawingPoint,
): { document: DrawingDocument; changed: boolean; replacementIds: string[] } {
  const object = document.objects.find((item) => item.id === objectId);
  if (!object || object.locked || !['line', 'polyline', 'curve', 'freehand'].includes(object.kind)) {
    return { document, changed: false, replacementIds: [] };
  }
  // Find the closest clamped projection, reject endpoint tolerance,
  // create two objects with createDrawingLineObject, preserve style/type,
  // replace the original object and normalize adjacent z-order.
}
```

- [ ] **Step 4: Write failing click-position paste tests**

Test that two copied objects whose minimum coordinates are `{ x: 10, y: 20 }` are placed with minimum coordinates `{ x: 300, y: 240 }`, keep their relative offset, receive fresh IDs and sequential z-index values.

- [ ] **Step 5: Implement copy placement**

```ts
export function placeDrawingCopiesAtPoint(
  objects: DrawingObject[],
  point: DrawingPoint,
  firstZIndex: number,
): DrawingObject[] {
  const minX = Math.min(...objects.map((item) => item.x));
  const minY = Math.min(...objects.map((item) => item.y));
  const stamp = Date.now();
  return objects.map((item, index) => ({
    ...structuredClone(item),
    id: `${item.id}-copy-${stamp}-${index}`,
    x: item.x - minX + point.x,
    y: item.y - minY + point.y,
    zIndex: firstZIndex + index,
  })) as DrawingObject[];
}
```

- [ ] **Step 6: Run Task 1 tests and commit**

Run: `npm test -- src/lib/__tests__/drawingCommands.test.ts`

Expected: all drawing command tests PASS.

Commit:

```bash
git add src/lib/drawingCommands.ts src/lib/__tests__/drawingCommands.test.ts
git commit -m "feat(drawing): add point-based path crop commands"
```

---

### Task 2: Icon-led context menu component

**Files:**
- Create: `src/components/drawings/standalone/DrawingCanvasContextMenu.tsx`
- Create: `src/lib/__tests__/drawingContextMenuUi.test.ts`

**Interfaces:**
- Consumes: menu screen coordinates, `target: 'canvas' | 'object'`, command disabled states and callbacks.
- Produces: `DrawingCanvasContextMenu` with `role="menu"` and `role="menuitem"` actions.

- [ ] **Step 1: Write a failing UI contract test**

Read the component source and assert the seven Chinese labels and lucide imports are present:

```ts
for (const label of ['粘贴', '复制', '删除', '裁剪', '移到顶层', '移到底层', '锁定']) {
  expect(source).toContain(label);
}
expect(source).toContain("from 'lucide-react'");
expect(source).toContain('role="menu"');
```

- [ ] **Step 2: Run the UI test and verify RED**

Run: `npm test -- src/lib/__tests__/drawingContextMenuUi.test.ts`

Expected: FAIL because the component file does not exist.

- [ ] **Step 3: Implement the focused menu component**

Use `ClipboardPaste`, `Copy`, `Trash2`, `Scissors`, `BringToFront`, `SendToBack`, `Lock`, and `Unlock` icons. Render Paste only for `target === 'canvas'`; otherwise render the six object commands. Every button uses `flex items-center gap-2`, its icon has `h-4 w-4`, and disabled items use `disabled:opacity-40`.

Clamp the fixed menu position against `window.innerWidth` and `window.innerHeight` using a menu ref and `useLayoutEffect`. Add listeners for `pointerdown` outside the menu, `Escape`, `resize`, and capture-phase `scroll`; each calls `onClose`.

- [ ] **Step 4: Run the UI test and commit**

Run: `npm test -- src/lib/__tests__/drawingContextMenuUi.test.ts`

Expected: PASS.

Commit:

```bash
git add src/components/drawings/standalone/DrawingCanvasContextMenu.tsx src/lib/__tests__/drawingContextMenuUi.test.ts
git commit -m "feat(drawing): add canvas context menu"
```

---

### Task 3: Canvas hit request and workbench action integration

**Files:**
- Modify: `src/components/drawings/standalone/StandaloneDrawingCanvas.tsx`
- Modify: `src/pages/DrawingWorkbenchPage.tsx`
- Modify: `src/lib/__tests__/drawingCanvasInteraction.test.ts`
- Modify: `src/lib/__tests__/drawingWorkbenchUi.test.ts`

**Interfaces:**
- Produces from Canvas: `onContextMenuRequest(request: { objectId: string | null; canvasPoint: DrawingPoint; clientPoint: { x: number; y: number } }): void`.
- Consumes in Page: Task 1 helpers and Task 2 menu callbacks.

- [ ] **Step 1: Write failing Canvas and Page contract tests**

Assert Canvas contains `onContextMenu`, `event.preventDefault()`, `getDrawingObjectAtPoint`, and `onContextMenuRequest`. Assert Page imports `DrawingCanvasContextMenu`, `splitDrawingPathAtPoint`, and `placeDrawingCopiesAtPoint`.

- [ ] **Step 2: Run integration contract tests and verify RED**

Run: `npm test -- src/lib/__tests__/drawingCanvasInteraction.test.ts src/lib/__tests__/drawingWorkbenchUi.test.ts`

Expected: FAIL because the context-menu interface is absent.

- [ ] **Step 3: Emit context requests from Canvas**

Add the optional callback to Canvas props. On `<canvas onContextMenu={...}>`, prevent default and propagation, convert the pointer with existing `getPoint`, hit-test with `getDrawingObjectAtPoint`, and emit both coordinate spaces. Clear active drag/selection-box state before emitting.

- [ ] **Step 4: Integrate selection and menu state in Page**

Add:

```ts
type DrawingContextState = {
  objectId: string | null;
  canvasPoint: DrawingPoint;
  clientPoint: { x: number; y: number };
};
const [contextMenu, setContextMenu] = useState<DrawingContextState | null>(null);
```

When a request hits an unselected object, select only that object. Preserve multi-selection when the hit object is already selected. Close the menu after every command.

- [ ] **Step 5: Wire menu actions to existing history-safe commands**

- Copy clones the active selection into the internal clipboard.
- Delete calls the existing unlocked-selection deletion path.
- Crop calls `splitDrawingPathAtPoint` for `contextMenu.objectId`, records one history snapshot only when changed, applies the returned document and selects both replacements.
- Bring/Send calls `moveLayers('front')` or `moveLayers('back')`.
- Lock/Unlock calls the existing `toggleLocks` command.
- Paste calls `placeDrawingCopiesAtPoint`, records one history snapshot, appends copies and selects them.

- [ ] **Step 6: Run integration tests and commit**

Run: `npm test -- src/lib/__tests__/drawingCanvasInteraction.test.ts src/lib/__tests__/drawingWorkbenchUi.test.ts src/lib/__tests__/drawingCommands.test.ts src/lib/__tests__/drawingContextMenuUi.test.ts`

Expected: all selected tests PASS.

Commit:

```bash
git add src/components/drawings/standalone/StandaloneDrawingCanvas.tsx src/pages/DrawingWorkbenchPage.tsx src/lib/__tests__/drawingCanvasInteraction.test.ts src/lib/__tests__/drawingWorkbenchUi.test.ts
git commit -m "feat(drawing): integrate canvas context actions"
```

---

### Task 4: Full verification and browser walkthrough

**Files:**
- Modify only if verification exposes a scoped defect.

**Interfaces:**
- Consumes the completed context-menu feature.
- Produces verification evidence; no new product API.

- [ ] **Step 1: Run all automated checks**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all tests pass; ESLint exits 0; TypeScript and Vite production build exit 0.

- [ ] **Step 2: Walk through the feature at `http://localhost:4173`**

Verify:

1. Right-clicking blank canvas shows only icon + “粘贴” and never the browser menu.
2. Copy an entity, right-click blank canvas, paste at the clicked position.
3. Right-click a path, crop it near the middle, and confirm two selectable path entities remain.
4. Right-click text and confirm Crop is disabled.
5. Verify Delete, Bring to Front, Send to Back and Lock/Unlock.
6. Press Escape and click outside to close the menu.
7. Confirm no application console errors.

- [ ] **Step 3: Inspect final repository state**

Run: `git status --short && git log -4 --oneline`

Expected: only the user's pre-existing untracked files remain; implementation commits are present.

# Chinese Errors, Wheel Zoom, and Table Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Localize every user-facing runtime error, route wheel input to the selected target or top-left-anchored canvas zoom, and add parameterized table creation with explicit table/cell/text transform handles.

**Architecture:** Keep the current Canvas renderer, DOM table layer, Zustand document store, and SVG selection overlay. Add pure helpers for error translation, zoom geometry, and table layout so event handlers stay thin and independently testable; extend the table object with optional layout fields so persisted drawings remain backward compatible.

**Tech Stack:** React 19, TypeScript 6, Zustand, Tailwind CSS, Canvas 2D, SVG pointer interactions, Vitest, ESLint, Vite.

## Global Constraints

- Preserve the existing project structure, code style, and technology stack.
- Use minimal changes and do not refactor unrelated code.
- Keep the existing uncommitted drawing-tool crosshair change intact.
- Display only Chinese error messages in the UI; log original errors to the browser console.
- Canvas zoom range is 25%–300% and remains anchored to the top-left corner.
- Selected-target zoom range is 20%–500%, preserves aspect ratio, and keeps the visual center fixed.
- A wheel over the current editable selection scales that selection; a wheel elsewhere scales the canvas.
- Locked or non-editable selections fall back to canvas zoom.
- Data row count excludes the fixed column-header row and optional table-title row.
- A table cell remains in its grid; its handles resize the corresponding row and column.
- Existing drawings without new optional table layout fields must continue to render and export.
- Do not include `.claude/` or unrelated working-tree changes in any commit.

---

## File Map

- Create `src/lib/userErrorMessage.ts`: pure conversion of unknown runtime errors into Chinese UI messages.
- Create `src/lib/__tests__/userErrorMessage.test.ts`: known Supabase, network, permission, conflict, and fallback cases.
- Modify error consumers in `src/App.tsx`, `src/components/shared/ErrorBoundary.tsx`, `src/components/project/ProjectList.tsx`, `src/components/project/ImportProjectDialog.tsx`, `src/components/drawings/PdfCropViewer.tsx`, `src/components/drawings/standalone/DrawingResourcePanel.tsx`, `src/components/drawings/standalone/StandaloneDrawingWizard.tsx`, and `src/pages/DrawingWorkbenchPage.tsx`.
- Modify `src/lib/drawingTransform.ts`: pure centered wheel-scaling and zoom-clamping helpers.
- Modify `src/lib/__tests__/drawingTransform.test.ts`: geometry, bounds, line-point, and hit-routing coverage.
- Modify `src/pages/DrawingWorkbenchPage.tsx`: mutable canvas zoom, grouped wheel undo, and table-dialog state.
- Modify `src/components/drawings/standalone/StandaloneDrawingCanvas.tsx`: wheel hit routing and table local-selection wiring.
- Modify `src/lib/__tests__/drawingCanvasInteraction.test.ts`: source-level event wiring assertions.
- Modify `src/types/drawing.ts`: optional backward-compatible table layout and local-target types.
- Create `src/lib/drawingTableLayout.ts`: normalized layout, target bounds, cell resize, text resize, and whole-table scaling.
- Create `src/lib/__tests__/drawingTableLayout.test.ts`: old-document defaults and grid-preserving transformations.
- Modify `src/lib/drawingDocument.ts`: parameterized custom-table factory.
- Modify `src/lib/drawingRenderer.ts`: shared resolved layout for exports and non-DOM rendering.
- Modify `src/lib/drawingExport.ts`: use the same resolved table layout for SVG/PDF serialization.
- Create `src/components/drawings/standalone/DrawingTableCreateDialog.tsx`: row, column, and optional-title inputs.
- Modify `src/lib/__tests__/drawingWorkbenchUi.test.ts`: toolbar-to-dialog and dialog validation assertions.
- Modify `src/components/drawings/standalone/StandaloneDrawingSelectionOverlay.tsx`: optionally hide rotation for cell/text targets while retaining eight resize handles.
- Modify `src/lib/__tests__/drawingCanvasTemplates.test.ts`: table/cell/text selection overlay assertions.

---

### Task 1: Centralize Chinese User-Facing Errors

**Files:**
- Create: `src/lib/userErrorMessage.ts`
- Create: `src/lib/__tests__/userErrorMessage.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/shared/ErrorBoundary.tsx`
- Modify: `src/components/project/ProjectList.tsx`
- Modify: `src/components/project/ImportProjectDialog.tsx`
- Modify: `src/components/drawings/PdfCropViewer.tsx`
- Modify: `src/components/drawings/standalone/DrawingResourcePanel.tsx`
- Modify: `src/components/drawings/standalone/StandaloneDrawingWizard.tsx`
- Modify: `src/pages/DrawingWorkbenchPage.tsx`

**Interfaces:**
- Consumes: `unknown` caught values and an optional Chinese fallback string.
- Produces: `getUserErrorMessage(error: unknown, fallback?: string): string`.

- [ ] **Step 1: Write failing translation tests**

```ts
import { describe, expect, it } from 'vitest';
import { getUserErrorMessage } from '@/lib/userErrorMessage';

describe('getUserErrorMessage', () => {
  it('names known missing drawing tables in Chinese', () => {
    expect(getUserErrorMessage(new Error("Could not find the table 'public.catalog_items' in the schema cache")))
      .toBe('公共资源数据表不存在或尚未初始化，请联系管理员完成数据库配置。');
    expect(getUserErrorMessage(new Error("Could not find the table 'public.drawing_icons' in the schema cache")))
      .toBe('绘图图标数据表不存在或尚未初始化，请联系管理员完成数据库配置。');
  });

  it('translates generic database, network, permission, conflict, and unknown errors', () => {
    expect(getUserErrorMessage({ message: "Could not find the table 'public.anything' in the schema cache" }))
      .toBe('所需数据表不存在或尚未初始化，请联系管理员完成数据库配置。');
    expect(getUserErrorMessage(new TypeError('Failed to fetch'))).toBe('网络连接失败，请检查网络后重试。');
    expect(getUserErrorMessage({ code: '42501', message: 'permission denied' })).toBe('没有权限执行此操作。');
    expect(getUserErrorMessage({ code: '23505', message: 'duplicate key' })).toBe('数据已存在或发生冲突，请刷新后重试。');
    expect(getUserErrorMessage(new Error('unmapped English'), '资源加载失败，请重试。')).toBe('资源加载失败，请重试。');
    expect(getUserErrorMessage(new Error('unmapped English'))).toBe('操作失败，请稍后重试。');
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/userErrorMessage.test.ts`

Expected: FAIL because `@/lib/userErrorMessage` does not exist.

- [ ] **Step 3: Implement the pure translator**

```ts
type ErrorShape = { code?: unknown; status?: unknown; message?: unknown };

const messageOf = (error: unknown) => error instanceof Error
  ? error.message
  : typeof (error as ErrorShape | null)?.message === 'string'
    ? String((error as ErrorShape).message)
    : '';

export function getUserErrorMessage(error: unknown, fallback = '操作失败，请稍后重试。'): string {
  const shape = (error && typeof error === 'object' ? error : {}) as ErrorShape;
  const message = messageOf(error);
  const normalized = message.toLowerCase();
  if (/schema cache|could not find the table/.test(normalized)) {
    if (normalized.includes('catalog_items')) return '公共资源数据表不存在或尚未初始化，请联系管理员完成数据库配置。';
    if (normalized.includes('drawing_icons')) return '绘图图标数据表不存在或尚未初始化，请联系管理员完成数据库配置。';
    return '所需数据表不存在或尚未初始化，请联系管理员完成数据库配置。';
  }
  if (/column .* does not exist|could not find .* column/.test(normalized)) return '数据库字段不存在或尚未更新，请联系管理员完成数据库配置。';
  if (shape.status === 401 || normalized.includes('jwt expired')) return '登录状态已失效，请重新登录。';
  if (shape.status === 403 || shape.code === '42501' || normalized.includes('permission denied')) return '没有权限执行此操作。';
  if (shape.code === '23505' || normalized.includes('duplicate key') || normalized.includes('conflict')) return '数据已存在或发生冲突，请刷新后重试。';
  if (error instanceof TypeError || /failed to fetch|network|timeout/.test(normalized)) return '网络连接失败，请检查网络后重试。';
  return fallback;
}
```

- [ ] **Step 4: Replace direct UI exposure of exception messages**

For every file listed above, import `getUserErrorMessage`, log the original error once in its `catch`, and pass a Chinese business fallback. Example:

```ts
catch (error) {
  console.error('公共资源加载失败:', error);
  setError(getUserErrorMessage(error, '公共资源加载失败，请重试。'));
}
```

In `ErrorBoundary`, keep `componentDidCatch` logging and replace the rendered `<pre>{error.message}</pre>` with the fixed Chinese sentence `错误详情已记录，请点击重试。`.

- [ ] **Step 5: Add a guard test for raw error-message rendering**

```ts
it('does not render caught English error messages directly', () => {
  const files = [
    'src/App.tsx',
    'src/components/shared/ErrorBoundary.tsx',
    'src/components/project/ProjectList.tsx',
    'src/components/project/ImportProjectDialog.tsx',
    'src/components/drawings/PdfCropViewer.tsx',
    'src/components/drawings/standalone/DrawingResourcePanel.tsx',
    'src/components/drawings/standalone/StandaloneDrawingWizard.tsx',
    'src/pages/DrawingWorkbenchPage.tsx',
  ];
  files.forEach((file) => expect(readFileSync(file, 'utf8')).not.toMatch(/set\w*\([^\n]*\.message/));
});
```

- [ ] **Step 6: Run focused and full error tests**

Run: `npm.cmd test -- src/lib/__tests__/userErrorMessage.test.ts src/lib/__tests__/drawingWorkbenchUi.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the localized-error unit**

```powershell
git add -- src/lib/userErrorMessage.ts src/lib/__tests__/userErrorMessage.test.ts src/App.tsx src/components/shared/ErrorBoundary.tsx src/components/project/ProjectList.tsx src/components/project/ImportProjectDialog.tsx src/components/drawings/PdfCropViewer.tsx src/components/drawings/standalone/DrawingResourcePanel.tsx src/components/drawings/standalone/StandaloneDrawingWizard.tsx src/pages/DrawingWorkbenchPage.tsx src/lib/__tests__/drawingWorkbenchUi.test.ts
git commit -m "feat: localize user-facing runtime errors"
```

---

### Task 2: Add Pure Wheel-Zoom Geometry

**Files:**
- Modify: `src/lib/drawingTransform.ts`
- Modify: `src/lib/__tests__/drawingTransform.test.ts`

**Interfaces:**
- Consumes: a current zoom, wheel direction, selected `DrawingObject`, and scale factor.
- Produces: `clampDrawingZoom`, `getWheelScaleFactor`, and `scaleDrawingObjectFromCenter`.

- [ ] **Step 1: Write failing geometry tests**

```ts
it('clamps canvas zoom and converts wheel direction to ten-percent factors', () => {
  expect(clampDrawingZoom(0.1)).toBe(0.25);
  expect(clampDrawingZoom(3.4)).toBe(3);
  expect(getWheelScaleFactor(-100)).toBe(1.1);
  expect(getWheelScaleFactor(100)).toBeCloseTo(1 / 1.1);
});

it('scales an object around its center and scales line points', () => {
  const textPatch = scaleDrawingObjectFromCenter(object, 1.5);
  expect(textPatch).toMatchObject({ x: 80, y: 190, width: 120, height: 60 });
  const line = { ...object, kind: 'line', rotation: 0, points: [{ x: 100, y: 200 }, { x: 180, y: 240 }], orthogonal: false } as DrawingObject;
  expect(scaleDrawingObjectFromCenter(line, 2)).toMatchObject({
    x: 60, y: 180, width: 160, height: 80,
    points: [{ x: 60, y: 180 }, { x: 220, y: 260 }],
  });
});
```

- [ ] **Step 2: Run the transform test and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingTransform.test.ts`

Expected: FAIL because the three helper exports do not exist.

- [ ] **Step 3: Implement bounded centered scaling**

```ts
export const MIN_CANVAS_ZOOM = 0.25;
export const MAX_CANVAS_ZOOM = 3;
export const MIN_OBJECT_SCALE = 0.2;
export const MAX_OBJECT_SCALE = 5;

export const clampDrawingZoom = (zoom: number) => Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, zoom));
export const getWheelScaleFactor = (deltaY: number) => deltaY < 0 ? 1.1 : 1 / 1.1;

export function scaleDrawingObjectFromCenter(object: DrawingObject, factor: number): DrawingTransformPatch {
  const width = Math.max(MIN_OBJECT_SIZE, object.width * factor);
  const height = Math.max(MIN_OBJECT_SIZE, object.height * factor);
  const center = getObjectCenter(object);
  const patch: DrawingTransformPatch = { x: center.x - width / 2, y: center.y - height / 2, width, height };
  if (isLineLike(object)) patch.points = object.points.map((point) => ({
    x: center.x + (point.x - center.x) * factor,
    y: center.y + (point.y - center.y) * factor,
  }));
  return patch;
}
```

Track the wheel gesture's starting width/height in the caller and clamp its cumulative factor to `MIN_OBJECT_SCALE`–`MAX_OBJECT_SCALE` before calling this helper.

- [ ] **Step 4: Run the focused test**

Run: `npm.cmd test -- src/lib/__tests__/drawingTransform.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the geometry unit**

```powershell
git add -- src/lib/drawingTransform.ts src/lib/__tests__/drawingTransform.test.ts
git commit -m "feat: add centered wheel zoom geometry"
```

---

### Task 3: Route Wheel Input Between Selection and Canvas

**Files:**
- Modify: `src/components/drawings/standalone/StandaloneDrawingCanvas.tsx`
- Modify: `src/pages/DrawingWorkbenchPage.tsx`
- Modify: `src/lib/__tests__/drawingCanvasInteraction.test.ts`

**Interfaces:**
- Consumes: `zoom`, `selectedObjectId`, object bounds, and wheel events.
- Produces canvas props `onCanvasZoom(nextZoom: number)` and `onScaleObject(objectId: string, patch: Partial<DrawingObject>, gestureStart: boolean)`.

- [ ] **Step 1: Write failing event-wiring assertions**

```ts
it('routes wheel input by the current selected-object hit area', () => {
  expect(canvasSource).toContain('onWheel={handleWheel}');
  expect(canvasSource).toContain('containsDrawingPoint(selectedTransformObject, point)');
  expect(canvasSource).toContain('selectedObject.locked');
  expect(canvasSource).toContain('onCanvasZoom?.(clampDrawingZoom');
  expect(canvasSource).toContain('onScaleObject?.(');
});
```

Add page assertions that `zoom` uses `setZoom` and that a `wheelGestureRef` gates `remember()`.

- [ ] **Step 2: Run the interaction test and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingCanvasInteraction.test.ts`

Expected: FAIL because the canvas has no wheel handler or callbacks.

- [ ] **Step 3: Add wheel routing to the canvas wrapper**

Convert client coordinates with the existing `toCanvasPoint`. In `handleWheel`:

```ts
event.preventDefault();
const point = toCanvasPoint(event.clientX, event.clientY);
const factor = getWheelScaleFactor(event.deltaY);
if (toolMode === 'select' && selectedObject && selectedTransformObject && !selectedObject.locked
  && containsDrawingPoint(selectedTransformObject, point)) {
  onScaleObject?.(selectedObject.id, scaleDrawingObjectFromCenter(selectedTransformObject, factor));
  return;
}
onCanvasZoom?.(clampDrawingZoom(zoom * factor));
```

Attach `onWheel={handleWheel}` to the outer relative canvas wrapper so DOM tables and Canvas content bubble through the same routing point. Prevent the browser page from scrolling only while the pointer is inside this wrapper.

- [ ] **Step 4: Make page zoom mutable and group object undo**

Replace `const [zoom] = useState(0.72)` with `const [zoom, setZoom] = useState(0.72)`. Add a ref containing the active object id, immutable start document, start dimensions, cumulative factor, and a 180 ms timer. Record `remember()` only at the start of a wheel burst; update the object on each event; clear the gesture after the timer. Canvas zoom calls only `setZoom` and never `remember()`.

Pass the callbacks to `StandaloneDrawingCanvas`:

```tsx
onCanvasZoom={setZoom}
onScaleObject={(objectId, patch) => scaleSelectedObject(objectId, patch)}
```

- [ ] **Step 5: Run focused interaction and transform tests**

Run: `npm.cmd test -- src/lib/__tests__/drawingCanvasInteraction.test.ts src/lib/__tests__/drawingTransform.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit wheel routing**

```powershell
git add -- src/components/drawings/standalone/StandaloneDrawingCanvas.tsx src/pages/DrawingWorkbenchPage.tsx src/lib/__tests__/drawingCanvasInteraction.test.ts
git commit -m "feat: route wheel zoom by pointer target"
```

---

### Task 4: Add Backward-Compatible Table Layout Geometry

**Files:**
- Modify: `src/types/drawing.ts`
- Create: `src/lib/drawingTableLayout.ts`
- Create: `src/lib/__tests__/drawingTableLayout.test.ts`
- Modify: `src/lib/drawingDocument.ts`
- Modify: `src/lib/drawingRenderer.ts`
- Modify: `src/lib/drawingExport.ts`

**Interfaces:**
- Consumes: any drawing table object, including legacy objects with no layout fields.
- Produces: `resolveDrawingTableLayout`, `getDrawingTableTargetObject`, `resizeDrawingTableCell`, `resizeDrawingTableText`, and `scaleDrawingTable`.

- [ ] **Step 1: Add failing layout tests**

```ts
it('resolves legacy tables without stored layout', () => {
  const layout = resolveDrawingTableLayout(legacyTable);
  expect(layout.showTitleRow).toBe(true);
  expect(layout.columnWidths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(legacyTable.width);
  expect(layout.rowHeights).toHaveLength(legacyTable.rows.length);
});

it('resizes the selected cell by changing its whole column and row', () => {
  const patch = resizeDrawingTableCell(table, { rowIndex: 1, columnIndex: 0 }, { width: 140, height: 32 });
  expect(patch.columnWidths?.[0]).toBe(140);
  expect(patch.rowHeights?.[1]).toBe(32);
});

it('scales table layout and text around the table center', () => {
  const patch = scaleDrawingTable(table, 2);
  expect(patch).toMatchObject({ x: table.x - table.width / 2, y: table.y - table.height / 2, width: table.width * 2, height: table.height * 2 });
  expect(patch.columnWidths).toEqual(table.columnWidths?.map((value) => value * 2));
  expect(patch.style?.fontSize).toBe(table.style.fontSize * 2);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingTableLayout.test.ts`

Expected: FAIL because the layout module and optional fields do not exist.

- [ ] **Step 3: Extend table types with optional layout fields**

```ts
export type DrawingTableTextSize = { width: number; height: number; fontSize: number };
export type DrawingTableLayoutFields = {
  showTitleRow?: boolean;
  columnWidths?: number[];
  titleRowHeight?: number;
  headerRowHeight?: number;
  rowHeights?: number[];
  textSizes?: Record<string, DrawingTableTextSize>;
};
```

Intersect each of `DrawingTableObject`, `DrawingBomTableObject`, and `DrawingWiringTableObject` with `DrawingTableLayoutFields`. Keep every new field optional.

- [ ] **Step 4: Implement normalized layout and target objects**

Use constants `DEFAULT_TITLE_ROW_HEIGHT = 22`, `DEFAULT_TABLE_ROW_HEIGHT = 18`, `MIN_TABLE_COLUMN_WIDTH = 28`, `MIN_TABLE_ROW_HEIGHT = 16`, and `MIN_TABLE_FONT_SIZE = 8`. `resolveDrawingTableLayout` must normalize array lengths without mutating the source object and default `showTitleRow` to `true` for legacy tables.

`getDrawingTableTargetObject(table, target)` returns a virtual `DrawingObject`-compatible rectangle in document coordinates with the table rotation. Cell bounds come from cumulative column widths and title/header/data row heights. Text bounds use the same key strings already used by `textOffsets`: `title`, `column-N`, and `row-R-column-C`.

- [ ] **Step 5: Implement cell, text, and whole-table mutations**

`resizeDrawingTableCell` changes only the addressed column width and data/header row height, clamps minimums, and updates overall table width/height to the sum of layout dimensions. `resizeDrawingTableText` writes a keyed `textSizes` record and preserves existing `textOffsets`. `scaleDrawingTable` scales geometry, all stored/resolved row and column sizes, text offsets, text sizes, stroke width, and font size by one factor.

- [ ] **Step 6: Parameterize custom-table creation**

Add:

```ts
export type DrawingTableCreateInput = { rowCount: number; columnCount: number; showTitleRow: boolean };

export function createDrawingTableObject(point: DrawingPoint, input: DrawingTableCreateInput): DrawingTableObject {
  const columns = Array.from({ length: input.columnCount }, (_, index) => `列${index + 1}`);
  const rows = Array.from({ length: input.rowCount }, () => Object.fromEntries(columns.map((column) => [column, ''])));
  return { ...objectBase('table', point, Math.max(180, input.columnCount * 90), 0), kind: 'table', title: '表格', columns, rows, showTitleRow: input.showTitleRow };
}
```

Set the final height from the resolved title/header/data row heights. Keep `createDrawingResourceObject('table', point)` delegating to defaults `{ rowCount: 3, columnCount: 3, showTitleRow: true }` for existing callers.

- [ ] **Step 7: Make Canvas and export table rendering use resolved layout**

Replace hard-coded `titleHeight`, `rowHeight`, and equal `columnWidth` calculations in `drawingRenderer.ts` and `drawingExport.ts` with `resolveDrawingTableLayout`. Skip the title row and its separator when `showTitleRow` is false. Apply cumulative column positions, individual row heights, per-key text offsets/sizes, and the resolved font size in both Canvas and SVG output; PDF and PNG already consume these render/export paths.

- [ ] **Step 8: Run layout, renderer, and export tests**

Run: `npm.cmd test -- src/lib/__tests__/drawingTableLayout.test.ts src/lib/__tests__/drawingCanvasTemplates.test.ts src/lib/__tests__/drawingExportCompletion.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit the table model unit**

```powershell
git add -- src/types/drawing.ts src/lib/drawingTableLayout.ts src/lib/__tests__/drawingTableLayout.test.ts src/lib/drawingDocument.ts src/lib/drawingRenderer.ts src/lib/drawingExport.ts src/lib/__tests__/drawingCanvasTemplates.test.ts src/lib/__tests__/drawingExportCompletion.test.ts
git commit -m "feat: add backward-compatible table layout geometry"
```

---

### Task 5: Add the Table Creation Dialog

**Files:**
- Create: `src/components/drawings/standalone/DrawingTableCreateDialog.tsx`
- Modify: `src/pages/DrawingWorkbenchPage.tsx`
- Modify: `src/lib/__tests__/drawingWorkbenchUi.test.ts`

**Interfaces:**
- Consumes: `open`, `onClose`, and `onConfirm(input: DrawingTableCreateInput)`.
- Produces: validated `rowCount`, `columnCount`, and `showTitleRow`.

- [ ] **Step 1: Write failing dialog wiring tests**

```ts
it('opens a parameter dialog before creating a custom table', () => {
  const page = readFileSync('src/pages/DrawingWorkbenchPage.tsx', 'utf8');
  const dialog = readFileSync('src/components/drawings/standalone/DrawingTableCreateDialog.tsx', 'utf8');
  expect(page).toContain('setTableDialogOpen(true)');
  expect(page).toContain('<DrawingTableCreateDialog');
  expect(dialog).toContain('数据行数');
  expect(dialog).toContain('列数');
  expect(dialog).toContain('显示表名行');
  expect(dialog).toContain('onConfirm({ rowCount, columnCount, showTitleRow })');
});
```

- [ ] **Step 2: Run the UI test and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingWorkbenchUi.test.ts`

Expected: FAIL because the dialog does not exist and toolbar action still creates immediately.

- [ ] **Step 3: Implement the accessible dialog**

Model it after `DrawingPdfExportDialog`: modal backdrop, Escape close, labeled numeric inputs, checkbox, Cancel, and Confirm. Initialize to 3 rows, 3 columns, and title row enabled. Accept integers in ranges 1–100 rows and 1–20 columns. Show `请输入 1 到 100 之间的整数。` or `请输入 1 到 20 之间的整数。` next to the invalid field and disable Confirm until valid.

- [ ] **Step 4: Wire toolbar creation through the dialog**

Change `onAddTable` to break the active drawing path and open the dialog. On confirm, call `createDrawingTableObject` at the existing collision-aware default placement, add/select the table, close the resource panel and dialog, and preserve the existing single undo entry made by `addObject`.

- [ ] **Step 5: Run the focused UI and document tests**

Run: `npm.cmd test -- src/lib/__tests__/drawingWorkbenchUi.test.ts src/lib/__tests__/drawingTableLayout.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the dialog unit**

```powershell
git add -- src/components/drawings/standalone/DrawingTableCreateDialog.tsx src/pages/DrawingWorkbenchPage.tsx src/lib/__tests__/drawingWorkbenchUi.test.ts
git commit -m "feat: configure tables before creation"
```

---

### Task 6: Add Table, Cell, and Text Selection Handles

**Files:**
- Modify: `src/types/drawing.ts`
- Modify: `src/lib/drawingTableLayout.ts`
- Modify: `src/components/drawings/standalone/StandaloneDrawingCanvas.tsx`
- Modify: `src/components/drawings/standalone/StandaloneDrawingSelectionOverlay.tsx`
- Modify: `src/lib/__tests__/drawingTableLayout.test.ts`
- Modify: `src/lib/__tests__/drawingCanvasTemplates.test.ts`
- Modify: `src/lib/__tests__/drawingCanvasInteraction.test.ts`

**Interfaces:**
- Consumes: `DrawingTableLocalTarget = { kind: 'table-cell' | 'table-text'; objectId: string; key: string; rowIndex?: number; columnIndex?: number }`.
- Produces: a single virtual transform object and target-specific resize/move patches.

- [ ] **Step 1: Write failing target-selection tests**

```ts
it('selects exactly one table interaction level and renders its eight handles', () => {
  expect(canvasSource).toContain("kind: 'table-cell'");
  expect(canvasSource).toContain("kind: 'table-text'");
  expect(canvasSource).toContain('setTableTarget(');
  expect(canvasSource).toContain('getDrawingTableTargetObject');
  expect(canvasSource).toContain('showRotation={tableTarget?.kind ===');
});
```

Add pure tests that calculate the exact document-coordinate bounds for a cell and text target at a non-unit zoom and rotated table.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingTableLayout.test.ts src/lib/__tests__/drawingCanvasTemplates.test.ts src/lib/__tests__/drawingCanvasInteraction.test.ts`

Expected: FAIL because local table targets are not modeled or rendered.

- [ ] **Step 3: Add local target state and hit ownership**

Store `tableTarget` inside `StandaloneDrawingCanvas`. Selecting a different document object, clearing selection, switching away from select mode, deleting the owning table, or starting content editing clears it. `DrawingTableLayer` reports:

```ts
onSelectTarget({ kind: 'table-text', objectId: object.id, key: target.key, rowIndex, columnIndex })
onSelectTarget({ kind: 'table-cell', objectId: object.id, key, rowIndex, columnIndex })
```

Use pointer-down propagation rules so text owns its glyph area, cell owns remaining cell space, and table border/title-row empty space owns the table.

- [ ] **Step 4: Render a single overlay for the active target**

Compute `activeTransformObject` as the local target's virtual object or the existing selected object. Pass it to the existing `StandaloneDrawingSelectionOverlay`. Add `showRotation?: boolean` defaulting to `true`; set it to `false` for cell and text targets while keeping all eight resize handles. Hide the overlay during `contentEditable` table text editing.

- [ ] **Step 5: Route pointer resize by target kind**

At resize start, snapshot the table and local target. During pointer move:

- table target: existing `resizeDrawingObject`, followed by proportional `scaleDrawingTable` layout normalization;
- cell target: convert the virtual target size into `resizeDrawingTableCell` width/height, interpreting horizontal handles as column changes and vertical handles as row changes;
- text target: write `textSizes` through `resizeDrawingTableText`.

Call `onStartEdit` exactly once per gesture and `onUpdateObject` for live patches. Keep minimum row, column, and font sizes from Task 4.

- [ ] **Step 6: Preserve text and whole-table dragging**

Retain existing `textOffsets` dragging for a selected text target. Table border/title empty-area drag continues to change table `x`/`y`. A cell-body drag does not detach or freely move the cell; it only selects the cell, with resizing performed by handles.

- [ ] **Step 7: Extend wheel routing to local table targets**

When the pointer lies inside the active local target, scale that target:

- cell: scale its corresponding column width and row height;
- text: scale its text size and font size;
- table: scale the whole table layout.

Use the same 20%–500% gesture limits and grouped undo semantics as ordinary object wheel scaling. Outside the active local target, scale the canvas.

- [ ] **Step 8: Run all focused drawing tests**

Run: `npm.cmd test -- src/lib/__tests__/drawingTableLayout.test.ts src/lib/__tests__/drawingCanvasTemplates.test.ts src/lib/__tests__/drawingCanvasInteraction.test.ts src/lib/__tests__/drawingTransform.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit table interaction handles**

```powershell
git add -- src/types/drawing.ts src/lib/drawingTableLayout.ts src/components/drawings/standalone/StandaloneDrawingCanvas.tsx src/components/drawings/standalone/StandaloneDrawingSelectionOverlay.tsx src/lib/__tests__/drawingTableLayout.test.ts src/lib/__tests__/drawingCanvasTemplates.test.ts src/lib/__tests__/drawingCanvasInteraction.test.ts
git commit -m "feat: distinguish table cell and text transforms"
```

---

### Task 7: Full Verification and Browser Walkthrough

**Files:**
- Modify only files required by failures found during verification.

**Interfaces:**
- Consumes: all completed task outputs.
- Produces: a passing, browser-verified feature set with no unrelated staged files.

- [ ] **Step 1: Run the full automated test suite**

Run: `npm.cmd test`

Expected: all Vitest files and tests pass.

- [ ] **Step 2: Run static checks and production build**

```powershell
npm.cmd run lint
npm.cmd run build
git diff --check
```

Expected: lint and build exit 0; `git diff --check` reports no whitespace errors. The existing Vite chunk-size advisory is non-blocking.

- [ ] **Step 3: Start the local app for browser verification**

Run: `npm.cmd run dev -- --host localhost`

Open `http://localhost:<reported-port>`; use `localhost`, not `127.0.0.1`, if the local browser security policy blocks the numeric loopback address.

- [ ] **Step 4: Walk through error localization**

Trigger or stub missing `catalog_items`, missing `drawing_icons`, network, and generic errors. Confirm every visible message and retry control is Chinese, while the browser console retains the original error.

- [ ] **Step 5: Walk through wheel zoom**

Select an unlocked object and wheel inside it: the object scales around its center with eight handles. Wheel outside it: the canvas scales with the top-left fixed. Repeat for a locked object, min/max zoom, undo, and redo.

- [ ] **Step 6: Walk through table creation and transforms**

Create tables with and without a title row. Confirm row count excludes title/header rows. Click table border, cell blank area, and text in turn; only the matching eight-handle overlay appears. Resize columns/rows, move text, move the whole table, wheel-scale each active target, and confirm cells never detach from the grid.

- [ ] **Step 7: Verify exports**

Export a modified table to PDF, PNG, and SVG through existing app actions. Confirm row heights, column widths, optional title row, text position, and font sizes match the workbench.

- [ ] **Step 8: Inspect final scope and commit verification fixes if any**

```powershell
git status --short
git diff --stat
git diff --check
```

Stage only files belonging to this plan. Do not stage `.claude/`, the earlier crosshair plan, or unrelated user changes. If verification required code fixes, commit them with:

```powershell
git commit -m "fix: complete drawing interaction verification"
```

# Default Drawing Tables and Material Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize every newly created Drawing Workbench document with the specified BOM, revision, and merged title tables, and provide current/company material management with real XLSX export.

**Architecture:** Extend the existing backward-compatible drawing-table model with optional semantic roles and merged-cell rectangles, then make DOM, Canvas, and SVG renderers consume one resolved-cell layout. Keep BOM mutations and XLSX formatting in pure library modules, isolate Supabase company-material writes behind a repository gateway, and wire focused dialogs into `DrawingWorkbenchPage` without changing other application modules.

**Tech Stack:** React 19, TypeScript 6, Zustand, Supabase JS, Vitest, Tailwind CSS, SheetJS `xlsx`.

## Global Constraints

- Only newly created documents in the Drawing Workbench receive the three-table layout; persisted drawings are never migrated or replaced.
- Keep the hidden `title-block` metadata object, but create exactly three visible default tables and no default wiring table.
- Preserve existing selection, eight-handle transforms, whole-table dragging, wheel scaling, and two-stage editing for non-BOM tables.
- Reuse one merged-cell geometry source for DOM, Canvas, SVG, PNG, and PDF output.
- All user-facing failures must be Chinese through `getUserErrorMessage`.
- Use test-first changes and the existing project structure; do not refactor unrelated modules.

---

### Task 1: Default three-table document and merged-cell geometry

**Files:**
- Modify: `src/types/drawing.ts`
- Modify: `src/lib/drawingDocument.ts`
- Modify: `src/lib/drawingTableLayout.ts`
- Test: `src/lib/__tests__/drawingTableLayout.test.ts`
- Create: `src/lib/__tests__/drawingDefaultTables.test.ts`

**Interfaces:**
- Produces: `DrawingTableRole = 'bom' | 'revision' | 'title-block'`.
- Produces: `DrawingTableMerge = { rowIndex: number; columnIndex: number; rowSpan: number; columnSpan: number }`, where header row is `-1` and data rows start at `0`.
- Produces: `resolveDrawingTableCells(table): ResolvedDrawingTableCell[]`, including `key`, row/column indices, value, bounds, header state, and span.
- Produces: `formatDrawingDate(date?: Date): string` using local `YYYY.MM.DD`.

- [ ] **Step 1: Write failing default-table and merged-cell tests**

Add assertions that `createBlankDrawingDocument('测试图纸', new Date(2026, 6, 15))` has one hidden title block and exactly three visible tables with roles `bom`, `revision`, and `title-block`. Assert BOM has the six required columns and zero rows; revision has two data rows and `2026.07.15`; title block has nine columns, four data rows, the exact merge rectangles, and `1 of 1`.

Add a layout test with merges at header `{ rowIndex: -1, columnIndex: 0, rowSpan: 1, columnSpan: 2 }` and body `{ rowIndex: 0, columnIndex: 0, rowSpan: 2, columnSpan: 1 }`. Assert covered cells are omitted and master-cell width/height equal the summed column widths/row heights.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingDefaultTables.test.ts src/lib/__tests__/drawingTableLayout.test.ts`

Expected: FAIL because table roles, merges, dynamic date injection, and `resolveDrawingTableCells` do not exist.

- [ ] **Step 3: Extend optional table fields and cell resolver**

Add optional fields to `DrawingTableLayoutFields`:

```ts
tableRole?: 'bom' | 'revision' | 'title-block';
mergedCells?: DrawingTableMerge[];
projectionCellKey?: string;
```

Implement `resolveDrawingTableCells` from resolved column widths and row heights. Normalize invalid spans to the available grid, treat `rowIndex: -1` as the header, skip cells covered by another merge, and retain legacy one-cell spans when no merges exist. Update local target bound resolution to use the merged master cell when its key matches.

- [ ] **Step 4: Create the exact default objects**

Change `createBlankDrawingDocument` to accept optional `Date` only for deterministic tests. Build:

```ts
objects: [titleBlock, createBomTable(), createRevisionTable(date), createTitleInformationTable(titleBlock.drawingNo, date)]
```

Use `showTitleRow: false`; BOM at the lower left with no rows; revision at upper right with two rows; title block at lower right with header plus four rows and merges for row 1 C1-C5/C6-C9, rows 2-3 C7-C9, rows 4-5 C1-C2, row 5 C4-C5/C7-C9. Set the projection merge master key to `row-2-column-0`.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm.cmd test -- src/lib/__tests__/drawingDefaultTables.test.ts src/lib/__tests__/drawingTableLayout.test.ts`

Expected: PASS.

---

### Task 2: Unified merged-table rendering and BOM double-click event

**Files:**
- Modify: `src/lib/drawingRenderer.ts`
- Modify: `src/lib/drawingExport.ts`
- Modify: `src/components/drawings/standalone/StandaloneDrawingCanvas.tsx`
- Test: `src/lib/__tests__/drawingExportCompletion.test.ts`
- Test: `src/lib/__tests__/drawingCanvasTemplates.test.ts`
- Test: `src/lib/__tests__/drawingCanvasInteraction.test.ts`

**Interfaces:**
- Consumes: `resolveDrawingTableCells`.
- Adds to `StandaloneDrawingCanvasProps`: `onOpenMaterialTable?: (objectId: string) => void`.
- Produces: projection icon drawing for `projectionCellKey` in DOM/Canvas/SVG.

- [ ] **Step 1: Write failing renderer and interaction tests**

Assert serialized SVG for the default title table contains one rectangle per resolved cell, does not draw internal lines through merged regions, contains `data-table-cell="row-2-column-0"`, and includes a projection-symbol group. Add source-level interaction assertions that `StandaloneDrawingCanvas` exposes `onOpenMaterialTable`, passes it to the table layer, and handles BOM double-click before local text editing.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingExportCompletion.test.ts src/lib/__tests__/drawingCanvasTemplates.test.ts src/lib/__tests__/drawingCanvasInteraction.test.ts`

Expected: FAIL because renderers still draw full grid lines and no BOM open callback exists.

- [ ] **Step 3: Render resolved cells in Canvas and SVG**

Replace independent vertical/horizontal full-grid construction with iteration over `resolveDrawingTableCells`. Each cell draws its own rectangle and clipped text using the existing text key and offsets. For `projectionCellKey`, draw a compact first-angle projection symbol using a frustum outline, center axis, and circle; add matching SVG markup with `data-projection-symbol="true"`.

- [ ] **Step 4: Render resolved cells in the DOM table layer**

Use one CSS grid whose columns and rows come from resolved geometry. Render only resolved cells, set `gridColumn`/`gridRow` spans, and preserve the existing pointer, local-target, contentEditable, drag, and resize handlers with each cell's original key and indices. Add `data-table-cell={cell.key}` for deterministic testing.

On `onDoubleClickCapture`, if `object.tableRole === 'bom'`, prevent default/propagation and call `onOpenMaterialTable(object.id)`. Non-BOM tables continue through the existing local double-click policy.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm.cmd test -- src/lib/__tests__/drawingExportCompletion.test.ts src/lib/__tests__/drawingCanvasTemplates.test.ts src/lib/__tests__/drawingCanvasInteraction.test.ts`

Expected: PASS.

---

### Task 3: Current BOM logic and company-material repository

**Files:**
- Create: `src/lib/drawingMaterials.ts`
- Create: `src/lib/drawingMaterialRepository.ts`
- Modify: `src/lib/drawingCatalogRepository.ts`
- Test: `src/lib/__tests__/drawingMaterials.test.ts`
- Create: `src/lib/__tests__/drawingMaterialRepository.test.ts`

**Interfaces:**
- Produces: `DrawingMaterialInput = { code: string; nameAndSpecification: string; unit: string; quantity: string; note: string }`.
- Produces: `appendDrawingMaterial(table, input): DrawingBomTableObject` and `renumberDrawingMaterials(rows)`.
- Produces: `CompanyMaterial = { id: string; code: string; nameAndSpecification: string; unit: string; note: string }`.
- Produces: `DrawingMaterialRepository.list(query?)` and `create(input)`.

- [ ] **Step 1: Write failing pure BOM tests**

Test that appending two inputs creates rows with exact keys and serials `1`, `2`, leaves the source table unchanged, and rejects no fields itself (validation remains UI-owned). Test `renumberDrawingMaterials` after arbitrary input serials.

- [ ] **Step 2: Run pure tests and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingMaterials.test.ts`

Expected: FAIL because `drawingMaterials.ts` does not exist.

- [ ] **Step 3: Implement pure BOM mutations**

Use the six fixed Chinese keys, trim input strings, append immutably, and regenerate all serial values from the row index.

- [ ] **Step 4: Write failing repository tests**

Use a fake gateway that records calls. Assert list returns only active, nondeleted accessory rows and matches query against code/name/specification/note. Assert create calls `insertDraft`, `insertSpecification`, then `activate` with code mapped to model, name mapped to resource name, note mapped to short description, and unit/specification mapped to accessory spec.

- [ ] **Step 5: Run repository tests and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingMaterialRepository.test.ts`

Expected: FAIL because repository interfaces and implementation do not exist.

- [ ] **Step 6: Implement repository and Supabase gateway**

Create a small gateway interface for list/insert-spec/update operations and a Supabase adapter using category `30000000-0000-4000-8000-000000000004`. Generate a lowercase constraint-safe `legacy_key` from the code plus a time suffix. Insert `catalog_items` as `draft`, insert `accessory_specs` with `accessory_kind: 'drawing-material'`, then update lifecycle to `active`. Throw `DrawingMaterialError` with the Supabase message at every failure.

Change `DrawingCatalogRepository.listResources` to include only `lifecycle_status === 'active'`, matching the approved design.

- [ ] **Step 7: Run tests and verify GREEN**

Run: `npm.cmd test -- src/lib/__tests__/drawingMaterials.test.ts src/lib/__tests__/drawingMaterialRepository.test.ts src/lib/__tests__/drawingCatalogRepository.test.ts`

Expected: PASS.

---

### Task 4: XLSX export and material dialogs

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/drawingMaterialExport.ts`
- Create: `src/components/drawings/standalone/DrawingMaterialFormDialog.tsx`
- Create: `src/components/drawings/standalone/DrawingMaterialTableDialog.tsx`
- Create: `src/lib/__tests__/drawingMaterialExport.test.ts`
- Modify: `src/lib/__tests__/drawingWorkbenchUi.test.ts`

**Interfaces:**
- Produces: `createDrawingMaterialWorkbook(table)` and `downloadDrawingMaterialXlsx(drawing, table)`.
- Material table dialog receives `drawing`, `table`, `onAddCurrent`, and `onClose`.
- Form dialog receives mode `current | company`, optional defaults, company-material suggestions, and async submit callback.

- [ ] **Step 1: Install SheetJS**

Run: `npm.cmd install xlsx`

Expected: `xlsx` added to dependencies and lockfile updated.

- [ ] **Step 2: Write failing XLSX tests**

Assert workbook sheet `物料表` has the six headers in fixed order, preserves current rows, exports an empty header-only sheet, and filename helper returns `WH-NEW-物料表.xlsx` with document-name fallback.

- [ ] **Step 3: Run XLSX tests and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingMaterialExport.test.ts`

Expected: FAIL because the export module does not exist.

- [ ] **Step 4: Implement XLSX export**

Use `XLSX.utils.aoa_to_sheet`, `book_new`, `book_append_sheet`, and `XLSX.writeFile`. Reuse `safeFilename`; always include the header row.

- [ ] **Step 5: Write failing UI contract tests**

Assert dialog sources contain both tabs, all required labels/placeholders/buttons, `role="dialog"`, retry UI, company row “添加”, and calls to `downloadDrawingMaterialXlsx`, `drawingMaterialRepository.list`, and `drawingMaterialRepository.create`.

- [ ] **Step 6: Run UI tests and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingWorkbenchUi.test.ts`

Expected: FAIL because material dialogs do not exist.

- [ ] **Step 7: Implement the dialogs**

Build accessible centered Tailwind dialogs consistent with existing standalone dialogs. Validate code/name/unit and positive numeric quantity for current-BOM mode; company mode validates code/name/unit and hides quantity. Load company data only while the parent dialog is open, display Chinese loading/error/retry states, filter on Search, clear on Reset, and use `getUserErrorMessage` for list/create/export failures.

- [ ] **Step 8: Run tests and verify GREEN**

Run: `npm.cmd test -- src/lib/__tests__/drawingMaterialExport.test.ts src/lib/__tests__/drawingWorkbenchUi.test.ts`

Expected: PASS.

---

### Task 5: Drawing Workbench integration and acceptance

**Files:**
- Modify: `src/pages/DrawingWorkbenchPage.tsx`
- Test: `src/lib/__tests__/drawingWorkbenchUi.test.ts`

**Interfaces:**
- Consumes: BOM callback from canvas, material dialog callbacks, `appendDrawingMaterial`, and XLSX export.
- Produces: one undo entry for every current-BOM append.

- [ ] **Step 1: Add failing page-wiring assertions**

Assert the page stores the open BOM table id, passes `onOpenMaterialTable` to the canvas, renders `DrawingMaterialTableDialog`, and updates the target table through the existing `remember()` and `updateObject()` flow.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingWorkbenchUi.test.ts`

Expected: FAIL because the page is not wired.

- [ ] **Step 3: Wire the page**

Add `materialTableObjectId` state, resolve only an existing `bom-table`, open it from canvas double-click, and close safely if the object disappears. On add, call `remember()` once and patch only the BOM table rows. Render the material dialog next to existing standalone dialogs.

- [ ] **Step 4: Run focused and full automated verification**

Run:

```powershell
npm.cmd test -- src/lib/__tests__/drawingWorkbenchUi.test.ts src/lib/__tests__/drawingDefaultTables.test.ts src/lib/__tests__/drawingTableLayout.test.ts src/lib/__tests__/drawingMaterialRepository.test.ts src/lib/__tests__/drawingMaterialExport.test.ts
npm.cmd test
npm.cmd run lint
npm.cmd run build
git diff --check
```

Expected: every command exits 0; the existing Vite bundle-size warning is acceptable.

- [ ] **Step 5: Browser acceptance**

At `http://localhost:<vite-port>/drawing-workbench`, clear only the `standalone-drawing-library` local-storage entry so a new document is created. Verify the three-table layout and date; whole-table selection/drag/wheel scale; BOM double-click; both tabs; current-material add; company search/reset; company create error/success state depending on configured Supabase; XLSX download; and title-table merged layout. Export SVG/PDF and visually compare merged cells.

- [ ] **Step 6: Commit implementation**

Stage only files from this plan and commit with:

```powershell
git commit -m "feat: add default drawing tables and material management"
```

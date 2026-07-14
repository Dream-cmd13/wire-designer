# Drawing Workbench Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the confirmed public-Supabase drawing wizard and full standalone drawing workbench workflow, including interactive drawing, selection, layers, locking, two-level Ctrl+X splitting, and verified exports.

**Architecture:** Keep `DrawingWorkbenchPage` as the orchestration boundary and extend the existing `DrawingDocument` scene model with focused pure document commands, resource repository APIs, and tool-mode canvas callbacks. Supabase remains the single public resource source; the existing Canvas renderer, DOM table editor, Zustand persistence, and export paths remain authoritative.

**Tech Stack:** React 19, TypeScript 6, Zustand 5, Supabase JS 2, HTML Canvas, Vitest 3, Vite 8, PostgreSQL SQL.

## Global Constraints

- Resources are public and read uniformly from Supabase; do not add private ownership or user isolation.
- Support only single-end and double-end topologies; do not expose `1:1:N`.
- Keep the current React, Canvas, Zustand, Supabase, and export stack; do not introduce a new canvas framework.
- Preserve the current project structure and coding style, and apply minimal focused changes.
- `Ctrl+X` means progressive split and does not implement conventional cut.
- Do not silently fall back to local fake resources after a Supabase failure.
- Preserve the base title block when clearing the canvas.
- Do not modify or stage the existing untracked `.claude/` directory.

---

## File Structure

- `supabase/sql/10_schema/02_catalog.sql`: canonical public catalog schema and new resource specification tables.
- `supabase/sql/10_schema/04_drawing_resources.sql`: canonical drawing template, phrase, and icon tables.
- `supabase/sql/30_security/01_rls.sql`: public read policies for new resource tables.
- `supabase/sql/40_seed/03_drawing_workbench_resources.sql`: idempotent public mock resources and drawing templates.
- `supabase/sql/50_upgrade/01_drawing_workbench_resources.sql`: non-destructive upgrade for an existing database.
- `src/types/drawing.ts`: standalone scene, resource, wizard, group, and icon types.
- `src/lib/drawingCatalogRepository.ts`: Supabase reads and deterministic client-side filtering.
- `src/lib/drawingCommands.ts`: pure clear, lock, layer, selection, draw-object, and split commands.
- `src/lib/drawingGenerator.ts`: wizard validation and generated grouped wire geometry.
- `src/components/drawings/standalone/StandaloneDrawingWizard.tsx`: four-step Supabase-backed wizard.
- `src/components/drawings/workbench/DrawingResourcePanel.tsx`: public resource browser and insertion requests.
- `src/components/drawings/workbench/DrawingToolbar.tsx`: visible workbench tools and active-mode state.
- `src/components/drawings/standalone/StandaloneDrawingCanvas.tsx`: pointer drawing, box selection, multi-selection, and temporary preview.
- `src/components/drawings/standalone/StandaloneDrawingInspector.tsx`: multi-selection style, layer, lock, and split controls.
- `src/pages/DrawingWorkbenchPage.tsx`: history, keyboard routing, dialogs, repository loading, and command orchestration.
- `src/lib/drawingRenderer.ts`: group, icon, selection, and preview rendering.
- `src/lib/drawingExport.ts`: export support for every new scene object.

---

### Task 1: Supabase public drawing resources, upgrade SQL, and seed data

**Files:**
- Modify: `supabase/sql/10_schema/02_catalog.sql`
- Create: `supabase/sql/10_schema/04_drawing_resources.sql`
- Modify: `supabase/sql/30_security/01_rls.sql`
- Create: `supabase/sql/40_seed/03_drawing_workbench_resources.sql`
- Create: `supabase/sql/50_upgrade/01_drawing_workbench_resources.sql`
- Modify: `supabase/sql/README.md`

**Interfaces:**
- Consumes: existing `catalog_items`, `catalog_categories`, `catalog_item_images`, and lifecycle columns.
- Produces: `model_specs`, `accessory_specs`, `packaging_specs`, `drawing_templates`, `drawing_template_versions`, `drawing_common_phrases`, and `drawing_icons`.

- [ ] **Step 1: Add a static SQL contract test that fails before the schema exists**

Create `src/lib/__tests__/drawingResourceSql.test.ts` with assertions for every required table, enum value, unique constraint, seed upsert, and upgrade statement:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('drawing workbench SQL resources', () => {
  it('defines canonical and upgrade tables with idempotent seed data', () => {
    const catalog = read('supabase/sql/10_schema/02_catalog.sql');
    const drawing = read('supabase/sql/10_schema/04_drawing_resources.sql');
    const upgrade = read('supabase/sql/50_upgrade/01_drawing_workbench_resources.sql');
    const seed = read('supabase/sql/40_seed/03_drawing_workbench_resources.sql');
    for (const value of ['model', 'accessory', 'packaging']) {
      expect(`${catalog}\n${upgrade}`).toContain(`'${value}'`);
    }
    for (const table of ['model_specs', 'accessory_specs', 'packaging_specs']) {
      expect(`${catalog}\n${upgrade}`).toContain(`table if not exists public.${table}`);
    }
    for (const table of ['drawing_templates', 'drawing_template_versions', 'drawing_common_phrases', 'drawing_icons']) {
      expect(`${drawing}\n${upgrade}`).toContain(`table if not exists public.${table}`);
    }
    expect(drawing).toContain('unique (template_id, version_no)');
    expect(seed).toContain('on conflict');
    expect(seed).toContain('UL1007');
    expect(seed).toContain('XH2.54');
  });
});
```

- [ ] **Step 2: Run the SQL contract test and verify failure**

Run: `npm test -- --run src/lib/__tests__/drawingResourceSql.test.ts`
Expected: FAIL because the new SQL files and enum values are absent.

- [ ] **Step 3: Implement canonical tables and non-destructive upgrade**

Use the following exact shapes in canonical and upgrade SQL; the upgrade first adds enum values with `alter type public.catalog_item_type add value if not exists`:

```sql
create table if not exists public.model_specs (
  catalog_item_id uuid primary key references public.catalog_items(id) on delete cascade,
  model_kind text not null,
  default_width_mm numeric(12,3) not null check (default_width_mm > 0),
  default_height_mm numeric(12,3) not null check (default_height_mm > 0),
  default_orientation text not null default 'none',
  model_parameters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accessory_specs (
  catalog_item_id uuid primary key references public.catalog_items(id) on delete cascade,
  accessory_kind text not null,
  specification text not null,
  material text,
  color text,
  unit text not null default 'PCS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.packaging_specs (
  catalog_item_id uuid primary key references public.catalog_items(id) on delete cascade,
  packaging_kind text not null,
  specification text not null,
  unit text not null default 'PCS',
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Create drawing tables with UUID primary keys, `deleted_at` soft-delete columns, active/status checks, display-order indexes, JSON schema constraints, and `unique (template_id, version_no)`. `drawing_template_versions.drawing_json` is JSONB and `schema_version` is integer `1`.

- [ ] **Step 4: Add public read policies and idempotent seed rows**

Add `select` policies for both `anon` and `authenticated` roles where rows are active and not deleted. Seed stable UUID rows for XH2.54 connectors, a USB model, UL1007 and shielded wires, heat-shrink and label accessories, coiled-bag packaging, one single-end and one double-end drawing template, three common phrases, and four SVG path icons. Every seed statement uses `on conflict (...) do update`.

- [ ] **Step 5: Document execution order and verify the SQL contract**

Update `supabase/sql/README.md` to list `10_schema/04_drawing_resources.sql`, the existing security script, `40_seed/03_drawing_workbench_resources.sql`, and the alternative `50_upgrade/01_drawing_workbench_resources.sql` for existing databases.

Run: `npm test -- --run src/lib/__tests__/drawingResourceSql.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```powershell
git add supabase/sql src/lib/__tests__/drawingResourceSql.test.ts
git commit -m "feat(db): add public drawing workbench resources"
```

---

### Task 2: Typed public drawing catalog repository

**Files:**
- Modify: `src/types/drawing.ts`
- Create: `src/lib/drawingCatalogRepository.ts`
- Create: `src/lib/__tests__/drawingCatalogRepository.test.ts`

**Interfaces:**
- Produces: `DrawingCatalogResource`, `DrawingCatalogFilters`, `DrawingTemplateSummary`, `DrawingCommonPhrase`, `DrawingIconResource`.
- Produces: `drawingCatalogRepository.listResources(filters)`, `.listTemplates()`, `.loadTemplate(id)`, `.listCommonPhrases()`, and `.listIcons()`.

- [ ] **Step 1: Write failing repository mapping and filtering tests**

Use an injected Supabase-like client so tests do not access the network:

```ts
const repository = new DrawingCatalogRepository(fakeClient);
const rows = await repository.listResources({
  resourceType: 'connector', query: 'xh2.54', gender: 'female', pinCount: 4,
  rowCount: 1, pitchMm: 2.54, category: '线对板连接器', series: 'XH2.54',
});
expect(rows).toEqual([expect.objectContaining({
  name: 'XH2.54-4P', resourceType: 'connector', gender: 'female', pinCount: 4,
  rowCount: 1, pitchMm: 2.54,
})]);
```

Add tests that Supabase errors reject with `DrawingCatalogError`, empty rows return `[]`, and an invalid template schema rejects.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run src/lib/__tests__/drawingCatalogRepository.test.ts`
Expected: FAIL because repository types and methods do not exist.

- [ ] **Step 3: Add resource and template types**

Add these exact public interfaces to `src/types/drawing.ts`:

```ts
export type DrawingCatalogResourceType = 'connector' | 'model' | 'wire' | 'accessory' | 'packaging';
export type DrawingCatalogFilters = {
  resourceType?: DrawingCatalogResourceType;
  query?: string;
  gender?: DrawingConnectorResource['gender'];
  category?: string;
  series?: string;
  pinCount?: number;
  rowCount?: number;
  pitchMm?: number;
};
export type DrawingCatalogResource = {
  id: string; catalogItemId: string; resourceType: DrawingCatalogResourceType;
  name: string; model: string; category: string; imageUrl?: string;
  gender?: DrawingConnectorResource['gender']; series?: string; pinCount?: number;
  rowCount?: number; pitchMm?: number; specification?: string; unit?: string;
};
export type DrawingTemplateSummary = { id: string; name: string; category: string; description: string; thumbnailPath?: string; currentVersion: number };
export type DrawingCommonPhrase = { id: string; category: string; phrase: string };
export type DrawingIconResource = { id: string; name: string; category: string; svgPath: string; defaultWidth: number; defaultHeight: number };
```

- [ ] **Step 4: Implement repository reads and deterministic filtering**

The repository constructor accepts `Pick<SupabaseClient, 'from' | 'storage'>`. Resource rows are mapped first, then exact numeric filters and normalized lowercase text filters are applied. Signed image URL failures leave `imageUrl` undefined but query failures throw `DrawingCatalogError`. `loadTemplate` accepts only schema version `1` and validates `page`, `objects`, and `titleBlock` before returning `DrawingDocument`.

- [ ] **Step 5: Run repository tests**

Run: `npm test -- --run src/lib/__tests__/drawingCatalogRepository.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```powershell
git add src/types/drawing.ts src/lib/drawingCatalogRepository.ts src/lib/__tests__/drawingCatalogRepository.test.ts
git commit -m "feat(drawing): add Supabase public resource repository"
```

---

### Task 3: Pure document commands, multi-selection, layers, locks, and progressive split

**Files:**
- Modify: `src/types/drawing.ts`
- Create: `src/lib/drawingCommands.ts`
- Create: `src/lib/__tests__/drawingCommands.test.ts`
- Modify: `src/lib/drawingDocument.ts`

**Interfaces:**
- Produces: `DrawingGroupObject`, `DrawingIconObject`, `DrawingSelection`.
- Produces: `clearDrawingCanvas`, `toggleDrawingLocks`, `moveDrawingLayers`, `setDrawingLayer`, `splitDrawingObjects`, `createDrawingLineObject`, and `getObjectsInSelectionRect`.

- [ ] **Step 1: Write failing document-command tests**

Cover these exact outcomes:

```ts
expect(clearDrawingCanvas(document).objects.every((object) => object.kind === 'title-block')).toBe(true);
expect(toggleDrawingLocks(document, ['a', 'b']).objects.filter((o) => ['a', 'b'].includes(o.id)).every((o) => o.locked)).toBe(true);
expect(moveDrawingLayers(document, ['a'], 'front').objects.at(-1)?.id).toBe('a');
expect(splitDrawingObjects(document, ['bundle']).changed).toBe(true);
expect(splitDrawingObjects(splitDrawingObjects(document, ['bundle']).document, ['core-1']).document.objects.some((o) => o.kind === 'line')).toBe(true);
expect(splitDrawingObjects(document, ['locked-bundle']).changed).toBe(false);
```

Also test stable `zIndex` normalization, box intersection, orthogonal endpoint snapping, and empty clear/split no-ops.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run src/lib/__tests__/drawingCommands.test.ts`
Expected: FAIL because document command exports do not exist.

- [ ] **Step 3: Add group, icon, and selection scene types**

```ts
export type DrawingGroupObject = DrawingObjectBase & {
  kind: 'group'; groupKind: 'wire-bundle' | 'wire-core'; children: DrawingObject[];
};
export type DrawingIconObject = DrawingObjectBase & {
  kind: 'icon'; name: string; svgPath: string;
};
export type DrawingSelection = { objectIds: string[] };
```

Add `'group' | 'icon'` to `DrawingObjectKind` and both objects to the union. Group children use coordinates relative to the group origin.

- [ ] **Step 4: Implement immutable commands**

```ts
export type DrawingLayerAction = 'front' | 'forward' | 'backward' | 'back';
export function clearDrawingCanvas(document: DrawingDocument): DrawingDocument;
export function toggleDrawingLocks(document: DrawingDocument, objectIds: string[]): DrawingDocument;
export function moveDrawingLayers(document: DrawingDocument, objectIds: string[], action: DrawingLayerAction): DrawingDocument;
export function setDrawingLayer(document: DrawingDocument, objectIds: string[], target: number): DrawingDocument;
export function splitDrawingObjects(document: DrawingDocument, objectIds: string[]): { document: DrawingDocument; changed: boolean; replacementIds: string[] };
export function getObjectsInSelectionRect(document: DrawingDocument, rect: { x: number; y: number; width: number; height: number }): string[];
```

When splitting a group, clone children to page coordinates, preserve effective visibility and lock state, allocate consecutive normalized layers, and replace the parent in place. Locked groups and primitive objects return `changed: false`.

- [ ] **Step 5: Run command and existing drawing tests**

Run: `npm test -- --run src/lib/__tests__/drawingCommands.test.ts src/lib/__tests__/drawingCanvasTemplates.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src/types/drawing.ts src/lib/drawingCommands.ts src/lib/drawingDocument.ts src/lib/__tests__/drawingCommands.test.ts
git commit -m "feat(drawing): add layers locks selection and progressive split"
```

---

### Task 4: Wizard validation, batch wiring, grouped generation, and material count

**Files:**
- Modify: `src/types/drawing.ts`
- Modify: `src/lib/drawingGenerator.ts`
- Create: `src/lib/__tests__/standaloneDrawingGenerator.test.ts`

**Interfaces:**
- Consumes: `DrawingCatalogResource`, `DrawingGroupObject`, and `DrawingWizardDraft`.
- Produces: `applyDrawingWireBatch`, `countDrawingMaterialKinds`, `validateStandaloneDrawingWizard`, and `createDrawingFromWizard`.

- [ ] **Step 1: Write failing generator tests**

Add tests for single-end, double-end reverse mapping, external default mold, missing wire resource, invalid target pins, batch length/color/numbering, read-only material-kind count, first-level wire bundle groups, wiring table, and BOM consistency.

```ts
const reversed = applyDrawingWireBatch(wires, { connection: 'reverse', wireNoPrefix: 'UL-', startNumber: 1 });
expect(reversed.map((wire) => wire.targetPin)).toEqual([4, 3, 2, 1]);
expect(reversed.map((wire) => wire.wireNo)).toEqual(['UL-01', 'UL-02', 'UL-03', 'UL-04']);
expect(countDrawingMaterialKinds(draft)).toBe(4);
expect(createDrawingFromWizard(draft).objects.some((object) => object.kind === 'group' && object.groupKind === 'wire-bundle')).toBe(true);
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run src/lib/__tests__/standaloneDrawingGenerator.test.ts`
Expected: FAIL because wire batch helpers and grouped generation are absent.

- [ ] **Step 3: Extend the wizard draft**

Add `wireResource?: DrawingCatalogResource`, `modelResource?: DrawingCatalogResource`, and `templateId?: string`. Keep the existing topology, connector, length, tolerance, mold, sleeve, and wire fields. Restrict topology to `'single-end' | 'double-end'`.

- [ ] **Step 4: Implement batch helpers and strict validation**

```ts
export type DrawingWireBatch = {
  color?: string; lengthMm?: number; wireNoPrefix?: string; startNumber?: number;
  connection?: 'straight' | 'reverse';
};
export function applyDrawingWireBatch(wires: DrawingWireDraft[], batch: DrawingWireBatch): DrawingWireDraft[];
export function countDrawingMaterialKinds(draft: DrawingWizardDraft): number;
```

Validation errors block generation for missing endpoint resources, missing wire resource, non-positive total/core length, and double-end target pins outside the selected right endpoint.

- [ ] **Step 5: Generate nested wire groups and synchronized tables**

The top wire-bundle group contains one wire-core group per draft row. Each core group contains one line, one wire-number text, and endpoint label objects. Wiring table rows and BOM rows are generated from the same draft and selected catalog resource identities.

- [ ] **Step 6: Run generator tests**

Run: `npm test -- --run src/lib/__tests__/standaloneDrawingGenerator.test.ts src/lib/__tests__/drawingCanvasTemplates.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```powershell
git add src/types/drawing.ts src/lib/drawingGenerator.ts src/lib/__tests__/standaloneDrawingGenerator.test.ts
git commit -m "feat(drawing): generate validated grouped harness drawings"
```

---

### Task 5: Four-step Supabase-backed wizard UI

**Files:**
- Modify: `src/components/drawings/standalone/StandaloneDrawingWizard.tsx`
- Create: `src/components/drawings/standalone/DrawingResourceSelect.tsx`
- Create: `src/components/drawings/standalone/DrawingWireBatchEditor.tsx`
- Create: `src/components/drawings/standalone/__tests__/StandaloneDrawingWizard.test.tsx`

**Interfaces:**
- Consumes: repository methods from Task 2 and generator helpers from Task 4.
- Produces: `StandaloneDrawingWizard` callbacks `onGenerate(drawing)` and `onLoadTemplate(drawing)`.

- [ ] **Step 1: Write failing source-level and behavior tests**

Test that the wizard does not contain `one-to-many`, shows all eight resource filters, loads repository results, renders separate left/right selections, applies reverse wiring, displays derived material count, blocks invalid generation, shows loading/error/retry/empty states, and loads a gallery template through `onLoadTemplate`.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run src/components/drawings/standalone/__tests__/StandaloneDrawingWizard.test.tsx`
Expected: FAIL because the filter UI and injected repository contract are absent.

- [ ] **Step 3: Implement reusable resource selection**

`DrawingResourceSelect` accepts `{ side, resources, filters, selectedId, loading, error, onFiltersChange, onSelect, onRetry }`. Render native inputs/selects for type, query, gender, category, series, PIN, rows, and pitch, followed by selectable resource rows and a visible selected summary.

- [ ] **Step 4: Implement batch wire editor**

`DrawingWireBatchEditor` controls uniform color, length, wire prefix/start number, and straight/reverse connection. Applying a batch calls `applyDrawingWireBatch` once and preserves manual edits made afterward.

- [ ] **Step 5: Implement the confirmed four steps**

Type step exposes internal/external/gallery and single/double only. Resource step renders one or two selectors. Attribute step requires a Supabase wire resource and shows derived material count. Preview step lists blocking errors and enables confirm only when validation has no errors. Gallery uses public templates and emits a validated editable document.

- [ ] **Step 6: Run wizard tests**

Run: `npm test -- --run src/components/drawings/standalone/__tests__/StandaloneDrawingWizard.test.tsx src/lib/__tests__/standaloneDrawingGenerator.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```powershell
git add src/components/drawings/standalone src/lib/__tests__/standaloneDrawingGenerator.test.ts
git commit -m "feat(drawing): complete the public resource drawing wizard"
```

---

### Task 6: Interactive Canvas tools, box selection, and orthogonal drawing

**Files:**
- Modify: `src/components/drawings/standalone/StandaloneDrawingCanvas.tsx`
- Modify: `src/lib/drawingRenderer.ts`
- Create: `src/lib/__tests__/drawingInteraction.test.ts`

**Interfaces:**
- Consumes: `DrawingToolMode`, `DrawingSelection`, and command helpers.
- Produces Canvas callbacks: `onSelectionChange(ids)`, `onCommitObjects(objects)`, and `onCommitObjectPatch(id, patch)`.

- [ ] **Step 1: Write failing interaction tests**

Test coordinate conversion, horizontal/vertical snapping, line completion after two clicks, polyline/curve completion through double-click and Escape, freehand point sampling, selection rectangle normalization, Shift multi-selection, and locked-object drag prevention.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run src/lib/__tests__/drawingInteraction.test.ts`
Expected: FAIL because interaction helpers and tool mode are absent.

- [ ] **Step 3: Add pure interaction helpers**

```ts
export type DrawingToolMode = 'select' | 'line' | 'polyline' | 'curve' | 'freehand';
export function snapOrthogonalPoint(origin: DrawingPoint, point: DrawingPoint): DrawingPoint;
export function normalizeDrawingRect(start: DrawingPoint, end: DrawingPoint): { x: number; y: number; width: number; height: number };
export function sampleFreehandPoint(points: DrawingPoint[], point: DrawingPoint, minimumDistance = 2): DrawingPoint[];
```

Place these in `src/lib/drawingCommands.ts` so Canvas state remains thin and testable.

- [ ] **Step 4: Implement pointer state and temporary previews**

Add props `toolMode`, `orthogonal`, and `selectedObjectIds`. In select mode, empty-pointer drag draws a selection rectangle; Shift toggles hit objects. In draw modes, maintain temporary points locally and render previews without mutating the document. Commit exactly once when a valid object finishes.

- [ ] **Step 5: Render groups, icons, multi-selection, and previews**

Render groups recursively using translated child coordinates. Render icon SVG paths through `Path2D`. Draw one selection rectangle around each selected object plus the active box-selection/line preview. Preserve the existing DOM table overlay and text caret behavior.

- [ ] **Step 6: Run interaction and regression tests**

Run: `npm test -- --run src/lib/__tests__/drawingInteraction.test.ts src/lib/__tests__/drawingCanvasTemplates.test.ts src/lib/__tests__/drawingTextLayout.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```powershell
git add src/components/drawings/standalone/StandaloneDrawingCanvas.tsx src/lib/drawingRenderer.ts src/lib/drawingCommands.ts src/lib/__tests__/drawingInteraction.test.ts
git commit -m "feat(drawing): add interactive canvas drawing and selection"
```

---

### Task 7: Workbench toolbar, public resource panel, inspector, dialogs, and keyboard routing

**Files:**
- Create: `src/components/drawings/workbench/DrawingToolbar.tsx`
- Create: `src/components/drawings/workbench/DrawingResourcePanel.tsx`
- Create: `src/components/drawings/workbench/DrawingInsertDialog.tsx`
- Modify: `src/components/drawings/standalone/StandaloneDrawingInspector.tsx`
- Modify: `src/pages/DrawingWorkbenchPage.tsx`
- Create: `src/lib/__tests__/drawingWorkbenchShortcuts.test.ts`

**Interfaces:**
- Consumes: repository, commands, Canvas tool modes, wizard, and store.
- Produces: complete visible toolbar and the shortcut-to-command dispatcher `getDrawingShortcut(event)`.

- [ ] **Step 1: Write failing shortcut and workbench source tests**

```ts
expect(getDrawingShortcut(key('u', { ctrlKey: true }))).toBe('clear');
expect(getDrawingShortcut(key('x', { ctrlKey: true }))).toBe('split');
expect(getDrawingShortcut(key('q', { shiftKey: true }))).toBe('toggle-orthogonal');
expect(getDrawingShortcut(key('w', { shiftKey: true }))).toBe('line');
expect(getDrawingShortcut(key('e', { shiftKey: true }))).toBe('polyline');
expect(getDrawingShortcut(key('r', { shiftKey: true }))).toBe('curve');
expect(getDrawingShortcut(key('x', { ctrlKey: true, editableTarget: true }))).toBeNull();
```

Source assertions require visible labels for clear canvas, layer settings, lock/unlock, text, number, dimension, orthogonal, line, polyline, curve, line width, sequence, icon, fill, freehand, brush settings, table, and PDF save.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run src/lib/__tests__/drawingWorkbenchShortcuts.test.ts`
Expected: FAIL because the dispatcher and toolbar components do not exist.

- [ ] **Step 3: Build the toolbar and keyboard dispatcher**

`DrawingToolbar` receives active mode, orthogonal state, selection summary, history availability, and callbacks. All icon-only controls include `title` and `aria-label`; important controls keep visible Chinese labels. `getDrawingShortcut` returns null for input, textarea, select, or contenteditable targets.

- [ ] **Step 4: Build the public resource panel and insertion dialogs**

The panel lists connector/model, wire, accessory, packaging, wiring table, BOM, line, branch, crossing, and material specification categories. Supabase categories show loading, retry, and empty states. Text dialog supports custom text/common phrases; number dialog supports labels; sequence dialog emits circled numbers; icon dialog reads `drawing_icons`; table dialog accepts title, rows, and columns.

- [ ] **Step 5: Upgrade inspector for multi-selection and layers**

Inspector accepts `selectedObjectIds`. When selection contains unlocked objects, style and position edits apply to those objects. Show front/forward/backward/back buttons, numeric layer input, lock toggle, fill/stroke/text colors, line width, and split. Locked selections allow only unlock.

- [ ] **Step 6: Integrate history-safe commands in the page**

Replace single `selectedObjectId` with ordered `selectedObjectIds`. Each document-level command calls `remember()` once, applies one immutable command, updates selection replacements, and clears redo history. `Ctrl+U`, `Ctrl+X`, Delete, copy/paste, and Shift drawing shortcuts route through the same toolbar callbacks. Empty/no-op commands do not create history.

- [ ] **Step 7: Run workbench and regression tests**

Run: `npm test -- --run src/lib/__tests__/drawingWorkbenchShortcuts.test.ts src/lib/__tests__/drawingCommands.test.ts src/lib/__tests__/drawingCanvasTemplates.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit Task 7**

```powershell
git add src/components/drawings src/pages/DrawingWorkbenchPage.tsx src/lib/__tests__/drawingWorkbenchShortcuts.test.ts
git commit -m "feat(drawing): complete workbench tools layers and resources"
```

---

### Task 8: Export coverage, full verification, and user-facing SQL instructions

**Files:**
- Modify: `src/lib/drawingExport.ts`
- Modify: `src/lib/__tests__/drawingCanvasTemplates.test.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-14-drawing-workbench-completion.md`

**Interfaces:**
- Consumes: final `DrawingDocument` scene union.
- Produces: equivalent Canvas, SVG, PNG, and PDF results for groups, icons, and interactively drawn lines.

- [ ] **Step 1: Add failing export regression tests**

Create a document containing a nested group, icon, polyline, curve, freehand line, modified layers, and a table. Assert SVG includes child labels and paths, PNG rendering reaches recursive objects, and PDF serialization retains drawing number, line labels, and table content.

- [ ] **Step 2: Run export tests and verify failure**

Run: `npm test -- --run src/lib/__tests__/drawingCanvasTemplates.test.ts`
Expected: FAIL on group/icon export assertions.

- [ ] **Step 3: Implement recursive export rendering**

Use one scene traversal helper for Canvas/SVG/PDF. Translate group children by the accumulated parent origin and preserve rotation, visibility, style, and normalized layer order. Serialize icon path data as SVG `<path>` and render it through Canvas `Path2D`; PDF uses the existing vector/text fallback without dropping child labels.

- [ ] **Step 4: Document Supabase execution commands**

Add exact README instructions for a fresh database and an existing database. Fresh execution order uses schema, security, then seed; existing execution uses `50_upgrade/01_drawing_workbench_resources.sql`, security, then seed. State that the seed is idempotent and public-only.

- [ ] **Step 5: Run targeted and full automated verification**

Run:

```powershell
npm test -- --run src/lib/__tests__/drawingResourceSql.test.ts src/lib/__tests__/drawingCatalogRepository.test.ts src/lib/__tests__/drawingCommands.test.ts src/lib/__tests__/standaloneDrawingGenerator.test.ts src/lib/__tests__/drawingInteraction.test.ts src/lib/__tests__/drawingWorkbenchShortcuts.test.ts src/lib/__tests__/drawingCanvasTemplates.test.ts
npm test
npm run lint
npm run build
```

Expected: every command exits with code 0; Vitest reports all tests passing; ESLint reports no errors; Vite produces `dist` successfully.

- [ ] **Step 6: Perform local browser walkthrough**

Start `npm run dev`, open `http://localhost:<vite-port>` rather than `127.0.0.1`, and verify: double-end wizard generation, public filters, reverse wiring, line/polyline/curve/freehand, box multi-select, layer moves, lock/unlock, clear/undo, two Ctrl+X splits/undo, and PDF download.

- [ ] **Step 7: Update plan completion checkboxes and commit Task 8**

```powershell
git add src/lib/drawingExport.ts src/lib/__tests__/drawingCanvasTemplates.test.ts README.md docs/superpowers/plans/2026-07-14-drawing-workbench-completion.md
git commit -m "feat(drawing): verify exports and complete workbench workflow"
```

---

## Plan Self-Review Result

- Spec coverage: Tasks 1-8 cover every confirmed schema, wizard, resource, interaction, shortcut, error-state, export, and verification requirement.
- Type consistency: repository, scene, command, wizard, Canvas, toolbar, inspector, and export interfaces use the exact names introduced by preceding tasks.
- Scope: all tasks contribute to one end-to-end drawing workflow; unrelated Harness editor and private-resource work remain excluded.
- Placeholder scan: the plan contains no incomplete implementation markers or undefined follow-on work.

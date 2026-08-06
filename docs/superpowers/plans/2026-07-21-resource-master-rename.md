# Resource Master Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the shared catalog database tables to resource-oriented names and remove the `catalog_categories` table without losing resource grouping in the UI.

**Architecture:** The shared parent becomes `resource_items`; its common image table becomes `resource_item_images`; every resource-specific main table references `resource_item_id`. `catalog_categories` and `category_id` are removed. A flat `resource_group text` column on `resource_items` preserves optional display grouping without a hierarchy or foreign key. Frontend store names such as `CatalogSnapshot` remain unchanged because they describe the UI catalogue, while persisted resource identifiers become `resourceItemId` and `resourceImageUrl`.

**Tech Stack:** PostgreSQL/Supabase SQL and RLS, TypeScript, React, Zustand, Vitest, ESLint, Vite.

## Global Constraints

- Keep one shared resource master and one shared image table; do not reintroduce resource detail tables.
- Delete only the category hierarchy; retain optional flat grouping in `resource_items.resource_group`.
- Preserve legacy database compatibility through an additive rename upgrade; do not require a destructive reset.
- Keep the storage bucket `catalog-assets` unchanged in this pass to avoid copying existing uploaded files.
- Preserve current dirty worktree changes and do not reset or discard unrelated files.
- Do not rename frontend `CatalogSnapshot` / `catalogStore`; they are runtime concepts rather than database object names.

---

### Task 1: Lock the new naming contract in tests

**Files:**
- Modify: `src/lib/__tests__/drawingResourceSql.test.ts`

**Interfaces:**
- Canonical SQL exposes `resource_items`, `resource_item_images`, and `resource_group`.
- Canonical SQL does not create `catalog_categories`, use `category_id`, or query the retired names from production repositories.

- [ ] **Step 1: Write the failing test**

Add assertions that the canonical schema/RLS/seed files contain `public.resource_items`, `public.resource_item_images`, and `resource_group`, and that `src/lib/catalogRepository.ts` and `src/lib/drawingCatalogRepository.ts` query those table names.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- --run src/lib/__tests__/drawingResourceSql.test.ts`

Expected: FAIL because the active schema and repositories still use `catalog_items`, `catalog_item_images`, and `catalog_categories`.

- [ ] **Step 3: Keep the assertion scoped to canonical files**

Exclude `50_upgrade/01_drawing_workbench_resources.sql` and `50_upgrade/03_catalog_resource_main_tables.sql` from retired-name assertions because they are historical migration inputs. Cover the new rename migration separately.

### Task 2: Rename canonical schema, integrity, security, and seed data

**Files:**
- Modify: `supabase/sql/00_reset/01_drop_all_tables.sql`
- Modify: `supabase/sql/10_schema/02_catalog.sql`
- Modify: `supabase/sql/10_schema/03_integrity.sql`
- Modify: `supabase/sql/20_storage/01_buckets.sql`
- Modify: `supabase/sql/30_security/01_rls.sql`
- Modify: `supabase/sql/40_seed/01_example_catalog.sql`
- Modify: `supabase/sql/40_seed/02_image_manifest.sql`
- Modify: `supabase/sql/40_seed/03_drawing_workbench_resources.sql`
- Modify: `supabase/sql/40_seed/04_frontend_catalog.sql`

**Interfaces:**
- `resource_items(id, resource_type, resource_group, ...)`
- `resource_item_images(id, resource_item_id, ...)`
- `connectors`, `wires`, `protective_sleeves`, `overmolds`, `models`, `accessories`, and `packagings` each expose `resource_item_id uuid primary key references public.resource_items(id)`.

- [ ] **Step 1: Rename the canonical parent and child names**

Replace `catalog_items` with `resource_items`, `catalog_item_images` with `resource_item_images`, `item_type` with `resource_type`, and every canonical `catalog_item_id`/`item_id` foreign key with `resource_item_id`.

- [ ] **Step 2: Remove hierarchy-specific schema**

Delete the `catalog_categories` table, `category_id` foreign key, leaf-category trigger, and category indexes. Add `resource_group text not null default ''` directly to `resource_items`.

- [ ] **Step 3: Update integrity and RLS semantics**

Rename trigger/index/policy identifiers to `resource_*`, update resource-type enforcement and storage-image policies to use `resource_items`/`resource_item_images`, and exclude the removed category table from grants and admin-write loops.

- [ ] **Step 4: Flatten seed group data**

Remove category seed inserts. Put their former leaf display labels into `resource_group` on each resource seed row. Update image manifests, resource joins, and conflict keys to use `resource_item_id`.

### Task 3: Add a non-destructive database rename upgrade

**Files:**
- Create: `supabase/sql/50_upgrade/05_resource_master_rename.sql`
- Modify: `supabase/sql/README.md`

**Interfaces:**
- Existing test databases with `catalog_items`, `catalog_item_images`, and `catalog_categories` can migrate to the canonical resource names.

- [ ] **Step 1: Rename physical tables and columns idempotently**

In a transaction, detect old and new table names with `to_regclass`, rename only when the old object exists and the target does not, and rename `catalog_item_id` to `resource_item_id`, image `item_id` to `resource_item_id`, and `item_type` to `resource_type`.

- [ ] **Step 2: Preserve grouping before dropping categories**

Add `resource_group` if absent, copy each legacy category name into the resource row, remove the `category_id` foreign key/column, then drop `catalog_categories` only after all references are removed.

- [ ] **Step 3: Clean stale policy and trigger names**

Drop obsolete category policies and old parent/image policies so rerunning canonical `03_integrity.sql` and `30_security/01_rls.sql` creates exactly the resource-named policies and triggers.

- [ ] **Step 4: Document upgrade order**

Require this script after legacy catalog/main-table upgrades and before rerunning integrity, RLS, and all seed scripts.

### Task 4: Update frontend resource contracts and queries

**Files:**
- Modify: `src/types/harness.ts`
- Modify: `src/types/catalog.ts`
- Modify: `src/types/drawing.ts`
- Modify: `src/lib/catalogRepository.ts`
- Modify: `src/lib/drawingCatalogRepository.ts`
- Modify: `src/lib/drawingMaterialRepository.ts`
- Modify: `src/lib/autoAssociateTwoDImages.ts`
- Modify: `src/lib/drawingGenerator.ts`
- Modify: `src/components/canvas/HarnessCanvas.tsx`
- Modify: `src/components/canvas/WireMaterialDialog.tsx`
- Modify: `src/components/drawings/standalone/DrawingResourcePanel.tsx`
- Modify: `src/components/drawings/standalone/DrawingResourceSelect.tsx`
- Modify: `src/components/drawings/standalone/StandaloneDrawingWizard.tsx`

**Interfaces:**
- Persisted resource references use `resourceItemId?: string` and `resourceImageUrl?: string`.
- `DrawingCatalogResource` uses `resourceItemId: string` and reports its optional `resourceGroup` as the UI category string.

- [ ] **Step 1: Change typed property names**

Replace `catalogItemId` with `resourceItemId` and `catalogImageUrl` with `resourceImageUrl` in harness, catalog, drawing, UI, generator, and repository code.

- [ ] **Step 2: Query the renamed SQL objects**

Make the catalog repositories select from `resource_items` and embed `resource_item_images`; map `resource_group` directly instead of joining `catalog_categories`.

- [ ] **Step 3: Retain only UI catalogue naming**

Keep `CatalogSnapshot`, `catalogRepository`, and `catalogStore` public runtime names unchanged so this migration does not expand into an unrelated UI/API rename.

### Task 5: Update fixtures, complete verification, and hand off

**Files:**
- Modify: `src/lib/__tests__/drawingCatalogRepository.test.ts`
- Modify: `src/lib/__tests__/drawingCanvasTemplates.test.ts`
- Modify: `src/lib/__tests__/standaloneDrawingGenerator.test.ts`
- Modify: `src/lib/__tests__/drawingResourceSql.test.ts`

- [ ] **Step 1: Update test fixtures and source-contract expectations**

Use `resourceItemId` in all drawing resource fixtures and assert flat `resourceGroup` handling.

- [ ] **Step 2: Run focused tests and verify GREEN**

Run: `npm.cmd test -- --run src/lib/__tests__/drawingResourceSql.test.ts src/lib/__tests__/drawingCatalogRepository.test.ts src/lib/__tests__/standaloneDrawingGenerator.test.ts src/lib/__tests__/drawingCanvasTemplates.test.ts`

Expected: PASS with the renamed source contract and unchanged drawing behavior.

- [ ] **Step 3: Run complete verification**

Run: `npm.cmd test -- --run`, `npx.cmd tsc -p tsconfig.app.json --noEmit`, `npm.cmd run lint`, `npm.cmd run build`, `git diff --check`, and a UTF-8 SQL quote-balance check.

- [ ] **Step 4: Inspect remaining legacy names**

Run: `rg -n "catalog_categories|catalog_items|catalog_item_images|catalog_item_id|category_id" src supabase/sql`.

Expected: runtime/canonical files are clean; only the historical pre-rename upgrade scripts and the new rename migration may mention legacy names.

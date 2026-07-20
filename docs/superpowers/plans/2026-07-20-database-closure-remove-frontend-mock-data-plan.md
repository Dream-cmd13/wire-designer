# Database Closure and Frontend Mock Data Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Supabase the source of truth for all business data used by the current pages and remove production imports of `src/lib/data.ts`.

**Architecture:** Keep `catalog_items` as the shared resource master and keep each resource type in one main table. Add database-backed dictionaries/options/pricing and user document/version tables. Load a typed catalog/pricing snapshot once, inject it into synchronous domain helpers, and persist projects/drawings through Supabase repositories; localStorage remains test-only or best-effort draft recovery.

**Tech Stack:** PostgreSQL/Supabase SQL and RLS, TypeScript, React, Zustand, Vitest, ESLint, Vite.

## Global Constraints

- Supabase is authoritative; no production fallback to static catalog data.
- `catalog_items` and `catalog_item_images` remain the shared catalog identity/image parent.
- Do not reintroduce `connector_pins`, `wire_spec_cores`, or per-resource `*_specs` tables.
- Runtime connector/material/sleeve/model instances remain in `project_documents.document` JSONB.
- Preserve existing user changes and do not reset or discard unrelated worktree files.
- Keep rendering geometry and UI-only constants in code; migrate business catalog/options/pricing data.
- Existing baseline has one unrelated stale source-assertion failure in `drawingCanvasTemplates.test.ts`; do not broaden this work to redesign drawing rendering.

---

## Phase 1: SQL and Seed Data

### Task 1: Add business option and pricing tables

**Files:**
- Modify: `supabase/sql/10_schema/02_catalog.sql`
- Modify: `supabase/sql/10_schema/03_integrity.sql`
- Create: `supabase/sql/10_schema/05_business_options.sql`

**Interfaces:**
- Produces tables `lead_time_options`, `protection_options`, `pricing_rules`, and `quantity_discount_rules` consumed by the catalog snapshot repository.

- [ ] Add idempotent tables with stable text keys, display metadata, numeric values, active/lifecycle flags, soft-delete timestamps, and audit columns.
- [ ] Add unique partial indexes for active keys and lookup indexes for active display order.
- [ ] Add audit triggers for the four tables using the existing audit function.
- [ ] Keep protection price-per-meter and corrugated material multiplier in database rows; no production code should use the old price maps as business defaults.

### Task 2: Add project and drawing persistence tables

**Files:**
- Create: `supabase/sql/10_schema/06_document_persistence.sql`
- Modify: `supabase/sql/10_schema/03_integrity.sql`

**Interfaces:**
- `project_document_versions(project_id, revision, document, schema_version, created_at, created_by)` stores immutable harness snapshots.
- `drawing_documents(id, owner_id, project_id, name, drawing_json, schema_version, revision, created_at, updated_at, deleted_at)` stores standalone user drawings.
- `drawing_document_versions(drawing_id, revision, drawing_json, schema_version, created_at, created_by)` stores immutable drawing snapshots.

- [ ] Create all tables with foreign keys to `projects`, `user`, and `drawing_documents`, JSON-object checks, positive revision checks, and soft-delete fields.
- [ ] Add indexes for project revision lookup, owner/update ordering, optional project association, and active rows.
- [ ] Add audit/timestamp triggers and a revision monotonicity trigger that rejects stale updates.

### Task 3: Update reset, security, seed, upgrade, and documentation SQL

**Files:**
- Modify: `supabase/sql/00_reset/01_drop_all_tables.sql`
- Modify: `supabase/sql/30_security/01_rls.sql`
- Modify: `supabase/sql/40_seed/04_frontend_catalog.sql`
- Create: `supabase/sql/40_seed/05_business_options.sql`
- Create: `supabase/sql/50_upgrade/04_frontend_business_data.sql`
- Modify: `supabase/sql/README.md`
- Modify: `src/lib/__tests__/drawingResourceSql.test.ts`

- [ ] Drop new tables in dependency-safe order and include them in the test reset flow.
- [ ] Grant read access to active public options and catalog rows; restrict project/drawing document tables to owners; keep catalog-admin write policies for option/pricing tables.
- [ ] Seed every business row formerly present in `src/lib/data.ts`, including all connectors, wire dictionaries, overmolds, lead-time rows, protection rows, pricing scalars, and quantity discounts.
- [ ] Move the protection price maps from `canvasMaterials.ts` into the protection seed rows; retain only presentation labels/geometry in code.
- [ ] Add an idempotent upgrade script for an existing test database and document fresh-reset versus upgrade execution order.
- [ ] Extend SQL tests to assert new tables/seeds/security/reset coverage and reject retired table names in production SQL.

### Task 4: Verify Phase 1

- [ ] Run `npm.cmd test -- --run src/lib/__tests__/drawingResourceSql.test.ts`.
- [ ] Run a repository search that confirms no base/reset/RLS/seed SQL creates or inserts into retired `*_specs`, `connector_pins`, or `wire_spec_cores` tables.
- [ ] Run `git diff --check`.
- [ ] If `supabase db lint --local --workdir D:\\wire-harness-designer` cannot connect because Docker/Postgres is unavailable, record that limitation and continue with static SQL checks.

---

## Phase 2: Frontend Runtime and Mock Removal

### Task 5: Define the typed catalog/pricing snapshot and repository

**Files:**
- Create: `src/types/catalog.ts`
- Modify: `src/lib/catalogRepository.ts`
- Create: `src/stores/catalogStore.ts`
- Modify: `src/lib/drawingCatalogRepository.ts`
- Modify: `src/lib/drawingMaterialRepository.ts`
- Test: `src/lib/__tests__/catalogRepository.test.ts`

**Interfaces:**
- `CatalogSnapshot` contains connectors, wires, wire types/colors/gauges, overmolds, lead-time options, protection options, pricing rules, and quantity discounts.
- `CatalogRepository.loadSnapshot(): Promise<CatalogSnapshot>` is the single public catalog bootstrap entry point.
- `useCatalogStore` exposes `{ status, snapshot, error, initialize, retry }` and pure lookup helpers.

- [ ] Replace nested legacy relation names with `connectors`, `wires`, `overmolds`, `models`, `accessories`, and `packagings`.
- [ ] Read `catalog_items.manufacturer_name`, map `connectors.pin_labels`, and map primary catalog images without failing the row when a signed URL fails.
- [ ] Add option/pricing queries with active/deleted filters and stable order.
- [ ] Add fake-client tests for snapshot loading and canonical relation names.

### Task 6: Replace production project persistence

**Files:**
- Modify: `src/repositories/projectRepository.ts`
- Modify: `src/stores/projectStore.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/project/ProjectList.tsx`
- Modify: `src/pages/HarnessLibraryPage.tsx`
- Test: `src/lib/__tests__/supabaseProjectRepository.test.ts`

**Interfaces:**
- Production repository methods list/create/load/save/remove projects through `projects`, `project_documents`, and version rows.
- Local repository remains exported only for isolated storage tests; it is not the default production binding.

- [ ] Map `owner_id` to `Project.userId`, remove the project-list dependency on persisted Zustand metadata, and hydrate after authentication.
- [ ] Create the project row and document row in one Supabase RPC or draft-first transaction-safe flow.
- [ ] On save, use the current revision, write a version snapshot, update the document, and update project metadata/timestamps.
- [ ] Replace synchronous before-unload persistence with an async visibility/manual-save path; keep best-effort local draft recovery without treating it as authoritative.
- [ ] Preserve project import/export and restore behavior against the new repository API.

### Task 7: Remove `src/lib/data.ts` and refactor catalog consumers

**Files:**
- Delete: `src/lib/data.ts`
- Modify: `src/stores/harnessStore.ts`
- Modify: `src/lib/commands.ts`
- Modify: `src/lib/validation.ts`
- Modify: `src/lib/canvasMaterials.ts`
- Modify: `src/lib/bom.ts`
- Modify: `src/lib/pricing.ts`
- Modify: `src/lib/drawingWizard.ts`
- Modify: `src/pages/ConnectorLibraryPage.tsx`
- Modify: `src/components/project/ProjectWizard.tsx`
- Modify: `src/components/canvas/WireMaterialDialog.tsx`
- Modify: `src/components/panels/QuotePanel.tsx`
- Modify: `src/components/preview3d/Preview3D.tsx`
- Modify: `src/components/drawings/TwoDView.tsx`
- Modify: `src/components/drawings/workbench/DrawingWizardDialog.tsx`
- Modify: `src/components/drawings/standalone/StandaloneDrawingWizard.tsx`
- Modify: `src/components/shared/PartPickerDialog.tsx`
- Modify: `src/components/shared/OvermoldPickerDialog.tsx`
- Modify: `src/App.tsx`

- [ ] Remove every production import of `@/lib/data` and make pages consume `useCatalogStore` data with loading/error/empty states.
- [ ] Make `createDefaultConfig` and project wizard construction accept catalog dependencies; an unloaded catalog produces an empty configuration, never a hardcoded connector.
- [ ] Make commands and validation accept explicit catalog lookup data or a runtime snapshot instead of global mock arrays.
- [ ] Make color resolution, wire core generation, BOM, quote, and drawing wizard logic use database-loaded dictionaries and pricing rules.
- [ ] Keep enum/geometry constants that define rendering behavior, but remove business names, options, prices, and catalog records from production code.
- [ ] Update tests to use small test-only fixtures under `src/lib/__tests__/fixtures`, not production mock data.

### Task 8: Persist standalone drawings and project assets

**Files:**
- Create: `src/repositories/drawingDocumentRepository.ts`
- Modify: `src/stores/drawingStore.ts`
- Modify: `src/pages/DrawingWorkbenchPage.tsx`
- Modify: `src/components/drawings/TwoDAssociateDialog.tsx`
- Modify: `src/components/drawings/PdfCropViewer.tsx`
- Modify: `src/types/drawing.ts`
- Test: `src/lib/__tests__/drawingDocumentRepository.test.ts`

- [ ] Load the authenticated user’s drawing library from `drawing_documents`; save revisions and immutable version rows.
- [ ] Keep public templates/phrases/icons on `drawingCatalogRepository`.
- [ ] Store uploaded project/PDF/2D files through `project_assets` and Storage, preserving association metadata in the project/drawing JSON.
- [ ] Keep the editor’s temporary local hydration only as a draft-recovery mechanism and show database save status separately.

### Task 9: Verify Phase 2 and complete handoff

- [ ] Run `rg -n "@/lib/data|connector_specs|connector_pins|wire_specs|wire_spec_cores|overmold_specs|accessory_specs|packaging_specs|model_specs" src supabase/sql` and confirm only test migration documentation or intentional legacy-upgrade code remains.
- [ ] Run `npm.cmd test -- --run` and address only failures caused by this migration; retain a note for any pre-existing unrelated stale assertion.
- [ ] Run `npm.cmd run lint`.
- [ ] Run `npm.cmd run build`.
- [ ] Run `git diff --check` and inspect `git status --short` so unrelated `.claude` or prior user changes are untouched.


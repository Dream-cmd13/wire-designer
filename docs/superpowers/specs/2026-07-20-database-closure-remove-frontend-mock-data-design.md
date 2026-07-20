# Database Closure and Frontend Mock Data Removal Design

**Date:** 2026-07-20  
**Status:** Awaiting user review  
**Scope:** Testing-stage database closure in two implementation phases

## Goal

Make Supabase the source of truth for all current catalog, project, drawing-resource, option, and pricing data, then remove frontend business mock data without adding unnecessary PIN/core detail tables.

## Current Context

The catalog schema already uses `catalog_items` as the common resource master with one-to-one resource tables (`connectors`, `wires`, `protective_sleeves`, `overmolds`, `models`, `accessories`, `packagings`) and `catalog_item_images`. The frontend still imports `src/lib/data.ts`, stores projects and standalone drawings in browser storage, and several repositories query the retired `*_specs` tables.

The existing `project_documents.document` JSONB shape matches the current `HarnessConfig` and will remain the first-phase persistence envelope. Runtime instances such as connector positions, wire circuits, sleeve attachments, and model dimensions remain inside the project document; they are not catalog rows.

## Decisions

1. Supabase is authoritative for business data. When Supabase is unavailable, the UI shows a clear configuration/error state instead of loading static catalog data.
2. Browser storage may remain only as a best-effort unsaved-draft/recovery cache; it is not a source of catalog, project-list, or drawing-library data.
3. `catalog_items` remains the only shared catalog identity table. No additional generic `catalog` table is introduced.
4. Connector pin labels and wire core specifications remain JSONB arrays in their resource main tables during this phase. A PIN/core detail table is deferred until the UI needs per-pin electrical, terminal, compatibility, inventory, or pricing queries.
5. `project_documents` stores the current harness document. Server-side restore history is stored separately so the existing restore action can survive migration.
6. Standalone drawing documents are separate from public drawing templates. They support multiple documents per user and optional association to a project.
7. All business data currently hardcoded in `src/lib/data.ts` is migrated, including connectors, wire dictionaries, overmolds, lead-time options, protection options, and pricing parameters. Rendering geometry and algorithmic UI constants are not treated as business mock data.

## Target Database Model

### Existing tables retained and aligned

```text
user
projects
project_documents
project_assets

catalog_categories
catalog_items
catalog_item_images
connectors
wires
protective_sleeves
overmolds
models
accessories
packagings
wire_colors
wire_gauges
wire_types

drawing_templates
drawing_template_versions
drawing_common_phrases
drawing_icons
```

### New option and pricing tables

`lead_time_options` stores the UI code, display name, display days, multiplier, active flag, and order.

`protection_options` stores protection type, display name, price per meter, optional material multiplier, active flag, and order. It replaces the business-price portion of `PROTECTION_OPTIONS` and the sleeve price maps currently in `canvasMaterials.ts`.

`pricing_rules` stores scalar rules such as connector base price, connector per-pin price, wire AWG multipliers, wire-type multipliers, labor rates, and jacketed-core factors. Each row has a stable rule code/key, numeric value, active flag, and order.

`quantity_discount_rules` stores minimum quantity thresholds and discount multipliers.

All four tables receive audit timestamps, soft-delete/active filtering, indexes, RLS, reset handling, and idempotent seed data.

### New project/drawing persistence tables

`project_document_versions` stores immutable project document snapshots keyed by project and revision. It supports the current “restore latest recovery point” workflow without storing recovery JSON only in localStorage.

`drawing_documents` stores user-owned standalone drawings with `owner_id`, optional `project_id`, name, drawing JSON, schema version, revision, timestamps, and soft deletion.

`drawing_document_versions` stores immutable drawing snapshots when a drawing is saved. Public template tables remain separate and unchanged in purpose.

## Phase 1: SQL and Data Migration

### Files to modify or create

- `supabase/sql/10_schema/02_catalog.sql`: add option/pricing tables and any missing constraints/indexes.
- `supabase/sql/10_schema/04_drawing_resources.sql`: add user drawing document/version tables, or create a focused `05_project_drawing_documents.sql` if keeping file boundaries clearer.
- `supabase/sql/10_schema/03_integrity.sql`: add audit triggers, owner/type checks, revision checks, and project/drawing indexes.
- `supabase/sql/00_reset/01_drop_all_tables.sql`: drop new tables in dependency-safe order.
- `supabase/sql/30_security/01_rls.sql`: add grants and owner/admin policies for new tables.
- `supabase/sql/40_seed/04_frontend_catalog.sql`: seed dictionaries, option rows, pricing rules, quantity discounts, and catalog resources from the former frontend data.
- `supabase/sql/50_upgrade/04_frontend_business_data.sql`: idempotent migration for an existing test database.
- `supabase/sql/README.md`: document execution order, source-of-truth rules, and the browser-cache boundary.

### SQL validation

Run static checks for table-name consistency, JSON/transaction balance, reset coverage, seed idempotency, and `git diff --check`. Attempt local Supabase lint when a local database is available; report the environment limitation if Docker/Postgres is unavailable.

## Phase 2: Frontend Data-Source Migration

### Catalog runtime

Add typed catalog snapshot data and a catalog store that loads, caches, and exposes:

```text
connectors
wires
wireTypes
wireColors
wireGauges
overmolds
leadTimeOptions
protectionOptions
pricingRules
quantityDiscountRules
```

Update `catalogRepository` to query the canonical plural resource tables, read `manufacturer_name`, and expose one snapshot-loading entry point. Update `drawingCatalogRepository` and `drawingMaterialRepository` to use `connectors`, `wires`, `models`, `accessories`, and `packagings`; no `*_specs` or `connector_pins` queries remain.

### Project runtime

Replace the production `LocalProjectRepository` binding with a Supabase repository that lists project metadata, creates/updates/deletes `projects`, and reads/writes `project_documents`. Saving a document updates `projects.updated_at`, increments the document revision, and records a version snapshot. The local repository remains available only for isolated unit tests and recovery implementation tests.

`projectStore` hydrates from Supabase after authentication instead of treating persisted Zustand metadata as the project list. The frontend project model maps `owner_id` to `userId`; `harnessConfigId` is compatibility-only and is not a new database identity.

### Remove static frontend business data

Delete `src/lib/data.ts` after all imports are removed. Replace consumers as follows:

- `ConnectorLibraryPage`, `ProjectWizard`, `PartPickerDialog`, and connector commands use the catalog snapshot.
- `WireMaterialDialog`, `Preview3D`, `TwoDView`, drawing wizard dialogs, validation, and color helpers use database-loaded wire colors/types/gauges.
- `QuotePanel`, `pricing.ts`, and `bom.ts` consume database-loaded lead-time, protection, pricing, and discount rules.
- `harnessStore` creates an empty document before catalog hydration and creates catalog-backed defaults only after a snapshot is available.
- Pure command/validation functions receive explicit catalog/pricing dependencies or a typed runtime snapshot; they never import static business data.

Test fixtures may define small in-test catalog objects, but no production component imports a mock catalog.

### Assets and drawings

Catalog images continue to use `catalog_item_images` and `catalog-assets`. Project PDF/product/2D uploads use `project_assets` and `project-assets`; project/drawing JSON stores asset paths and association metadata rather than large embedded data URLs wherever the current flow permits.

The standalone drawing store is replaced or backed by `drawing_documents` and version rows. Public templates, phrases, and icons continue to load from their existing repository.

## Error and Loading Behavior

- Catalog loading failure: show a retryable resource error; do not silently fall back to static data.
- Project list loading failure: show an authenticated database error and keep unsaved editor state intact.
- Save conflict: compare revision and report a reload/merge action rather than overwriting silently.
- Partial catalog image failure: keep the resource row and show the existing image-error state.
- Missing optional pricing row: use an explicit zero/disabled state and an error message, not a hidden hardcoded default.

## Testing Strategy

1. SQL static tests assert canonical table names, option/pricing seed rows, reset/RLS coverage, and absence of retired `*_specs` references in production SQL.
2. Repository tests cover canonical nested relations, snapshot loading, project CRUD/revision handling, and drawing document persistence using typed fake clients.
3. Pure pricing/BOM tests inject a fixture snapshot and verify connector, wire, protection, lead-time, and quantity-discount calculations.
4. UI source tests assert that no production file imports `@/lib/data` and that catalog/project/drawing pages use repository/store data.
5. Run the full test suite, lint, and production build after each phase.

## Non-Goals for This Migration

- No normalized connector-pin or wire-core tables yet.
- No supplier, purchase-order, inventory, or formal quote-history workflow.
- No redesign of canvas geometry or drawing rendering constants.
- No static catalog fallback hidden behind the database repository.


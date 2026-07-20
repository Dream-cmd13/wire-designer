# Catalog Resource Main Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-resource specification and pin/core detail tables with one typed main table per catalog resource while retaining `catalog_items` as the shared resource master and `catalog_item_images` as the image detail table.

**Architecture:** `catalog_items` owns common identity, classification, lifecycle, audit, and image relationships. `connectors`, `wires`, `protective_sleeves`, `overmolds`, `models`, `accessories`, and `packagings` each hold all fields specific to that resource type; connector pin labels and wire core metadata are JSONB arrays in their respective main tables. The development reset, integrity triggers, RLS policies, seed data, upgrade guidance, and SQL-focused test must use the new table names.

**Tech Stack:** PostgreSQL/Supabase SQL, RLS, Storage policies, Vitest SQL assertions.

## Global Constraints

- Preserve `catalog_items` and `catalog_item_images` as the shared resource identity and image parent.
- Do not create `connector_pins` or `wire_spec_cores` in the new base schema.
- Keep wire lookup tables (`wire_colors`, `wire_gauges`, `wire_types`) because they are reusable dictionaries, not resource detail rows.
- The project is still in testing; the documented reset-and-reseed flow is the supported path for the new schema.
- This change targets SQL and SQL-focused tests; frontend repositories that still select legacy table names require a follow-up synchronization pass.

---

### Task 1: Define resource main tables

**Files:**
- Modify: `supabase/sql/10_schema/02_catalog.sql`
- Modify: `supabase/sql/00_reset/01_drop_all_tables.sql`

- [ ] Replace `connector_specs`, `wire_specs`, `protective_sleeve_specs`, `overmold_specs`, `model_specs`, `accessory_specs`, and `packaging_specs` with `connectors`, `wires`, `protective_sleeves`, `overmolds`, `models`, `accessories`, and `packagings`.
- [ ] Move all existing type-specific columns into the corresponding main table and add `pin_labels jsonb` to `connectors` and `core_specs jsonb` to `wires`, each constrained to JSON arrays.
- [ ] Give each resource main table consistent audit columns and a `catalog_item_id` primary-key foreign key to `catalog_items`.
- [ ] Remove `connector_pins` and `wire_spec_cores` from the base schema and add the new table names to the development reset order.

### Task 2: Synchronize integrity and security

**Files:**
- Modify: `supabase/sql/10_schema/03_integrity.sql`
- Modify: `supabase/sql/30_security/01_rls.sql`

- [ ] Update audit triggers, type-matching triggers, active-item integrity checks, delete protection, grants, public-read policies, catalog-admin policy arrays, and lookup indexes to use the new resource table names.
- [ ] Keep image and Storage policies joined through `catalog_items` and `catalog_item_images`.
- [ ] Remove RLS references to the deleted pin/core/spec table names.

### Task 3: Update idempotent seed SQL

**Files:**
- Modify: `supabase/sql/40_seed/01_example_catalog.sql`
- Modify: `supabase/sql/40_seed/03_drawing_workbench_resources.sql`
- Modify: `supabase/sql/40_seed/04_frontend_catalog.sql`

- [ ] Write connector pin labels directly into `connectors.pin_labels` JSONB.
- [ ] Write wire core metadata directly into `wires.core_specs` JSONB.
- [ ] Change all other resource seed inserts to their corresponding main tables while preserving deterministic IDs and idempotent upserts.

### Task 4: Document upgrade/reset behavior

**Files:**
- Create: `supabase/sql/50_upgrade/03_catalog_resource_main_tables.sql`
- Modify: `supabase/sql/README.md`

- [ ] Add an idempotent development upgrade that renames legacy resource tables where possible, folds pin/core rows into JSONB, and removes the legacy detail tables after the data copy.
- [ ] Document that a fresh test setup uses `00_reset` followed by the normal schema, integrity, storage, RLS, and seed order; document the legacy upgrade entry point separately.

### Task 5: Update SQL-focused verification

**Files:**
- Modify: `src/lib/__tests__/drawingResourceSql.test.ts`

- [ ] Assert that the new resource main tables exist in schema/security/reset SQL and that the removed pin/core table names are absent from the new base flow.
- [ ] Run the SQL-focused test and the full Vitest suite.
- [ ] Run repository-wide searches to confirm no SQL file in the base/reset/RLS/seed path still creates or inserts into the removed legacy detail tables.

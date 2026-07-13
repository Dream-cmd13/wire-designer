# Catalog Data Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move current front-end catalog mock data into Supabase seed SQL and make the application read catalog and lookup data from Supabase.

**Architecture:** Extend the initial migration with normalized lookup tables for values that are currently UI-only constants. Seed catalog objects in a second migration with deterministic UUIDs, then use a repository that reads Supabase when configured and returns an empty loading-safe catalog otherwise; the existing local arrays are removed only after each consuming screen reads the repository data.

**Tech Stack:** PostgreSQL/Supabase RLS and Storage, React 19, TypeScript, Zustand, Vitest.

## Global Constraints

- `catalog-assets` is private; files use `{catalog_item_uuid}/{image_uuid}-{safe-file-name}`.
- A four-core PVC jacketed wire associates to a product image at every AWG; 22 AWG is not a condition.
- SQL seed files contain only metadata and expected Storage paths; binary image upload remains a manual Storage operation.
- No service-role key appears in frontend code.

---

### Task 1: Add normalized lookup-table migration

**Files:**
- Modify: `supabase/migrations/20260710000000_initial_schema.sql`

- [ ] Add `wire_colors`, `wire_gauges`, `wire_types`, `lead_time_options`, `protection_options`, and `pricing_rules` with UUID primary keys, audit fields, row-level security, and read/write policies matching the shared catalog.
- [ ] Add required lookup-table indexes and include the tables in audit-trigger and RLS dynamic policy arrays.
- [ ] Verify the migration still contains no `DELETE` grant or authenticated delete policy.

### Task 2: Seed catalog and lookup data

**Files:**
- Create: `supabase/migrations/20260710000001_seed_catalog_data.sql`

- [ ] Insert all current connector entries, the current overmold, colors, gauges, wire types, lead-time options, protection options, and base pricing rules with deterministic UUIDs.
- [ ] Insert one image-eligible M12 connector, one outer mold, and one four-core PVC jacketed wire catalog item; use fixed IDs and comments that list their expected Storage object paths.
- [ ] Create no `catalog_item_images` rows until the user supplies the final uploaded object paths.

### Task 3: Replace frontend catalog mock source

**Files:**
- Create: `src/lib/catalogRepository.ts`, `src/lib/supabaseClient.ts`
- Modify: `src/lib/data.ts` and its consumers listed by `rg '@/lib/data' src tests`

- [ ] Add a typed read-only repository for connectors, outer molds, wire colors, gauges, types, protection options, lead-time options, and pricing rules.
- [ ] Make catalog-consuming UI render loading/empty states and source data from the repository; remove converted arrays from `src/lib/data.ts`.
- [ ] Preserve pure canvas configuration and command behaviors; do not embed Supabase rows directly inside `HarnessConfig`.

### Task 4: Change product-image association

**Files:**
- Modify: `src/lib/autoAssociateTwoDImages.ts`
- Test: `src/lib/__tests__/autoAssociateTwoDImages.test.ts`

- [ ] Add a failing test showing a four-core PVC jacketed wire at AWG 24 receives the configured product image.
- [ ] Replace the `awg === 22` condition with a four-core PVC jacketed-wire condition and use catalog image metadata rather than Vite root-file assets.
- [ ] Run the focused test and then the full test suite.

### Task 5: Validate migration and document image handoff

**Files:**
- Modify: `docs/supabase-backend-database-integration.md`

- [ ] Add the fixed seed IDs and Storage path handoff steps to the database document.
- [ ] Run SQL static checks, `npm.cmd run lint`, `npm.cmd run build`, and `npm.cmd test -- --run`.

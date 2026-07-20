# Supabase SQL execution order

Run the files in this order in the Supabase SQL Editor:

1. `00_reset/01_drop_all_tables.sql` only when a development reset is intended.
2. `10_schema/01_foundation.sql`
3. `10_schema/02_catalog.sql`
4. `10_schema/03_integrity.sql`
5. `10_schema/04_drawing_resources.sql`
6. `20_storage/01_buckets.sql`
7. `30_security/01_rls.sql`
8. `40_seed/01_example_catalog.sql`
9. `40_seed/03_drawing_workbench_resources.sql`
10. `40_seed/04_frontend_catalog.sql` (the catalog data migrated from `src/lib/data.ts`)
11. Upload images to the paths documented in `40_seed/02_image_manifest.sql`, then run that file.

The reset script drops both `public."user"` and the legacy `public.profiles` name so it is safe
to run before or after the rename migration.

For an existing development database, run 50_upgrade/02_rename_profiles_to_user.sql first when upgrading
the application user table, then run 50_upgrade/01_drawing_workbench_resources.sql followed by
50_upgrade/03_catalog_resource_main_tables.sql, and rerun 10_schema/03_integrity.sql, 30_security/01_rls.sql,
`40_seed/03_drawing_workbench_resources.sql`, and `40_seed/04_frontend_catalog.sql`.
The upgrades and both seeds are idempotent. For a clean test environment, prefer
00_reset/01_drop_all_tables.sql followed by the normal execution order above.

The catalog schema keeps catalog_items as the shared resource master and
catalog_item_images as the image table. Resource-specific data is stored in
one main table per type: connectors, wires, protective_sleeves,
overmolds, models, accessories, and packagings. The legacy
connector_pins and wire_spec_cores detail tables are folded into
connectors.pin_labels and wires.core_specs JSONB arrays.

The application user table is named `public."user"`; because `user` is a PostgreSQL keyword,
SQL references must quote it. Supabase Data API callers may still use the table name `user`.

`catalog-assets` is private. Upload transparent PNG or WebP files for images that need to be layered in the product-image view. JPEG files are supported for photographs but cannot be transparent.

Supplier, BOM, and quotation tables are intentionally absent from this version.

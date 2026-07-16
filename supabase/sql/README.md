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

For an existing database, run `50_upgrade/02_rename_profiles_to_user.sql` first when upgrading
the application user table, then run `50_upgrade/01_drawing_workbench_resources.sql`, and rerun
`10_schema/03_integrity.sql`, `30_security/01_rls.sql`,
`40_seed/03_drawing_workbench_resources.sql`, and `40_seed/04_frontend_catalog.sql`.
The upgrade and both seeds are idempotent.

The application user table is named `public."user"`; because `user` is a PostgreSQL keyword,
SQL references must quote it. Supabase Data API callers may still use the table name `user`.

`catalog-assets` is private. Upload transparent PNG or WebP files for images that need to be layered in the product-image view. JPEG files are supported for photographs but cannot be transparent.

Supplier, BOM, and quotation tables are intentionally absent from this version.

# Supabase SQL execution order

Run the files in this order in the Supabase SQL Editor:

1. `00_reset/01_drop_all_tables.sql` only when a development reset is intended.
2. `10_schema/01_foundation.sql`
3. `10_schema/02_catalog.sql`
4. `10_schema/03_integrity.sql`
5. `20_storage/01_buckets.sql`
6. `30_security/01_rls.sql`
7. `40_seed/01_example_catalog.sql`
8. Upload images to the paths documented in `40_seed/02_image_manifest.sql`, then run that file.

`catalog-assets` is private. Upload transparent PNG or WebP files for images that need to be layered in the product-image view. JPEG files are supported for photographs but cannot be transparent.

Supplier, BOM, and quotation tables are intentionally absent from this version.

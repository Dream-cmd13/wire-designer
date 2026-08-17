# Supabase SQL execution order

Run the files in this order in the Supabase SQL Editor:

1. `00_reset/01_drop_all_tables.sql` only when a development reset is intended.
2. `10_schema/01_foundation.sql`
3. `10_schema/02_catalog.sql` (resource master schema)
4. `10_schema/04_drawing_resources.sql`
5. `10_schema/05_business_options.sql`
6. `10_schema/06_document_persistence.sql`
7. `10_schema/03_integrity.sql` (runs after every table it audits exists)
8. `20_storage/01_buckets.sql`
9. `30_security/01_rls.sql`
10. `40_seed/01_example_catalog.sql`
11. `40_seed/03_drawing_workbench_resources.sql`
12. `40_seed/04_frontend_catalog.sql` (baseline connector, wire, and overmold resource rows)
13. `40_seed/05_business_options.sql` (quotation, lead-time, protection, and discount rules)
14. Upload images to the paths documented in `40_seed/02_image_manifest.sql`, then run that file.

After the SQL deployment, run the idempotent Storage bootstrap from CI, the deployment server,
or an administrator workstation:

```powershell
npm run supabase:bootstrap-storage
```

The command requires `SUPABASE_URL` (or `VITE_SUPABASE_URL`) and the server-only
`SUPABASE_SECRET_KEY` (legacy `SUPABASE_SERVICE_ROLE_KEY` is also accepted). It creates missing
`catalog-assets` and `project-assets` buckets, keeps existing private buckets unchanged, and repairs
either bucket if it was made public. Any management API failure returns a non-zero exit code.

The bootstrap command manages buckets only. It does not replace `30_security/01_rls.sql` or any
other database SQL. `20_storage/01_buckets.sql` also installs the restricted
`public.get_storage_bootstrap_status()` function used by the frontend's read-only health check.
Never expose the secret key through a `VITE_` variable or browser code.

The reset script drops both `public."user"` and the legacy `public.profiles` name so it is safe
to run before or after the rename migration.

For an existing development database, run 50_upgrade/02_rename_profiles_to_user.sql first when upgrading
the application user table, then run 50_upgrade/01_drawing_workbench_resources.sql followed by
50_upgrade/03_catalog_resource_main_tables.sql, 50_upgrade/04_frontend_business_data.sql, and
50_upgrade/05_resource_master_rename.sql. Rerun
10_schema/03_integrity.sql, 30_security/01_rls.sql, `40_seed/03_drawing_workbench_resources.sql`,
`40_seed/04_frontend_catalog.sql`, and `40_seed/05_business_options.sql` afterward.
The upgrades and seeds are idempotent. For a clean test environment, prefer
00_reset/01_drop_all_tables.sql followed by the normal execution order above.

The resource master schema keeps resource_items as the shared resource master and
resource_item_images as the image table. resource_group is an optional flat display
group stored on each resource; catalog_categories has been removed. Resource-specific data is stored in
one main table per type: connectors, wires, protective_sleeves,
overmolds, models, accessories, and packagings. The legacy
connector_pins and wire_spec_cores detail tables are folded into
connectors.pin_labels and wires.core_specs JSONB arrays.

Quotation options and document recovery are database-owned as well:
lead_time_options, protection_options, pricing_rules, quantity_discount_rules,
project_document_versions, drawing_documents, and drawing_document_versions.
The version tables are append-only; the active document rows are the current
snapshot used by the frontend.

The application user table is named `public."user"`; because `user` is a PostgreSQL keyword,
SQL references must quote it. Supabase Data API callers may still use the table name `user`.

`catalog-assets` is private. Upload transparent PNG or WebP files for images that need to be layered in the product-image view. JPEG files are supported for photographs but cannot be transparent.

Supplier, order, and BOM tables are intentionally absent from this version.
Quotation behavior is represented by the database-owned pricing and lead-time rules above.

-- Development reset only. This permanently deletes application test data.
-- Run only after confirming the target Supabase project.
-- Storage protects its metadata tables from direct deletion. Run
-- `npm run supabase:reset-project-assets` before this SQL when removing the obsolete bucket.

drop table if exists public.drawings cascade;
drop table if exists public.projects cascade;
drop table if exists public.catalog_items cascade;

drop table if exists public.drawing_document_versions cascade;
drop table if exists public.drawing_documents cascade;
drop table if exists public.project_document_versions cascade;
drop table if exists public.project_documents cascade;
drop table if exists public.project_assets cascade;
drop table if exists public.drawing_template_versions cascade;
drop table if exists public.drawing_templates cascade;
drop table if exists public.drawing_common_phrases cascade;
drop table if exists public.drawing_icons cascade;
drop table if exists public.resource_item_images cascade;
drop table if exists public.connectors cascade;
drop table if exists public.wires cascade;
drop table if exists public.protective_sleeves cascade;
drop table if exists public.overmolds cascade;
drop table if exists public.models cascade;
drop table if exists public.accessories cascade;
drop table if exists public.packagings cascade;
drop table if exists public.resource_items cascade;
drop table if exists public.catalog_item_images cascade;
drop table if exists public.catalog_categories cascade;
drop table if exists public.quantity_discount_rules cascade;
drop table if exists public.pricing_rules cascade;
drop table if exists public.protection_options cascade;
drop table if exists public.lead_time_options cascade;
drop table if exists public.wire_colors cascade;
drop table if exists public.wire_gauges cascade;
drop table if exists public.wire_types cascade;
drop table if exists public.wire_spec_cores cascade;
drop table if exists public.connector_pins cascade;
drop table if exists public.connector_specs cascade;
drop table if exists public.wire_specs cascade;
drop table if exists public.protective_sleeve_specs cascade;
drop table if exists public.overmold_specs cascade;
drop table if exists public.model_specs cascade;
drop table if exists public.accessory_specs cascade;
drop table if exists public.packaging_specs cascade;
drop table if exists public."user" cascade;
drop table if exists public.profiles cascade;

drop function if exists public.get_storage_bootstrap_status() cascade;
drop function if exists public.is_catalog_admin() cascade;
drop function if exists public.handle_new_auth_user() cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.set_audit_fields() cascade;
drop function if exists public.set_project_delete_audit() cascade;
drop function if exists public.prevent_version_mutation() cascade;
drop function if exists public.set_timestamp_fields() cascade;
drop function if exists public.enforce_resource_spec_item_type() cascade;
drop function if exists public.prevent_active_resource_spec_delete() cascade;
drop function if exists public.enforce_active_resource_item_integrity() cascade;

drop type if exists public.app_role cascade;
drop type if exists public.project_status cascade;
drop type if exists public.resource_item_type cascade;
drop type if exists public.resource_image_role cascade;

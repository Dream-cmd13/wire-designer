-- Development reset only. This destroys all application data in these tables.
-- It does not delete auth.users, Storage objects, buckets, functions, or enum types.

drop table if exists public.drawing_template_versions cascade;
drop table if exists public.drawing_templates cascade;
drop table if exists public.drawing_common_phrases cascade;
drop table if exists public.drawing_icons cascade;
drop table if exists public.wire_spec_cores cascade;
drop table if exists public.packaging_specs cascade;
drop table if exists public.accessory_specs cascade;
drop table if exists public.model_specs cascade;
drop table if exists public.catalog_item_images cascade;
drop table if exists public.connector_pins cascade;
drop table if exists public.connector_specs cascade;
drop table if exists public.wire_specs cascade;
drop table if exists public.protective_sleeve_specs cascade;
drop table if exists public.overmold_specs cascade;
drop table if exists public.catalog_items cascade;
drop table if exists public.catalog_categories cascade;
drop table if exists public.wire_colors cascade;
drop table if exists public.wire_gauges cascade;
drop table if exists public.wire_types cascade;
drop table if exists public.project_assets cascade;
drop table if exists public.project_documents cascade;
drop table if exists public.projects cascade;
drop table if exists public.profiles cascade;

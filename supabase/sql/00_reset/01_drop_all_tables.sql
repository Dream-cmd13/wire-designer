-- Development reset only. This destroys all application data in these tables.
-- It does not delete auth.users, Storage objects, buckets, functions, or enum types.

drop table if exists public.drawing_document_versions cascade;
drop table if exists public.drawing_documents cascade;
drop table if exists public.project_document_versions cascade;
drop table if exists public.drawing_template_versions cascade;
drop table if exists public.drawing_templates cascade;
drop table if exists public.drawing_common_phrases cascade;
drop table if exists public.drawing_icons cascade;
drop table if exists public.packagings cascade;
drop table if exists public.accessories cascade;
drop table if exists public.models cascade;
drop table if exists public.resource_item_images cascade;
drop table if exists public.protective_sleeves cascade;
drop table if exists public.overmolds cascade;
drop table if exists public.wires cascade;
drop table if exists public.connectors cascade;
-- Legacy development names are also removed so an old test database can be
-- reset before the new resource-main-table schema is applied.
drop table if exists public.wire_spec_cores cascade;
drop table if exists public.connector_pins cascade;
drop table if exists public.connector_specs cascade;
drop table if exists public.wire_specs cascade;
drop table if exists public.protective_sleeve_specs cascade;
drop table if exists public.overmold_specs cascade;
drop table if exists public.model_specs cascade;
drop table if exists public.accessory_specs cascade;
drop table if exists public.packaging_specs cascade;
drop table if exists public.resource_items cascade;
-- Retired catalog names are removed too, so a previous test database can be
-- reset before the resource-master schema is applied.
drop table if exists public.catalog_item_images cascade;
drop table if exists public.catalog_items cascade;
drop table if exists public.catalog_categories cascade;
drop table if exists public.quantity_discount_rules cascade;
drop table if exists public.pricing_rules cascade;
drop table if exists public.protection_options cascade;
drop table if exists public.lead_time_options cascade;
drop table if exists public.wire_colors cascade;
drop table if exists public.wire_gauges cascade;
drop table if exists public.wire_types cascade;
drop table if exists public.project_assets cascade;
drop table if exists public.project_documents cascade;
drop table if exists public.projects cascade;
drop table if exists public."user" cascade;
drop table if exists public.profiles cascade;

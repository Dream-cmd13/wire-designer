-- Development reset only.
-- This file intentionally contains destructive statements. Do not run it in
-- an environment that contains data you need to retain.

drop table if exists public.project_catalog_references cascade;
drop table if exists public.overmold_specs cascade;
drop table if exists public.protective_sleeve_specs cascade;
drop table if exists public.wire_specs cascade;
drop table if exists public.connector_pins cascade;
drop table if exists public.connector_specs cascade;
drop table if exists public.catalog_item_images cascade;
drop table if exists public.supplier_prices cascade;
drop table if exists public.catalog_item_organizations cascade;
drop table if exists public.catalog_items cascade;
drop table if exists public.organization_contacts cascade;
drop table if exists public.organizations cascade;
drop table if exists public.pricing_rules cascade;
drop table if exists public.protection_options cascade;
drop table if exists public.lead_time_options cascade;
drop table if exists public.wire_types cascade;
drop table if exists public.wire_gauges cascade;
drop table if exists public.wire_colors cascade;
drop table if exists public.catalog_categories cascade;
drop table if exists public.project_assets cascade;
drop table if exists public.project_documents cascade;
drop table if exists public.projects cascade;
drop table if exists public.profiles cascade;

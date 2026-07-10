-- Wire Harness Designer / Supabase initial schema
-- Run through Supabase CLI migrations or the Supabase SQL editor on a new project.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create type public.app_role as enum ('user', 'catalog_admin');
create type public.project_status as enum ('draft', 'in_progress', 'completed', 'archived');
create type public.catalog_item_type as enum ('connector', 'wire', 'protective_sleeve', 'overmold');
create type public.organization_kind as enum ('manufacturer', 'brand_owner', 'trader', 'supplier', 'other');
create type public.organization_relationship_type as enum ('manufacturer', 'brand_owner', 'trader', 'supplier');
create type public.supplier_price_status as enum ('active', 'expired', 'void');
create type public.catalog_image_purpose as enum ('product', 'drawing', 'dimension', 'packaging', 'other');
create type public.project_design_entity_type as enum ('connector', 'wire', 'protective_sleeve', 'overmold');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_path text,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 200),
  description text not null default '',
  status public.project_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create table public.project_documents (
  project_id uuid primary key references public.projects(id) on delete cascade,
  document jsonb not null,
  schema_version integer not null check (schema_version > 0),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.project_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  bucket text not null check (bucket = 'project-assets'),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create table public.catalog_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.catalog_categories(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 100),
  code text not null check (code ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  organization_kind public.organization_kind not null default 'other',
  website text,
  address text,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create table public.organization_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contact_name text not null check (length(btrim(contact_name)) between 1 and 100),
  job_title text,
  phone text,
  email text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  check (phone is not null or email is not null)
);

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  item_type public.catalog_item_type not null,
  resource_name text not null check (length(btrim(resource_name)) between 1 and 200),
  model text not null check (length(btrim(model)) between 1 and 200),
  manufacturer_part_number text,
  short_description text not null default '',
  detailed_description text not null default '',
  category_id uuid not null references public.catalog_categories(id) on delete restrict,
  lifecycle_status text not null default 'active'
    check (lifecycle_status in ('draft', 'active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create table public.catalog_item_organizations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.catalog_items(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  relationship_type public.organization_relationship_type not null,
  supplier_sku text,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  unique (item_id, organization_id, relationship_type),
  unique (id, relationship_type)
);

create table public.supplier_prices (
  id uuid primary key default gen_random_uuid(),
  item_organization_id uuid not null,
  relationship_type public.organization_relationship_type not null default 'supplier'
    check (relationship_type = 'supplier'),
  currency_code char(3) not null default 'CNY' check (currency_code = 'CNY'),
  purchase_unit text not null check (length(btrim(purchase_unit)) between 1 and 32),
  unit_price numeric(18, 6) not null check (unit_price >= 0),
  min_quantity numeric(18, 6) not null default 1 check (min_quantity > 0),
  max_quantity numeric(18, 6) check (max_quantity is null or max_quantity > min_quantity),
  minimum_order_quantity numeric(18, 6) check (minimum_order_quantity is null or minimum_order_quantity > 0),
  tax_rate numeric(5, 4) check (tax_rate is null or tax_rate between 0 and 1),
  effective_from date not null,
  effective_to date,
  quoted_at date not null default current_date,
  status public.supplier_price_status not null default 'active',
  remark text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  foreign key (item_organization_id, relationship_type)
    references public.catalog_item_organizations(id, relationship_type) on delete restrict,
  check (effective_to is null or effective_to >= effective_from)
);

alter table public.supplier_prices
  add constraint supplier_prices_no_active_overlap
  exclude using gist (
    item_organization_id with =,
    currency_code with =,
    purchase_unit with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&,
    numrange(min_quantity, coalesce(max_quantity, 'infinity'::numeric), '[)') with &&
  ) where (status = 'active');

create table public.catalog_item_images (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.catalog_items(id) on delete restrict,
  bucket text not null check (bucket = 'catalog-assets'),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type like 'image/%'),
  size_bytes bigint not null check (size_bytes >= 0),
  width_px integer check (width_px is null or width_px > 0),
  height_px integer check (height_px is null or height_px > 0),
  purpose public.catalog_image_purpose not null default 'product',
  display_order integer not null default 0 check (display_order >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create table public.connector_specs (
  catalog_item_id uuid primary key references public.catalog_items(id) on delete restrict,
  package text,
  series text,
  connector_type text,
  contact_type text,
  pin_count integer check (pin_count is null or pin_count > 0),
  row_count integer check (row_count is null or row_count > 0),
  pitch_mm numeric(10, 4) check (pitch_mm is null or pitch_mm > 0),
  row_pitch_mm numeric(10, 4) check (row_pitch_mm is null or row_pitch_mm > 0),
  contact_termination text,
  color text,
  features text,
  insulation_material text,
  operating_temperature_min_c numeric(8, 2),
  operating_temperature_max_c numeric(8, 2),
  rohs_status text,
  moisture_sensitivity_level text,
  reach_status text,
  remark text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  check (operating_temperature_max_c is null or operating_temperature_min_c is null
         or operating_temperature_max_c >= operating_temperature_min_c)
);

create table public.wire_specs (
  catalog_item_id uuid primary key references public.catalog_items(id) on delete restrict,
  spool_length_m numeric(18, 3) check (spool_length_m is null or spool_length_m > 0),
  conductor_color text,
  package text,
  cable_type text,
  wire_gauge_awg numeric(8, 2) check (wire_gauge_awg is null or wire_gauge_awg > 0),
  conductor_strand_count integer check (conductor_strand_count is null or conductor_strand_count > 0),
  conductor_material text,
  insulation_material text,
  insulation_outer_diameter_mm numeric(10, 4) check (insulation_outer_diameter_mm is null or insulation_outer_diameter_mm > 0),
  insulation_thickness_mm numeric(10, 4) check (insulation_thickness_mm is null or insulation_thickness_mm > 0),
  nominal_length_m numeric(18, 3) check (nominal_length_m is null or nominal_length_m > 0),
  rated_voltage_v numeric(12, 2) check (rated_voltage_v is null or rated_voltage_v > 0),
  operating_temperature_min_c numeric(8, 2),
  operating_temperature_max_c numeric(8, 2),
  jacket_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  check (operating_temperature_max_c is null or operating_temperature_min_c is null
         or operating_temperature_max_c >= operating_temperature_min_c)
);

create table public.protective_sleeve_specs (
  catalog_item_id uuid primary key references public.catalog_items(id) on delete restrict,
  material text,
  color text,
  sleeve_type text,
  shrink_ratio numeric(8, 4) check (shrink_ratio is null or shrink_ratio > 0),
  nominal_length_m numeric(18, 3) check (nominal_length_m is null or nominal_length_m > 0),
  inner_diameter_as_supplied_mm numeric(10, 4) check (inner_diameter_as_supplied_mm is null or inner_diameter_as_supplied_mm > 0),
  inner_diameter_recovered_mm numeric(10, 4) check (inner_diameter_recovered_mm is null or inner_diameter_recovered_mm > 0),
  recovered_wall_thickness_mm numeric(10, 4) check (recovered_wall_thickness_mm is null or recovered_wall_thickness_mm > 0),
  features text,
  operating_temperature_min_c numeric(8, 2),
  operating_temperature_max_c numeric(8, 2),
  shrink_temperature_c numeric(8, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  check (operating_temperature_max_c is null or operating_temperature_min_c is null
         or operating_temperature_max_c >= operating_temperature_min_c)
);

create table public.overmold_specs (
  catalog_item_id uuid primary key references public.catalog_items(id) on delete restrict,
  outer_material text,
  inner_material text,
  color text,
  outer_hardness_shore text,
  length_mm numeric(10, 3) check (length_mm is null or length_mm > 0),
  width_mm numeric(10, 3) check (width_mm is null or width_mm > 0),
  height_mm numeric(10, 3) check (height_mm is null or height_mm > 0),
  compatible_wire_diameter_min_mm numeric(10, 4) check (compatible_wire_diameter_min_mm is null or compatible_wire_diameter_min_mm > 0),
  compatible_wire_diameter_max_mm numeric(10, 4) check (compatible_wire_diameter_max_mm is null or compatible_wire_diameter_max_mm > 0),
  molding_temperature_c numeric(8, 2),
  process_description text not null default '',
  features text,
  remark text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  check (compatible_wire_diameter_max_mm is null or compatible_wire_diameter_min_mm is null
         or compatible_wire_diameter_max_mm >= compatible_wire_diameter_min_mm)
);

create table public.project_catalog_references (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  design_entity_type public.project_design_entity_type not null,
  design_entity_id uuid not null,
  catalog_item_id uuid not null references public.catalog_items(id) on delete restrict,
  supplier_price_id uuid references public.supplier_prices(id) on delete restrict,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  unique (project_id, design_entity_type, design_entity_id)
);

create or replace function public.set_audit_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles', 'projects', 'project_documents', 'project_assets',
    'catalog_categories', 'organizations', 'organization_contacts',
    'catalog_items', 'catalog_item_organizations', 'supplier_prices',
    'catalog_item_images', 'connector_specs', 'wire_specs',
    'protective_sleeve_specs', 'overmold_specs', 'project_catalog_references'
  ] loop
    execute format(
      'create trigger %I before insert or update on public.%I '
      || 'for each row execute function public.set_audit_fields()',
      table_name || '_set_audit_fields', table_name
    );
  end loop;
end;
$$;

create or replace function public.enforce_spec_item_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.catalog_items
    where id = new.catalog_item_id and item_type::text = tg_argv[0]
  ) then
    raise exception 'catalog item % must have type %', new.catalog_item_id, tg_argv[0];
  end if;
  return new;
end;
$$;

create trigger connector_specs_match_item_type
  before insert or update on public.connector_specs
  for each row execute function public.enforce_spec_item_type('connector');
create trigger wire_specs_match_item_type
  before insert or update on public.wire_specs
  for each row execute function public.enforce_spec_item_type('wire');
create trigger protective_sleeve_specs_match_item_type
  before insert or update on public.protective_sleeve_specs
  for each row execute function public.enforce_spec_item_type('protective_sleeve');
create trigger overmold_specs_match_item_type
  before insert or update on public.overmold_specs
  for each row execute function public.enforce_spec_item_type('overmold');

create or replace function public.enforce_active_catalog_item_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare has_spec boolean;
begin
  if new.lifecycle_status <> 'active' or new.deleted_at is not null then
    return null;
  end if;

  if exists (
    select 1 from public.catalog_categories c
    where c.parent_id = new.category_id and c.deleted_at is null
  ) then
    raise exception 'catalog item category % must be a leaf category', new.category_id;
  end if;

  select case new.item_type
    when 'connector' then exists (select 1 from public.connector_specs where catalog_item_id = new.id)
    when 'wire' then exists (select 1 from public.wire_specs where catalog_item_id = new.id)
    when 'protective_sleeve' then exists (select 1 from public.protective_sleeve_specs where catalog_item_id = new.id)
    when 'overmold' then exists (select 1 from public.overmold_specs where catalog_item_id = new.id)
  end into has_spec;

  if not coalesce(has_spec, false) then
    raise exception 'active catalog item % requires a matching % specification', new.id, new.item_type;
  end if;
  return null;
end;
$$;

create constraint trigger active_catalog_items_require_leaf_category_and_spec
  after insert or update on public.catalog_items
  deferrable initially deferred
  for each row execute function public.enforce_active_catalog_item_integrity();

create unique index catalog_categories_active_sibling_code_key
  on public.catalog_categories (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), code)
  where deleted_at is null;
create unique index organizations_active_name_kind_key
  on public.organizations (name, organization_kind) where deleted_at is null;
create unique index organization_contacts_one_active_primary
  on public.organization_contacts (organization_id) where is_primary and deleted_at is null;
create unique index catalog_items_active_model_key
  on public.catalog_items (item_type, model) where deleted_at is null;
create unique index catalog_item_images_one_active_primary
  on public.catalog_item_images (item_id) where is_primary and deleted_at is null;
create index projects_active_owner_updated_idx
  on public.projects (owner_id, updated_at desc) where deleted_at is null;
create index catalog_items_active_lookup_idx
  on public.catalog_items (item_type, category_id, model) where deleted_at is null and lifecycle_status = 'active';
create index catalog_items_active_resource_name_search_idx
  on public.catalog_items using gin (to_tsvector('simple', resource_name || ' ' || model))
  where deleted_at is null and lifecycle_status = 'active';
create index catalog_item_organizations_lookup_idx
  on public.catalog_item_organizations (organization_id, relationship_type, item_id);
create index supplier_prices_current_lookup_idx
  on public.supplier_prices (item_organization_id, effective_from desc)
  where status = 'active';
create index project_catalog_references_project_idx
  on public.project_catalog_references (project_id, catalog_item_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into storage.buckets (id, name, public)
values ('catalog-assets', 'catalog-assets', false), ('project-assets', 'project-assets', false)
on conflict (id) do update set public = excluded.public;

create or replace function public.is_catalog_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'catalog_admin'
  );
$$;

revoke all on function public.is_catalog_admin() from public;
grant execute on function public.is_catalog_admin() to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
revoke delete on all tables in schema public from authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;

alter table public.profiles enable row level security;
create policy "profile owner can read" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "profile owner can update allowed columns" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

alter table public.projects enable row level security;
create policy "owners read projects" on public.projects for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owners create projects" on public.projects for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "owners update projects" on public.projects for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

alter table public.project_documents enable row level security;
create policy "owners read project documents" on public.project_documents for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "owners create project documents" on public.project_documents for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "owners update project documents" on public.project_documents for update to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

alter table public.project_assets enable row level security;
create policy "owners read project assets" on public.project_assets for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "owners create project assets" on public.project_assets for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "owners update project assets" on public.project_assets for update to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

alter table public.project_catalog_references enable row level security;
create policy "owners read project catalog references" on public.project_catalog_references for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "owners create project catalog references" on public.project_catalog_references for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "owners update project catalog references" on public.project_catalog_references for update to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

alter table public.catalog_categories enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_contacts enable row level security;
alter table public.catalog_items enable row level security;
alter table public.catalog_item_organizations enable row level security;
alter table public.supplier_prices enable row level security;
alter table public.catalog_item_images enable row level security;
alter table public.connector_specs enable row level security;
alter table public.wire_specs enable row level security;
alter table public.protective_sleeve_specs enable row level security;
alter table public.overmold_specs enable row level security;

create policy "read active categories" on public.catalog_categories for select to authenticated using (deleted_at is null);
create policy "read active organizations" on public.organizations for select to authenticated using (deleted_at is null);
create policy "read active organization contacts" on public.organization_contacts for select to authenticated using (
  deleted_at is null and exists (select 1 from public.organizations o where o.id = organization_id and o.deleted_at is null));
create policy "read active catalog items" on public.catalog_items for select to authenticated using (deleted_at is null);
create policy "read active item organizations" on public.catalog_item_organizations for select to authenticated using (
  exists (select 1 from public.catalog_items i where i.id = item_id and i.deleted_at is null)
  and exists (select 1 from public.organizations o where o.id = organization_id and o.deleted_at is null));
create policy "read active supplier prices" on public.supplier_prices for select to authenticated using (
  exists (select 1 from public.catalog_item_organizations cio join public.catalog_items i on i.id = cio.item_id
          where cio.id = item_organization_id and i.deleted_at is null));
create policy "read active catalog images" on public.catalog_item_images for select to authenticated using (
  deleted_at is null and exists (select 1 from public.catalog_items i where i.id = item_id and i.deleted_at is null));
create policy "read active connector specs" on public.connector_specs for select to authenticated using (
  exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null));
create policy "read active wire specs" on public.wire_specs for select to authenticated using (
  exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null));
create policy "read active sleeve specs" on public.protective_sleeve_specs for select to authenticated using (
  exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null));
create policy "read active overmold specs" on public.overmold_specs for select to authenticated using (
  exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'catalog_categories', 'organizations', 'organization_contacts', 'catalog_items',
    'catalog_item_organizations', 'supplier_prices', 'catalog_item_images',
    'connector_specs', 'wire_specs', 'protective_sleeve_specs', 'overmold_specs'
  ] loop
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_catalog_admin()))',
                   table_name || ' insertable by catalog admins', table_name);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_catalog_admin())) with check ((select public.is_catalog_admin()))',
                   table_name || ' updatable by catalog admins', table_name);
  end loop;
end;
$$;

create policy "authenticated users read catalog assets" on storage.objects for select to authenticated
  using (
    bucket_id = 'catalog-assets'
    and exists (
      select 1 from public.catalog_item_images image
      join public.catalog_items item on item.id = image.item_id
      where image.bucket = bucket_id
        and image.storage_path = name
        and image.deleted_at is null
        and item.deleted_at is null
    )
  );
create policy "catalog admins upload catalog assets" on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog-assets' and (select public.is_catalog_admin()));
create policy "catalog admins update catalog assets" on storage.objects for update to authenticated
  using (bucket_id = 'catalog-assets' and (select public.is_catalog_admin()))
  with check (bucket_id = 'catalog-assets' and (select public.is_catalog_admin()));

create policy "owners read project assets in storage" on storage.objects for select to authenticated
  using (
    bucket_id = 'project-assets'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(name))[1]
        and p.owner_id = (select auth.uid()) and p.deleted_at is null
    )
  );
create policy "owners upload project assets in storage" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-assets'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(name))[1]
        and p.owner_id = (select auth.uid()) and p.deleted_at is null
    )
  );
create policy "owners update project assets in storage" on storage.objects for update to authenticated
  using (
    bucket_id = 'project-assets'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(name))[1]
        and p.owner_id = (select auth.uid()) and p.deleted_at is null
    )
  )
  with check (
    bucket_id = 'project-assets'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(name))[1]
        and p.owner_id = (select auth.uid()) and p.deleted_at is null
    )
  );

-- Promote the initial catalog administrator from a trusted SQL session only:
-- update public.profiles set role = 'catalog_admin' where id = '<auth-user-uuid>';

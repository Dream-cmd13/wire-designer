-- Catalog data for connectors, wires, protective sleeves, and overmolds.

do $$ begin
  create type public.catalog_item_type as enum ('connector', 'wire', 'protective_sleeve', 'overmold', 'model', 'accessory', 'packaging');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.catalog_image_role as enum (
    'product',
    'connector_before_top', 'connector_before_bottom', 'connector_before_left', 'connector_before_right',
    'connector_after_top', 'connector_after_bottom', 'connector_after_left', 'connector_after_right',
    'pinout', 'drawing', 'dimension', 'packaging', 'other'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.catalog_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.catalog_categories(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 100),
  code text not null check (code ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  description text not null default '',
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.wire_colors (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 50),
  hex_color char(7) not null check (hex_color ~ '^#[0-9A-Fa-f]{6}$'),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.wire_gauges (
  id uuid primary key default gen_random_uuid(),
  awg numeric(8, 2) not null check (awg > 0),
  conductor_diameter_mm numeric(10, 4) check (conductor_diameter_mm is null or conductor_diameter_mm > 0),
  max_current_a numeric(10, 3) check (max_current_a is null or max_current_a > 0),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.wire_types (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 100),
  description text not null default '',
  temperature_rating_c numeric(8, 2) check (temperature_rating_c is null or temperature_rating_c > 0),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  item_type public.catalog_item_type not null,
  legacy_key text not null check (legacy_key ~ '^[a-z0-9][a-z0-9_-]{0,99}$'),
  resource_name text not null check (length(btrim(resource_name)) between 1 and 200),
  model text not null check (length(btrim(model)) between 1 and 200),
  manufacturer_name text,
  manufacturer_part_number text,
  short_description text not null default '',
  detailed_description text not null default '',
  category_id uuid not null references public.catalog_categories(id) on delete restrict,
  lifecycle_status text not null default 'active' check (lifecycle_status in ('draft', 'active', 'inactive')),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.catalog_item_images (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.catalog_items(id) on delete cascade,
  bucket text not null default 'catalog-assets' check (bucket = 'catalog-assets'),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes bigint not null check (size_bytes >= 0),
  width_px integer check (width_px is null or width_px > 0),
  height_px integer check (height_px is null or height_px > 0),
  image_role public.catalog_image_role not null default 'product',
  is_primary boolean not null default false,
  display_order integer not null default 0 check (display_order >= 0),
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.connector_specs (
  catalog_item_id uuid primary key references public.catalog_items(id) on delete cascade,
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
  housing_material text,
  contact_material text,
  nut_material text,
  operating_temperature_min_c numeric(8, 2),
  operating_temperature_max_c numeric(8, 2),
  rohs_status text,
  reach_status text,
  remark text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  check (operating_temperature_max_c is null or operating_temperature_min_c is null or operating_temperature_max_c >= operating_temperature_min_c)
);

create table if not exists public.connector_pins (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references public.catalog_items(id) on delete cascade,
  pin_number integer not null check (pin_number > 0),
  pin_label text not null check (length(btrim(pin_label)) between 1 and 100),
  display_order integer not null check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  unique (catalog_item_id, pin_number),
  unique (catalog_item_id, display_order)
);

create table if not exists public.wire_specs (
  catalog_item_id uuid primary key references public.catalog_items(id) on delete cascade,
  spool_length_m numeric(18, 3) check (spool_length_m is null or spool_length_m > 0),
  core_count integer check (core_count is null or core_count > 0),
  -- The *_id columns are canonical references; legacy text/numeric fields remain
  -- temporarily for backwards-compatible reads and migration of old rows.
  wire_type_id uuid references public.wire_types(id) on delete restrict,
  wire_gauge_id uuid references public.wire_gauges(id) on delete restrict,
  conductor_color_id uuid references public.wire_colors(id) on delete restrict,
  jacket_color_id uuid references public.wire_colors(id) on delete restrict,
  jacket_material text,
  is_shielded boolean not null default false,
  conductor_color text,
  jacket_color text,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  check (operating_temperature_max_c is null or operating_temperature_min_c is null or operating_temperature_max_c >= operating_temperature_min_c)
);

-- Per-core data for multicore cables. A wire catalog item may have zero or more
-- rows here; core_index is stable within one wire specification.
create table if not exists public.wire_spec_cores (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references public.wire_specs(catalog_item_id) on delete cascade,
  core_index integer not null check (core_index > 0),
  color_id uuid not null references public.wire_colors(id) on delete restrict,
  signal_name text,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  unique (catalog_item_id, core_index)
);

create table if not exists public.protective_sleeve_specs (
  catalog_item_id uuid primary key references public.catalog_items(id) on delete cascade,
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
  check (operating_temperature_max_c is null or operating_temperature_min_c is null or operating_temperature_max_c >= operating_temperature_min_c)
);

create table if not exists public.overmold_specs (
  catalog_item_id uuid primary key references public.catalog_items(id) on delete cascade,
  outer_material text,
  inner_material text,
  inner_material_optional boolean not null default false,
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
  check (compatible_wire_diameter_max_mm is null or compatible_wire_diameter_min_mm is null or compatible_wire_diameter_max_mm >= compatible_wire_diameter_min_mm)
);

create table if not exists public.model_specs (
  catalog_item_id uuid primary key references public.catalog_items(id) on delete cascade,
  model_kind text not null,
  default_width_mm numeric(12, 3) not null check (default_width_mm > 0),
  default_height_mm numeric(12, 3) not null check (default_height_mm > 0),
  default_orientation text not null default 'none',
  model_parameters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accessory_specs (
  catalog_item_id uuid primary key references public.catalog_items(id) on delete cascade,
  accessory_kind text not null,
  specification text not null,
  material text,
  color text,
  unit text not null default 'PCS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.packaging_specs (
  catalog_item_id uuid primary key references public.catalog_items(id) on delete cascade,
  packaging_kind text not null,
  specification text not null,
  unit text not null default 'PCS',
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

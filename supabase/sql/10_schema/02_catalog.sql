-- Shared resource identity, resource main tables, and resource images.

do $$ begin
  create type public.resource_item_type as enum ('connector', 'wire', 'protective_sleeve', 'overmold', 'model', 'accessory', 'packaging');
exception when duplicate_object then null;
end $$;

-- Reset intentionally preserves enum types; reconcile older databases that
-- were created before model/accessory/packaging were introduced.
alter type public.resource_item_type add value if not exists 'model';
alter type public.resource_item_type add value if not exists 'accessory';
alter type public.resource_item_type add value if not exists 'packaging';

do $$ begin
  create type public.resource_image_role as enum (
    'product',
    'connector_before_top', 'connector_before_bottom', 'connector_before_left', 'connector_before_right',
    'connector_after_top', 'connector_after_bottom', 'connector_after_left', 'connector_after_right',
    'pinout', 'drawing', 'dimension', 'packaging', 'other'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.wire_colors (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 50),
  hex_color char(7) not null check (hex_color ~ '^#[0-9A-Fa-f]{6}$'),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  updated_by uuid references public."user"(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public."user"(id) on delete set null
);

create table if not exists public.wire_gauges (
  id uuid primary key default gen_random_uuid(),
  awg numeric(8, 2) not null check (awg > 0),
  conductor_diameter_mm numeric(10, 4) check (conductor_diameter_mm is null or conductor_diameter_mm > 0),
  max_current_a numeric(10, 3) check (max_current_a is null or max_current_a > 0),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  updated_by uuid references public."user"(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public."user"(id) on delete set null
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
  created_by uuid references public."user"(id) on delete set null,
  updated_by uuid references public."user"(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public."user"(id) on delete set null
);

-- Common resource identity. Type-specific values live in one main table per
-- resource_type below; images use this table as their stable parent.
create table if not exists public.resource_items (
  id uuid primary key default gen_random_uuid(),
  resource_type public.resource_item_type not null,
  resource_group text not null default '',
  legacy_key text not null check (legacy_key ~ '^[a-z0-9][a-z0-9_-]{0,99}$'),
  resource_name text not null check (length(btrim(resource_name)) between 1 and 200),
  model text not null check (length(btrim(model)) between 1 and 200),
  manufacturer_name text,
  manufacturer_part_number text,
  short_description text not null default '',
  detailed_description text not null default '',
  lifecycle_status text not null default 'active' check (lifecycle_status in ('draft', 'active', 'inactive')),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  updated_by uuid references public."user"(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public."user"(id) on delete set null
);

create table if not exists public.resource_item_images (
  id uuid primary key default gen_random_uuid(),
  resource_item_id uuid not null references public.resource_items(id) on delete cascade,
  bucket text not null default 'catalog-assets' check (bucket = 'catalog-assets'),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes bigint not null check (size_bytes >= 0),
  width_px integer check (width_px is null or width_px > 0),
  height_px integer check (height_px is null or height_px > 0),
  image_role public.resource_image_role not null default 'product',
  is_primary boolean not null default false,
  display_order integer not null default 0 check (display_order >= 0),
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  updated_by uuid references public."user"(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public."user"(id) on delete set null
);

-- Connector main table. Pin labels remain inline until per-pin electrical or
-- mating metadata makes a dedicated pin table necessary.
create table if not exists public.connectors (
  resource_item_id uuid primary key references public.resource_items(id) on delete cascade,
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
  pin_labels jsonb not null default '[]'::jsonb check (jsonb_typeof(pin_labels) = 'array'),
  operating_temperature_min_c numeric(8, 2),
  operating_temperature_max_c numeric(8, 2),
  rohs_status text,
  reach_status text,
  remark text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  updated_by uuid references public."user"(id) on delete set null,
  check (operating_temperature_max_c is null or operating_temperature_min_c is null or operating_temperature_max_c >= operating_temperature_min_c)
);

-- Wire catalog defaults consumed by the frontend wire-material dialog.
create table if not exists public.wires (
  resource_item_id uuid primary key references public.resource_items(id) on delete cascade,
  wire_kind text not null check (wire_kind in ('electronic', 'jacketed')),
  awg numeric(8, 2) not null check (awg > 0),
  ul_number text,
  conductor_color text,
  jacket_material text,
  jacket_color text,
  core_count integer,
  is_shielded boolean not null default false,
  core_colors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  updated_by uuid references public."user"(id) on delete set null,
  check (jsonb_typeof(core_colors) = 'array'),
  check (
    (
      wire_kind = 'electronic'
      and ul_number = '1007'
      and nullif(btrim(conductor_color), '') is not null
      and jacket_material is null
      and jacket_color is null
      and core_count is null
      and is_shielded = false
      and jsonb_array_length(core_colors) = 0
    )
    or
    (
      wire_kind = 'jacketed'
      and jacket_material in ('PVC', 'PUR')
      and jacket_color in ('black', 'green')
      and core_count in (1, 2, 3, 4, 5, 6, 8, 12, 17, 20, 24, 30, 32, 40, 50)
      and (ul_number is null or ul_number in ('UL2464', 'UL20276'))
      and jsonb_array_length(core_colors) = core_count
      and conductor_color is null
    )
  )
);

create table if not exists public.protective_sleeves (
  resource_item_id uuid primary key references public.resource_items(id) on delete cascade,
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
  created_by uuid references public."user"(id) on delete set null,
  updated_by uuid references public."user"(id) on delete set null,
  check (operating_temperature_max_c is null or operating_temperature_min_c is null or operating_temperature_max_c >= operating_temperature_min_c)
);

create table if not exists public.overmolds (
  resource_item_id uuid primary key references public.resource_items(id) on delete cascade,
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
  created_by uuid references public."user"(id) on delete set null,
  updated_by uuid references public."user"(id) on delete set null,
  check (compatible_wire_diameter_max_mm is null or compatible_wire_diameter_min_mm is null or compatible_wire_diameter_max_mm >= compatible_wire_diameter_min_mm)
);

create table if not exists public.models (
  resource_item_id uuid primary key references public.resource_items(id) on delete cascade,
  model_kind text not null,
  default_width_mm numeric(12, 3) not null check (default_width_mm > 0),
  default_height_mm numeric(12, 3) not null check (default_height_mm > 0),
  default_orientation text not null default 'none',
  model_parameters jsonb not null default '{}'::jsonb check (jsonb_typeof(model_parameters) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  updated_by uuid references public."user"(id) on delete set null
);

create table if not exists public.accessories (
  resource_item_id uuid primary key references public.resource_items(id) on delete cascade,
  accessory_kind text not null,
  specification text not null,
  material text,
  color text,
  unit text not null default 'PCS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  updated_by uuid references public."user"(id) on delete set null
);

create table if not exists public.packagings (
  resource_item_id uuid primary key references public.resource_items(id) on delete cascade,
  packaging_kind text not null,
  specification text not null,
  unit text not null default 'PCS',
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  updated_by uuid references public."user"(id) on delete set null
);

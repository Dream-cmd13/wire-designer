-- Non-destructive upgrade for public drawing workbench resources.

alter type public.catalog_item_type add value if not exists 'model';
alter type public.catalog_item_type add value if not exists 'accessory';
alter type public.catalog_item_type add value if not exists 'packaging';

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

create table if not exists public.drawing_templates (
  id uuid primary key default gen_random_uuid(), name text not null, category text not null,
  description text not null default '', thumbnail_path text, current_version integer not null default 1 check (current_version > 0),
  status text not null default 'active' check (status in ('draft', 'active', 'inactive')),
  display_order integer not null default 0 check (display_order >= 0), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.drawing_template_versions (
  id uuid primary key default gen_random_uuid(), template_id uuid not null references public.drawing_templates(id) on delete cascade,
  version_no integer not null check (version_no > 0), schema_version integer not null default 1 check (schema_version = 1),
  drawing_json jsonb not null check (jsonb_typeof(drawing_json) = 'object'), created_at timestamptz not null default now(),
  unique (template_id, version_no)
);
create table if not exists public.drawing_common_phrases (
  id uuid primary key default gen_random_uuid(), category text not null, phrase text not null, is_active boolean not null default true,
  display_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, unique (category, phrase)
);
create table if not exists public.drawing_icons (
  id uuid primary key default gen_random_uuid(), name text not null, category text not null, svg_path text not null,
  default_width numeric(12, 3) not null check (default_width > 0), default_height numeric(12, 3) not null check (default_height > 0),
  is_active boolean not null default true, display_order integer not null default 0, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz, unique (category, name)
);

create index if not exists drawing_templates_active_order_idx on public.drawing_templates (category, display_order, updated_at desc) where deleted_at is null and status = 'active';
create index if not exists drawing_template_versions_lookup_idx on public.drawing_template_versions (template_id, version_no desc);
create index if not exists drawing_common_phrases_active_order_idx on public.drawing_common_phrases (category, display_order) where deleted_at is null and is_active;
create index if not exists drawing_icons_active_order_idx on public.drawing_icons (category, display_order) where deleted_at is null and is_active;

create or replace function public.enforce_active_catalog_item_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
declare has_spec boolean;
begin
  if new.lifecycle_status <> 'active' or new.deleted_at is not null then return null; end if;
  select case new.item_type
    when 'connector' then exists (select 1 from public.connector_specs where catalog_item_id = new.id)
    when 'wire' then exists (select 1 from public.wire_specs where catalog_item_id = new.id)
    when 'protective_sleeve' then exists (select 1 from public.protective_sleeve_specs where catalog_item_id = new.id)
    when 'overmold' then exists (select 1 from public.overmold_specs where catalog_item_id = new.id)
    when 'model' then exists (select 1 from public.model_specs where catalog_item_id = new.id)
    when 'accessory' then exists (select 1 from public.accessory_specs where catalog_item_id = new.id)
    when 'packaging' then exists (select 1 from public.packaging_specs where catalog_item_id = new.id)
  end into has_spec;
  if not coalesce(has_spec, false) then raise exception 'active catalog item % requires a matching specification', new.id; end if;
  return null;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'model_specs_match_type' and tgrelid = 'public.model_specs'::regclass) then
    create trigger model_specs_match_type before insert or update on public.model_specs for each row execute function public.enforce_catalog_spec_item_type('model');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'accessory_specs_match_type' and tgrelid = 'public.accessory_specs'::regclass) then
    create trigger accessory_specs_match_type before insert or update on public.accessory_specs for each row execute function public.enforce_catalog_spec_item_type('accessory');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'packaging_specs_match_type' and tgrelid = 'public.packaging_specs'::regclass) then
    create trigger packaging_specs_match_type before insert or update on public.packaging_specs for each row execute function public.enforce_catalog_spec_item_type('packaging');
  end if;
end $$;

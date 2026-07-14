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

-- Public workbench resources are intentionally readable without login.
alter table public.model_specs enable row level security;
alter table public.accessory_specs enable row level security;
alter table public.packaging_specs enable row level security;
alter table public.drawing_templates enable row level security;
alter table public.drawing_template_versions enable row level security;
alter table public.drawing_common_phrases enable row level security;
alter table public.drawing_icons enable row level security;

grant select on public.catalog_categories, public.wire_colors, public.wire_gauges, public.wire_types,
  public.catalog_items, public.catalog_item_images, public.connector_specs, public.connector_pins,
  public.wire_specs, public.protective_sleeve_specs, public.overmold_specs, public.model_specs,
  public.accessory_specs, public.packaging_specs, public.drawing_templates, public.drawing_template_versions,
  public.drawing_common_phrases, public.drawing_icons to anon, authenticated;

create or replace function pg_temp.create_public_read_policy(target_policy text, target_table text, using_expression text)
returns void language plpgsql as $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = target_table
      and policyname = target_policy
  ) then
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (%s)',
      target_policy,
      target_table,
      using_expression
    );
  end if;
end;
$$;

select pg_temp.create_public_read_policy('public categories read', 'catalog_categories', 'deleted_at is null');
select pg_temp.create_public_read_policy('public wire colors read', 'wire_colors', 'deleted_at is null');
select pg_temp.create_public_read_policy('public wire gauges read', 'wire_gauges', 'deleted_at is null');
select pg_temp.create_public_read_policy('public wire types read', 'wire_types', 'deleted_at is null');
select pg_temp.create_public_read_policy('public catalog items read', 'catalog_items', 'deleted_at is null and lifecycle_status = ''active''');
select pg_temp.create_public_read_policy('public catalog images read', 'catalog_item_images', 'deleted_at is null and exists (select 1 from public.catalog_items i where i.id = item_id and i.deleted_at is null and i.lifecycle_status = ''active'')');
select pg_temp.create_public_read_policy('public connector specs read', 'connector_specs', 'exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = ''active'')');
select pg_temp.create_public_read_policy('public connector pins read', 'connector_pins', 'exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = ''active'')');
select pg_temp.create_public_read_policy('public wire specs read', 'wire_specs', 'exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = ''active'')');
select pg_temp.create_public_read_policy('public sleeve specs read', 'protective_sleeve_specs', 'exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = ''active'')');
select pg_temp.create_public_read_policy('public overmold specs read', 'overmold_specs', 'exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = ''active'')');
select pg_temp.create_public_read_policy('public model specs read', 'model_specs', 'exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = ''active'')');
select pg_temp.create_public_read_policy('public accessory specs read', 'accessory_specs', 'exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = ''active'')');
select pg_temp.create_public_read_policy('public packaging specs read', 'packaging_specs', 'exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = ''active'')');
select pg_temp.create_public_read_policy('public drawing templates read', 'drawing_templates', 'deleted_at is null and status = ''active''');
select pg_temp.create_public_read_policy('public drawing template versions read', 'drawing_template_versions', 'exists (select 1 from public.drawing_templates t where t.id = template_id and t.deleted_at is null and t.status = ''active'')');
select pg_temp.create_public_read_policy('public drawing phrases read', 'drawing_common_phrases', 'deleted_at is null and is_active');
select pg_temp.create_public_read_policy('public drawing icons read', 'drawing_icons', 'deleted_at is null and is_active');

do $$
begin
  drop policy if exists "catalog assets authenticated read" on storage.objects;
  drop policy if exists "catalog assets public read" on storage.objects;
  create policy "catalog assets public read" on storage.objects for select to anon, authenticated using (
    bucket_id = 'catalog-assets' and exists (select 1 from public.catalog_item_images image join public.catalog_items item on item.id = image.item_id where image.storage_path = storage.objects.name and image.deleted_at is null and item.deleted_at is null and item.lifecycle_status = 'active')
  );
end;
$$;

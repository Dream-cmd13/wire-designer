-- Public drawing templates and editor resources.

create table if not exists public.drawing_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  category text not null check (length(btrim(category)) between 1 and 100),
  description text not null default '',
  thumbnail_path text,
  current_version integer not null default 1 check (current_version > 0),
  status text not null default 'active' check (status in ('draft', 'active', 'inactive')),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.drawing_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.drawing_templates(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  schema_version integer not null default 1 check (schema_version = 1),
  drawing_json jsonb not null check (jsonb_typeof(drawing_json) = 'object'),
  created_at timestamptz not null default now(),
  unique (template_id, version_no)
);

create table if not exists public.drawing_common_phrases (
  id uuid primary key default gen_random_uuid(),
  category text not null check (length(btrim(category)) between 1 and 100),
  phrase text not null check (length(btrim(phrase)) between 1 and 500),
  is_active boolean not null default true,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (category, phrase)
);

create table if not exists public.drawing_icons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  category text not null check (length(btrim(category)) between 1 and 100),
  svg_path text not null check (length(btrim(svg_path)) > 0),
  default_width numeric(12, 3) not null check (default_width > 0),
  default_height numeric(12, 3) not null check (default_height > 0),
  is_active boolean not null default true,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (category, name)
);

create index if not exists drawing_templates_active_order_idx on public.drawing_templates (category, display_order, updated_at desc) where deleted_at is null and status = 'active';
create index if not exists drawing_template_versions_lookup_idx on public.drawing_template_versions (template_id, version_no desc);
create index if not exists drawing_common_phrases_active_order_idx on public.drawing_common_phrases (category, display_order) where deleted_at is null and is_active;
create index if not exists drawing_icons_active_order_idx on public.drawing_icons (category, display_order) where deleted_at is null and is_active;

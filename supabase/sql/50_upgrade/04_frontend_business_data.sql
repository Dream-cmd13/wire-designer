-- Upgrade an existing test database with the dictionaries and persistence
-- tables needed by the database-backed frontend.
-- Run after 50_upgrade/03_catalog_resource_main_tables.sql and before
-- rerunning 10_schema/03_integrity.sql and 30_security/01_rls.sql.

begin;

create table if not exists public.lead_time_options (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  display_name text not null,
  display_days text not null default '',
  multiplier numeric(12, 6) not null default 1,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  updated_by uuid references public."user"(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public."user"(id) on delete set null
);

create table if not exists public.protection_options (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  display_name text not null,
  price_per_meter numeric(18, 6) not null default 0,
  material_multipliers jsonb not null default '{}'::jsonb,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  updated_by uuid references public."user"(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public."user"(id) on delete set null
);

create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  rule_code text not null,
  rule_key text not null,
  numeric_value numeric(18, 6) not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  updated_by uuid references public."user"(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public."user"(id) on delete set null
);

create table if not exists public.quantity_discount_rules (
  id uuid primary key default gen_random_uuid(),
  minimum_quantity integer not null,
  multiplier numeric(12, 6) not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  updated_by uuid references public."user"(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public."user"(id) on delete set null
);

create table if not exists public.project_document_versions (
  project_id uuid not null references public.projects(id) on delete cascade,
  revision bigint not null check (revision > 0),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  schema_version integer not null check (schema_version > 0),
  created_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  primary key (project_id, revision)
);

create table if not exists public.drawing_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public."user"(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  name text not null,
  drawing_json jsonb not null check (jsonb_typeof(drawing_json) = 'object'),
  schema_version integer not null default 1,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  updated_by uuid references public."user"(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public."user"(id) on delete set null
);

create table if not exists public.drawing_document_versions (
  drawing_id uuid not null references public.drawing_documents(id) on delete cascade,
  revision bigint not null check (revision > 0),
  drawing_json jsonb not null check (jsonb_typeof(drawing_json) = 'object'),
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  primary key (drawing_id, revision)
);

create unique index if not exists lead_time_options_active_code_key
  on public.lead_time_options (code) where deleted_at is null;
create unique index if not exists protection_options_active_code_key
  on public.protection_options (code) where deleted_at is null;
create unique index if not exists pricing_rules_active_key
  on public.pricing_rules (rule_code, rule_key) where deleted_at is null;
create unique index if not exists quantity_discount_rules_active_minimum_key
  on public.quantity_discount_rules (minimum_quantity) where deleted_at is null;

insert into public.lead_time_options (code, display_name, display_days, multiplier, display_order)
values
  ('rush', '加急', '10个工作日', 1.3, 10),
  ('standard', '标准', '20-30个工作日', 1.0, 20),
  ('economy', '经济', '30-50个工作日', 0.9, 30)
on conflict (code) where deleted_at is null do update set
  display_name = excluded.display_name, display_days = excluded.display_days,
  multiplier = excluded.multiplier, display_order = excluded.display_order,
  is_active = true, deleted_at = null, updated_at = now();

insert into public.protection_options (code, display_name, price_per_meter, material_multipliers, display_order)
values
  ('none', '无', 0, '{}'::jsonb, 10),
  ('acetate-cloth', '醋酸布', 2.2, '{}'::jsonb, 20),
  ('fleece', '绒布', 2.8, '{}'::jsonb, 30),
  ('heat-shrink', '热缩管', 1.67, '{}'::jsonb, 40),
  ('braided', '编织网管', 3.33, '{}'::jsonb, 50),
  ('spiral', '螺旋缠绕管', 0.8, '{}'::jsonb, 60),
  ('convoluted', '波纹管', 1.2, '{}'::jsonb, 70),
  ('corrugated', '波纹管（可选材质）', 4.0, '{"PP":1.0,"PA":1.4,"stainless-steel":3.2}'::jsonb, 80)
on conflict (code) where deleted_at is null do update set
  display_name = excluded.display_name, price_per_meter = excluded.price_per_meter,
  material_multipliers = excluded.material_multipliers, display_order = excluded.display_order,
  is_active = true, deleted_at = null, updated_at = now();

insert into public.pricing_rules (rule_code, rule_key, numeric_value, display_order)
values
  ('connector', 'base', 0.5, 10), ('connector', 'per_pin', 0.3, 20),
  ('wire_per_meter', 'awg_22', 2.0, 10), ('wire_per_meter', 'awg_24', 1.5, 20),
  ('wire_per_meter', 'awg_26', 1.0, 30), ('wire_per_meter', 'awg_28', 0.8, 40),
  ('wire_per_meter', 'awg_30', 0.6, 50),
  ('wire_type_multiplier', 'silicone', 1.5, 10), ('wire_type_multiplier', 'ul1007', 1.0, 20),
  ('wire_type_multiplier', 'ul1061', 0.9, 30), ('wire_type_multiplier', 'gxl', 1.3, 40),
  ('wire_type_multiplier', 'ptfe', 2.0, 50),
  ('labor', 'per_connector', 2.0, 10), ('labor', 'per_meter', 1.5, 20),
  ('jacketed', 'core_factor', 0.6, 10)
on conflict (rule_code, rule_key) where deleted_at is null do update set
  numeric_value = excluded.numeric_value, display_order = excluded.display_order,
  is_active = true, deleted_at = null, updated_at = now();

insert into public.quantity_discount_rules (minimum_quantity, multiplier, display_order)
values (1, 1.0, 10), (5, 0.95, 20), (10, 0.9, 30), (20, 0.85, 40), (50, 0.8, 50), (100, 0.7, 60)
on conflict (minimum_quantity) where deleted_at is null do update set
  multiplier = excluded.multiplier, display_order = excluded.display_order,
  is_active = true, deleted_at = null, updated_at = now();

commit;

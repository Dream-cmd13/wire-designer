-- Business dictionaries and pricing parameters used by the frontend.

create table if not exists public.lead_time_options (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 100),
  display_days text not null default '',
  multiplier numeric(12, 6) not null check (multiplier > 0),
  display_order integer not null default 0 check (display_order >= 0),
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
  code text not null check (code ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 100),
  price_per_meter numeric(18, 6) not null default 0 check (price_per_meter >= 0),
  material_multipliers jsonb not null default '{}'::jsonb check (jsonb_typeof(material_multipliers) = 'object'),
  display_order integer not null default 0 check (display_order >= 0),
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
  rule_code text not null check (rule_code ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  rule_key text not null check (length(btrim(rule_key)) between 1 and 100),
  numeric_value numeric(18, 6) not null,
  display_order integer not null default 0 check (display_order >= 0),
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
  minimum_quantity integer not null check (minimum_quantity > 0),
  multiplier numeric(12, 6) not null check (multiplier > 0 and multiplier <= 1),
  display_order integer not null default 0 check (display_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  updated_by uuid references public."user"(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public."user"(id) on delete set null
);


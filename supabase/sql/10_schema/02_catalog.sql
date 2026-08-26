create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'connector', 'wire', 'protective_sleeve', 'overmold',
    'model', 'accessory', 'packaging'
  )),
  code text not null check (code ~ '^[a-z0-9][a-z0-9_-]{0,99}$'),
  name text not null check (length(btrim(name)) between 1 and 200),
  model text not null check (length(btrim(model)) between 1 and 200),
  manufacturer text not null default '',
  resource_group text not null default '',
  description text not null default '',
  image_path text,
  image_variants jsonb not null default '{}'::jsonb
    check (jsonb_typeof(image_variants) = 'object'),
  sort_order integer not null default 0 check (sort_order >= 0),
  spec jsonb not null default '{}'::jsonb check (jsonb_typeof(spec) = 'object'),
  constraint catalog_items_overmold_spec_check check (kind <> 'overmold' or (spec ? 'outerMaterial' and jsonb_typeof(spec->'outerMaterial') = 'string' and length(btrim(spec->>'outerMaterial')) > 0 and spec ? 'innerMaterial' and jsonb_typeof(spec->'innerMaterial') = 'string' and length(btrim(spec->>'innerMaterial')) > 0 and spec ? 'innerMaterialOptional' and jsonb_typeof(spec->'innerMaterialOptional') = 'boolean' and spec->>'innerMaterialOptional' = 'true' and (not (spec ? 'outerForm') or spec->>'outerForm' in ('straight', 'bent')))),
  unique (kind, code)
);

create index catalog_items_kind_order_idx
  on public.catalog_items (kind, resource_group, sort_order, name);

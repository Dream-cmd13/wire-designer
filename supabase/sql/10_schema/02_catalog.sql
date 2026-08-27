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
  constraint catalog_items_overmold_spec_check check (
    (kind <> 'overmold') or
    (
      (spec ? 'outerMaterial') and
      (jsonb_typeof(spec->'outerMaterial') = 'string') and
      (spec->>'outerMaterial' in ('黑色PVC', '黑色TPE')) and
      (spec ? 'outerForm') and
      (jsonb_typeof(spec->'outerForm') = 'string') and
      (spec->>'outerForm' in ('straight', 'bent')) and
      (not (spec ? 'innerMaterialOptional')) and
      (
        (
          (spec->>'outerMaterial' = '黑色PVC') and
          (spec ? 'outerHardness') and
          (jsonb_typeof(spec->'outerHardness') = 'string') and
          (spec->>'outerHardness' = '45P')
        ) or
        (
          (spec->>'outerMaterial' = '黑色TPE') and
          (not (spec ? 'outerHardness'))
        )
      ) and
      (
        (
          (not (spec ? 'innerMaterial')) and
          (not (spec ? 'innerForm'))
        ) or
        (
          (spec ? 'innerMaterial') and
          (jsonb_typeof(spec->'innerMaterial') = 'string') and
          (spec->>'innerMaterial' = '低密度透明PE') and
          (spec ? 'innerForm') and
          (jsonb_typeof(spec->'innerForm') = 'string') and
          (spec->>'innerForm' = spec->>'outerForm')
        )
      )
    ) is true
  ),
  unique (kind, code)
);

create index catalog_items_kind_order_idx
  on public.catalog_items (kind, resource_group, sort_order, name);

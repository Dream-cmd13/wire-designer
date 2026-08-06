-- Rename the legacy catalog master schema to the resource master schema.
-- Run after 50_upgrade/04_frontend_business_data.sql and before rerunning
-- 10_schema/03_integrity.sql, 30_security/01_rls.sql, and the resource seeds.

begin;

-- The physical master tables are renamed in place so existing resource IDs,
-- foreign-key values, and image records remain intact.
do $$
begin
  if to_regclass('public.catalog_items') is not null
     and to_regclass('public.resource_items') is not null then
    raise exception 'cannot rename catalog_items: resource_items already exists';
  elsif to_regclass('public.catalog_items') is not null then
    alter table public.catalog_items rename to resource_items;
  end if;

  if to_regclass('public.catalog_item_images') is not null
     and to_regclass('public.resource_item_images') is not null then
    raise exception 'cannot rename catalog_item_images: resource_item_images already exists';
  elsif to_regclass('public.catalog_item_images') is not null then
    alter table public.catalog_item_images rename to resource_item_images;
  end if;
end;
$$;

-- Enum names are part of the public schema contract as well.
do $$
begin
  if exists (
    select 1 from pg_type type_row join pg_namespace namespace_row on namespace_row.oid = type_row.typnamespace
    where namespace_row.nspname = 'public' and type_row.typname = 'catalog_item_type'
  ) and exists (
    select 1 from pg_type type_row join pg_namespace namespace_row on namespace_row.oid = type_row.typnamespace
    where namespace_row.nspname = 'public' and type_row.typname = 'resource_item_type'
  ) then
    raise exception 'cannot rename catalog_item_type: resource_item_type already exists';
  elsif exists (
    select 1 from pg_type type_row join pg_namespace namespace_row on namespace_row.oid = type_row.typnamespace
    where namespace_row.nspname = 'public' and type_row.typname = 'catalog_item_type'
  ) then
    alter type public.catalog_item_type rename to resource_item_type;
  end if;

  if exists (
    select 1 from pg_type type_row join pg_namespace namespace_row on namespace_row.oid = type_row.typnamespace
    where namespace_row.nspname = 'public' and type_row.typname = 'catalog_image_role'
  ) and exists (
    select 1 from pg_type type_row join pg_namespace namespace_row on namespace_row.oid = type_row.typnamespace
    where namespace_row.nspname = 'public' and type_row.typname = 'resource_image_role'
  ) then
    raise exception 'cannot rename catalog_image_role: resource_image_role already exists';
  elsif exists (
    select 1 from pg_type type_row join pg_namespace namespace_row on namespace_row.oid = type_row.typnamespace
    where namespace_row.nspname = 'public' and type_row.typname = 'catalog_image_role'
  ) then
    alter type public.catalog_image_role rename to resource_image_role;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.resource_items') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'resource_items' and column_name = 'item_type'
     ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'resource_items' and column_name = 'resource_type'
    ) then
      raise exception 'cannot rename resource_items.item_type: resource_type already exists';
    end if;
    alter table public.resource_items rename column item_type to resource_type;
  end if;

  if to_regclass('public.resource_items') is not null then
    alter table public.resource_items add column if not exists resource_group text not null default '';
  end if;

  if to_regclass('public.resource_item_images') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'resource_item_images' and column_name = 'item_id'
     ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'resource_item_images' and column_name = 'resource_item_id'
    ) then
      raise exception 'cannot rename resource_item_images.item_id: resource_item_id already exists';
    end if;
    alter table public.resource_item_images rename column item_id to resource_item_id;
  end if;
end;
$$;

-- Main resource tables retain their one-to-one relation, with a name that
-- describes the resource master rather than the removed catalog concept.
do $$
declare
  resource_table_name text;
begin
  foreach resource_table_name in array array[
    'connectors', 'wires', 'protective_sleeves', 'overmolds',
    'models', 'accessories', 'packagings'
  ] loop
    if to_regclass(format('public.%I', resource_table_name)) is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = resource_table_name and column_name = 'catalog_item_id'
       ) then
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = resource_table_name and column_name = 'resource_item_id'
      ) then
        raise exception 'cannot rename %.catalog_item_id: resource_item_id already exists', resource_table_name;
      end if;
      execute format('alter table public.%I rename column catalog_item_id to resource_item_id', resource_table_name);
    end if;
  end loop;
end;
$$;

-- Preserve the old leaf-category label as an optional flat display group,
-- then remove the hierarchy and its foreign key completely.
do $$
begin
  if to_regclass('public.resource_items') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'resource_items' and column_name = 'category_id'
     ) then
    if to_regclass('public.catalog_categories') is not null then
      update public.resource_items item
      set resource_group = coalesce(category.name, '')
      from public.catalog_categories category
      where item.category_id = category.id
        and item.resource_group = '';
    end if;

    alter table public.resource_items drop column category_id;
  end if;
end;
$$;

drop table if exists public.catalog_categories;

-- The canonical integrity script recreates the new trigger names/functions.
-- Remove legacy trigger bindings so it does not retain catalog-era functions.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'connectors', 'wires', 'protective_sleeves', 'overmolds',
    'models', 'accessories', 'packagings'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('drop trigger if exists %I on public.%I', table_name || '_match_type', table_name);
      execute format('drop trigger if exists %I on public.%I', table_name || '_prevent_active_delete', table_name);
    end if;
  end loop;

  if to_regclass('public.resource_items') is not null then
    drop trigger if exists active_catalog_items_require_resource on public.resource_items;
    drop trigger if exists active_catalog_items_require_spec on public.resource_items;
    drop trigger if exists catalog_items_set_audit_fields on public.resource_items;
  end if;

  if to_regclass('public.resource_item_images') is not null then
    drop trigger if exists catalog_item_images_set_audit_fields on public.resource_item_images;
  end if;
end;
$$;

drop function if exists public.enforce_catalog_spec_item_type();
drop function if exists public.prevent_active_catalog_spec_delete();
drop function if exists public.enforce_active_catalog_item_integrity();

-- Parent and image policies receive new names when the canonical RLS script
-- is rerun. Child-table policies keep their established resource table names.
do $$
begin
  if to_regclass('public.resource_items') is not null then
    drop policy if exists "active catalog items read" on public.resource_items;
    drop policy if exists "public catalog items read" on public.resource_items;
    drop policy if exists "catalog_items catalog admin write" on public.resource_items;
  end if;

  if to_regclass('public.resource_item_images') is not null then
    drop policy if exists "active catalog images read" on public.resource_item_images;
    drop policy if exists "public catalog images read" on public.resource_item_images;
    drop policy if exists "catalog_item_images catalog admin write" on public.resource_item_images;
  end if;
end;
$$;

-- Keep index metadata aligned with the renamed tables. The legacy lookup
-- index includes category_id and is dropped automatically with that column;
-- 10_schema/03_integrity.sql creates its resource_group replacement.
do $$
declare
  old_name text;
  new_name text;
begin
  for old_name, new_name in
    select * from (values
      ('catalog_items_active_model_key', 'resource_items_active_model_key'),
      ('catalog_items_active_legacy_key', 'resource_items_active_legacy_key'),
      ('catalog_items_active_search_idx', 'resource_items_active_search_idx'),
      ('catalog_item_images_one_active_primary', 'resource_item_images_one_active_primary'),
      ('catalog_item_images_item_order_idx', 'resource_item_images_item_order_idx')
    ) as index_names(old_name, new_name)
  loop
    if to_regclass(format('public.%I', old_name)) is not null
       and to_regclass(format('public.%I', new_name)) is null then
      execute format('alter index public.%I rename to %I', old_name, new_name);
    end if;
  end loop;
end;
$$;

commit;

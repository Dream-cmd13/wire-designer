create or replace function public.set_audit_fields()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles', 'projects', 'project_documents', 'project_assets',
    'catalog_categories', 'wire_colors', 'wire_gauges', 'wire_types',
    'catalog_items', 'catalog_item_images', 'connector_specs', 'connector_pins',
    'wire_specs', 'wire_spec_cores', 'protective_sleeve_specs', 'overmold_specs'
  ] loop
    if not exists (select 1 from pg_trigger where tgname = table_name || '_set_audit_fields' and tgrelid = format('public.%I', table_name)::regclass) then
      execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_audit_fields()', table_name || '_set_audit_fields', table_name);
    end if;
  end loop;
end;
$$;

-- Remove the old generic audit triggers from timestamp-only tables when this
-- file is rerun on a database created by an earlier schema version.
do $$
declare table_name text;
begin
  foreach table_name in array array['model_specs', 'accessory_specs', 'packaging_specs'] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_audit_fields', table_name);
  end loop;
end;
$$;

-- Some catalog/resource tables intentionally carry timestamps but not actor
-- columns. Keep their timestamps consistent without assigning missing fields.
create or replace function public.set_timestamp_fields()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
  end if;
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'model_specs', 'accessory_specs', 'packaging_specs',
    'drawing_templates', 'drawing_common_phrases', 'drawing_icons'
  ] loop
    if not exists (select 1 from pg_trigger where tgname = table_name || '_set_timestamp_fields' and tgrelid = format('public.%I', table_name)::regclass) then
      execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_timestamp_fields()', table_name || '_set_timestamp_fields', table_name);
    end if;
  end loop;
end;
$$;

create or replace function public.enforce_catalog_spec_item_type()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.catalog_items where id = new.catalog_item_id and item_type::text = tg_argv[0]) then
    raise exception 'catalog item % must have type %', new.catalog_item_id, tg_argv[0];
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'connector_specs_match_type' and tgrelid = 'public.connector_specs'::regclass) then
    create trigger connector_specs_match_type before insert or update on public.connector_specs for each row execute function public.enforce_catalog_spec_item_type('connector');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'connector_pins_match_type' and tgrelid = 'public.connector_pins'::regclass) then
    create trigger connector_pins_match_type before insert or update on public.connector_pins for each row execute function public.enforce_catalog_spec_item_type('connector');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'wire_specs_match_type' and tgrelid = 'public.wire_specs'::regclass) then
    create trigger wire_specs_match_type before insert or update on public.wire_specs for each row execute function public.enforce_catalog_spec_item_type('wire');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'wire_spec_cores_match_type' and tgrelid = 'public.wire_spec_cores'::regclass) then
    create trigger wire_spec_cores_match_type before insert or update on public.wire_spec_cores for each row execute function public.enforce_catalog_spec_item_type('wire');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'protective_sleeve_specs_match_type' and tgrelid = 'public.protective_sleeve_specs'::regclass) then
    create trigger protective_sleeve_specs_match_type before insert or update on public.protective_sleeve_specs for each row execute function public.enforce_catalog_spec_item_type('protective_sleeve');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'overmold_specs_match_type' and tgrelid = 'public.overmold_specs'::regclass) then
    create trigger overmold_specs_match_type before insert or update on public.overmold_specs for each row execute function public.enforce_catalog_spec_item_type('overmold');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'model_specs_match_type' and tgrelid = 'public.model_specs'::regclass) then
    create trigger model_specs_match_type before insert or update on public.model_specs for each row execute function public.enforce_catalog_spec_item_type('model');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'accessory_specs_match_type' and tgrelid = 'public.accessory_specs'::regclass) then
    create trigger accessory_specs_match_type before insert or update on public.accessory_specs for each row execute function public.enforce_catalog_spec_item_type('accessory');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'packaging_specs_match_type' and tgrelid = 'public.packaging_specs'::regclass) then
    create trigger packaging_specs_match_type before insert or update on public.packaging_specs for each row execute function public.enforce_catalog_spec_item_type('packaging');
  end if;
end;
$$;

-- Prevent an active catalog item from losing the specification required by its
-- item_type. Archive the item first, then edit or delete its specification.
create or replace function public.prevent_active_catalog_spec_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1
    from public.catalog_items item
    where item.id = old.catalog_item_id
      and item.deleted_at is null
      and item.lifecycle_status = 'active'
  ) then
    raise exception 'cannot delete % for active catalog item %; archive the item first', tg_table_name, old.catalog_item_id;
  end if;
  return old;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'connector_specs', 'connector_pins', 'wire_specs', 'wire_spec_cores',
    'protective_sleeve_specs', 'overmold_specs', 'model_specs',
    'accessory_specs', 'packaging_specs'
  ] loop
    if not exists (
      select 1
      from pg_trigger
      where tgname = table_name || '_prevent_active_delete'
        and tgrelid = format('public.%I', table_name)::regclass
    ) then
      execute format(
        'create trigger %I before delete on public.%I for each row execute function public.prevent_active_catalog_spec_delete()',
        table_name || '_prevent_active_delete', table_name
      );
    end if;
  end loop;
end;
$$;

create or replace function public.enforce_active_catalog_item_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
declare has_spec boolean;
begin
  if new.lifecycle_status <> 'active' or new.deleted_at is not null then
    return null;
  end if;
  if exists (select 1 from public.catalog_categories where parent_id = new.category_id and deleted_at is null) then
    raise exception 'catalog item category % must be a leaf category', new.category_id;
  end if;
  select case new.item_type
    when 'connector' then exists (select 1 from public.connector_specs where catalog_item_id = new.id)
    when 'wire' then exists (select 1 from public.wire_specs where catalog_item_id = new.id)
    when 'protective_sleeve' then exists (select 1 from public.protective_sleeve_specs where catalog_item_id = new.id)
    when 'overmold' then exists (select 1 from public.overmold_specs where catalog_item_id = new.id)
    when 'model' then exists (select 1 from public.model_specs where catalog_item_id = new.id)
    when 'accessory' then exists (select 1 from public.accessory_specs where catalog_item_id = new.id)
    when 'packaging' then exists (select 1 from public.packaging_specs where catalog_item_id = new.id)
  end into has_spec;
  if not coalesce(has_spec, false) then
    raise exception 'active catalog item % requires a matching specification', new.id;
  end if;
  return null;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'active_catalog_items_require_spec' and tgrelid = 'public.catalog_items'::regclass) then
    create constraint trigger active_catalog_items_require_spec
      after insert or update on public.catalog_items
      deferrable initially deferred
      for each row execute function public.enforce_active_catalog_item_integrity();
  end if;
end;
$$;

create unique index if not exists catalog_categories_active_sibling_code_key on public.catalog_categories (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), code) where deleted_at is null;
create unique index if not exists wire_colors_active_code_key on public.wire_colors (code) where deleted_at is null;
create unique index if not exists wire_gauges_active_awg_key on public.wire_gauges (awg) where deleted_at is null;
create unique index if not exists wire_types_active_code_key on public.wire_types (code) where deleted_at is null;
create unique index if not exists catalog_items_active_model_key on public.catalog_items (item_type, model) where deleted_at is null;
create unique index if not exists catalog_items_active_legacy_key on public.catalog_items (item_type, legacy_key) where deleted_at is null;
create unique index if not exists catalog_item_images_one_active_primary on public.catalog_item_images (item_id) where is_primary and deleted_at is null;
create index if not exists projects_active_owner_updated_idx on public.projects (owner_id, updated_at desc) where deleted_at is null;
create index if not exists catalog_items_active_lookup_idx on public.catalog_items (item_type, category_id, display_order, updated_at desc) where deleted_at is null and lifecycle_status = 'active';
create index if not exists catalog_items_active_search_idx on public.catalog_items using gin (to_tsvector('simple', resource_name || ' ' || model || ' ' || coalesce(manufacturer_part_number, ''))) where deleted_at is null and lifecycle_status = 'active';
create index if not exists catalog_item_images_item_order_idx on public.catalog_item_images (item_id, is_primary desc, display_order, created_at desc) where deleted_at is null;
create index if not exists connector_pins_lookup_idx on public.connector_pins (catalog_item_id, display_order);
create index if not exists wire_spec_cores_lookup_idx on public.wire_spec_cores (catalog_item_id, display_order);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', '')) on conflict (id) do nothing;
  return new;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass) then
    create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
  end if;
end;
$$;

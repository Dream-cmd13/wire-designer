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

create or replace function public.set_project_delete_audit()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    new.deleted_by := auth.uid();
  elsif old.deleted_at is not null and new.deleted_at is null then
    new.deleted_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_set_delete_audit on public.projects;
create trigger projects_set_delete_audit
before update on public.projects
for each row execute function public.set_project_delete_audit();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'user', 'projects', 'project_documents', 'project_assets',
    'wire_colors', 'wire_gauges', 'wire_types',
    'lead_time_options', 'protection_options', 'pricing_rules', 'quantity_discount_rules',
    'resource_items', 'resource_item_images', 'connectors', 'wires',
    'protective_sleeves', 'overmolds', 'models', 'accessories', 'packagings',
    'drawing_documents'
  ] loop
    if not exists (select 1 from pg_trigger where tgname = table_name || '_set_audit_fields' and tgrelid = format('public.%I', table_name)::regclass) then
      execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_audit_fields()', table_name || '_set_audit_fields', table_name);
    end if;
  end loop;
end;
$$;

create or replace function public.prevent_version_mutation()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  raise exception '% rows are immutable', tg_table_name;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['project_document_versions', 'drawing_document_versions'] loop
    if not exists (
      select 1 from pg_trigger
      where tgname = table_name || '_prevent_mutation'
        and tgrelid = format('public.%I', table_name)::regclass
    ) then
      execute format(
        'create trigger %I before update or delete on public.%I for each row execute function public.prevent_version_mutation()',
        table_name || '_prevent_mutation', table_name
      );
    end if;
  end loop;
end;
$$;

-- Some drawing/resource tables intentionally carry timestamps but not actor
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
    'drawing_templates', 'drawing_common_phrases', 'drawing_icons'
  ] loop
    if not exists (select 1 from pg_trigger where tgname = table_name || '_set_timestamp_fields' and tgrelid = format('public.%I', table_name)::regclass) then
      execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_timestamp_fields()', table_name || '_set_timestamp_fields', table_name);
    end if;
  end loop;
end;
$$;

create or replace function public.enforce_resource_spec_item_type()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.resource_items where id = new.resource_item_id and resource_type::text = tg_argv[0]) then
    raise exception 'resource item % must have type %', new.resource_item_id, tg_argv[0];
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'connectors_match_type' and tgrelid = 'public.connectors'::regclass) then
    create trigger connectors_match_type before insert or update on public.connectors for each row execute function public.enforce_resource_spec_item_type('connector');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'wires_match_type' and tgrelid = 'public.wires'::regclass) then
    create trigger wires_match_type before insert or update on public.wires for each row execute function public.enforce_resource_spec_item_type('wire');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'protective_sleeves_match_type' and tgrelid = 'public.protective_sleeves'::regclass) then
    create trigger protective_sleeves_match_type before insert or update on public.protective_sleeves for each row execute function public.enforce_resource_spec_item_type('protective_sleeve');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'overmolds_match_type' and tgrelid = 'public.overmolds'::regclass) then
    create trigger overmolds_match_type before insert or update on public.overmolds for each row execute function public.enforce_resource_spec_item_type('overmold');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'models_match_type' and tgrelid = 'public.models'::regclass) then
    create trigger models_match_type before insert or update on public.models for each row execute function public.enforce_resource_spec_item_type('model');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'accessories_match_type' and tgrelid = 'public.accessories'::regclass) then
    create trigger accessories_match_type before insert or update on public.accessories for each row execute function public.enforce_resource_spec_item_type('accessory');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'packagings_match_type' and tgrelid = 'public.packagings'::regclass) then
    create trigger packagings_match_type before insert or update on public.packagings for each row execute function public.enforce_resource_spec_item_type('packaging');
  end if;
end;
$$;

-- Prevent an active resource item from losing its resource row. Archive the
-- item first, then edit or delete its main resource row.
create or replace function public.prevent_active_resource_spec_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1
    from public.resource_items item
    where item.id = old.resource_item_id
      and item.deleted_at is null
      and item.lifecycle_status = 'active'
  ) then
    raise exception 'cannot delete % for active resource item %; archive the item first', tg_table_name, old.resource_item_id;
  end if;
  return old;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'connectors', 'wires', 'protective_sleeves', 'overmolds', 'models', 'accessories', 'packagings'
  ] loop
    if not exists (
      select 1
      from pg_trigger
      where tgname = table_name || '_prevent_active_delete'
        and tgrelid = format('public.%I', table_name)::regclass
    ) then
      execute format(
        'create trigger %I before delete on public.%I for each row execute function public.prevent_active_resource_spec_delete()',
        table_name || '_prevent_active_delete', table_name
      );
    end if;
  end loop;
end;
$$;

create or replace function public.enforce_active_resource_item_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
declare has_resource boolean;
begin
  if new.lifecycle_status <> 'active' or new.deleted_at is not null then
    return null;
  end if;
  select case new.resource_type
    when 'connector' then exists (select 1 from public.connectors where resource_item_id = new.id)
    when 'wire' then exists (select 1 from public.wires where resource_item_id = new.id)
    when 'protective_sleeve' then exists (select 1 from public.protective_sleeves where resource_item_id = new.id)
    when 'overmold' then exists (select 1 from public.overmolds where resource_item_id = new.id)
    when 'model' then exists (select 1 from public.models where resource_item_id = new.id)
    when 'accessory' then exists (select 1 from public.accessories where resource_item_id = new.id)
    when 'packaging' then exists (select 1 from public.packagings where resource_item_id = new.id)
  end into has_resource;
  if not coalesce(has_resource, false) then
    raise exception 'active resource item % requires a matching resource row', new.id;
  end if;
  return null;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'active_resource_items_require_resource' and tgrelid = 'public.resource_items'::regclass) then
    create constraint trigger active_resource_items_require_resource
      after insert or update on public.resource_items
      deferrable initially deferred
      for each row execute function public.enforce_active_resource_item_integrity();
  end if;
end;
$$;

create unique index if not exists wire_colors_active_code_key on public.wire_colors (code) where deleted_at is null;
create unique index if not exists wire_gauges_active_awg_key on public.wire_gauges (awg) where deleted_at is null;
create unique index if not exists wire_types_active_code_key on public.wire_types (code) where deleted_at is null;
create unique index if not exists resource_items_active_model_key on public.resource_items (resource_type, model) where deleted_at is null;
create unique index if not exists resource_items_active_legacy_key on public.resource_items (resource_type, legacy_key) where deleted_at is null;
create unique index if not exists resource_item_images_one_active_primary on public.resource_item_images (resource_item_id) where is_primary and deleted_at is null;
create index if not exists projects_active_owner_updated_idx on public.projects (owner_id, updated_at desc) where deleted_at is null;
create index if not exists project_assets_active_project_created_idx on public.project_assets (project_id, created_at desc) where deleted_at is null;
create unique index if not exists lead_time_options_active_code_key on public.lead_time_options (code) where deleted_at is null;
create unique index if not exists protection_options_active_code_key on public.protection_options (code) where deleted_at is null;
create unique index if not exists pricing_rules_active_key on public.pricing_rules (rule_code, rule_key) where deleted_at is null;
create unique index if not exists quantity_discount_rules_active_minimum_key on public.quantity_discount_rules (minimum_quantity) where deleted_at is null;
create index if not exists lead_time_options_active_order_idx on public.lead_time_options (display_order, code) where deleted_at is null and is_active;
create index if not exists protection_options_active_order_idx on public.protection_options (display_order, code) where deleted_at is null and is_active;
create index if not exists pricing_rules_active_order_idx on public.pricing_rules (rule_code, display_order, rule_key) where deleted_at is null and is_active;
create index if not exists quantity_discount_rules_active_order_idx on public.quantity_discount_rules (minimum_quantity desc) where deleted_at is null and is_active;
create index if not exists resource_items_active_lookup_idx on public.resource_items (resource_type, resource_group, display_order, updated_at desc) where deleted_at is null and lifecycle_status = 'active';
create index if not exists resource_items_active_search_idx on public.resource_items using gin (to_tsvector('simple', resource_name || ' ' || model || ' ' || coalesce(manufacturer_part_number, ''))) where deleted_at is null and lifecycle_status = 'active';
create index if not exists resource_item_images_item_order_idx on public.resource_item_images (resource_item_id, is_primary desc, display_order, created_at desc) where deleted_at is null;
create index if not exists connectors_lookup_idx on public.connectors (series, connector_type, pin_count);
create index if not exists wires_lookup_idx on public.wires (wire_kind, awg, core_count);
create index if not exists protective_sleeves_lookup_idx on public.protective_sleeves (sleeve_type, material);
create index if not exists overmolds_lookup_idx on public.overmolds (outer_material, outer_hardness_shore);
create index if not exists models_lookup_idx on public.models (model_kind);
create index if not exists accessories_lookup_idx on public.accessories (accessory_kind);
create index if not exists packagings_lookup_idx on public.packagings (packaging_kind);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public."user" (id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', '')) on conflict (id) do nothing;
  return new;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass) then
    create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
  end if;
end;
$$;

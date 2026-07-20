-- Upgrade a development database created with the legacy *_specs tables.
-- Run after 50_upgrade/01_drawing_workbench_resources.sql and before rerunning
-- 10_schema/03_integrity.sql and 30_security/01_rls.sql.

begin;

do $$
declare
  old_name text;
  new_name text;
begin
  for old_name, new_name in
    select * from (values
      ('connector_specs', 'connectors'),
      ('wire_specs', 'wires'),
      ('protective_sleeve_specs', 'protective_sleeves'),
      ('overmold_specs', 'overmolds'),
      ('model_specs', 'models'),
      ('accessory_specs', 'accessories'),
      ('packaging_specs', 'packagings')
    ) as resource_names(old_name, new_name)
  loop
    if to_regclass(format('public.%I', old_name)) is not null
       and to_regclass(format('public.%I', new_name)) is not null then
      raise exception 'cannot migrate %: both legacy table and target table exist', old_name;
    elsif to_regclass(format('public.%I', old_name)) is not null then
      execute format('alter table public.%I rename to %I', old_name, new_name);
    end if;
  end loop;
end;
$$;

alter table if exists public.connectors
  add column if not exists pin_labels jsonb not null default '[]'::jsonb;
alter table if exists public.wires
  add column if not exists core_specs jsonb not null default '[]'::jsonb;

do $$ begin
  if to_regclass('public.connectors') is not null
     and not exists (select 1 from pg_constraint where conname = 'connectors_pin_labels_array') then
    alter table public.connectors add constraint connectors_pin_labels_array check (jsonb_typeof(pin_labels) = 'array');
  end if;
  if to_regclass('public.wires') is not null
     and not exists (select 1 from pg_constraint where conname = 'wires_core_specs_array') then
    alter table public.wires add constraint wires_core_specs_array check (jsonb_typeof(core_specs) = 'array');
  end if;
end;
$$;

-- The old connector_pins rows become an ordered string array.
do $$
begin
  if to_regclass('public.connector_pins') is not null then
    execute $sql$
      update public.connectors connector
      set pin_labels = pins.labels
      from (
        select catalog_item_id,
          jsonb_agg(pin_label order by display_order, pin_number) as labels
        from public.connector_pins
        group by catalog_item_id
      ) pins
      where connector.catalog_item_id = pins.catalog_item_id
    $sql$;
    execute 'drop table public.connector_pins cascade';
  end if;
end;
$$;

-- The old wire_spec_cores rows become an ordered JSON array. Keep both the
-- dictionary id and code so the first version remains queryable without a join.
do $$
begin
  if to_regclass('public.wire_spec_cores') is not null then
    execute $sql$
      update public.wires wire
      set core_specs = cores.items
      from (
        select core.catalog_item_id,
          jsonb_agg(
            jsonb_build_object(
              'coreIndex', core.core_index,
              'colorId', core.color_id,
              'color', color.code,
              'signalName', core.signal_name,
              'displayOrder', core.display_order
            ) order by core.display_order, core.core_index
          ) as items
        from public.wire_spec_cores core
        left join public.wire_colors color on color.id = core.color_id
        group by core.catalog_item_id
      ) cores
      where wire.catalog_item_id = cores.catalog_item_id
    $sql$;
    execute 'drop table public.wire_spec_cores cascade';
  end if;
end;
$$;

-- Legacy model/accessory/packaging tables did not carry actor columns.
do $$
declare table_name text;
begin
  foreach table_name in array array['models', 'accessories', 'packagings'] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I add column if not exists created_by uuid references public."user"(id) on delete set null', table_name);
      execute format('alter table public.%I add column if not exists updated_by uuid references public."user"(id) on delete set null', table_name);
    end if;
  end loop;
end;
$$;

-- Remove trigger names owned by the old physical tables. The canonical names
-- are recreated by 10_schema/03_integrity.sql.
do $$
declare table_name text; trigger_name text;
begin
  for table_name, trigger_name in
    select * from (values
      ('connectors', 'connector_specs_match_type'),
      ('wires', 'wire_specs_match_type'),
      ('protective_sleeves', 'protective_sleeve_specs_match_type'),
      ('overmolds', 'overmold_specs_match_type'),
      ('models', 'model_specs_match_type'),
      ('accessories', 'accessory_specs_match_type'),
      ('packagings', 'packaging_specs_match_type')
    ) as trigger_names(table_name, trigger_name)
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('drop trigger if exists %I on public.%I', trigger_name, table_name);
      execute format('drop trigger if exists %I on public.%I', replace(trigger_name, '_match_type', '_prevent_active_delete'), table_name);
    end if;
  end loop;
  if to_regclass('public.catalog_items') is not null then
    execute 'drop trigger if exists active_catalog_items_require_spec on public.catalog_items';
  end if;
end;
$$;

commit;

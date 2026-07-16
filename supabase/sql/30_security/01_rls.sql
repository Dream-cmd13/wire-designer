create or replace function public.is_catalog_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public."user" where id = auth.uid() and role = 'catalog_admin');
$$;

revoke all on function public.is_catalog_admin() from public;
grant execute on function public.is_catalog_admin() to authenticated;
grant usage on schema public to authenticated;
grant usage on schema public to anon;
grant select, insert, update on all tables in schema public to authenticated;
revoke delete on all tables in schema public from authenticated;
revoke update on public."user" from authenticated;
grant update (display_name, avatar_path) on public."user" to authenticated;

create or replace function pg_temp.create_policy_if_missing(policy_name text, schema_name text, table_name text, policy_sql text)
returns void language plpgsql as $$
begin
  if not exists (select 1 from pg_policies where schemaname = schema_name and tablename = table_name and policyname = policy_name) then
    execute policy_sql;
  end if;
end;
$$;

alter table public."user" enable row level security;
select pg_temp.create_policy_if_missing('user owner read', 'public', 'user', $policy$create policy "user owner read" on public."user" for select to authenticated using (id = (select auth.uid()))$policy$);
select pg_temp.create_policy_if_missing('user owner update', 'public', 'user', $policy$create policy "user owner update" on public."user" for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()))$policy$);

alter table public.projects enable row level security;
alter table public.project_documents enable row level security;
alter table public.project_assets enable row level security;
select pg_temp.create_policy_if_missing('project owner read', 'public', 'projects', $policy$create policy "project owner read" on public.projects for select to authenticated using (owner_id = (select auth.uid()) and deleted_at is null)$policy$);
select pg_temp.create_policy_if_missing('project owner insert', 'public', 'projects', $policy$create policy "project owner insert" on public.projects for insert to authenticated with check (owner_id = (select auth.uid()))$policy$);
select pg_temp.create_policy_if_missing('project owner update', 'public', 'projects', $policy$create policy "project owner update" on public.projects for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))$policy$);
select pg_temp.create_policy_if_missing('document owner access', 'public', 'project_documents', $policy$create policy "document owner access" on public.project_documents for all to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()) and p.deleted_at is null)) with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()) and p.deleted_at is null))$policy$);
select pg_temp.create_policy_if_missing('asset owner access', 'public', 'project_assets', $policy$create policy "asset owner access" on public.project_assets for all to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()) and p.deleted_at is null)) with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()) and p.deleted_at is null))$policy$);

alter table public.catalog_categories enable row level security;
alter table public.wire_colors enable row level security;
alter table public.wire_gauges enable row level security;
alter table public.wire_types enable row level security;
alter table public.catalog_items enable row level security;
alter table public.catalog_item_images enable row level security;
alter table public.connector_specs enable row level security;
alter table public.connector_pins enable row level security;
alter table public.wire_specs enable row level security;
alter table public.wire_spec_cores enable row level security;
alter table public.protective_sleeve_specs enable row level security;
alter table public.overmold_specs enable row level security;
alter table public.model_specs enable row level security;
alter table public.accessory_specs enable row level security;
alter table public.packaging_specs enable row level security;
alter table public.drawing_templates enable row level security;
alter table public.drawing_template_versions enable row level security;
alter table public.drawing_common_phrases enable row level security;
alter table public.drawing_icons enable row level security;

grant select on public.catalog_categories, public.catalog_items, public.catalog_item_images,
  public.wire_colors, public.wire_gauges, public.wire_types,
  public.connector_specs, public.connector_pins, public.wire_specs, public.wire_spec_cores, public.protective_sleeve_specs,
  public.overmold_specs, public.model_specs, public.accessory_specs, public.packaging_specs,
  public.drawing_templates, public.drawing_template_versions, public.drawing_common_phrases,
  public.drawing_icons to anon, authenticated;

select pg_temp.create_policy_if_missing('active categories read', 'public', 'catalog_categories', $policy$create policy "active categories read" on public.catalog_categories for select to authenticated using (deleted_at is null)$policy$);
select pg_temp.create_policy_if_missing('active wire colors read', 'public', 'wire_colors', $policy$create policy "active wire colors read" on public.wire_colors for select to authenticated using (deleted_at is null)$policy$);
select pg_temp.create_policy_if_missing('active wire gauges read', 'public', 'wire_gauges', $policy$create policy "active wire gauges read" on public.wire_gauges for select to authenticated using (deleted_at is null)$policy$);
select pg_temp.create_policy_if_missing('active wire types read', 'public', 'wire_types', $policy$create policy "active wire types read" on public.wire_types for select to authenticated using (deleted_at is null)$policy$);
select pg_temp.create_policy_if_missing('active catalog items read', 'public', 'catalog_items', $policy$create policy "active catalog items read" on public.catalog_items for select to authenticated using (deleted_at is null and lifecycle_status = 'active')$policy$);
select pg_temp.create_policy_if_missing('active catalog images read', 'public', 'catalog_item_images', $policy$create policy "active catalog images read" on public.catalog_item_images for select to authenticated using (deleted_at is null and exists (select 1 from public.catalog_items i where i.id = item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('active connector specs read', 'public', 'connector_specs', $policy$create policy "active connector specs read" on public.connector_specs for select to authenticated using (exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('active connector pins read', 'public', 'connector_pins', $policy$create policy "active connector pins read" on public.connector_pins for select to authenticated using (exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('active wire specs read', 'public', 'wire_specs', $policy$create policy "active wire specs read" on public.wire_specs for select to authenticated using (exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('active wire spec cores read', 'public', 'wire_spec_cores', $policy$create policy "active wire spec cores read" on public.wire_spec_cores for select to authenticated using (exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('active sleeve specs read', 'public', 'protective_sleeve_specs', $policy$create policy "active sleeve specs read" on public.protective_sleeve_specs for select to authenticated using (exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('active overmold specs read', 'public', 'overmold_specs', $policy$create policy "active overmold specs read" on public.overmold_specs for select to authenticated using (exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public categories read', 'public', 'catalog_categories', $policy$create policy "public categories read" on public.catalog_categories for select to anon, authenticated using (deleted_at is null)$policy$);
select pg_temp.create_policy_if_missing('public wire colors read', 'public', 'wire_colors', $policy$create policy "public wire colors read" on public.wire_colors for select to anon, authenticated using (deleted_at is null)$policy$);
select pg_temp.create_policy_if_missing('public wire gauges read', 'public', 'wire_gauges', $policy$create policy "public wire gauges read" on public.wire_gauges for select to anon, authenticated using (deleted_at is null)$policy$);
select pg_temp.create_policy_if_missing('public wire types read', 'public', 'wire_types', $policy$create policy "public wire types read" on public.wire_types for select to anon, authenticated using (deleted_at is null)$policy$);
select pg_temp.create_policy_if_missing('public catalog items read', 'public', 'catalog_items', $policy$create policy "public catalog items read" on public.catalog_items for select to anon, authenticated using (deleted_at is null and lifecycle_status = 'active')$policy$);
select pg_temp.create_policy_if_missing('public catalog images read', 'public', 'catalog_item_images', $policy$create policy "public catalog images read" on public.catalog_item_images for select to anon, authenticated using (deleted_at is null and exists (select 1 from public.catalog_items i where i.id = item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public connector specs read', 'public', 'connector_specs', $policy$create policy "public connector specs read" on public.connector_specs for select to anon, authenticated using (exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public connector pins read', 'public', 'connector_pins', $policy$create policy "public connector pins read" on public.connector_pins for select to anon, authenticated using (exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public wire specs read', 'public', 'wire_specs', $policy$create policy "public wire specs read" on public.wire_specs for select to anon, authenticated using (exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public wire spec cores read', 'public', 'wire_spec_cores', $policy$create policy "public wire spec cores read" on public.wire_spec_cores for select to anon, authenticated using (exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public sleeve specs read', 'public', 'protective_sleeve_specs', $policy$create policy "public sleeve specs read" on public.protective_sleeve_specs for select to anon, authenticated using (exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public overmold specs read', 'public', 'overmold_specs', $policy$create policy "public overmold specs read" on public.overmold_specs for select to anon, authenticated using (exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public model specs read', 'public', 'model_specs', $policy$create policy "public model specs read" on public.model_specs for select to anon, authenticated using (exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public accessory specs read', 'public', 'accessory_specs', $policy$create policy "public accessory specs read" on public.accessory_specs for select to anon, authenticated using (exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public packaging specs read', 'public', 'packaging_specs', $policy$create policy "public packaging specs read" on public.packaging_specs for select to anon, authenticated using (exists (select 1 from public.catalog_items i where i.id = catalog_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public drawing templates read', 'public', 'drawing_templates', $policy$create policy "public drawing templates read" on public.drawing_templates for select to anon, authenticated using (deleted_at is null and status = 'active')$policy$);
select pg_temp.create_policy_if_missing('public drawing template versions read', 'public', 'drawing_template_versions', $policy$create policy "public drawing template versions read" on public.drawing_template_versions for select to anon, authenticated using (exists (select 1 from public.drawing_templates t where t.id = template_id and t.deleted_at is null and t.status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public drawing phrases read', 'public', 'drawing_common_phrases', $policy$create policy "public drawing phrases read" on public.drawing_common_phrases for select to anon, authenticated using (deleted_at is null and is_active)$policy$);
select pg_temp.create_policy_if_missing('public drawing icons read', 'public', 'drawing_icons', $policy$create policy "public drawing icons read" on public.drawing_icons for select to anon, authenticated using (deleted_at is null and is_active)$policy$);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'catalog_categories', 'wire_colors', 'wire_gauges', 'wire_types', 'catalog_items',
    'catalog_item_images', 'connector_specs', 'connector_pins', 'wire_specs', 'wire_spec_cores',
    'protective_sleeve_specs', 'overmold_specs', 'model_specs', 'accessory_specs', 'packaging_specs',
    'drawing_templates', 'drawing_template_versions', 'drawing_common_phrases', 'drawing_icons'
  ] loop
    perform pg_temp.create_policy_if_missing(table_name || ' catalog admin write', 'public', table_name,
      format('create policy %I on public.%I for all to authenticated using ((select public.is_catalog_admin())) with check ((select public.is_catalog_admin()))', table_name || ' catalog admin write', table_name));
  end loop;
end;
$$;

select pg_temp.create_policy_if_missing('catalog assets authenticated read', 'storage', 'objects', $policy$create policy "catalog assets authenticated read" on storage.objects for select to authenticated using (bucket_id = 'catalog-assets' and exists (select 1 from public.catalog_item_images image join public.catalog_items item on item.id = image.item_id where image.storage_path = storage.objects.name and image.deleted_at is null and item.deleted_at is null and item.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('catalog assets public read', 'storage', 'objects', $policy$create policy "catalog assets public read" on storage.objects for select to anon, authenticated using (bucket_id = 'catalog-assets' and exists (select 1 from public.catalog_item_images image join public.catalog_items item on item.id = image.item_id where image.storage_path = storage.objects.name and image.deleted_at is null and item.deleted_at is null and item.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('catalog assets catalog admin write', 'storage', 'objects', $policy$create policy "catalog assets catalog admin write" on storage.objects for all to authenticated using (bucket_id = 'catalog-assets' and (select public.is_catalog_admin())) with check (bucket_id = 'catalog-assets' and (select public.is_catalog_admin()))$policy$);
select pg_temp.create_policy_if_missing('project assets owner access', 'storage', 'objects', $policy$create policy "project assets owner access" on storage.objects for all to authenticated using (bucket_id = 'project-assets' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'project-assets' and (storage.foldername(name))[1] = (select auth.uid())::text)$policy$);

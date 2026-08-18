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
revoke all on public.projects from anon;
revoke update on public.projects from authenticated;
revoke delete, truncate, references, trigger on public.projects from authenticated;
grant update (name, description, status, deleted_at, updated_at) on public.projects to authenticated;
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
alter table public.project_document_versions enable row level security;
alter table public.drawing_documents enable row level security;
alter table public.drawing_document_versions enable row level security;
select pg_temp.create_policy_if_missing('project owner read', 'public', 'projects', $policy$create policy "project owner read" on public.projects for select to authenticated using (owner_id = (select auth.uid()))$policy$);
select pg_temp.create_policy_if_missing('project owner insert', 'public', 'projects', $policy$create policy "project owner insert" on public.projects for insert to authenticated with check (owner_id = (select auth.uid()))$policy$);
select pg_temp.create_policy_if_missing('project owner update', 'public', 'projects', $policy$create policy "project owner update" on public.projects for update to authenticated using (owner_id = (select auth.uid()) and deleted_at is null) with check (owner_id = (select auth.uid()))$policy$);
select pg_temp.create_policy_if_missing('document owner access', 'public', 'project_documents', $policy$create policy "document owner access" on public.project_documents for all to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()) and p.deleted_at is null)) with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()) and p.deleted_at is null))$policy$);
select pg_temp.create_policy_if_missing('asset owner access', 'public', 'project_assets', $policy$create policy "asset owner access" on public.project_assets for all to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()) and p.deleted_at is null)) with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()) and p.deleted_at is null))$policy$);
select pg_temp.create_policy_if_missing('project document version owner access', 'public', 'project_document_versions', $policy$create policy "project document version owner access" on public.project_document_versions for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()) and p.deleted_at is null))$policy$);
select pg_temp.create_policy_if_missing('project document version owner insert', 'public', 'project_document_versions', $policy$create policy "project document version owner insert" on public.project_document_versions for insert to authenticated with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()) and p.deleted_at is null))$policy$);
select pg_temp.create_policy_if_missing('drawing document owner access', 'public', 'drawing_documents', $policy$create policy "drawing document owner access" on public.drawing_documents for all to authenticated using (owner_id = (select auth.uid()) and deleted_at is null) with check (owner_id = (select auth.uid()))$policy$);
select pg_temp.create_policy_if_missing('drawing document owner insert', 'public', 'drawing_documents', $policy$create policy "drawing document owner insert" on public.drawing_documents for insert to authenticated with check (owner_id = (select auth.uid()))$policy$);
select pg_temp.create_policy_if_missing('drawing document owner delete', 'public', 'drawing_documents', $policy$create policy "drawing document owner delete" on public.drawing_documents for delete to authenticated using (owner_id = (select auth.uid()))$policy$);
select pg_temp.create_policy_if_missing('drawing document version owner access', 'public', 'drawing_document_versions', $policy$create policy "drawing document version owner access" on public.drawing_document_versions for select to authenticated using (exists (select 1 from public.drawing_documents d where d.id = drawing_id and d.owner_id = (select auth.uid()) and d.deleted_at is null))$policy$);
select pg_temp.create_policy_if_missing('drawing document version owner insert', 'public', 'drawing_document_versions', $policy$create policy "drawing document version owner insert" on public.drawing_document_versions for insert to authenticated with check (exists (select 1 from public.drawing_documents d where d.id = drawing_id and d.owner_id = (select auth.uid()) and d.deleted_at is null))$policy$);

alter table public.wire_colors enable row level security;
alter table public.wire_gauges enable row level security;
alter table public.wire_types enable row level security;
alter table public.resource_items enable row level security;
alter table public.resource_item_images enable row level security;
alter table public.connectors enable row level security;
alter table public.wires enable row level security;
alter table public.protective_sleeves enable row level security;
alter table public.overmolds enable row level security;
alter table public.models enable row level security;
alter table public.accessories enable row level security;
alter table public.packagings enable row level security;
alter table public.drawing_templates enable row level security;
alter table public.drawing_template_versions enable row level security;
alter table public.drawing_common_phrases enable row level security;
alter table public.drawing_icons enable row level security;
alter table public.lead_time_options enable row level security;
alter table public.protection_options enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.quantity_discount_rules enable row level security;

grant select on public.resource_items, public.resource_item_images,
  public.wire_colors, public.wire_gauges, public.wire_types,
  public.connectors, public.wires, public.protective_sleeves, public.overmolds,
  public.models, public.accessories, public.packagings,
  public.lead_time_options, public.protection_options, public.pricing_rules,
  public.quantity_discount_rules,
  public.drawing_templates, public.drawing_template_versions, public.drawing_common_phrases,
  public.drawing_icons to anon, authenticated;

select pg_temp.create_policy_if_missing('active wire colors read', 'public', 'wire_colors', $policy$create policy "active wire colors read" on public.wire_colors for select to authenticated using (deleted_at is null)$policy$);
select pg_temp.create_policy_if_missing('active wire gauges read', 'public', 'wire_gauges', $policy$create policy "active wire gauges read" on public.wire_gauges for select to authenticated using (deleted_at is null)$policy$);
select pg_temp.create_policy_if_missing('active wire types read', 'public', 'wire_types', $policy$create policy "active wire types read" on public.wire_types for select to authenticated using (deleted_at is null)$policy$);
select pg_temp.create_policy_if_missing('active resource items read', 'public', 'resource_items', $policy$create policy "active resource items read" on public.resource_items for select to authenticated using (deleted_at is null and lifecycle_status = 'active')$policy$);
select pg_temp.create_policy_if_missing('active resource images read', 'public', 'resource_item_images', $policy$create policy "active resource images read" on public.resource_item_images for select to authenticated using (deleted_at is null and exists (select 1 from public.resource_items i where i.id = resource_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('active connectors read', 'public', 'connectors', $policy$create policy "active connectors read" on public.connectors for select to authenticated using (exists (select 1 from public.resource_items i where i.id = resource_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('active wires read', 'public', 'wires', $policy$create policy "active wires read" on public.wires for select to authenticated using (exists (select 1 from public.resource_items i where i.id = resource_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('active protective sleeves read', 'public', 'protective_sleeves', $policy$create policy "active protective sleeves read" on public.protective_sleeves for select to authenticated using (exists (select 1 from public.resource_items i where i.id = resource_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('active overmolds read', 'public', 'overmolds', $policy$create policy "active overmolds read" on public.overmolds for select to authenticated using (exists (select 1 from public.resource_items i where i.id = resource_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('active models read', 'public', 'models', $policy$create policy "active models read" on public.models for select to authenticated using (exists (select 1 from public.resource_items i where i.id = resource_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('active accessories read', 'public', 'accessories', $policy$create policy "active accessories read" on public.accessories for select to authenticated using (exists (select 1 from public.resource_items i where i.id = resource_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('active packagings read', 'public', 'packagings', $policy$create policy "active packagings read" on public.packagings for select to authenticated using (exists (select 1 from public.resource_items i where i.id = resource_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('active lead time options read', 'public', 'lead_time_options', $policy$create policy "active lead time options read" on public.lead_time_options for select to authenticated using (deleted_at is null and is_active)$policy$);
select pg_temp.create_policy_if_missing('active protection options read', 'public', 'protection_options', $policy$create policy "active protection options read" on public.protection_options for select to authenticated using (deleted_at is null and is_active)$policy$);
select pg_temp.create_policy_if_missing('active pricing rules read', 'public', 'pricing_rules', $policy$create policy "active pricing rules read" on public.pricing_rules for select to authenticated using (deleted_at is null and is_active)$policy$);
select pg_temp.create_policy_if_missing('active quantity discount rules read', 'public', 'quantity_discount_rules', $policy$create policy "active quantity discount rules read" on public.quantity_discount_rules for select to authenticated using (deleted_at is null and is_active)$policy$);

select pg_temp.create_policy_if_missing('public wire colors read', 'public', 'wire_colors', $policy$create policy "public wire colors read" on public.wire_colors for select to anon, authenticated using (deleted_at is null)$policy$);
select pg_temp.create_policy_if_missing('public wire gauges read', 'public', 'wire_gauges', $policy$create policy "public wire gauges read" on public.wire_gauges for select to anon, authenticated using (deleted_at is null)$policy$);
select pg_temp.create_policy_if_missing('public wire types read', 'public', 'wire_types', $policy$create policy "public wire types read" on public.wire_types for select to anon, authenticated using (deleted_at is null)$policy$);
select pg_temp.create_policy_if_missing('public resource items read', 'public', 'resource_items', $policy$create policy "public resource items read" on public.resource_items for select to anon, authenticated using (deleted_at is null and lifecycle_status = 'active')$policy$);
select pg_temp.create_policy_if_missing('public resource images read', 'public', 'resource_item_images', $policy$create policy "public resource images read" on public.resource_item_images for select to anon, authenticated using (deleted_at is null and exists (select 1 from public.resource_items i where i.id = resource_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public connectors read', 'public', 'connectors', $policy$create policy "public connectors read" on public.connectors for select to anon, authenticated using (exists (select 1 from public.resource_items i where i.id = resource_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public wires read', 'public', 'wires', $policy$create policy "public wires read" on public.wires for select to anon, authenticated using (exists (select 1 from public.resource_items i where i.id = resource_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public protective sleeves read', 'public', 'protective_sleeves', $policy$create policy "public protective sleeves read" on public.protective_sleeves for select to anon, authenticated using (exists (select 1 from public.resource_items i where i.id = resource_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public overmolds read', 'public', 'overmolds', $policy$create policy "public overmolds read" on public.overmolds for select to anon, authenticated using (exists (select 1 from public.resource_items i where i.id = resource_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public models read', 'public', 'models', $policy$create policy "public models read" on public.models for select to anon, authenticated using (exists (select 1 from public.resource_items i where i.id = resource_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public accessories read', 'public', 'accessories', $policy$create policy "public accessories read" on public.accessories for select to anon, authenticated using (exists (select 1 from public.resource_items i where i.id = resource_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public packagings read', 'public', 'packagings', $policy$create policy "public packagings read" on public.packagings for select to anon, authenticated using (exists (select 1 from public.resource_items i where i.id = resource_item_id and i.deleted_at is null and i.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public lead time options read', 'public', 'lead_time_options', $policy$create policy "public lead time options read" on public.lead_time_options for select to anon, authenticated using (deleted_at is null and is_active)$policy$);
select pg_temp.create_policy_if_missing('public protection options read', 'public', 'protection_options', $policy$create policy "public protection options read" on public.protection_options for select to anon, authenticated using (deleted_at is null and is_active)$policy$);
select pg_temp.create_policy_if_missing('public pricing rules read', 'public', 'pricing_rules', $policy$create policy "public pricing rules read" on public.pricing_rules for select to anon, authenticated using (deleted_at is null and is_active)$policy$);
select pg_temp.create_policy_if_missing('public quantity discount rules read', 'public', 'quantity_discount_rules', $policy$create policy "public quantity discount rules read" on public.quantity_discount_rules for select to anon, authenticated using (deleted_at is null and is_active)$policy$);
select pg_temp.create_policy_if_missing('public drawing templates read', 'public', 'drawing_templates', $policy$create policy "public drawing templates read" on public.drawing_templates for select to anon, authenticated using (deleted_at is null and status = 'active')$policy$);
select pg_temp.create_policy_if_missing('public drawing template versions read', 'public', 'drawing_template_versions', $policy$create policy "public drawing template versions read" on public.drawing_template_versions for select to anon, authenticated using (exists (select 1 from public.drawing_templates t where t.id = template_id and t.deleted_at is null and t.status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('public drawing phrases read', 'public', 'drawing_common_phrases', $policy$create policy "public drawing phrases read" on public.drawing_common_phrases for select to anon, authenticated using (deleted_at is null and is_active)$policy$);
select pg_temp.create_policy_if_missing('public drawing icons read', 'public', 'drawing_icons', $policy$create policy "public drawing icons read" on public.drawing_icons for select to anon, authenticated using (deleted_at is null and is_active)$policy$);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'wire_colors', 'wire_gauges', 'wire_types', 'resource_items',
    'resource_item_images', 'connectors', 'wires', 'protective_sleeves', 'overmolds',
    'models', 'accessories', 'packagings', 'lead_time_options', 'protection_options',
    'pricing_rules', 'quantity_discount_rules', 'drawing_templates', 'drawing_template_versions',
    'drawing_common_phrases', 'drawing_icons'
  ] loop
    perform pg_temp.create_policy_if_missing(table_name || ' resource admin write', 'public', table_name,
      format('create policy %I on public.%I for all to authenticated using ((select public.is_catalog_admin())) with check ((select public.is_catalog_admin()))', table_name || ' resource admin write', table_name));
  end loop;
end;
$$;

select pg_temp.create_policy_if_missing('catalog assets authenticated read', 'storage', 'objects', $policy$create policy "catalog assets authenticated read" on storage.objects for select to authenticated using (bucket_id = 'catalog-assets' and exists (select 1 from public.resource_item_images image join public.resource_items item on item.id = image.resource_item_id where image.storage_path = storage.objects.name and image.deleted_at is null and item.deleted_at is null and item.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('catalog assets public read', 'storage', 'objects', $policy$create policy "catalog assets public read" on storage.objects for select to anon, authenticated using (bucket_id = 'catalog-assets' and exists (select 1 from public.resource_item_images image join public.resource_items item on item.id = image.resource_item_id where image.storage_path = storage.objects.name and image.deleted_at is null and item.deleted_at is null and item.lifecycle_status = 'active'))$policy$);
select pg_temp.create_policy_if_missing('catalog assets catalog admin write', 'storage', 'objects', $policy$create policy "catalog assets catalog admin write" on storage.objects for all to authenticated using (bucket_id = 'catalog-assets' and (select public.is_catalog_admin())) with check (bucket_id = 'catalog-assets' and (select public.is_catalog_admin()))$policy$);
select pg_temp.create_policy_if_missing('project assets owner access', 'storage', 'objects', $policy$create policy "project assets owner access" on storage.objects for all to authenticated using (bucket_id = 'project-assets' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'project-assets' and (storage.foldername(name))[1] = (select auth.uid())::text)$policy$);

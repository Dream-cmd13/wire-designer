grant usage on schema public to anon, authenticated;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

revoke all on public.projects, public.drawings, public.catalog_items from anon, authenticated;
-- 项目/图纸写入只允许通过带版本校验的 RPC（见 supabase/updates/20261014_document_revision.sql）
grant select on public.projects, public.drawings to authenticated;
grant select on public.catalog_items to authenticated;
grant insert on public.catalog_items to authenticated;

alter table public.projects enable row level security;
alter table public.drawings enable row level security;
alter table public.catalog_items enable row level security;

drop policy if exists "projects owner access" on public.projects;
create policy "projects owner access"
  on public.projects for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "drawings owner access" on public.drawings;
create policy "drawings owner access"
  on public.drawings for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "catalog public read" on public.catalog_items;
drop policy if exists "catalog authenticated read" on public.catalog_items;
create policy "catalog authenticated read"
  on public.catalog_items for select to authenticated
  using (true);

drop policy if exists "catalog accessory insert" on public.catalog_items;
create policy "catalog accessory insert"
  on public.catalog_items for insert to authenticated
  with check (kind = 'accessory');

drop policy if exists "catalog assets referenced read" on storage.objects;
create policy "catalog assets referenced read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'catalog-assets'
    and exists (
      select 1
      from public.catalog_items item
      where item.image_path = storage.objects.name
        or exists (
          select 1
          from jsonb_each_text(item.image_variants) as variant(role, path)
          where variant.path = storage.objects.name
        )
    )
  );

drop policy if exists "cost analysis sources authenticated read" on storage.objects;
create policy "cost analysis sources authenticated read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'cost-analysis-sources'
  );

drop policy if exists "finished harness drawings authenticated read" on storage.objects;
create policy "finished harness drawings authenticated read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'finished-harness-drawings'
  );

drop policy if exists "dwg drawings authenticated read" on storage.objects;
create policy "dwg drawings authenticated read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'dwg-drawings'
  );


-- 3D models: owner-only even for admins; no DELETE or object UPDATE permission.
revoke all on public.model_assets from anon, authenticated;
grant select, insert on public.model_assets to authenticated;
grant update(status) on public.model_assets to authenticated;
grant all on public.model_assets to service_role;
alter table public.model_assets enable row level security;
drop policy if exists "model owner read" on public.model_assets;
create policy "model owner read" on public.model_assets for select to authenticated
using (owner_id = (select auth.uid()) and public.current_app_role() in ('engineer','admin'));
drop policy if exists "model owner insert" on public.model_assets;
create policy "model owner insert" on public.model_assets for insert to authenticated
with check (owner_id = (select auth.uid()) and public.current_app_role() in ('engineer','admin') and status = 'uploading');
drop policy if exists "model owner finalize" on public.model_assets;
create policy "model owner finalize" on public.model_assets for update to authenticated
using (owner_id = (select auth.uid()) and public.current_app_role() in ('engineer','admin') and status = 'uploading')
with check (owner_id = (select auth.uid()) and public.current_app_role() in ('engineer','admin') and status = 'ready');
drop policy if exists "model files owner read" on storage.objects;
create policy "model files owner read" on storage.objects for select to authenticated
using (bucket_id = 'model-files' and public.current_app_role() in ('engineer','admin')
  and exists (select 1 from public.model_assets m where m.owner_id = (select auth.uid()) and m.object_key = storage.objects.name));
drop policy if exists "model files owner upload" on storage.objects;
create policy "model files owner upload" on storage.objects for insert to authenticated
with check (bucket_id = 'model-files' and public.current_app_role() in ('engineer','admin')
  and exists (select 1 from public.model_assets m where m.owner_id = (select auth.uid()) and m.object_key = storage.objects.name and m.status = 'uploading'));

grant usage on schema public to anon, authenticated;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

revoke all on public.projects, public.drawings, public.catalog_items from anon, authenticated;
grant select, insert, update, delete on public.projects, public.drawings to authenticated;
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


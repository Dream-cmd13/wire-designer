grant usage on schema public to anon, authenticated;

revoke all on public.projects, public.drawings, public.catalog_items from anon, authenticated;
grant select, insert, update, delete on public.projects, public.drawings to authenticated;
grant select on public.catalog_items to anon, authenticated;
grant insert on public.catalog_items to authenticated;

alter table public.projects enable row level security;
alter table public.drawings enable row level security;
alter table public.catalog_items enable row level security;

create policy "projects owner access"
  on public.projects for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "drawings owner access"
  on public.drawings for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "catalog public read"
  on public.catalog_items for select to anon, authenticated
  using (true);

create policy "catalog accessory insert"
  on public.catalog_items for insert to authenticated
  with check (kind = 'accessory');

create policy "catalog assets referenced read"
  on storage.objects for select to anon, authenticated
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

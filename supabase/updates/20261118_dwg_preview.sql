-- Additive and repeatable. Back up the database and original Storage files before applying.
begin;

create table if not exists public.dwg_assets (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  original_name text not null check (length(original_name) between 1 and 1024 and original_name ~* '\.dwg$'),
  object_key text not null unique check (object_key = owner_id::text || '/' || id::text || '/source.dwg'),
  file_size bigint not null check (file_size between 1 and 20971520),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'uploading' check (status in ('uploading','ready')),
  created_at timestamptz not null default now()
);
create index if not exists dwg_assets_owner_created on public.dwg_assets(owner_id, created_at desc, id desc);

insert into storage.buckets (id, name, public, file_size_limit)
values ('dwg-files', 'dwg-files', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create or replace function public.guard_dwg_asset_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'uploading' or new.status <> 'ready'
    or (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'DWG metadata is immutable; only uploading to ready is allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'dwg-files'
      and o.name = old.object_key and (o.metadata->>'size')::bigint = old.file_size) then
    raise exception 'Original DWG upload has not completed' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_dwg_asset_update() from public, anon, authenticated;
drop trigger if exists guard_dwg_asset_update on public.dwg_assets;
create trigger guard_dwg_asset_update before update on public.dwg_assets
for each row execute function public.guard_dwg_asset_update();

revoke all on public.dwg_assets from anon, authenticated;
grant select, insert on public.dwg_assets to authenticated;
grant update(status) on public.dwg_assets to authenticated;
grant all on public.dwg_assets to service_role;
alter table public.dwg_assets enable row level security;

drop policy if exists "dwg owner read" on public.dwg_assets;
create policy "dwg owner read" on public.dwg_assets for select to authenticated
using (owner_id = (select auth.uid()) and public.current_app_role() in ('engineer','admin'));
drop policy if exists "dwg owner insert" on public.dwg_assets;
create policy "dwg owner insert" on public.dwg_assets for insert to authenticated
with check (owner_id = (select auth.uid()) and public.current_app_role() in ('engineer','admin') and status = 'uploading');
drop policy if exists "dwg owner finalize" on public.dwg_assets;
create policy "dwg owner finalize" on public.dwg_assets for update to authenticated
using (owner_id = (select auth.uid()) and public.current_app_role() in ('engineer','admin') and status = 'uploading')
with check (owner_id = (select auth.uid()) and public.current_app_role() in ('engineer','admin') and status = 'ready');

drop policy if exists "dwg files owner read" on storage.objects;
create policy "dwg files owner read" on storage.objects for select to authenticated
using (bucket_id = 'dwg-files' and public.current_app_role() in ('engineer','admin')
  and exists (select 1 from public.dwg_assets d where d.owner_id = (select auth.uid()) and d.object_key = storage.objects.name));
drop policy if exists "dwg files owner upload" on storage.objects;
create policy "dwg files owner upload" on storage.objects for insert to authenticated
with check (bucket_id = 'dwg-files' and public.current_app_role() in ('engineer','admin')
  and exists (select 1 from public.dwg_assets d where d.owner_id = (select auth.uid()) and d.object_key = storage.objects.name and d.status = 'uploading'));

commit;

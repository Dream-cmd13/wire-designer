-- Confirm target and backup first; see docs/model-preview-validation.md.
-- Additive, repeatable migration. Never reset or drop business/model data.
begin;
-- Original files and approximate display-mesh metadata; no destructive data conversion.
create table if not exists public.model_assets (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  original_name text not null check (length(original_name) between 1 and 1024),
  format text not null check (format in ('step', 'stl')),
  source_unit text not null check (source_unit in ('mm','cm','m','inch') and (format <> 'step' or source_unit = 'mm')),
  object_key text not null unique,
  file_size bigint not null check (file_size between 1 and 20971520),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'uploading' check (status in ('uploading','ready')),
  bounds_mm jsonb not null check (jsonb_typeof(bounds_mm) = 'object'
    and jsonb_typeof(bounds_mm->'min') = 'array' and jsonb_array_length(bounds_mm->'min') = 3
    and jsonb_typeof(bounds_mm->'max') = 'array' and jsonb_array_length(bounds_mm->'max') = 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint model_assets_object_path check (
    object_key = owner_id::text || '/' || id::text || '/source.' ||
      case when format = 'stl' then 'stl' else 'step' end
    or (format = 'step' and object_key = owner_id::text || '/' || id::text || '/source.stp')
  )
);
create index if not exists model_assets_owner_created on public.model_assets(owner_id, created_at desc, id desc);

create or replace function public.guard_model_asset_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'uploading' or new.status <> 'ready'
    or (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'Model metadata is immutable; only uploading to ready is allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'model-files'
      and o.name = old.object_key and (o.metadata->>'size')::bigint = old.file_size) then
    raise exception 'Original model upload has not completed' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.guard_model_asset_update() from public, anon, authenticated;
drop trigger if exists guard_model_asset_update on public.model_assets;
create trigger guard_model_asset_update before update on public.model_assets
for each row execute function public.guard_model_asset_update();

-- Browser original model files; never public, limit matches the parser.
insert into storage.buckets (id, name, public, file_size_limit)
values ('model-files', 'model-files', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create or replace function public.get_storage_bootstrap_status()
returns table (bucket_id text, is_present boolean, is_public boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with required_buckets(bucket_id) as (
    values ('catalog-assets'::text), ('dwg-drawings'::text), ('model-files'::text)
  )
  select
    required_buckets.bucket_id,
    buckets.id is not null as is_present,
    coalesce(buckets.public, false) as is_public
  from required_buckets
  left join storage.buckets as buckets on buckets.id = required_buckets.bucket_id
  order by required_buckets.bucket_id;
$$;

revoke all on function public.get_storage_bootstrap_status() from public;
grant execute on function public.get_storage_bootstrap_status() to anon, authenticated;


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

commit;

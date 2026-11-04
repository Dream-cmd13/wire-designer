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

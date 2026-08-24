insert into storage.buckets (id, name, public)
values ('catalog-assets', 'catalog-assets', false)
on conflict (id) do update set public = excluded.public;

create or replace function public.get_storage_bootstrap_status()
returns table (bucket_id text, is_present boolean, is_public boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with required_buckets(bucket_id) as (
    values ('catalog-assets'::text)
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

-- Catalog image path convention:
-- catalog/{resource_type}/{catalog_item_id}/{image_role}/{file_name}

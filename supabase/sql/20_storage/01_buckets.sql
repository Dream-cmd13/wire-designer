insert into storage.buckets (id, name, public)
values ('catalog-assets', 'catalog-assets', false), ('project-assets', 'project-assets', false)
on conflict (id) do update set public = excluded.public;

create or replace function public.get_storage_bootstrap_status()
returns table (bucket_id text, is_present boolean, is_public boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with required_buckets(bucket_id) as (
    values ('catalog-assets'::text), ('project-assets'::text)
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

-- Resource object path convention (the existing catalog-assets bucket is retained):
-- catalog/{resource_type}/{resource_item_id}/{image_role}/{file_name}
-- Example:
-- catalog/connector/20000000-0000-4000-8000-000000007001/connector_before_left/connector-before-left.png

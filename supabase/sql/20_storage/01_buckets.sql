insert into storage.buckets (id, name, public)
values ('catalog-assets', 'catalog-assets', false), ('project-assets', 'project-assets', false)
on conflict (id) do update set public = excluded.public;

-- Resource object path convention (the existing catalog-assets bucket is retained):
-- catalog/{resource_type}/{resource_item_id}/{image_role}/{file_name}
-- Example:
-- catalog/connector/20000000-0000-4000-8000-000000007001/connector_before_left/connector-before-left.png

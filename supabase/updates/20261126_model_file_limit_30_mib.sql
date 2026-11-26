-- Raise the original 3D model limit without touching existing model rows or objects.
begin;

alter table public.model_assets
  drop constraint model_assets_file_size_check,
  add constraint model_assets_file_size_check check (file_size between 1 and 31457280);

-- Update only the size of the existing private bucket; abort if it is not ready.
do $$
begin
  update storage.buckets
    set file_size_limit = 31457280
    where id = 'model-files' and public = false;
  if not found then
    raise exception 'Private model-files bucket is missing or not private';
  end if;
end;
$$;

commit;

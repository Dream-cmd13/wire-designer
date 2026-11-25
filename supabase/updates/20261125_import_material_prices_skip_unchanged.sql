-- Additive, repeatable function update: skips unchanged material prices without modifying existing rows.
begin;
create or replace function public.import_material_prices(price_rows jsonb, source_name text) returns void
language plpgsql set search_path = '' as $$
declare imported_entry jsonb;
begin
  if not public.can_manage_pricing() then raise exception 'Forbidden' using errcode = '42501'; end if;
  if price_rows is null or jsonb_typeof(price_rows) <> 'array' then raise exception 'Invalid price rows'; end if;
  if jsonb_array_length(price_rows) not between 1 and 10000
    or source_name is null or length(btrim(source_name)) not between 1 and 255 then raise exception 'Invalid import'; end if;
  for imported_entry in select value from jsonb_array_elements(price_rows) loop
    if jsonb_typeof(imported_entry) <> 'object'
      or jsonb_typeof(imported_entry->'taxIncludedPrice') is distinct from 'string'
      or (imported_entry->>'taxIncludedPrice') !~ '^[0-9]{1,9}(\.[0-9]{1,6})?$'
      or jsonb_typeof(imported_entry->'lengthMm') is distinct from 'number'
      or (imported_entry->>'lengthMm') !~ '^[0-9]+$'
      or jsonb_typeof(imported_entry->'specification') is distinct from 'string'
      or jsonb_typeof((imported_entry->>'specification')::jsonb) <> 'array' then raise exception 'Invalid price row'; end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(price_rows) as rows(entry)
    group by entry->>'kind', entry->>'resourceId', (entry->>'specification')::jsonb, entry->>'lengthMm', entry->>'unit'
    having count(*) > 1) then raise exception 'Duplicate price rows'; end if;
  insert into public.material_prices(kind, resource_id, name, specification, length_mm, unit, tax_included_price, source_name)
    select entry->>'kind', (entry->>'resourceId')::uuid, entry->>'name', entry->>'specification',
      (entry->>'lengthMm')::bigint, entry->>'unit', (entry->>'taxIncludedPrice')::numeric, source_name
    from jsonb_array_elements(price_rows) as rows(entry)
    on conflict (kind, resource_id, specification, length_mm, unit) do update set
      name = excluded.name, tax_included_price = excluded.tax_included_price, source_name = excluded.source_name
    where public.material_prices.tax_included_price is distinct from excluded.tax_included_price
       or public.material_prices.name is distinct from excluded.name;
end $$;
revoke all on function public.import_material_prices(jsonb,text) from public, anon;
grant execute on function public.import_material_prices(jsonb,text) to authenticated;
commit;

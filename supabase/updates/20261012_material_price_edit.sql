-- Additive, repeatable migration: no existing material or price rows are changed.
begin;
create or replace function public.save_material_prices(price_rows jsonb) returns void
language plpgsql set search_path = '' as $$
declare entry jsonb; affected uuid;
begin
  if not public.can_manage_pricing() then raise exception 'Forbidden' using errcode = '42501'; end if;
  if price_rows is null or jsonb_typeof(price_rows) <> 'array' then raise exception 'Invalid price rows'; end if;
  if jsonb_array_length(price_rows) not between 1 and 10000 then raise exception 'Invalid price rows'; end if;
  if exists (select 1 from jsonb_array_elements(price_rows) r
    group by r->>'kind', r->>'resourceId', r->>'specification', r->>'lengthMm', r->>'unit'
    having count(*) > 1) then raise exception 'Duplicate price rows'; end if;
  -- Stable lock order; updates compare the original timestamp in the same statement.
  for entry in select value from jsonb_array_elements(price_rows)
    order by value->>'kind', value->>'resourceId', value->>'specification', value->>'lengthMm', value->>'unit'
  loop
    if jsonb_typeof(entry) <> 'object'
      or jsonb_typeof(entry->'taxIncludedPrice') is distinct from 'string'
      or (entry->>'taxIncludedPrice') !~ '^[0-9]{1,9}(\.[0-9]{1,6})?$'
      or jsonb_typeof(entry->'lengthMm') is distinct from 'number'
      or (entry->>'lengthMm') !~ '^[0-9]+$'
      or not (entry ? 'expectedUpdatedAt')
      or jsonb_typeof(entry->'expectedUpdatedAt') not in ('null','string')
    then raise exception 'Invalid price row'; end if;
    affected := null;
    if entry->>'expectedUpdatedAt' is null then
      insert into public.material_prices(kind, resource_id, name, specification, length_mm, unit, tax_included_price, source_name)
      values (entry->>'kind', (entry->>'resourceId')::uuid, entry->>'name', entry->>'specification',
        (entry->>'lengthMm')::bigint, entry->>'unit', (entry->>'taxIncludedPrice')::numeric, '页面编辑')
      on conflict (kind, resource_id, specification, length_mm, unit) do nothing
      returning id into affected;
    else
      update public.material_prices set tax_included_price = (entry->>'taxIncludedPrice')::numeric,
        source_name = '页面编辑'
      where kind = entry->>'kind' and resource_id = (entry->>'resourceId')::uuid
        and specification = entry->>'specification' and length_mm = (entry->>'lengthMm')::bigint
        and unit = entry->>'unit' and updated_at = (entry->>'expectedUpdatedAt')::timestamptz
      returning id into affected;
    end if;
    if affected is null then raise exception 'Price conflict' using errcode = 'P0002'; end if;
  end loop;
end $$;
revoke all on function public.save_material_prices(jsonb) from public, anon;
grant execute on function public.save_material_prices(jsonb) to authenticated;
commit;

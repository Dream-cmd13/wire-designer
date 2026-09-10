create table public.material_prices (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.catalog_items(id) on delete cascade,
  kind text not null check (kind in ('connector', 'wire', 'outer-mold')),
  name text not null check (length(btrim(name)) between 1 and 200),
  specification text not null check (length(specification) between 1 and 1000 and jsonb_typeof(specification::jsonb) = 'array'),
  length_mm bigint not null check (length_mm between 0 and 9007199254740991),
  unit text not null,
  tax_included_price numeric not null check (tax_included_price >= 0 and tax_included_price < 1000000000 and scale(tax_included_price) <= 6),
  source_name text not null check (length(btrim(source_name)) between 1 and 255),
  updated_at timestamptz not null default now(),
  check ((kind = 'wire' and length_mm > 0 and unit = '元/条')
    or (kind <> 'wire' and length_mm = 0 and unit = '元/个')),
  unique (kind, resource_id, specification, length_mm, unit)
);

comment on column public.material_prices.length_mm is '线材整条价格档位上限（毫米）：实际长度向上取最近档，边界使用本档；连接器及外模为0。超过5000毫米由报价逻辑转人工核价。';

create function public.validate_material_price() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.catalog_items where id = new.resource_id
    and kind = case when new.kind = 'outer-mold' then 'overmold' else new.kind end) then
    raise exception 'Price material does not match catalog kind';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger material_price_validate before insert or update on public.material_prices
for each row execute function public.validate_material_price();

alter table public.material_prices enable row level security;
revoke all on public.material_prices from anon, authenticated;
grant select, insert, update on public.material_prices to authenticated;
grant all on public.material_prices to service_role;
create policy "shared prices read" on public.material_prices for select to authenticated using (true);
create policy "shared prices insert" on public.material_prices for insert to authenticated with check (true);
create policy "shared prices update" on public.material_prices for update to authenticated using (true) with check (true);

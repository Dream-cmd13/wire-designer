create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('sales', 'engineer', 'admin'))
);
create function public.current_app_role() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select role from public.user_roles where user_id = auth.uid()), 'sales')
$$;
create function public.can_manage_pricing() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public.current_app_role() in ('engineer', 'admin')
$$;
revoke all on function public.current_app_role(), public.can_manage_pricing() from public, anon;
grant execute on function public.current_app_role(), public.can_manage_pricing() to authenticated, service_role;
alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
create policy "own role read" on public.user_roles for select to authenticated using (user_id = auth.uid());

create table public.pricing_settings (
  id integer primary key default 1 check (id = 1),
  version integer not null default 1 check (version > 0),
  settings jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.pricing_settings (settings) values ('{
  "materialLossRate":"0.03","processingLossRate":"0.05","marginRate":"0.20","freightRate":"0.03",
  "laborRates":{"裁线":"0.05","去皮":"0.02","去外皮":"0.02","处理编织":"0.10","热缩编织":"0.10","焊接":"0.20","成型":"0.20"},
  "finishingLaborRates":{
    "500":{"电测":"0.05","外观":"0.05","包装人工":"0.05"},
    "1000":{"电测":"0.10","外观":"0.20","包装人工":"0.10"},
    "2000":{"电测":"0.10","外观":"0.20","包装人工":"0.20"},
    "3000":{"电测":"0.10","外观":"0.20","包装人工":"0.20"},
    "5000":{"电测":"0.10","外观":"0.20","包装人工":"0.30"}
  }
}');
alter table public.pricing_settings enable row level security;
revoke all on public.pricing_settings from anon, authenticated;
grant select on public.pricing_settings to authenticated;
grant all on public.pricing_settings to service_role;
create policy "pricing settings internal read" on public.pricing_settings for select to authenticated using (public.can_manage_pricing());

create table public.pricing_audit (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);
alter table public.pricing_audit enable row level security;
revoke all on public.pricing_audit from public, anon, authenticated;
grant select on public.pricing_audit to authenticated;
grant all on public.pricing_audit to service_role;
grant all on sequence public.pricing_audit_id_seq to service_role;
create policy "admin audit read" on public.pricing_audit for select to authenticated using (public.current_app_role() = 'admin');
create function public.audit_pricing_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pricing_audit(actor, action, before_value, after_value)
    values (auth.uid(), tg_table_name || ':' || tg_op, case when tg_op <> 'INSERT' then to_jsonb(old) end, to_jsonb(new));
  return new;
end $$;
revoke all on function public.audit_pricing_change() from public, anon, authenticated;
create trigger prices_audit after insert or update on public.material_prices for each row execute function public.audit_pricing_change();
create trigger settings_audit after update on public.pricing_settings for each row execute function public.audit_pricing_change();
create trigger roles_audit after insert or update on public.user_roles for each row execute function public.audit_pricing_change();

create function public.save_pricing_settings(expected_version integer, new_settings jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare k text; v text; next_version integer; tier text; tier_rates jsonb;
begin
  if not public.can_manage_pricing() then raise exception 'Forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(new_settings) is distinct from 'object'
    or jsonb_typeof(new_settings->'laborRates') is distinct from 'object'
    or jsonb_typeof(new_settings->'finishingLaborRates') is distinct from 'object' then raise exception 'Invalid settings'; end if;
  if (select count(*) from jsonb_object_keys(new_settings)) <> 6
    or (select count(*) from jsonb_object_keys(new_settings->'laborRates')) <> 7
    or (select count(*) from jsonb_object_keys(new_settings->'finishingLaborRates')) <> 5 then raise exception 'Invalid settings fields'; end if;
  foreach k in array array['materialLossRate','processingLossRate','marginRate','freightRate'] loop
    v := new_settings->>k;
    if jsonb_typeof(new_settings->k) is distinct from 'string' or v !~ '^[0-9]{1,9}(\.[0-9]{1,6})?$' then raise exception 'Invalid rate'; end if;
    if v::numeric >= 1 then raise exception 'Invalid rate'; end if;
  end loop;
  foreach k in array array['裁线','去皮','去外皮','处理编织','热缩编织','焊接','成型'] loop
    v := new_settings->'laborRates'->>k;
    if jsonb_typeof(new_settings->'laborRates'->k) is distinct from 'string' or v !~ '^[0-9]{1,9}(\.[0-9]{1,6})?$' then raise exception 'Invalid labor rate'; end if;
  end loop;
  foreach tier in array array['500','1000','2000','3000','5000'] loop
    tier_rates := new_settings->'finishingLaborRates'->tier;
    if jsonb_typeof(tier_rates) is distinct from 'object' then raise exception 'Invalid finishing tier'; end if;
    if (select count(*) from jsonb_object_keys(tier_rates)) <> 3 then raise exception 'Invalid finishing fields'; end if;
    foreach k in array array['电测','外观','包装人工'] loop
      v := tier_rates->>k;
      if jsonb_typeof(tier_rates->k) is distinct from 'string' or v !~ '^[0-9]{1,9}(\.[0-9]{1,6})?$' then raise exception 'Invalid finishing rate'; end if;
    end loop;
  end loop;
  update public.pricing_settings set settings = new_settings - 'version', version = version + 1,
    updated_at = now(), updated_by = auth.uid() where id = 1 and version = expected_version
    returning version into next_version;
  if next_version is null then raise exception '参数已被其他用户修改，请刷新后重试'; end if;
  return next_version;
end $$;
revoke all on function public.save_pricing_settings(integer,jsonb) from public, anon;
grant execute on function public.save_pricing_settings(integer,jsonb) to authenticated;

-- A single RPC validates the complete import before writing any rows.
create function public.import_material_prices(price_rows jsonb, source_name text) returns void
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
      name = excluded.name, tax_included_price = excluded.tax_included_price, source_name = excluded.source_name;
end $$;
revoke all on function public.import_material_prices(jsonb,text) from public, anon;
grant execute on function public.import_material_prices(jsonb,text) to authenticated;

create function public.assign_user_role(target_user uuid, new_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.current_app_role() <> 'admin' then raise exception 'Forbidden' using errcode = '42501'; end if;
  if target_user = auth.uid() then raise exception '不能修改自己的角色'; end if;
  if new_role not in ('sales','engineer','admin') or new_role is null then raise exception 'Invalid role'; end if;
  insert into public.user_roles(user_id, role) values (target_user, new_role)
    on conflict (user_id) do update set role = excluded.role;
end $$;
create function public.list_app_users() returns table(user_id uuid, email text, role text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.current_app_role() <> 'admin' then raise exception 'Forbidden' using errcode = '42501'; end if;
  return query select u.id, u.email::text, coalesce(r.role, 'sales') from auth.users u left join public.user_roles r on r.user_id = u.id order by u.email;
end $$;
revoke all on function public.assign_user_role(uuid,text), public.list_app_users() from public, anon;
grant execute on function public.assign_user_role(uuid,text), public.list_app_users() to authenticated;

-- One SQL statement gives the engine a consistent catalog/price/settings snapshot.
create function public.quote_snapshot(actor_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'role', coalesce((select role from public.user_roles where user_id = actor_id), 'sales'),
    'catalog', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.catalog_items c where kind in ('connector','wire','overmold')),
    'prices', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from public.material_prices p),
    'settings', (select settings || jsonb_build_object('version', version) from public.pricing_settings where id = 1)
  )
$$;
revoke all on function public.quote_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.quote_snapshot(uuid) to service_role;

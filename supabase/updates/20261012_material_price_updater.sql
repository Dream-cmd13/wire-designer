-- Add metadata without rewriting prices, timestamps or historical audit records.
begin;
alter table public.material_prices add column if not exists updated_by uuid;
alter table public.material_prices add column if not exists updated_by_name text;
comment on column public.material_prices.updated_by is 'Authenticated updater UUID; historical unknown records remain null. Retained if account is deleted.';
comment on column public.material_prices.updated_by_name is 'Display name snapshot at update time; historical unknown records remain null.';
create or replace function public.stamp_material_price_updater() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_by := auth.uid();
  new.updated_by_name := null;
  if new.updated_by is not null then
    select coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'), ''),
      nullif(split_part(u.email, '@', 1), ''), new.updated_by::text)
    into new.updated_by_name from auth.users u where u.id = new.updated_by;
  else
    new.updated_by_name := '系统';
  end if;
  return new;
end $$;
revoke all on function public.stamp_material_price_updater() from public, anon, authenticated;
drop trigger if exists material_price_updater on public.material_prices;
create trigger material_price_updater before insert or update on public.material_prices
for each row execute function public.stamp_material_price_updater();
commit;

begin;

alter table public.dwg_assets add column if not exists parent_asset_id uuid
  references public.dwg_assets(id) on delete restrict;
create index if not exists dwg_assets_parent on public.dwg_assets(parent_asset_id) where parent_asset_id is not null;

create or replace function public.check_dwg_asset_parent() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.parent_asset_id is not null and (new.parent_asset_id = new.id or not exists (
    select 1 from public.dwg_assets as parent
    where parent.id = new.parent_asset_id and parent.owner_id = new.owner_id and parent.status = 'ready'
  )) then
    raise exception 'DWG parent must be a ready drawing of the same owner' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.check_dwg_asset_parent() from public, anon, authenticated;
drop trigger if exists check_dwg_asset_parent on public.dwg_assets;
create trigger check_dwg_asset_parent before insert on public.dwg_assets
for each row execute function public.check_dwg_asset_parent();

commit;

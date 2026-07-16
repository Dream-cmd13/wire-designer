-- Rename the application user table on an existing database.
-- "user" is a PostgreSQL keyword, so callers must quote the identifier in SQL.
begin;

-- Drop stale RLS policies before the relation is renamed. PostgreSQL renames
-- policies with the table, but this makes reruns deterministic on older setups.
do $$
begin
  if to_regclass('public.profiles') is not null then
    execute 'alter table public.profiles disable row level security';
    execute 'drop policy if exists "profile owner read" on public.profiles';
    execute 'drop policy if exists "profile owner update" on public.profiles';
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.profiles') is not null
    and to_regclass('public."user"') is not null then
    raise exception 'both public.profiles and public."user" exist; resolve this table name collision before continuing';
  elsif to_regclass('public.profiles') is not null then
    alter table public.profiles rename to "user";
  end if;
end;
$$;

commit;

-- After this file, rerun:
--   10_schema/03_integrity.sql
--   30_security/01_rls.sql

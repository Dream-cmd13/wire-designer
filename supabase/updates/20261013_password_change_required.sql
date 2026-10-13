-- Additive, repeatable migration. Does not change any existing account or business data.
begin;

-- Version checks are atomic with Auth's password write, including concurrent admin resets.
create or replace function public.guard_account_password() returns trigger
language plpgsql set search_path = '' as $$
declare previous_version bigint; write_context jsonb;
begin
  if tg_op = 'INSERT' then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
      || '{"must_change_password":true,"password_version":0}'::jsonb;
  elsif new.encrypted_password is distinct from old.encrypted_password then
    previous_version := coalesce((old.raw_app_meta_data->>'password_version')::bigint, 0);
    perform set_config('app.password_write_context', jsonb_build_object('id', new.id, 'version', previous_version)::text, true);
    if new.raw_app_meta_data ? 'password_expected_version'
      and (new.raw_app_meta_data->>'password_expected_version')::bigint is distinct from previous_version then
      raise exception 'Password changed concurrently; retry with the current password';
    end if;
    new.raw_app_meta_data := (coalesce(new.raw_app_meta_data, '{}'::jsonb) - 'password_expected_version')
      || jsonb_build_object('password_version', previous_version + 1);
  elsif new.raw_app_meta_data is distinct from old.raw_app_meta_data then
    -- GoTrue updates encrypted_password first, then app metadata in the same transaction.
    if new.raw_app_meta_data ? 'password_expected_version' then
      write_context := nullif(current_setting('app.password_write_context', true), '')::jsonb;
      if write_context->>'id' is distinct from new.id::text
        or (write_context->>'version')::bigint is distinct from (new.raw_app_meta_data->>'password_expected_version')::bigint then
        raise exception 'Password changed concurrently; retry with the current password';
      end if;
    end if;
    new.raw_app_meta_data := (coalesce(new.raw_app_meta_data, '{}'::jsonb) - 'password_expected_version')
      || jsonb_build_object('password_version', coalesce((old.raw_app_meta_data->>'password_version')::bigint, 0));
  end if;
  return new;
end $$;
revoke all on function public.guard_account_password() from public, anon, authenticated;
drop trigger if exists guard_account_password on auth.users;
create trigger guard_account_password before insert or update on auth.users
  for each row execute function public.guard_account_password();

create or replace function public.password_change_required() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (raw_app_meta_data->>'must_change_password')::boolean
    from auth.users where id = auth.uid()), false)
$$;
revoke all on function public.password_change_required() from public, anon;
grant execute on function public.password_change_required() to authenticated, service_role;

-- A restrictive policy is ANDed with existing policies, preserving their role/owner rules.
do $$
declare target record;
begin
  for target in select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and c.relrowsecurity
      and (n.nspname = 'public' or (n.nspname = 'storage' and c.relname = 'objects'))
  loop
    execute format('drop policy if exists password_change_gate on %I.%I', target.nspname, target.relname);
    execute format('create policy password_change_gate on %I.%I as restrictive for all to authenticated
      using (not (select public.password_change_required()))
      with check (not (select public.password_change_required()))', target.nspname, target.relname);
  end loop;
end $$;

-- SECURITY DEFINER RPCs use current_app_role; deny them while a password change is pending.
do $migration$
begin
  if to_regclass('public.user_roles') is not null then
    execute $fn$create or replace function public.current_app_role() returns text
      language sql stable security definer set search_path = '' as $body$
        select case when public.password_change_required() then 'password_required'
          else coalesce((select role from public.user_roles where user_id = auth.uid()), 'sales') end
      $body$$fn$;
  end if;
end $migration$;

-- This owner-executed view bypasses table RLS; retain its columns and add the same gate.
do $$
declare definition text;
begin
  if to_regclass('public.finished_harness_materials_visible') is not null then
    definition := rtrim(pg_get_viewdef('public.finished_harness_materials_visible'::regclass, true), E';\n ');
    if position('password_change_required' in definition) = 0 then
      execute 'create or replace view public.finished_harness_materials_visible with (security_barrier = true) as '
        || 'select * from (' || definition || ') visible where not public.password_change_required()';
    end if;
  end if;
end $$;
commit;

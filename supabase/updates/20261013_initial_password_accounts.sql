-- Apply after 20261013_password_change_required.sql. Keeps all passwords and business data.
begin;

create or replace function public.enforce_initial_password() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Supabase bcrypt hashes can be checked without exposing or changing the password.
  if new.encrypted_password like '$2%'
    and extensions.crypt('888888', new.encrypted_password) = new.encrypted_password then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
      || '{"must_change_password":true}'::jsonb;
  end if;
  return new;
end $$;
revoke all on function public.enforce_initial_password() from public, anon, authenticated;
-- Runs after guard_account_password (PostgreSQL orders same-event triggers by name).
drop trigger if exists require_initial_password_change on auth.users;
create trigger require_initial_password_change before insert or update of encrypted_password, raw_app_meta_data on auth.users
  for each row execute function public.enforce_initial_password();

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"must_change_password":true}'::jsonb
where encrypted_password like '$2%'
  and extensions.crypt('888888', encrypted_password) = encrypted_password
  and (raw_app_meta_data->>'must_change_password') is distinct from 'true';

commit;

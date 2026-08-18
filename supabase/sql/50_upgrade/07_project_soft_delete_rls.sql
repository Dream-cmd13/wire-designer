-- Repair project soft-delete RLS for an existing database.
--
-- PostgREST reads the result of PATCH internally. A SELECT policy that hides
-- deleted_at rows therefore rejects the row produced by the soft-delete with
-- 42501, even when the UPDATE policy authorizes the owner.
--
-- Run manually with administrator privileges. This migration is idempotent.

begin;

alter table public.projects enable row level security;

drop policy if exists "project owner read" on public.projects;
create policy "project owner read"
on public.projects
for select to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "project owner update" on public.projects;
create policy "project owner update"
on public.projects
for update to authenticated
using (owner_id = (select auth.uid()) and deleted_at is null)
with check (owner_id = (select auth.uid()));

revoke all on public.projects from anon;
revoke update on public.projects from authenticated;
revoke delete, truncate, references, trigger on public.projects from authenticated;
grant update (name, description, status, deleted_at, updated_at) on public.projects to authenticated;

create or replace function public.set_project_delete_audit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    new.deleted_by := auth.uid();
  elsif old.deleted_at is not null and new.deleted_at is null then
    new.deleted_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_set_delete_audit on public.projects;
create trigger projects_set_delete_audit
before update on public.projects
for each row execute function public.set_project_delete_audit();

notify pgrst, 'reload schema';

commit;

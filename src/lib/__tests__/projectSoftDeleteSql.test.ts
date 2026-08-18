import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const rlsSql = readFileSync(
  new URL('../../../supabase/sql/30_security/01_rls.sql', import.meta.url),
  'utf8',
).replace(/\s+/g, ' ');
const integritySql = readFileSync(
  new URL('../../../supabase/sql/10_schema/03_integrity.sql', import.meta.url),
  'utf8',
).replace(/\s+/g, ' ');
const upgradeSql = readFileSync(
  new URL('../../../supabase/sql/50_upgrade/07_project_soft_delete_rls.sql', import.meta.url),
  'utf8',
).replace(/\s+/g, ' ');

describe('project soft-delete RLS', () => {
  it('keeps the updated soft-deleted row visible to its owner during PATCH', () => {
    expect(rlsSql).toContain(
      'create policy "project owner read" on public.projects for select to authenticated using (owner_id = (select auth.uid()))',
    );
    expect(rlsSql).toContain(
      'create policy "project owner update" on public.projects for update to authenticated using (owner_id = (select auth.uid()) and deleted_at is null) with check (owner_id = (select auth.uid()))',
    );
    expect(rlsSql).toContain('revoke all on public.projects from anon');
    expect(rlsSql).toContain('revoke update on public.projects from authenticated');
    expect(rlsSql).toContain(
      'grant update (name, description, status, deleted_at, updated_at) on public.projects to authenticated',
    );
  });

  it('audits soft-delete transitions and carries the same repair in the upgrade migration', () => {
    expect(integritySql).toContain('create or replace function public.set_project_delete_audit()');
    expect(integritySql).toContain('create trigger projects_set_delete_audit');
    expect(upgradeSql).toContain('drop policy if exists "project owner read" on public.projects');
    expect(upgradeSql).toContain('new.deleted_by := auth.uid()');
    expect(upgradeSql).toContain('revoke all on public.projects from anon');
    expect(upgradeSql).toContain(
      'grant update (name, description, status, deleted_at, updated_at) on public.projects to authenticated',
    );
    expect(upgradeSql).toContain("notify pgrst, 'reload schema'");
  });
});

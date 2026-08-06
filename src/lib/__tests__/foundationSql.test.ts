import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const foundationSql = readFileSync(new URL('../../../supabase/sql/10_schema/01_foundation.sql', import.meta.url), 'utf8');

describe('foundation SQL', () => {
  it('creates an application user record whenever an auth user is created', () => {
    expect(foundationSql).toContain('create or replace function public.handle_new_auth_user()');
    expect(foundationSql).toContain('create trigger on_auth_user_created');
  });
});

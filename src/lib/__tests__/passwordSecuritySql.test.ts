import { afterAll, beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = '00000000-0000-4000-8000-000000000001';

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_app_meta_data jsonb not null default '{}', encrypted_password text);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create schema storage;
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated, service_role;
    grant select on storage.objects to authenticated;
    insert into auth.users values ('${id}', 'user@test', '{"must_change_password":true}');
    create table public.catalog_items(id integer primary key);
    alter table public.catalog_items enable row level security;
    grant select on public.catalog_items to authenticated;
    create policy "catalog read" on public.catalog_items for select to authenticated using (true);
    insert into public.catalog_items values (1);
  `);
  await db.exec(readFileSync('supabase/updates/20261013_password_change_required.sql', 'utf8'));
}, 30000);

afterAll(async () => { await db.close(); });

it('blocks business tables while password change is required and reopens them afterwards', async () => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
  expect((await db.query('select public.password_change_required() as required')).rows[0]).toEqual({ required: true });
  expect((await db.query('select * from public.catalog_items')).rows).toHaveLength(0);
  await db.exec(`reset role; update auth.users set raw_app_meta_data = '{}' where id = '${id}';`);
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
  expect((await db.query('select * from public.catalog_items')).rows).toHaveLength(1);
});

it('rejects a password change verified before a concurrent administrator reset', async () => {
  await db.exec(`reset role;
    update auth.users set encrypted_password = 'reset-hash', raw_app_meta_data = '{"must_change_password":true}' where id = '${id}';`);
  await expect(db.exec(`update auth.users set encrypted_password = 'stale-change-hash',
    raw_app_meta_data = '{"must_change_password":false,"password_expected_version":0}' where id = '${id}'`)).rejects.toThrow('Password changed concurrently');
  const result = await db.query(`select encrypted_password, raw_app_meta_data->>'must_change_password' as required from auth.users where id = '${id}'`);
  expect(result.rows[0]).toEqual({ encrypted_password: 'reset-hash', required: 'true' });
});

it('forces new Auth accounts to change password without altering existing accounts', async () => {
  await db.exec(`reset role; insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000002','new@test')`);
  expect((await db.query(`select raw_app_meta_data->>'must_change_password' as required from auth.users where email = 'new@test'`)).rows[0]).toEqual({ required: 'true' });
});

it('handles GoTrue password-then-metadata writes atomically and preserves the database version', async () => {
  await db.exec(`reset role;
    begin;
    update auth.users set encrypted_password = 'new-valid-hash' where id = '${id}';
    update auth.users set raw_app_meta_data = '{"must_change_password":false,"password_expected_version":1,"password_version":1}' where id = '${id}';
    commit;`);
  expect((await db.query(`select raw_app_meta_data from auth.users where id = '${id}'`)).rows[0]).toEqual({ raw_app_meta_data: { must_change_password: false, password_version: 2 } });
  await db.exec('begin');
  await db.exec(`update auth.users set encrypted_password = 'stale-hash' where id = '${id}'`);
  await expect(db.exec(`update auth.users set raw_app_meta_data = '{"must_change_password":false,"password_expected_version":1}' where id = '${id}'`)).rejects.toThrow('Password changed concurrently');
  await db.exec('rollback');
  expect((await db.query(`select encrypted_password from auth.users where id = '${id}'`)).rows[0]).toEqual({ encrypted_password: 'new-valid-hash' });
});

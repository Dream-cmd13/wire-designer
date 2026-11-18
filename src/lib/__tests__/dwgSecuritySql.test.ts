import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('preserves built-in drawings and enforces owner-only DWG storage and finalization', async () => {
  const db = new PGlite();
  const owner = '00000000-0000-4000-8000-000000000001';
  const other = '00000000-0000-4000-8000-000000000002';
  const id = '00000000-0000-4000-8000-000000000003';
  const key = `${owner}/${id}/source.dwg`;
  const sql = readFileSync('supabase/updates/20261118_dwg_preview.sql', 'utf8');
  const asUser = (user: string, role: string) => db.exec(`reset role; set role authenticated;
    select set_config('request.jwt.claim.sub', '${user}', false), set_config('app.role', '${role}', false);`);
  const insert = () => db.query(`insert into dwg_assets(id, owner_id, original_name, object_key, file_size, sha256)
    values ($1,$2,'drawing.DWG',$3,20,$4)`, [id, owner, key, 'a'.repeat(64)]);
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      insert into auth.users values ('${owner}'), ('${other}');
      create function auth.uid() returns uuid language sql stable as $$select current_setting('request.jwt.claim.sub')::uuid$$;
      create function public.current_app_role() returns text language sql stable as $$select current_setting('app.role')$$;
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
      create table storage.objects (bucket_id text, name text, metadata jsonb, unique(bucket_id,name));
      insert into storage.buckets values ('dwg-drawings', 'dwg-drawings', false, null);
      insert into storage.objects values ('dwg-drawings', 'manifest.json', '{}');
      alter table storage.objects enable row level security;
      create policy "built-in read" on storage.objects for select to authenticated using (bucket_id = 'dwg-drawings');
      grant usage on schema auth,storage to authenticated;
      grant select,insert,update,delete on storage.objects to authenticated;`);
    await db.exec(sql);
    await asUser(owner, 'sales');
    await expect(insert()).rejects.toThrow();
    await asUser(owner, 'engineer');
    await expect(db.query("insert into storage.objects values ('dwg-files', $1, '{\"size\":20}')", [key])).rejects.toThrow();
    await insert();
    await expect(db.exec("update dwg_assets set status='ready'")).rejects.toThrow('upload');

    await db.query("insert into storage.objects values ('dwg-files', $1, '{\"size\":20}')", [key]);
    await db.exec("update dwg_assets set status='ready'");
    expect((await db.query('select status from dwg_assets')).rows).toEqual([{ status: 'ready' }]);
    expect((await db.query("select name from storage.objects where bucket_id='dwg-files'")).rows).toEqual([{ name: key }]);
    expect((await db.query("delete from storage.objects where bucket_id='dwg-files' returning *")).rows).toEqual([]);
    await expect(db.exec("update dwg_assets set original_name='changed.dwg'")).rejects.toThrow();

    await asUser(other, 'admin');
    expect((await db.query('select id from dwg_assets')).rows).toEqual([]);
    expect((await db.query('select name from storage.objects')).rows).toEqual([{ name: 'manifest.json' }]);

    await db.exec('reset role');
    await db.exec(sql);
    expect((await db.query("select public, file_size_limit::int from storage.buckets where id='dwg-files'")).rows)
      .toEqual([{ public: false, file_size_limit: 20971520 }]);
    expect((await db.query('select name from storage.objects order by bucket_id')).rows)
      .toEqual([{ name: 'manifest.json' }, { name: key }]);
    expect((await db.query('select status from dwg_assets')).rows).toEqual([{ status: 'ready' }]);
  } finally {
    await db.close();
  }
});

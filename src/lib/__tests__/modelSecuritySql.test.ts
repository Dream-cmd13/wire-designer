import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

const db = new PGlite();
const ids = ['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004'];
const modelId = '00000000-0000-4000-8000-000000000101';
const key = `${ids[0]}/${modelId}/source.stp`;
const migration = () => readFileSync('supabase/updates/20261104_model_preview.sql', 'utf8');
async function asUser(index: number, role = 'authenticated') {
  await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${index < 0 ? '' : ids[index]}',false);`);
}
const insert = (id = modelId, owner = ids[0], objectKey = key, status = 'uploading') => db.query(`insert into public.model_assets
  (id,owner_id,original_name,format,source_unit,object_key,file_size,sha256,status,bounds_mm)
  values ($1,$2,'part.stp','step','mm',$3,13,$4,$5,'{"min":[0,0,0],"max":[1,1,1]}')`, [id, owner, objectKey, 'a'.repeat(64), status]);

describe('model migration and RLS (real PostgreSQL engine; Storage schema fixture)', () => {
  beforeAll(async () => {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
      create table public.user_roles(user_id uuid,role text);
      create function public.current_app_role() returns text language sql stable security definer set search_path='' as $$select role from public.user_roles where user_id=auth.uid()$$;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema public,storage to anon,authenticated; grant select,insert,update,delete on storage.objects to authenticated;
      create table public.existing_business(id int, payload text); insert into public.existing_business values(1,'keep me');
      insert into auth.users values ${ids.map((id) => `('${id}')`).join(',')};
      insert into public.user_roles values ${ids.map((id,i) => `('${id}','${['engineer','engineer','sales','admin'][i]}')`).join(',')};`);
    await db.exec(migration()); await asUser(0); await insert();
  });
  afterAll(async () => { await db.close(); });
  it('is repeatable and preserves existing rows and objects', async () => {
    await db.exec('reset role'); await db.exec(migration());
    expect((await db.query('select payload from existing_business')).rows).toEqual([{ payload: 'keep me' }]);
    expect((await db.query('select count(*)::int as n from model_assets')).rows[0]).toEqual({ n: 1 });
  });
  it('only permits the owner engineer, including when the other user is admin', async () => {
    for (const index of [1,2,3]) {
      await asUser(index);
      expect((await db.query('select * from model_assets')).rows).toHaveLength(0);
      expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
      await expect(insert('00000000-0000-4000-8000-000000000102')).rejects.toThrow();
      await expect(db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['model-files',key])).rejects.toThrow();
    }
    await asUser(-1, 'anon'); await expect(db.query('select * from model_assets')).rejects.toThrow();
    await asUser(0); expect((await db.query('select * from model_assets')).rows).toHaveLength(1);
  });
  it('rejects forged paths/owners, premature ready and ready inserts', async () => {
    await asUser(0);
    await expect(insert('00000000-0000-4000-8000-000000000102', ids[1], `${ids[1]}/00000000-0000-4000-8000-000000000102/source.stp`)).rejects.toThrow();
    await expect(insert('00000000-0000-4000-8000-000000000102', ids[0], '../wrong')).rejects.toThrow();
    await expect(insert('00000000-0000-4000-8000-000000000102', ids[0], `${ids[0]}/00000000-0000-4000-8000-000000000102/source.stp`, 'ready')).rejects.toThrow();
    await expect(db.query("update model_assets set status='ready' where id=$1", [modelId])).rejects.toThrow();
  });
  it('permits original insert/read but disallows overwrite and delete after ready', async () => {
    await asUser(0);
    await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)', ['model-files', key, { size: 13 }]);
    await db.query("update model_assets set status='ready' where id=$1", [modelId]);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(1);
    expect((await db.query('update storage.objects set metadata=\'{}\' returning *')).rows).toHaveLength(0);
    expect((await db.query('delete from storage.objects returning *')).rows).toHaveLength(0);
    await expect(db.query('delete from model_assets')).rejects.toThrow();
    expect((await db.query("update model_assets set status='uploading' returning *")).rows).toHaveLength(0);
    expect((await db.query('select status from model_assets')).rows[0]).toEqual({ status: 'ready' });
    await expect(db.query("update model_assets set sha256=$1", ['b'.repeat(64)])).rejects.toThrow();
    for (const index of [1,2,3]) { await asUser(index); expect((await db.query('select * from storage.objects')).rows).toHaveLength(0); }
  });
  it('revoking the owner role removes both record and file access', async () => {
    await db.exec(`reset role; update user_roles set role='sales' where user_id='${ids[0]}'`);
    await asUser(0);
    expect((await db.query('select * from model_assets')).rows).toHaveLength(0);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
  });
});

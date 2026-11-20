import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('preserves built-in drawings and enforces owner-only DWG storage and finalization', async () => {
  const db = new PGlite();
  const owner = '00000000-0000-4000-8000-000000000001';
  const other = '00000000-0000-4000-8000-000000000002';
  const id = '00000000-0000-4000-8000-000000000003';
  const key = `${owner}/${id}/source.dwg`;
  const source = readFileSync('M12A05-07-068-3-10-500.dwg');
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  const sql = readFileSync('supabase/updates/20261118_dwg_preview.sql', 'utf8');
  const asUser = (user: string, role: string) => db.exec(`reset role; set role authenticated;
    select set_config('request.jwt.claim.sub', '${user}', false), set_config('app.role', '${role}', false);`);
  const insert = () => db.query(`insert into dwg_assets(id, owner_id, original_name, object_key, file_size, sha256)
    values ($1,$2,'drawing.DWG',$3,$4,$5)`, [id, owner, key, source.length, hash(source)]);
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

    await db.query("insert into storage.objects values ('dwg-files', $1, $2::jsonb)", [key, JSON.stringify({ size: source.length })]);
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

    const migration = readFileSync('supabase/updates/20261120_dwg_asset_parent.sql', 'utf8');
    const before = (await db.query('select to_jsonb(d) as row from dwg_assets d')).rows;
    const beforeObjects = (await db.query('select * from storage.objects order by name')).rows;
    await db.exec('create table storage.fixture_bytes (name text primary key, content bytea not null)');
    await db.query('insert into storage.fixture_bytes values ($1,$2)', [key, Uint8Array.from(source)]);
    const storedHash = async (database: PGlite) => {
      const result = await database.query<{ content: Uint8Array }>('select content from storage.fixture_bytes where name=$1', [key]);
      return hash(result.rows[0].content);
    };
    const backup = await db.dumpDataDir('gzip');
    const restored = await PGlite.create({ loadDataDir: backup });
    try {
      expect((await restored.query('select to_jsonb(d) as row from dwg_assets d')).rows).toEqual(before);
      expect((await restored.query('select * from storage.objects order by name')).rows).toEqual(beforeObjects);
      expect(await storedHash(restored)).toBe(hash(source));
    } finally {
      await restored.close();
    }
    await db.exec(migration);
    await db.exec(migration);
    expect((await db.query("select to_jsonb(d) - 'parent_asset_id' as row from dwg_assets d")).rows).toEqual(before);
    expect((await db.query('select * from storage.objects order by name')).rows).toEqual(beforeObjects);
    expect(await storedHash(db)).toBe(hash(source));
    expect((await db.query('select parent_asset_id from dwg_assets')).rows).toEqual([{ parent_asset_id: null }]);

    const child = (suffix: string, ownerId: string, parentId: string) => {
      const childId = `00000000-0000-4000-8000-0000000000${suffix}`;
      return db.query(`insert into dwg_assets(id, owner_id, original_name, object_key, file_size, sha256, parent_asset_id)
        values ($1,$2,'version.dwg',$3,21,$4,$5)`, [childId, ownerId, `${ownerId}/${childId}/source.dwg`, 'c'.repeat(64), parentId]);
    };
    await asUser(other, 'engineer');
    await expect(child('10', other, id)).rejects.toThrow('same owner');
    await asUser(owner, 'engineer');
    await child('11', owner, id);
    await child('12', owner, id);
    await expect(child('13', owner, '00000000-0000-4000-8000-000000000011')).rejects.toThrow('ready');
    expect((await db.query('select * from dwg_assets where parent_asset_id=$1', [id])).rows).toHaveLength(2);
    await db.exec('reset role');
    await expect(db.query('update dwg_assets set parent_asset_id=null where parent_asset_id=$1', [id])).rejects.toThrow('immutable');
  } finally {
    await db.close();
  }
});

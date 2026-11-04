import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const engineer = '00000000-0000-4000-8000-000000000001';
const otherEngineer = '00000000-0000-4000-8000-000000000002';
const sales = '00000000-0000-4000-8000-000000000003';
const projectA = '00000000-0000-4000-8000-00000000a001';
const projectB = '00000000-0000-4000-8000-00000000b001';
const drawingA = 'drawing-a-0001';

const db = new PGlite();

async function asUser(id: string) {
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
}

async function asOwner() {
  await db.exec('reset role;');
}

async function scalar(sql: string, params?: unknown[]) {
  return (await db.query<Record<string, unknown>>(sql, params)).rows[0];
}

function projectConfig(id: string, name: string, marker: string) {
  return {
    id,
    name,
    marker,
    connectors: [],
    materials: [],
    protectiveSleeves: [],
    models: [],
    updatedAt: 1,
  };
}

describe('document revision SQL and permissions (isolated PGlite)', () => {
  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key, email text, raw_app_meta_data jsonb not null default '{}', encrypted_password text);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      create schema storage; create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon, authenticated, service_role;
      grant select on storage.objects to authenticated;
      insert into auth.users values
        ('${engineer}','engineer@test'), ('${otherEngineer}','other@test'), ('${sales}','sales@test');
    `);
    for (const file of [
      '10_schema/01_core',
      '10_schema/02_catalog',
      '10_schema/03_material_prices',
      '10_schema/04_suppliers',
      '10_schema/05_finished_harness_materials',
      '10_schema/06_finished_harness_cost_analyses',
      '10_schema/07_pricing_permissions',
      '30_security/01_rls',
    ]) {
      await db.exec(readFileSync(`supabase/sql/${file}.sql`, 'utf8')
        .replace('create extension if not exists pgcrypto;', ''));
    }
    await db.exec(readFileSync('supabase/updates/20261013_password_change_required.sql', 'utf8'));
    await db.exec(`
      insert into public.user_roles values ('${engineer}','engineer'), ('${otherEngineer}','engineer'), ('${sales}','sales');
      insert into public.projects (id, owner_id, name, description, config)
        values ('${projectA}', '${engineer}', '旧项目', '保留描述', '${JSON.stringify(projectConfig(projectA, '旧项目', 'before'))}');
      insert into public.drawings (id, owner_id, document)
        values ('${drawingA}', '${engineer}', '{"id":"${drawingA}","name":"旧图纸","updatedAt":1,"objects":[]}');
    `);
  }, 60000);

  afterAll(async () => {
    await db.close();
  });

  it('adds revision columns by a repeatable migration without changing existing data', async () => {
    const migration = readFileSync('supabase/updates/20261014_document_revision.sql', 'utf8');
    const beforeProject = await scalar(
      `select count(*)::int as count, min(id::text) as id, min(owner_id::text) as owner,
              min(md5(config::text)) as hash, min(md5(description)) as description_hash
       from public.projects`,
    );
    const beforeDrawing = await scalar(
      `select count(*)::int as count, min(id) as id, min(owner_id::text) as owner, min(md5(document::text)) as hash
       from public.drawings`,
    );

    await db.exec(migration);
    await asOwner();
    await db.exec(migration);
    await asOwner();

    const afterProject = await scalar(
      `select count(*)::int as count, min(id::text) as id, min(owner_id::text) as owner,
              min(md5(config::text)) as hash, min(md5(description)) as description_hash, min(revision) as revision
       from public.projects`,
    );
    expect(afterProject).toMatchObject({
      count: beforeProject.count,
      id: beforeProject.id,
      owner: beforeProject.owner,
      hash: beforeProject.hash,
      description_hash: beforeProject.description_hash,
      revision: 1,
    });

    const afterDrawing = await scalar(
      `select count(*)::int as count, min(id) as id, min(owner_id::text) as owner,
              min(md5(document::text)) as hash, min(revision) as revision
       from public.drawings`,
    );
    expect(afterDrawing).toMatchObject({
      count: beforeDrawing.count,
      id: beforeDrawing.id,
      owner: beforeDrawing.owner,
      hash: beforeDrawing.hash,
      revision: 1,
    });
  });

  it('rejects the stale writer and keeps the newest content (two-session contract)', async () => {
    const firstPayload = JSON.stringify(projectConfig(projectA, '第一版', 'writer-a'));

    await asUser(engineer);
    const first = await scalar(
      'select * from public.save_project_document($1, $2, $3::jsonb, null)',
      [projectA, 1, firstPayload],
    );
    expect(first).toMatchObject({ revision: 2 });

    const stalePayload = JSON.stringify(projectConfig(projectA, '旧窗口版本', 'writer-b'));
    await expect(
      db.query('select * from public.save_project_document($1, $2, $3::jsonb, null)', [projectA, 1, stalePayload]),
    ).rejects.toThrow(/Version conflict/);

    // 读取必须携带当前版本；数据库内容仍是第一个写入者的
    const loaded = await scalar('select config, revision from public.projects where id = $1', [projectA]);
    expect(loaded.revision).toBe(2);
    expect((loaded.config as { marker?: string }).marker).toBe('writer-a');

    // 用最新版本重试即可成功
    const retried = await scalar(
      'select * from public.save_project_document($1, $2, $3::jsonb, null)',
      [projectA, 2, stalePayload],
    );
    expect(retried).toMatchObject({ revision: 3 });
  });

  it('keeps creation create-only and refuses to resurrect old documents', async () => {
    await asUser(engineer);
    await expect(
      db.query('select * from public.save_project_document($1, null, $2::jsonb, null)', [
        projectA,
        JSON.stringify(projectConfig(projectA, '复活尝试', 'resurrect')),
      ]),
    ).rejects.toThrow(/Document already exists/);

    await expect(
      db.query('select * from public.save_drawing_document($1, null, $2::jsonb)', [
        drawingA,
        JSON.stringify({ id: drawingA, name: '复活图纸', updatedAt: 2, objects: [] }),
      ]),
    ).rejects.toThrow(/Document already exists/);

    const projectCount = await scalar('select count(*)::int as count from public.projects');
    expect(projectCount.count).toBe(1);
  });

  it('denies direct table writes and cross-account access while keeping owner reads', async () => {
    await asUser(engineer);
    await expect(db.exec('update public.projects set name = \'直接写\' where id = \'' + projectA + '\''))
      .rejects.toThrow(/permission denied/i);
    await expect(db.exec('insert into public.projects (id, owner_id, name, config) values (gen_random_uuid(), \'' + engineer + '\', \'x\', \'{}\')'))
      .rejects.toThrow(/permission denied/i);
    await expect(db.exec('delete from public.drawings where id = \'' + drawingA + '\''))
      .rejects.toThrow(/permission denied/i);

    const own = await scalar('select count(*)::int as count from public.projects');
    expect(own.count).toBe(1);

    await asUser(otherEngineer);
    const visible = await scalar('select count(*)::int as count from public.projects');
    expect(visible.count).toBe(0);
    await expect(
      db.query('select * from public.save_project_document($1, $2, $3::jsonb, null)', [
        projectA,
        2,
        JSON.stringify(projectConfig(projectA, '越权', 'cross-account')),
      ]),
    ).rejects.toThrow(/Document not found/);
    await expect(
      db.query('select * from public.delete_project_document($1, $2)', [projectA, 2]),
    ).rejects.toThrow(/Document not found/);
  });

  it('deletes only with the exact expected revision', async () => {
    await asUser(engineer);
    await expect(db.query('select public.delete_project_document($1, $2)', [projectA, 999]))
      .rejects.toThrow(/Version conflict/);
    const stillThere = await scalar('select count(*)::int as count from public.projects');
    expect(stillThere.count).toBe(1);

    await db.query('select public.delete_project_document($1, $2)', [projectA, 3]);
    const deleted = await scalar('select count(*)::int as count from public.projects');
    expect(deleted.count).toBe(0);

    // 删除后的旧图纸/旧版本保存不会复活：创建带上旧版本号会被拒绝
    await asUser(engineer);
    await expect(
      db.query('select * from public.save_project_document($1, $2, $3::jsonb, null)', [
        projectA,
        3,
        JSON.stringify(projectConfig(projectA, '复活', 'resurrect-after-delete')),
      ]),
    ).rejects.toThrow(/Document not found/);
  });

  it('blocks sales role and forced password change, and allows drawing saves for engineers', async () => {
    await asUser(sales);
    await expect(
      db.query('select * from public.save_drawing_document($1, null, $2::jsonb)', [
        'drawing-sales',
        JSON.stringify({ id: 'drawing-sales', name: 'sales', updatedAt: 1, objects: [] }),
      ]),
    ).rejects.toThrow(/Forbidden/);

    await asOwner();
    await db.exec(`update auth.users set raw_app_meta_data = '{"must_change_password":true}' where id = '${engineer}'`);
    await asUser(engineer);
    expect(await scalar('select public.current_app_role() as role')).toEqual({ role: 'password_required' });
    await expect(
      db.query('select * from public.save_drawing_document($1, null, $2::jsonb)', [
        'drawing-blocked',
        JSON.stringify({ id: 'drawing-blocked', name: 'blocked', updatedAt: 1, objects: [] }),
      ]),
    ).rejects.toThrow(/Forbidden/);

    await asOwner();
    await db.exec(`update auth.users set raw_app_meta_data = '{}' where id = '${engineer}'`);
    await asUser(engineer);
    const created = await scalar(
      'select * from public.save_drawing_document($1, null, $2::jsonb)',
      ['drawing-new', JSON.stringify({ id: 'drawing-new', name: '新图纸', updatedAt: 1, objects: [] })],
    );
    expect(created).toMatchObject({ revision: 1 });
    expect(await scalar('select count(*)::int as count from public.drawings')).toEqual({ count: 2 });

    await expect(db.query('select public.delete_drawing_document($1, $2)', ['drawing-new', 1]))
      .resolves.toBeDefined();
    expect(await scalar('select count(*)::int as count from public.drawings')).toEqual({ count: 1 });
  });

  it('updates project metadata with the same version contract and keeps config untouched', async () => {
    await asUser(engineer);
    const created = await scalar(
      'select * from public.save_project_document($1, null, $2::jsonb, $3)',
      [projectB, JSON.stringify(projectConfig(projectB, '元数据项目', 'meta')), '初始描述'],
    );
    expect(created).toMatchObject({ revision: 1 });

    await expect(
      db.query('select * from public.update_project_metadata($1, $2, $3, $4)', [projectB, 99, '改名', null]),
    ).rejects.toThrow(/Version conflict/);

    const renamed = await scalar(
      'select * from public.update_project_metadata($1, $2, $3, $4)',
      [projectB, 1, '改名后', '新描述'],
    );
    expect(renamed).toMatchObject({ revision: 2 });
    const row = await scalar('select name, description, config, revision from public.projects where id = $1', [projectB]);
    expect(row.name).toBe('改名后');
    expect(row.description).toBe('新描述');
    expect((row.config as { marker?: string }).marker).toBe('meta');
    expect(row.revision).toBe(2);
  });
});

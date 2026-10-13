import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { DEFAULT_PRICING_SETTINGS } from '../../../server/pricing';

const sales = '00000000-0000-4000-8000-000000000001';
const engineer = '00000000-0000-4000-8000-000000000002';
const admin = '00000000-0000-4000-8000-000000000003';
const material = '00000000-0000-4000-8000-000000000004';
const db = new PGlite();
async function asUser(id: string) {
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
}
async function scalar(sql: string) { return (await db.query<Record<string, unknown>>(sql)).rows[0]; }

describe('real PostgreSQL pricing permissions', () => {
  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      create schema storage; create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon, authenticated, service_role;
      grant select on storage.objects to authenticated;
      insert into auth.users values ('${sales}','sales@test'), ('${engineer}','engineer@test'), ('${admin}','admin@test');
    `);
    for (const file of ['10_schema/01_core', '10_schema/02_catalog', '10_schema/03_material_prices',
      '10_schema/04_suppliers', '10_schema/05_finished_harness_materials', '10_schema/06_finished_harness_cost_analyses',
      '10_schema/07_pricing_permissions', '30_security/01_rls', '30_security/02_pricing_permissions']) {
      await db.exec(readFileSync(`supabase/sql/${file}.sql`, 'utf8').replace('create extension if not exists pgcrypto;', ''));
    }
    await db.exec(`
      insert into public.user_roles values ('${engineer}','engineer'), ('${admin}','admin');
      insert into public.catalog_items(id,kind,code,name,model,spec) values ('${material}','connector','test','M12','M12','{"connectorType":"male","pinCount":4,"pinLabels":["1","2","3","4"],"series":"M12","shielded":true}');
      insert into public.material_prices(resource_id,kind,name,specification,length_mm,unit,tax_included_price,source_name)
        values ('${material}','connector','M12','[]',0,'元/个',2,'test');
      insert into public.finished_harness_materials(platform_no,son_name,total_cost,quote_price,sales_price,son_price_low,has_cost_analysis,source_excel_url)
        values ('TEST','test',10,20,15,12,true,'secret.xlsx');
      insert into public.finished_harness_cost_analyses(platform_no,source_excel_file,source_sheet_name,total_cost)
        values ('TEST','secret.xlsx','TEST',10);
      insert into storage.objects(bucket_id,name) values ('cost-analysis-sources','secret.xlsx');
    `);
  }, 30000);
  afterAll(async () => { await db.close(); });
  it('denies direct sensitive reads and writes to sales while allowing catalog and safe quote', async () => {
    await asUser(sales);
    expect(await scalar('select public.current_app_role() as role')).toEqual({ role: 'sales' });
    for (const table of ['material_prices','pricing_settings','finished_harness_materials','finished_harness_cost_analyses']) {
      expect(await scalar(`select count(*)::int as count from public.${table}`)).toEqual({ count: 0 });
    }
    expect(await scalar('select count(*)::int as count from storage.objects')).toEqual({ count: 0 });
    expect(await scalar('select total_cost, quote_price, sales_price, son_price_low, source_excel_url from public.finished_harness_materials_visible')).toEqual({
      total_cost: null, quote_price: '20', sales_price: null, son_price_low: null, source_excel_url: null,
    });
    await expect(db.exec(`insert into public.user_roles values ('${sales}','admin')`)).rejects.toThrow();
    await expect(db.exec(`select public.assign_user_role('${sales}','admin')`)).rejects.toThrow('Forbidden');
    await expect(db.exec(`select public.quote_snapshot('${admin}')`)).rejects.toThrow();
    await expect(db.exec(`insert into public.material_prices(resource_id,kind,name,specification,length_mm,unit,tax_included_price,source_name)
      values ('${material}','connector','M12','[1]',0,'元/个',3,'hack')`)).rejects.toThrow();
  });
  it('engineers can read, update prices and save parameters, with version checks and auditing', async () => {
    await asUser(engineer);
    expect(await scalar('select count(*)::int as count from public.material_prices')).toEqual({ count: 1 });
    expect(await scalar('select count(*)::int as count from storage.objects')).toEqual({ count: 1 });
    await db.exec('update public.material_prices set tax_included_price = 3');
    const result = await scalar(`select public.save_pricing_settings(1, (select settings from public.pricing_settings)) as version`);
    expect(result).toEqual({ version: 2 });
    await expect(db.exec(`select public.save_pricing_settings(1, (select settings from public.pricing_settings))`)).rejects.toThrow('修改');
    await expect(db.exec(`select public.save_pricing_settings(2, '{"marginRate":"1"}'::jsonb)`)).rejects.toThrow('Invalid');
    await expect(db.exec(`select public.assign_user_role('${sales}','admin')`)).rejects.toThrow('Forbidden');
    await expect(db.exec(`update public.pricing_settings set version = 999`)).rejects.toThrow();
  });
  it('validates price imports in the database and rolls back invalid batches', async () => {
    await asUser(engineer);
    const entry = { kind: 'connector', resourceId: material, name: 'M12', specification: '[]', lengthMm: 0, unit: '元/个', taxIncludedPrice: '4' };
    const merge = (rows: unknown[]) => db.query('select public.import_material_prices($1::jsonb, $2::text)', [JSON.stringify(rows), 'import.xlsx']);
    await expect(merge([entry, entry])).rejects.toThrow('Duplicate');
    await expect(merge([])).rejects.toThrow('Invalid');
    await expect(merge(Array.from({ length: 10001 }, () => entry))).rejects.toThrow('Invalid');
    await expect(merge([entry, { ...entry, specification: '[1]', taxIncludedPrice: '0.1234567' }])).rejects.toThrow();
    await expect(merge([entry, { ...entry, resourceId: sales }])).rejects.toThrow();
    expect(await scalar('select tax_included_price from public.material_prices')).toEqual({ tax_included_price: '3' });
    await merge([entry]);
    expect(await scalar('select tax_included_price from public.material_prices')).toEqual({ tax_included_price: '4' });
    await asUser(sales);
    await expect(merge([entry])).rejects.toThrow('Forbidden');
  });
  it('saves manual prices atomically with conflict checks, audit and role enforcement', async () => {
    await db.exec('reset role');
    const migration = readFileSync('supabase/updates/20261012_material_price_edit.sql', 'utf8');
    expect(migration).toBe(readFileSync('supabase/sql/10_schema/08_material_price_edit.sql', 'utf8'));
    const before = await db.query('select * from public.material_prices order by id');
    await db.exec(migration);
    await db.exec(migration);
    expect(await db.query('select * from public.material_prices order by id')).toEqual(before);
    await asUser(engineer);
    const current = await scalar('select updated_at::text as stamp from public.material_prices');
    const entry = { kind: 'connector', resourceId: material, name: 'M12', specification: '[]',
      lengthMm: 0, unit: '元/个', taxIncludedPrice: '0.123456', expectedUpdatedAt: current?.stamp };
    const save = (rows: unknown[]) => db.query('select public.save_material_prices($1::jsonb)', [JSON.stringify(rows)]);
    await save([entry]);
    expect(await scalar('select tax_included_price from public.material_prices')).toEqual({ tax_included_price: '0.123456' });
    await expect(save([{ ...entry, taxIncludedPrice: '9' }])).rejects.toThrow('Price conflict');
    await expect(save([{ ...entry, expectedUpdatedAt: null }])).rejects.toThrow('Price conflict');
    const fresh = await scalar('select updated_at::text as stamp from public.material_prices');
    await expect(save([{ ...entry, expectedUpdatedAt: fresh?.stamp, taxIncludedPrice: '5' },
      { ...entry, specification: '[1]', expectedUpdatedAt: null, taxIncludedPrice: '-1' }])).rejects.toThrow();
    expect(await scalar('select tax_included_price from public.material_prices')).toEqual({ tax_included_price: '0.123456' });
    await expect(save([{ ...entry, expectedUpdatedAt: fresh?.stamp, taxIncludedPrice: '1.1234567' }])).rejects.toThrow();
    await expect(save([entry, entry])).rejects.toThrow();
    await save([{ ...entry, expectedUpdatedAt: fresh?.stamp, taxIncludedPrice: '0' }]);
    await asUser(sales);
    await expect(save([{ ...entry, specification: '[1]', expectedUpdatedAt: null }])).rejects.toThrow('Forbidden');
    await asUser(admin);
    await save([{ ...entry, specification: '[1]', expectedUpdatedAt: null }]);
    expect(await scalar("select count(*)::int as count from public.pricing_audit where after_value->>'source_name' = '页面编辑'"))
      .toEqual({ count: 3 });
    const snapshot = await db.query('select * from public.material_prices order by specification');
    const audit = await scalar('select count(*)::int as count from public.pricing_audit');
    const stamps = await db.query<{ specification: string; stamp: string }>('select specification, updated_at::text as stamp from public.material_prices');
    const firstStamp = stamps.rows.find(r => r.specification === '[1]')!.stamp;
    // '[1]' sorts before '[]': the first update really executes before the stale second row fails.
    await expect(save([
      { ...entry, specification: '[1]', expectedUpdatedAt: firstStamp, taxIncludedPrice: '99' },
      { ...entry, expectedUpdatedAt: '2000-01-01T00:00:00Z', taxIncludedPrice: '88' },
    ])).rejects.toThrow('Price conflict');
    expect(await db.query('select * from public.material_prices order by specification')).toEqual(snapshot);
    expect(await scalar('select count(*)::int as count from public.pricing_audit')).toEqual(audit);

  });
  it('upgrades existing settings without losing other prices and can safely run twice', async () => {
    await db.exec('reset role');
    await db.exec(`update public.pricing_settings set settings =
      jsonb_set(settings - 'finishingLaborRates', '{laborRates}',
        (settings->'laborRates') || '{"电测":"9","外观":"8","包装人工":"7","裁线":"0.08"}'::jsonb)`);
    const before = await scalar('select version from public.pricing_settings');
    const update = readFileSync('supabase/updates/20261012_finishing_labor_rates.sql', 'utf8');
    await db.exec(update);
    const after = await scalar('select version, settings from public.pricing_settings');
    expect(after?.version).toBe(Number(before?.version) + 1);
    expect(after?.settings).toEqual({
      ...DEFAULT_PRICING_SETTINGS, version: undefined,
      laborRates: { ...DEFAULT_PRICING_SETTINGS.laborRates, 裁线: '0.08' },
    });
    await db.exec(update);
    expect(await scalar('select version, settings from public.pricing_settings')).toEqual(after);
    await db.exec(readFileSync('supabase/updates/20261012_tinning_labor_rates.sql', 'utf8'));
  });
  it('upgrades tinning rates once, preserves existing data and validates the new rate', async () => {
    await db.exec('reset role');
    await db.exec(`update public.pricing_settings set settings = jsonb_set(settings, '{laborRates}',
      ((settings->'laborRates') - '沾锡') || '{"去皮":"0.02","处理编织":"0.20","热缩编织":"0.30"}'::jsonb)`);
    const before = await scalar('select version, settings from public.pricing_settings');
    const materialBefore = await scalar('select count(*)::int as count from public.material_prices');
    const migration = readFileSync('supabase/updates/20261012_tinning_labor_rates.sql', 'utf8');
    await db.exec(migration);
    const after = await scalar('select version, settings from public.pricing_settings');
    const original = before!.settings as typeof DEFAULT_PRICING_SETTINGS;
    expect(after).toEqual({ version: Number(before!.version) + 1, settings: {
      ...original, laborRates: { ...original.laborRates, 去皮: '0.05', 沾锡: '0.05', 处理编织: '0.10', 热缩编织: '0.10' },
    } });
    expect(await scalar('select count(*)::int as count from public.material_prices')).toEqual(materialBefore);
    await db.exec(migration);
    expect(await scalar('select version, settings from public.pricing_settings')).toEqual(after);
    await asUser(engineer);
    for (const rate of [null, '-0.05', '0.1234567', 0.05]) {
      const settings = after!.settings as typeof DEFAULT_PRICING_SETTINGS;
      await expect(db.query('select public.save_pricing_settings($1, $2::jsonb)',
        [after!.version as number, JSON.stringify({ ...settings, laborRates: { ...settings.laborRates, 沾锡: rate } })])).rejects.toThrow('Invalid');
    }
    expect(await scalar('select version, settings from public.pricing_settings')).toEqual(after);
  });
  it('updates only outer stripping and does not repeat the version change', async () => {
    await db.exec('reset role');
    await db.exec(`update public.pricing_settings set settings = jsonb_set(settings, '{laborRates,去外皮}', '"0.02"'::jsonb)`);
    const before = await scalar('select version, settings from public.pricing_settings');
    const migration = readFileSync('supabase/updates/20261012_outer_strip_rate.sql', 'utf8');
    await db.exec(migration);
    const after = await scalar('select version, settings from public.pricing_settings');
    const original = before!.settings as typeof DEFAULT_PRICING_SETTINGS;
    expect(after).toEqual({ version: Number(before!.version) + 1, settings: {
      ...original, laborRates: { ...original.laborRates, 去外皮: '0.05' },
    } });
    await db.exec(migration);
    expect(await scalar('select version, settings from public.pricing_settings')).toEqual(after);
  });
  it('persists editable finishing tiers and rejects malformed data atomically', async () => {
    await asUser(engineer);
    const before = await scalar('select version, settings from public.pricing_settings');
    const settings = before!.settings as typeof DEFAULT_PRICING_SETTINGS;
    const changed = { ...settings, finishingLaborRates: { ...settings.finishingLaborRates,
      '500': { 电测: '0.123456', 外观: '0', 包装人工: '0.45' },
    } };
    await db.query('select public.save_pricing_settings($1, $2::jsonb)', [before!.version as number, JSON.stringify(changed)]);
    const saved = await scalar('select version, settings from public.pricing_settings');
    expect(saved?.settings).toEqual(changed);
    for (const invalid of [null, {}, [], { ...changed.finishingLaborRates, '6000': {} },
      ...[null, {}, { 电测: 0.1, 外观: '0.2', 包装人工: '0.3' },
        { 电测: '-1', 外观: '0.2', 包装人工: '0.3' },
        { 电测: '0.1234567', 外观: '0.2', 包装人工: '0.3' },
      ].map(tier => ({ ...changed.finishingLaborRates, '500': tier })),
    ]) {
      await expect(db.query('select public.save_pricing_settings($1, $2::jsonb)',
        [saved!.version as number, JSON.stringify({ ...changed, finishingLaborRates: invalid })])).rejects.toThrow('Invalid');
    }
    expect(await scalar('select version, settings from public.pricing_settings')).toEqual(saved);
    await asUser(sales);
    await expect(db.query('select public.save_pricing_settings($1, $2::jsonb)',
      [saved!.version as number, JSON.stringify(changed)])).rejects.toThrow('Forbidden');
  });
  it('admins assign roles and downgrades take effect for the next database request', async () => {
    await asUser(admin);
    expect((await db.query('select * from public.list_app_users()')).rows).toHaveLength(3);
    expect(Number((await scalar('select count(*) as count from public.pricing_audit'))?.count)).toBeGreaterThan(0);
    await db.exec(`select public.assign_user_role('${engineer}','sales')`);
    await expect(db.exec(`select public.assign_user_role('${admin}','sales')`)).rejects.toThrow('自己');
    await asUser(engineer);
    expect(await scalar('select count(*)::int as count from public.material_prices')).toEqual({ count: 0 });
    expect(await scalar('select count(*)::int as count from storage.objects')).toEqual({ count: 0 });
  });
  it('records the authenticated updater for edits and imports without rewriting historical prices', async () => {
    await db.exec('reset role');
    await db.exec("alter table auth.users add column raw_user_meta_data jsonb default '{}'::jsonb");
    await db.query("update public.user_roles set role = 'engineer' where user_id = $1", [engineer]);
    await db.query("update auth.users set raw_user_meta_data = $1::jsonb where id = $2", [JSON.stringify({ display_name: '张工' }), engineer]);
    const before = await db.query('select id, tax_included_price, updated_at::text from public.material_prices order by id');
    const migration = readFileSync('supabase/updates/20261012_material_price_updater.sql', 'utf8');
    expect(migration).toBe(readFileSync('supabase/sql/10_schema/09_material_price_updater.sql', 'utf8'));
    await db.exec(migration);
    await db.exec(migration);
    expect(await db.query('select id, tax_included_price, updated_at::text from public.material_prices order by id')).toEqual(before);
    expect(await scalar('select count(*)::int as count from public.material_prices where updated_by is not null')).toEqual({ count: 0 });
    await asUser(engineer);
    // Attempting to spoof the updater and timestamp must be overwritten by database triggers.
    await db.query("update public.material_prices set tax_included_price = 12, updated_by = $1, updated_by_name = '伪造用户', updated_at = '2000-01-01' where specification = '[]'", [admin]);
    expect(await scalar("select updated_by, updated_by_name, updated_at > '2000-01-02'::timestamptz as fresh from public.material_prices where specification = '[]'"))
      .toEqual({ updated_by: engineer, updated_by_name: '张工', fresh: true });
    await asUser(admin);
    await db.query('select public.import_material_prices($1::jsonb, $2)', [JSON.stringify([{ kind: 'connector', resourceId: material, name: 'M12', specification: '[]', lengthMm: 0, unit: '元/个', taxIncludedPrice: '13' }]), 'test.xlsx']);
    expect(await scalar("select updated_by, updated_by_name from public.material_prices where specification = '[]'"))
      .toEqual({ updated_by: admin, updated_by_name: 'admin' });
    expect(await scalar("select after_value->>'updated_by' as actor from public.pricing_audit where action = 'material_prices:UPDATE' order by id desc limit 1"))
      .toEqual({ actor: admin });
    await asUser(sales);
    expect(await scalar('select count(*)::int as count from public.material_prices')).toEqual({ count: 0 });
  });
  it('records initial price entry and replaces metadata with the latest editor', async () => {
    const entry = { kind: 'connector', resourceId: material, name: 'M12', specification: '["metadata-lifecycle"]',
      lengthMm: 0, unit: '元/个', taxIncludedPrice: '10', expectedUpdatedAt: null as string | null };
    await asUser(engineer);
    await db.query('select public.save_material_prices($1::jsonb)', [JSON.stringify([entry])]);
    const first = await scalar(`select updated_at::text as stamp, updated_by, updated_by_name,
      updated_at > '2020-01-01'::timestamptz as fresh from public.material_prices where specification = '["metadata-lifecycle"]'`);
    expect(first).toMatchObject({ updated_by: engineer, updated_by_name: '张工', fresh: true });
    await asUser(admin);
    await db.query('select public.save_material_prices($1::jsonb)', [JSON.stringify([{ ...entry,
      taxIncludedPrice: '11', expectedUpdatedAt: first.stamp }])]);
    const latest = await scalar(`select updated_at::text as stamp, updated_by, updated_by_name,
      tax_included_price from public.material_prices where specification = '["metadata-lifecycle"]'`);
    expect(latest).toMatchObject({ updated_by: admin, updated_by_name: 'admin', tax_included_price: '11' });
    expect(Date.parse(String(latest.stamp))).toBeGreaterThan(Date.parse(String(first.stamp)));
  });

});

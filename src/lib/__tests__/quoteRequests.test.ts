import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { appRoutes, getRouteByPath, requiresAuth, resolveRoleRoute } from '../appRoute';
import { hasQuoteFileSignature, validateQuoteRequest } from '../../../supabase/functions/_shared/quoteRequest';

const db = new PGlite();
const id = '10000000-0000-4000-8000-000000000001';
const sales = '10000000-0000-4000-8000-000000000002';
const outsider = '10000000-0000-4000-8000-000000000003';
const nextSales = '10000000-0000-4000-8000-000000000004';
const admin = '10000000-0000-4000-8000-000000000005';
const drawing = { name: '样品.pdf', size: 9, sha256: 'a'.repeat(64) };
const valid = { name: ' 联系人 ', phone: '138 1234 5678', email: '', company: '', demand: '', kind: '', files: [drawing] };
const migration = () => readFileSync('supabase/updates/20261126_quote_requests.sql', 'utf8');

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, raw_app_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    create table public.user_roles(user_id uuid, role text);
    create function public.password_change_required() returns boolean language sql stable security definer set search_path='' as $$
      select coalesce((select (raw_app_meta_data->>'must_change_password')::boolean from auth.users where id=auth.uid()),false) $$;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
    create table storage.objects(bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated;
    grant select on storage.objects to anon,authenticated;
    insert into auth.users(id) values ('${sales}'),('${outsider}'),('${nextSales}'),('${admin}');
    insert into public.user_roles values ('${sales}','sales'),('${nextSales}','sales'),('${admin}','admin');
    insert into storage.buckets values ('existing','existing',false,null);
    insert into storage.objects values ('existing','keep.pdf','{}');`);
});

afterAll(async () => { await db.close(); });

it('keeps public quote requests independent of automatic quote and opens the staff route for sales', () => {
  const publicRoute = getRouteByPath('/request-quote');
  expect(publicRoute.id).toBe('request-quote');
  expect(requiresAuth(publicRoute)).toBe(false);
  expect(requiresAuth(appRoutes['auto-quote'])).toBe(true);
  expect(requiresAuth(appRoutes['quote-requests'])).toBe(true);
  expect(resolveRoleRoute(publicRoute, 'sales')).toBe(publicRoute);
  expect(resolveRoleRoute(appRoutes['quote-requests'], 'sales').id).toBe('quote-requests');
  expect(resolveRoleRoute(appRoutes.materials, 'sales').id).toBe('auto-quote');
});

it('accepts a drawing or demand and validates contact, limits and actual file headers', () => {
  expect(validateQuoteRequest(valid)).toMatchObject({ name: '联系人', phone: '13812345678', files: [drawing] });
  expect(validateQuoteRequest({ ...valid, demand: '需要 20 条', files: [] }).demand).toBe('需要 20 条');
  expect(() => validateQuoteRequest({ ...valid, files: [] })).toThrow();
  expect(() => validateQuoteRequest({ ...valid, phone: '' })).toThrow();
  expect(() => validateQuoteRequest({ ...valid, files: [{ ...drawing, size: 6 * 1024 * 1024 }] })).toThrow();
  expect(() => validateQuoteRequest({ ...valid, files: [{ ...drawing, name: 'invoice.exe' }] })).toThrow();
  expect(hasQuoteFileSignature('样品.pdf', new TextEncoder().encode('%PDF-1.7\n'))).toBe(true);
  expect(hasQuoteFileSignature('样品.pdf', new TextEncoder().encode('<script>'))).toBe(false);
  expect(hasQuoteFileSignature('样品.dwg', new TextEncoder().encode('AC1018\0'))).toBe(true);
  expect(hasQuoteFileSignature('样品.dxf', new TextEncoder().encode('  0\r\nSECTION\r\n'))).toBe(true);
});

it('preserves existing data, finalizes once, protects files and enforces ownership and concurrent edits', async () => {
  const callPrepare = (payload = valid, requestId = id) => db.query('select public.prepare_quote_request($1,$2) as result', [requestId, payload]);
  const callFinalize = () => db.query('select public.finalize_quote_request($1) as result', [id]);
  const as = async (role: string, actor = '') => {
    await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${actor}',false)`);
  };
  await db.exec(migration());
  await db.exec(migration());
  expect((await db.query("select name from storage.objects where bucket_id='existing'")).rows).toEqual([{ name: 'keep.pdf' }]);
  await as('anon');
  await expect(callPrepare()).rejects.toThrow();
  await expect(db.query('select * from quote_requests')).rejects.toThrow();
  await as('service_role');
  const payload = validateQuoteRequest(valid);
  expect((await callPrepare(payload)).rows).toEqual([{ result: { state: 'uploading' } }]);
  expect((await callPrepare(payload)).rows).toEqual([{ result: { state: 'uploading' } }]);
  expect((await callPrepare({ ...payload, name: '另外的人' })).rows).toEqual([{ result: { state: 'conflict' } }]);
  expect((await callFinalize()).rows).toEqual([{ result: { state: 'missing_files' } }]);
  for (const suffix of [6, 7, 8, 9]) {
    expect((await callPrepare(payload, `10000000-0000-4000-8000-00000000000${suffix}`)).rows).toEqual([{ result: { state: 'uploading' } }]);
  }
  expect((await callPrepare(payload, '10000000-0000-4000-8000-000000000010')).rows).toEqual([{ result: { state: 'rate_limited' } }]);
  await db.exec(`reset role; insert into storage.objects values ('quote-request-files','${id}/0','{"size":9}')`);
  await as('authenticated', sales);
  expect((await db.query('select * from quote_requests')).rows).toEqual([]);
  expect((await db.query("select * from storage.objects where bucket_id='quote-request-files'")).rows).toEqual([]);
  await as('service_role');
  const first = (await callFinalize()).rows[0] as { result: { receipt: string } };
  expect(first.result).toEqual({ state: 'received', receipt: expect.stringMatching(/^RFQ-/), created: true });
  expect((await callFinalize()).rows).toEqual([{ result: { ...first.result, created: false } }]);
  await as('authenticated', outsider);
  expect((await db.query('select id from quote_requests')).rows).toEqual([]);
  expect((await db.query("select * from storage.objects where bucket_id='quote-request-files'")).rows).toEqual([]);
  await as('authenticated', sales);
  const [request] = (await db.query<{ updated_at: string }>('select updated_at::text from quote_requests')).rows;
  expect((await db.query("select name from storage.objects where bucket_id='quote-request-files'")).rows).toEqual([{ name: `${id}/0` }]);
  const update = (version: string, status: string, note = '') => db.query(
    'select public.update_quote_request($1,$2,$3,$4) as result', [id, version, status, note],
  );
  await expect(update(request.updated_at, 'quoted', '人民币 500 元')).rejects.toThrow();
  const [claimed] = (await update(request.updated_at, 'following')).rows as { result: { updated_at: string; assignee_id: string } }[];
  expect(claimed.result.assignee_id).toBe(sales);
  await expect(update(request.updated_at, 'following')).rejects.toThrow();
  await as('authenticated', nextSales);
  await expect(update(claimed.result.updated_at, 'quoted', '人民币 500 元')).rejects.toThrow();
  await as('authenticated', sales);
  await expect(update(claimed.result.updated_at, 'quoted')).rejects.toThrow();
  const [quoted] = (await update(claimed.result.updated_at, 'quoted', '人民币 500 元')).rows as { result: { updated_at: string; status: string } }[];
  expect(quoted.result.status).toBe('quoted');
  await as('authenticated', admin);
  expect((await update(quoted.result.updated_at, 'closed', '已完成')).rows[0]).toMatchObject({ result: { status: 'closed' } });
  await db.exec(`reset role; update auth.users set raw_app_meta_data='{"must_change_password":true}' where id='${sales}'`);
  await as('authenticated', sales);
  expect((await db.query('select id from quote_requests')).rows).toEqual([]);
});

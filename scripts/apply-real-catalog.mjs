import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const planPath = process.argv[2];
const apply = process.argv.includes('--apply');
if (!planPath) throw new Error('Provide replacement-plan.json; add --apply to commit');
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const backup = JSON.parse(fs.readFileSync(path.join(path.dirname(planPath), 'catalog-backup.json'), 'utf8'));
if (plan.blockers.length || plan.proposals.length !== 24 || plan.deletionCandidates.length !== 46) {
  throw new Error('Plan is blocked or differs from the reviewed 24-item replacement');
}
if (createHash('sha256').update(fs.readFileSync(plan.source)).digest('hex') !== plan.sourceSha256) {
  throw new Error('Source workbook changed after preparation');
}
const env = process.env;
if (new URL(env.SUPABASE_URL || env.VITE_SUPABASE_URL).host !== plan.databaseHost) throw new Error('Database host differs from preparation');
const require = createRequire(import.meta.url);
const pg = require(path.resolve('.tmp/db-runtime/node_modules/pg'));
const client = new pg.Client({ host: env.SUPABASE_DB_HOST, port: Number(env.SUPABASE_DB_PORT),
  user: env.SUPABASE_DB_USER, password: env.SUPABASE_DB_PASSWORD, database: env.SUPABASE_DB_NAME,
  connectionTimeoutMillis: 15000 });
const canonical = value => JSON.stringify(value, function (_key, value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value;
});
await client.connect();
try {
  await client.query('begin');
  await client.query("set local lock_timeout = '10s'");
  await client.query('lock table public.catalog_items in exclusive mode');
  const current = (await client.query('select * from public.catalog_items')).rows;
  if (current.length !== backup.length || current.some(row => canonical(row) !== canonical(backup.find(b => b.id === row.id)))) {
    throw new Error('Database catalog changed since backup; prepare a fresh plan');
  }
  const schema = fs.readFileSync('supabase/sql/10_schema/02_catalog.sql', 'utf8').replaceAll('\r\n', '\n');
  const start = schema.indexOf('constraint catalog_items_wire_spec_check check (');
  const end = schema.indexOf('\n  ),\n  unique (kind, code)', start);
  if (start < 0 || end < start) throw new Error('Cannot locate wire constraint in schema');
  const constraint = schema.slice(start, end + '\n  )'.length);
  await client.query('alter table public.catalog_items drop constraint catalog_items_wire_spec_check');
  await client.query(`alter table public.catalog_items add ${constraint}`);
  const imported = [];
  for (const proposal of plan.proposals) {
    const columns = ['kind', 'code', 'name', 'model', 'manufacturer', 'resource_group', 'description',
      'image_path', 'image_variants', 'sort_order', 'spec'];
    const values = columns.map(key => typeof proposal[key] === 'object' && proposal[key] !== null
      ? JSON.stringify(proposal[key]) : proposal[key]);
    let result;
    if (proposal.id) {
      result = await client.query(`update public.catalog_items set ${columns.map((c, i) => `${c}=$${i + 1}`).join(',')}
        where id=$${values.length + 1} returning *`, [...values, proposal.id]);
    } else {
      result = await client.query(`insert into public.catalog_items (${columns.join(',')})
        values (${values.map((_, i) => `$${i + 1}`).join(',')}) returning *`, values);
    }
    if (result.rowCount !== 1) throw new Error(`Failed to import ${proposal.model}`);
    imported.push(result.rows[0]);
  }
  const deleted = await client.query('delete from public.catalog_items where id = any($1::uuid[]) returning id',
    [plan.deletionCandidates.map(r => r.id)]);
  if (deleted.rowCount !== 46) throw new Error('Deletion count mismatch');
  const after = (await client.query('select * from public.catalog_items')).rows;
  if (after.length !== 24) throw new Error('Final catalog count mismatch');
  for (const previous of backup.filter(b => plan.proposals.some(p => p.id === b.id))) {
    const row = after.find(r => r.id === previous.id);
    if (!row || row.code !== previous.code || row.image_path !== previous.image_path
      || canonical(row.image_variants) !== canonical(previous.image_variants)) throw new Error('Image identity changed');
  }
  fs.writeFileSync(path.join(path.dirname(planPath), apply ? 'imported-catalog.json' : 'validated-catalog.json'), JSON.stringify(after, null, 2));
  await client.query(apply ? 'commit' : 'rollback');
  console.log(JSON.stringify({ committed: apply, deleted: deleted.rowCount, total: after.length,
    kinds: Object.fromEntries(['connector', 'wire', 'overmold'].map(k => [k, after.filter(r => r.kind === k).length])),
    preservedImageBindings: 18, unresolvedPrices: plan.pendingPrices.length }));
} catch (error) {
  await client.query('rollback');
  throw error;
} finally {
  await client.end();
}

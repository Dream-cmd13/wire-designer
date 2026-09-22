import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);

const BUCKET = 'finished-harness-drawings';
const EXCEL_DIR = resolve('excel');
const SEED_PATH = resolve('supabase/sql/40_seed/07_finished_harness_drawings.sql');
const APPLY = process.argv.includes('--apply');
const WRITE_SEED = process.argv.includes('--write-seed');

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    const [, key, rawValue] = match;
    const quoted = rawValue.match(/^(["'])(.*)\1$/);
    process.env[key] = quoted ? quoted[2] : rawValue;
  }
}

loadEnvFile(resolve('.env'));

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secretKey) {
  console.error('缺少 SUPABASE_URL（或 VITE_SUPABASE_URL）或 SUPABASE_SECRET_KEY。');
  process.exit(1);
}

const client = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

function listDrawingFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listDrawingFiles(full));
    } else {
      const match = entry.name.match(/^(WL-[0-9A-Za-z._-]+)\.(png|jpe?g)$/i);
      if (match) found.push({ platformNo: match[1], filePath: full, ext: match[2].toLowerCase() });
    }
  }
  found.sort((a, b) => (a.filePath < b.filePath ? -1 : 1));
  const unique = new Map();
  for (const item of found) if (!unique.has(item.platformNo)) unique.set(item.platformNo, item);
  return [...unique.values()];
}

function buildSeedSql(entries) {
  const lines = [];
  lines.push('-- ==============================================================================');
  lines.push('-- 07_finished_harness_drawings.sql');
  lines.push('-- 成品线束补充 2D 图纸（私有桶 finished-harness-drawings，file_2d 保存对象路径，登录后签名访问）');
  lines.push('-- 仅当 file_2d 为空时回填；原本已有图纸的记录不做任何处理。');
  lines.push('-- ==============================================================================\n');
  for (const entry of entries) {
    lines.push('update public.finished_harness_materials');
    lines.push(`set file_2d = '${entry.storagePath}', updated_at = now()`);
    lines.push(`where platform_no = '${entry.platformNo}' and file_2d is null;\n`);
  }
  return lines.join('\n');
}

const drawingFiles = listDrawingFiles(EXCEL_DIR);
const pg = require(resolve('.tmp/db-runtime/node_modules/pg'));
const dbClient = new pg.Client({
  host: process.env.SUPABASE_DB_HOST,
  port: Number(process.env.SUPABASE_DB_PORT || 6543),
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME,
  ssl: { rejectUnauthorized: false },
});
await dbClient.connect();
const analysesRes = await dbClient.query('select platform_no from public.finished_harness_cost_analyses');
const materialsRes = await dbClient.query('select platform_no, file_2d from public.finished_harness_materials');
const analysisSet = new Set(analysesRes.rows.map((row) => row.platform_no));
const materialMap = new Map(materialsRes.rows.map((row) => [row.platform_no, row.file_2d]));

const plan = [];
const seedEntries = [];
for (const item of drawingFiles) {
  const storagePath = `${item.platformNo}.${item.ext}`;
  const current = materialMap.get(item.platformNo);
  let action;
  if (!analysisSet.has(item.platformNo)) action = 'skip-非成本方案';
  else if (!materialMap.has(item.platformNo)) action = 'skip-物料不存在';
  else if (current && !/^https?:\/\//i.test(current)) action = 'skip-已由本桶图纸填充';
  else if (current) action = 'skip-已有图纸';
  else action = 'fill-补充图纸';
  plan.push({ ...item, storagePath, action });
  if (action === 'fill-补充图纸' || action === 'skip-已由本桶图纸填充') {
    seedEntries.push({ platformNo: item.platformNo, storagePath });
  }
}

console.log(APPLY ? '模式：--apply 真正写入' : '模式：只读预览（加 --apply 执行上传与回填）');
for (const item of plan) {
  console.log(`[${item.action}] ${item.platformNo} <- ${relative(EXCEL_DIR, item.filePath)}`);
}
console.log(`图纸文件 ${plan.length} 个；待补充 ${plan.filter((p) => p.action.startsWith('fill')).length} 条。`);

if (WRITE_SEED) {
  writeFileSync(SEED_PATH, buildSeedSql(seedEntries), 'utf8');
  console.log(`已写入种子: ${SEED_PATH}（${seedEntries.length} 条）`);
}

if (APPLY) {
  let uploaded = 0;
  let updated = 0;
  for (const item of plan) {
    if (!item.action.startsWith('fill')) continue;
    const { error: uploadError } = await client.storage
      .from(BUCKET)
      .upload(item.storagePath, readFileSync(item.filePath), {
        contentType: item.ext === 'png' ? 'image/png' : 'image/jpeg',
        upsert: true,
      });
    if (uploadError) throw new Error(`上传 ${item.platformNo} 失败: ${uploadError.message}`);
    uploaded++;
    const updateRes = await dbClient.query(
      'update public.finished_harness_materials set file_2d = $1, updated_at = now() where platform_no = $2 and file_2d is null',
      [item.storagePath, item.platformNo],
    );
    updated += updateRes.rowCount || 0;
  }
  await dbClient.end();
  console.log(`上传完成: ${uploaded} 个文件，回填 ${updated} 条（仅 file_2d 为空的记录）。`);
} else {
  await dbClient.end();
}

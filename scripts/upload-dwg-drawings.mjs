import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'dwg-drawings';
const PREFIX = 'dwg';
const MANIFEST_PATH = `${PREFIX}/manifest.json`;
const ROOT = process.cwd();

const sourceArg = process.argv.find((arg) => arg.startsWith('--source='));
const SOURCE_DIR = resolve(ROOT, sourceArg ? sourceArg.slice('--source='.length) : '.');
const APPLY = process.argv.includes('--apply');

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    const [, key, rawValue] = match;
    const quoted = rawValue.match(/^("|')(.*)\1$/);
    process.env[key] = quoted ? quoted[2] : rawValue;
  }
}

loadEnvFile(resolve(ROOT, '.env'));

if (!existsSync(SOURCE_DIR)) {
  console.error(`未找到 DWG 目录：${SOURCE_DIR}`);
  process.exit(1);
}

const files = readdirSync(SOURCE_DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.dwg')
  .map((entry) => entry.name)
  .sort();

if (files.length === 0) {
  console.error(`目录中没有 DWG 文件：${SOURCE_DIR}`);
  process.exit(1);
}

/**
 * Storage 对象键只允许 ASCII（中文等字符会被 API 拒绝 Invalid key），
 * 非 ASCII 与下划线分别转义为 `_<码位hex>_` 与 `__`，保证与显示文件名一一对应。
 */
function asciiKey(name) {
  let key = '';
  for (const char of name) {
    if (/^[A-Za-z0-9.-]$/.test(char)) key += char;
    else if (char === '_') key += '__';
    else key += `_${char.codePointAt(0).toString(16)}_`;
  }
  return key;
}

const entries = files.map((name) => ({ name, key: `${PREFIX}/${asciiKey(name)}` }));

console.log(`DWG 目录：${SOURCE_DIR}`);
console.log(`目标桶：${BUCKET}（对象前缀 ${PREFIX}/，清单 ${MANIFEST_PATH}）`);
for (const entry of entries) console.log(`${entry.name} -> ${entry.key}`);
console.log(`共 ${files.length} 个 DWG。`);

if (!APPLY) {
  console.log('只读预览，未写入 Storage（加 --apply 执行上传）。');
  process.exit(0);
}

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secretKey) {
  console.error('缺少 SUPABASE_URL（或 VITE_SUPABASE_URL）或 SUPABASE_SECRET_KEY。');
  process.exit(1);
}

const client = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

for (const entry of entries) {
  const { error } = await client.storage
    .from(BUCKET)
    .upload(entry.key, readFileSync(resolve(SOURCE_DIR, entry.name)), {
      contentType: 'application/acad',
      upsert: true,
    });
  if (error) throw new Error(`上传 ${entry.name} 失败：${error.message}`);
  console.log(`已上传 ${entry.key}`);
}

const manifest = `${JSON.stringify(entries, null, 2)}\n`;
const { error: manifestError } = await client.storage
  .from(BUCKET)
  .upload(MANIFEST_PATH, manifest, {
    contentType: 'application/json; charset=utf-8',
    upsert: true,
  });
if (manifestError) throw new Error(`写入 ${MANIFEST_PATH} 失败：${manifestError.message}`);

console.log(`上传完成：${files.length} 个 DWG + 1 个清单。`);

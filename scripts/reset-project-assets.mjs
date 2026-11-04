// ⚠️ 开发专用隔离脚本：仅用于用户明确授权的空白/可丢弃开发实例。
// 该脚本会永久删除 project-assets 桶及其全部对象；不属于初始化或升级步骤，
// 不提供 npm script 快捷入口，必须显式传入 --confirm-delete-bucket project-assets。
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { removeStorageBucket } from './lib/storageBootstrap.mjs';

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

const confirmIndex = process.argv.indexOf('--confirm-delete-bucket');
const confirmedBucket = confirmIndex >= 0 ? process.argv[confirmIndex + 1] : null;
if (confirmedBucket !== 'project-assets') {
  console.error('拒绝执行：该脚本会永久删除 project-assets 桶及全部对象。');
  console.error('仅在明确授权的空白/可丢弃开发实例上，显式执行：');
  console.error('  node scripts/reset-project-assets.mjs --confirm-delete-bucket project-assets');
  process.exit(1);
}

loadEnvFile(resolve(process.cwd(), '.env'));

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secretKey) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) or SUPABASE_SECRET_KEY.');
  process.exitCode = 1;
} else {
  try {
    const targetRef = new URL(url).hostname.split('.')[0];
    console.error(`⚠️ 即将删除桶 project-assets，目标项目: ${targetRef}`);
    const storage = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    }).storage;
    const result = await removeStorageBucket(storage, 'project-assets');
    console.log(`project-assets: ${result}`);
  } catch (error) {
    console.error(`Storage cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

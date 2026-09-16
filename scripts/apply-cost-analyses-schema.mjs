import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function loadEnv() {
  const envPath = path.resolve('.env');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const pg = require(path.resolve('.tmp/db-runtime/node_modules/pg'));
  const client = new pg.Client({
    host: env.SUPABASE_DB_HOST,
    port: Number(env.SUPABASE_DB_PORT || 6543),
    user: env.SUPABASE_DB_USER,
    password: env.SUPABASE_DB_PASSWORD,
    database: env.SUPABASE_DB_NAME,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  console.log('正在连接 Supabase 数据库...');
  await client.connect();
  console.log('数据库连接成功！');

  const sqlFile = path.resolve('supabase/sql/10_schema/06_finished_harness_cost_analyses.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');
  console.log('正在执行 schema 变更...');
  await client.query(sql);
  console.log('06_finished_harness_cost_analyses.sql 执行成功！');

  // 验证表与字段是否存在
  const res = await client.query(`
    select column_name, data_type 
    from information_schema.columns 
    where table_name = 'finished_harness_cost_analyses'
    order by ordinal_position;
  `);
  console.log('新建表 finished_harness_cost_analyses 包含字段数:', res.rows.length);

  await client.end();
}

main().catch((err) => {
  console.error('执行失败:', err);
  process.exit(1);
});

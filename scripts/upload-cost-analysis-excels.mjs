import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { listExcelWorkbooks } from './import-cost-analyses.mjs';

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

const BUCKET_NAME = 'cost-analysis-sources';

// 将带有中文、空格、加号的文件名转为干净的 Storage Key
function toSafeStorageKey(fileName, index) {
  // 生成文件名 hash，确保唯一且稳定
  const hash = crypto.createHash('md5').update(fileName).digest('hex').slice(0, 8);
  // 提取纯英文字符作为可读标签
  const cleanBase = fileName
    .replace(/\.xlsx$/i, '')
    .replace(/[^\w-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30);
  
  const paddedIdx = String(index + 1).padStart(2, '0');
  const safeName = cleanBase ? `${paddedIdx}_${cleanBase}_${hash}.xlsx` : `${paddedIdx}_${hash}.xlsx`;
  return `cost-analyses/${safeName}`;
}

async function main() {
  const env = loadEnv();
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const secretKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error('缺少 Supabase URL 或 SUPABASE_SECRET_KEY，请检查 .env');
  }

  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('1. 正在检查/确认 Supabase Storage 桶:', BUCKET_NAME);
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    throw new Error(`获取存储桶列表失败: ${listErr.message}`);
  }

  const exists = buckets.some((b) => b.id === BUCKET_NAME);
  if (!exists) {
    console.log(`桶 ${BUCKET_NAME} 不存在，正在创建为私有桶 (public: false)...`);
    const { error: createErr } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: false,
      fileSizeLimit: 52428800, // 50MB
    });
    if (createErr) throw new Error(`创建存储桶失败: ${createErr.message}`);
    console.log(`桶 ${BUCKET_NAME} 创建成功！`);
  } else {
    console.log(`桶 ${BUCKET_NAME} 已存在，更新为 public: false...`);
    await supabase.storage.updateBucket(BUCKET_NAME, {
      public: false,
      fileSizeLimit: 52428800,
    });
  }

  // 2. 数据库 DDL 扩展
  console.log('\n2. 正在检查并更新数据库表结构（添加 source_excel_url 字段）...');
  const pg = require(path.resolve('.tmp/db-runtime/node_modules/pg'));
  const dbClient = new pg.Client({
    host: env.SUPABASE_DB_HOST,
    port: Number(env.SUPABASE_DB_PORT || 6543),
    user: env.SUPABASE_DB_USER,
    password: env.SUPABASE_DB_PASSWORD,
    database: env.SUPABASE_DB_NAME,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await dbClient.connect();
  console.log('数据库连接成功！');

  await dbClient.query(`
    alter table public.finished_harness_materials
      add column if not exists source_excel_url text;

    alter table public.finished_harness_cost_analyses
      add column if not exists source_excel_url text,
      add column if not exists source_excel_path text;
  `);
  console.log('数据表字段扩展检查/执行完成！');

  // 3. 上传 Excel 文件到 Storage
  console.log('\n3. 正在上传 20 个 Excel 文件到 Storage 并生成公网 URL...');
  const excelDir = path.resolve('excel');
  // 递归扫描（每个 xlsx 可放在同名子文件夹中），按文件名排序，保证与 seed 生成使用一致的序号->存储路径映射
  const files = listExcelWorkbooks(excelDir);
  console.log(`扫描到 ${files.length} 个 Excel 文件。`);

  const fileUrlMap = new Map();

  for (let i = 0; i < files.length; i++) {
    const { fileName, filePath: localFilePath } = files[i];
    const fileBuffer = fs.readFileSync(localFilePath);
    const storagePath = toSafeStorageKey(fileName, i);

    console.log(`-> [${i + 1}/${files.length}] 上传: ${fileName}`);
    console.log(`   Storage Key: ${storagePath} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`上传文件 ${fileName} 失败: ${uploadErr.message}`);
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;
    fileUrlMap.set(fileName, { storagePath, publicUrl });
    console.log(`   公网 URL: ${publicUrl}`);
  }

  // 4. 回填数据库
  console.log('\n4. 正在回填数据库 source_excel_url 与 source_excel_path...');
  let updatedAnalysisCount = 0;
  for (const [fileName, { storagePath, publicUrl }] of fileUrlMap.entries()) {
    const res = await dbClient.query(
      `update public.finished_harness_cost_analyses
       set source_excel_url = $1, source_excel_path = $2, updated_at = now()
       where source_excel_file = $3`,
      [publicUrl, storagePath, fileName]
    );
    updatedAnalysisCount += res.rowCount || 0;
  }
  console.log(`已更新 finished_harness_cost_analyses 记录数: ${updatedAnalysisCount}`);

  // 回填 finished_harness_materials 主表
  const updateMatRes = await dbClient.query(`
    update public.finished_harness_materials m
    set source_excel_url = ca.source_excel_url, updated_at = now()
    from public.finished_harness_cost_analyses ca
    where m.id = ca.harness_material_id and ca.source_excel_url is not null;
  `);
  console.log(`已同步回填 finished_harness_materials 主表记录数: ${updateMatRes.rowCount || 0}`);

  // 5. 抽样验证
  const sampleRes = await dbClient.query(`
    select m.platform_no, m.son_name, m.sales_price, m.source_excel_url, ca.source_excel_file, ca.source_excel_path
    from public.finished_harness_materials m
    join public.finished_harness_cost_analyses ca on m.id = ca.harness_material_id
    limit 2;
  `);
  console.log('\n抽样验证结果:');
  console.dir(sampleRes.rows, { depth: null });

  await dbClient.end();
  console.log('\n全部操作完成！');
}

main().catch((err) => {
  console.error('执行发生错误:', err);
  process.exit(1);
});

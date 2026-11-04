import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import {
  COST_ANALYSIS_BUCKET,
  commitCostAnalysisBatch,
  buildPgSslConfig,
  buildSyncManifest,
  collectSourceFiles,
  dedupeAnalysesByPlatformNo,
  resolveProjectRef,
  readVerifiedSourceFile,
  validateCostAnalysisBatch,
  verifySourceFilesUnchanged,
} from './lib/costAnalysisSync.mjs';
import { listExcelWorkbooks, parseCostWorkbook } from './import-cost-analyses.mjs';

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

async function ensurePrivateBucket(supabase, isCommit) {
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) throw new Error(`查询桶失败: ${listErr.message}`);

  const exists = buckets.some((b) => b.id === COST_ANALYSIS_BUCKET);
  if (!exists) {
    if (!isCommit) {
      console.log(`[Storage] 桶 ${COST_ANALYSIS_BUCKET} 缺失（将在 --commit 时创建为私有桶）`);
      return;
    }
    const { error } = await supabase.storage.createBucket(COST_ANALYSIS_BUCKET, {
      public: false,
      fileSizeLimit: 52428800,
    });
    if (error) throw new Error(`创建存储桶失败: ${error.message}`);
    console.log(`[Storage] 成功创建私有桶 ${COST_ANALYSIS_BUCKET}`);
    return;
  }

  if (isCommit) {
    const { error } = await supabase.storage.updateBucket(COST_ANALYSIS_BUCKET, {
      public: false,
      fileSizeLimit: 52428800,
    });
    if (error) throw new Error(`更新存储桶为私有失败: ${error.message}`);
    console.log(`[Storage] 成功确认/更新桶 ${COST_ANALYSIS_BUCKET} 为私有桶`);
  }
}

async function main() {
  const isCommit = process.argv.includes('--commit');
  const env = loadEnv();
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const secretKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error('缺少 Supabase URL 或 SUPABASE_SECRET_KEY，请检查 .env');
  }

  console.log('====================================================');
  console.log('成品线束方案一体化同步管道 (Storage + 数据库 + BOM推导)');
  console.log(`运行模式: ${isCommit ? '【真正写入模式 --commit】' : '【只读分析预览模式 (加 --commit 写入)】'}`);
  console.log(`目标 Supabase 项目: ${resolveProjectRef(supabaseUrl)}`);
  console.log('====================================================\n');

  // 1. 扫描并记录来源文件哈希；完整解析与校验通过前不进行任何远程写入。
  const excelDir = path.resolve('excel');
  const files = listExcelWorkbooks(excelDir);
  const sourceFiles = collectSourceFiles(files);
  console.log(`[Local] 扫描到 ${files.length} 个 Excel 文件。`);

  const rawAnalyses = [];
  const parseFailures = [];
  const parseWarnings = [];
  for (const source of sourceFiles) {
    const { fileName, filePath } = source;
    try {
      const res = parseCostWorkbook(filePath, {
        buffer: readVerifiedSourceFile(source),
        onWarning: (message) => parseWarnings.push(message),
      });
      rawAnalyses.push(...res);
    } catch (err) {
      parseFailures.push(`${fileName}: ${err.message}`);
      console.error(`解析失败 ${fileName}:`, err.message);
    }
  }

  const analyses = dedupeAnalysesByPlatformNo(rawAnalyses);
  validateCostAnalysisBatch(analyses, sourceFiles, parseFailures, parseWarnings);

  console.log(`[Parser] 共解析出 ${analyses.length} 个成品方案。`);
  const manifest = buildSyncManifest({ sourceFiles, analyses });
  console.log(`[Manifest] ${manifest.sourceFiles.length} 个来源文件，${manifest.analysisCount} 个方案：`);
  for (const file of manifest.sourceFiles) {
    console.log(`  - ${file.fileName} (${file.bytes} B, sha256:${file.sha256.slice(0, 16)}…)`);
  }

  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (!isCommit) {
    console.log('\n[Preview] 抽样前 2 个解析结果:');
    for (const item of analyses.slice(0, 2)) {
      console.log({
        platformNo: item.platformNo,
        productName: item.productName,
        totalCost: item.totalCost,
        salesPrice: item.salesPrice,
        stepsCount: item.calculationSteps.length,
        sourceExcelFile: item.sourceExcelFile,
      });
    }
    await ensurePrivateBucket(supabase, false);
    console.log('\n提示：若需真正将变更写入 Supabase（先上传版本对象、再单事务交付），请执行: node scripts/sync-cost-analyses.mjs --commit');
    return;
  }

  // 2. 首次远程写入前校验数据库配置，避免上传后才发现无法提交。
  if (!env.SUPABASE_DB_HOST || !env.SUPABASE_DB_USER || !env.SUPABASE_DB_PASSWORD) {
    throw new Error('缺少 SUPABASE_DB_HOST / SUPABASE_DB_USER / SUPABASE_DB_PASSWORD，禁止写入');
  }
  const dbClient = new pg.Client({
    host: env.SUPABASE_DB_HOST,
    port: Number(env.SUPABASE_DB_PORT || 6543),
    user: env.SUPABASE_DB_USER,
    password: env.SUPABASE_DB_PASSWORD,
    database: env.SUPABASE_DB_NAME,
    ssl: buildPgSslConfig(env),
    connectionTimeoutMillis: 15000,
  });
  verifySourceFilesUnchanged(sourceFiles);
  await ensurePrivateBucket(supabase, true);
  // 3. 上传不可覆盖版本，全部确认后才执行数据库事务；中途失败不清理任何对象。
  const result = await commitCostAnalysisBatch(supabase, dbClient, sourceFiles, analyses, (paths) => {
    console.error('同步未完成。以下对象可能已存在，其数据库引用状态尚未确认；已保留，请人工核查：');
    for (const storagePath of paths) console.error(`  - ${storagePath}`);
  });
  console.log(`[Database] 同步完成！更新关联: ${result.updatedCount} 个，新建档: ${result.createdCount} 个。`);
  console.log('未出现在本次来源中的既有方案与物料保持原样；本次不做任何删除。');
}

main().catch((err) => {
  console.error('同步发生异常:', err);
  process.exit(1);
});

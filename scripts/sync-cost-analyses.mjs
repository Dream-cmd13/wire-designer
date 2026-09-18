import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { parseCostWorkbook, buildStaleCleanupStatements, listExcelWorkbooks, NO_DRAWING_MATERIAL_CLEANUP_SQL } from './import-cost-analyses.mjs';

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

function toSafeStorageKey(fileName, index) {
  const hash = crypto.createHash('md5').update(fileName).digest('hex').slice(0, 8);
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
  console.log('====================================================\n');

  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. 确保 Storage 桶为私有
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) throw new Error(`查询桶失败: ${listErr.message}`);

  const exists = buckets.some((b) => b.id === BUCKET_NAME);
  if (!exists) {
    if (isCommit) {
      const { error: createErr } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: false,
        fileSizeLimit: 52428800,
      });
      if (createErr) throw new Error(`创建存储桶失败: ${createErr.message}`);
      console.log(`[Storage] 成功创建私有桶 ${BUCKET_NAME}`);
    } else {
      console.log(`[Storage] 桶 ${BUCKET_NAME} 缺失（将在 --commit 时创建为私有桶）`);
    }
  } else if (isCommit) {
    const { error: updateErr } = await supabase.storage.updateBucket(BUCKET_NAME, {
      public: false,
      fileSizeLimit: 52428800,
    });
    if (updateErr) throw new Error(`更新存储桶为私有失败: ${updateErr.message}`);
    console.log(`[Storage] 成功确认/更新桶 ${BUCKET_NAME} 为私有桶`);
  }

  // 2. 递归扫描本地 Excel（每个 xlsx 可放在同名子文件夹中；按文件名排序，保证与 seed 生成使用一致的序号->存储路径映射）
  const excelDir = path.resolve('excel');
  const files = listExcelWorkbooks(excelDir);
  console.log(`[Local] 扫描到 ${files.length} 个 Excel 文件。`);

  // 3. 上传/获取 Storage 公网 URL 映射
  const fileUrlMap = new Map();
  for (let i = 0; i < files.length; i++) {
    const { fileName, filePath: localFilePath } = files[i];
    const fileBuffer = fs.readFileSync(localFilePath);
    const storagePath = toSafeStorageKey(fileName, i);

    if (isCommit) {
      const { error: upErr } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, fileBuffer, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: true,
        });
      if (upErr) throw new Error(`上传 ${fileName} 失败: ${upErr.message}`);
    }

    const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
    fileUrlMap.set(fileName, { storagePath, publicUrl: urlData.publicUrl });
  }
  console.log(`[Storage] ${fileUrlMap.size} 个 Excel 文件云端 URL 已就绪。`);

  // 4. 解析全量成本分析数据
  const allAnalyses = [];
  const parseWarnings = [];
  for (const { fileName, filePath } of files) {
    try {
      const res = parseCostWorkbook(filePath, {
        onWarning: (message) => parseWarnings.push(message),
      });
      allAnalyses.push(...res);
    } catch (err) {
      console.error(`解析失败 ${fileName}:`, err);
    }
  }
  console.log(`[Parser] 共解析出 ${allAnalyses.length} 个成品方案。`);
  if (parseWarnings.length > 0) {
    console.warn(`[Parser] 解析告警 ${parseWarnings.length} 条：`);
    parseWarnings.forEach((message) => console.warn(`  - ${message}`));
  }

  if (!isCommit) {
    console.log('\n[Preview] 抽样前 2 个解析结果:');
    for (const item of allAnalyses.slice(0, 2)) {
      console.log({
        platformNo: item.platformNo,
        productName: item.productName,
        totalCost: item.totalCost,
        salesPrice: item.salesPrice,
        stepsCount: item.calculationSteps.length,
        sourceExcelFile: item.sourceExcelFile,
        sourceExcelUrl: fileUrlMap.get(item.sourceExcelFile)?.publicUrl,
      });
    }
    console.log('\n提示：若需真正将变更写入 Supabase 数据库，请执行: node scripts/sync-cost-analyses.mjs --commit');
    return;
  }

  // 5. 写入数据库
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

  // 直接替换旧命名结果：清理当前解析结果之外的历史成本分析与自动建档物料
  await dbClient.query(
    buildStaleCleanupStatements(allAnalyses.map((item) => item.platformNo)).join('\n')
  );

  let updatedCount = 0;
  let createdCount = 0;

  for (const item of allAnalyses) {
    const urlInfo = fileUrlMap.get(item.sourceExcelFile);
    const sourceExcelUrl = urlInfo?.publicUrl || null;
    const sourceExcelPath = urlInfo?.storagePath || null;

    const existRes = await dbClient.query(
      'select id from public.finished_harness_materials where platform_no = $1',
      [item.platformNo]
    );

    let harnessMaterialId = null;
    if (existRes.rows.length > 0) {
      harnessMaterialId = existRes.rows[0].id;
      await dbClient.query(
        `update public.finished_harness_materials 
         set total_cost = $1, sales_price = $2, sample_price = $3, quote_price = $4, 
             has_cost_analysis = true, source_excel_url = $5,
             son_name = case when source_material_id is null then $7 else son_name end, updated_at = now()
         where id = $6`,
        [item.totalCost, item.salesPrice, item.samplePrice, item.quotePrice, sourceExcelUrl, harnessMaterialId, item.productName || null]
      );
      updatedCount++;
    } else {
      // 自动建档新成品物料：不写入 son_price_low 与 son_unit
      // son_price_low 为 CRM 平台最低售价、son_unit 为外部导入单位，有值即保留、缺失保持 null，禁止由成本分析/Excel 推导回填
      const insertRes = await dbClient.query(
        `insert into public.finished_harness_materials 
         (source_material_id, platform_no, son_name, total_cost, sales_price, sample_price, quote_price, has_cost_analysis, source_excel_url)
         values ($1, $2, $3, $4, $5, $6, $7, true, $8)
         returning id`,
        [
          null,
          item.platformNo,
          item.productName || null,
          item.totalCost,
          item.salesPrice,
          item.samplePrice,
          item.quotePrice,
          sourceExcelUrl,
        ]
      );
      harnessMaterialId = insertRes.rows[0].id;
      createdCount++;
    }

    await dbClient.query(
      `insert into public.finished_harness_cost_analyses
       (harness_material_id, platform_no, source_excel_file, source_sheet_name, customer_name, customer_part_no,
        material_cost, material_loss, labor_cost, labor_loss, total_cost, tax_cost, sales_price, sample_price, quote_price,
        formula_config, calculation_steps, bom_items, labor_items, source_excel_url, source_excel_path, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, now())
       on conflict (platform_no) do update set
        harness_material_id = excluded.harness_material_id,
        source_excel_file = excluded.source_excel_file,
        source_sheet_name = excluded.source_sheet_name,
        customer_name = excluded.customer_name,
        customer_part_no = excluded.customer_part_no,
        material_cost = excluded.material_cost,
        material_loss = excluded.material_loss,
        labor_cost = excluded.labor_cost,
        labor_loss = excluded.labor_loss,
        total_cost = excluded.total_cost,
        tax_cost = excluded.tax_cost,
        sales_price = excluded.sales_price,
        sample_price = excluded.sample_price,
        quote_price = excluded.quote_price,
        formula_config = excluded.formula_config,
        calculation_steps = excluded.calculation_steps,
        bom_items = excluded.bom_items,
        labor_items = excluded.labor_items,
        source_excel_url = excluded.source_excel_url,
        source_excel_path = excluded.source_excel_path,
        updated_at = now()`,
      [
        harnessMaterialId,
        item.platformNo,
        item.sourceExcelFile,
        item.sourceSheetName,
        item.customerName || null,
        item.customerPartNo || null,
        item.materialCost,
        item.materialLoss,
        item.laborCost,
        item.laborLoss,
        item.totalCost,
        item.taxCost,
        item.salesPrice,
        item.samplePrice,
        item.quotePrice,
        JSON.stringify(item.formulaConfig),
        JSON.stringify(item.calculationSteps),
        JSON.stringify(item.bomItems),
        JSON.stringify(item.laborItems),
        sourceExcelUrl,
        sourceExcelPath,
      ]
    );
  }

  // 成本分析写入完成后再隐藏无图纸且未被引用的物料
  await dbClient.query(NO_DRAWING_MATERIAL_CLEANUP_SQL);

  console.log(`[Database] 同步完成！更新关联: ${updatedCount} 个，新建档: ${createdCount} 个。`);
  await dbClient.end();
}

main().catch((err) => {
  console.error('同步发生异常:', err);
  process.exit(1);
});

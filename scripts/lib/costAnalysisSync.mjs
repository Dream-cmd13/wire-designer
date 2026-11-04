import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const COST_ANALYSIS_BUCKET = 'cost-analysis-sources';

/** 计算文件 SHA-256，用于来源版本路径与提交前输入一致性校验。 */
export function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/**
 * 来源文件的不可覆盖版本对象路径：以内容哈希结尾，同一文件内容重复上传幂等，
 * 内容变化时生成新路径，不覆盖历史来源对象。
 */
export function buildVersionedStoragePath(fileName, index, contentSha256) {
  const hash = String(contentSha256 || '').slice(0, 12) || crypto.createHash('md5').update(fileName).digest('hex').slice(0, 8);
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

/**
 * 扫描 excel 目录并记录每个来源文件的名称、大小与内容哈希。
 * 返回的 sha256 用于提交前二次确认输入未发生变化。
 */
export function collectSourceFiles(files) {
  return files.map(({ fileName, filePath }) => {
    const stat = fs.statSync(filePath);
    return { fileName, filePath, bytes: stat.size, sha256: sha256File(filePath) };
  });
}

/** 提交前再次确认来源文件未被替换或修改（哈希与解析时一致）。 */
export function verifySourceFilesUnchanged(sourceFiles) {
  for (const file of sourceFiles) {
    const current = sha256File(file.filePath);
    if (current !== file.sha256) {
      throw new Error(`来源文件在解析后发生变化，已中止写入：${file.fileName}`);
    }
  }
}

/** 解析和上传都校验实际使用的字节，拒绝预检后被替换的来源文件。 */
export function readVerifiedSourceFile(source) {
  const buffer = fs.readFileSync(source.filePath);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  if (hash !== source.sha256 || buffer.length !== source.bytes) {
    throw new Error(`来源文件在解析后发生变化，已中止写入：${source.fileName}`);
  }
  return buffer;
}

/** 版本对象禁止覆盖；重试遇到同路径时，必须下载核验原始内容才允许复用。 */
export async function uploadVersionedSource(bucket, storagePath, buffer) {
  const { error } = await bucket.upload(storagePath, buffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    upsert: false,
  });
  if (!error) return;
  if (String(error.statusCode ?? error.status) !== '409') {
    throw new Error(`上传来源对象失败：${error.message}`);
  }
  const existing = await bucket.download(storagePath);
  if (existing.error || !existing.data) throw new Error(`无法核验既有来源对象：${storagePath}`);
  const bytes = Buffer.from(await existing.data.arrayBuffer());
  const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
  if (bytes.length !== buffer.length || hash(bytes) !== hash(buffer)) {
    throw new Error(`既有来源对象与待上传内容不一致，未覆盖：${storagePath}`);
  }
}

/** 覆盖上传与数据库两个阶段的失败恢复；任何不确定对象均保留，供人工核查。 */
export async function commitCostAnalysisBatch(supabase, dbClient, sourceFiles, analyses, reportPendingObjects) {
  const pendingPaths = [];
  const fileUrlMap = new Map();
  try {
    const bucket = supabase.storage.from(COST_ANALYSIS_BUCKET);
    for (const [index, source] of sourceFiles.entries()) {
      const buffer = readVerifiedSourceFile(source);
      const storagePath = buildVersionedStoragePath(source.fileName, index, source.sha256);
      // 请求可能在对象写入后断网，失败的当前路径也需要核查，不能认定它不存在。
      pendingPaths.push(storagePath);
      await uploadVersionedSource(bucket, storagePath, buffer);
      const { data } = bucket.getPublicUrl(storagePath);
      fileUrlMap.set(source.fileName, { storagePath, publicUrl: data.publicUrl, verified: true });
    }
    await dbClient.connect();
    return await applyCostAnalysisBatch(dbClient, analyses, fileUrlMap);
  } catch (error) {
    reportPendingObjects(pendingPaths);
    throw error;
  } finally {
    await dbClient.end().catch(() => {});
  }
}

/**
 * 同料号多 sheet 时按现有约定追加 sheet 名区分；仍无法区分则抛错。
 * 返回去重后的分析列表（保持原有改名语义）。
 */
export function dedupeAnalysesByPlatformNo(analyses) {
  const seen = new Set();
  const result = [];
  for (const item of analyses) {
    if (!seen.has(item.platformNo)) {
      seen.add(item.platformNo);
      result.push(item);
      continue;
    }
    const altNo = `${item.platformNo}-${String(item.sourceSheetName || '').replace(/\s+/g, '')}`;
    if (seen.has(altNo)) {
      throw new Error(`料号重复且无法区分：${item.platformNo}（${item.sourceSheetName}）`);
    }
    item.platformNo = altNo;
    seen.add(altNo);
    result.push(item);
  }
  return result;
}

/**
 * 批次完整校验：任一读取/解析失败、结构告警、空输入、重复料号或输入元数据缺失均中止。
 * 校验不通过直接抛错；通过时无返回值。
 */
export function validateCostAnalysisBatch(analyses, sourceFiles, parseFailures, parseWarnings) {
  if (sourceFiles.length === 0) {
    throw new Error('未扫描到任何来源 Excel 文件，已中止。');
  }
  for (const file of sourceFiles) {
    if (!file.fileName || !file.sha256) {
      throw new Error(`来源文件缺少名称或哈希，已中止：${file.fileName || file.filePath}`);
    }
  }
  if (parseFailures.length > 0) {
    throw new Error(
      `存在 ${parseFailures.length} 个读取/解析失败的文件，已中止写入：${parseFailures.join('；')}`,
    );
  }
  if (parseWarnings.length > 0) {
    throw new Error(
      `存在 ${parseWarnings.length} 条结构不完整告警，已中止写入：${parseWarnings.slice(0, 5).join('；')}`,
    );
  }
  if (analyses.length === 0) {
    throw new Error('未解析出任何成本方案，已中止写入。');
  }
  const fileNames = new Set(sourceFiles.map((file) => file.fileName));
  const seen = new Set();
  for (const item of analyses) {
    if (!fileNames.has(item.sourceExcelFile)) {
      throw new Error(`方案 ${item.platformNo} 的来源文件不在本次扫描清单中：${item.sourceExcelFile}`);
    }
    if (seen.has(item.platformNo)) {
      throw new Error(`料号重复：${item.platformNo}`);
    }
    seen.add(item.platformNo);
  }
}

/** 连接数据库使用的 CA 配置：优先读取显式提供的 CA，默认开启证书校验。 */
export function buildPgSslConfig(env) {
  const caPath = String(env.SUPABASE_DB_CA_CERT || '').trim();
  if (caPath) {
    return { ca: fs.readFileSync(path.resolve(caPath), 'utf8'), rejectUnauthorized: true };
  }
  return { rejectUnauthorized: true };
}

/** 从 Supabase URL 提取目标项目标识（用于输出目标信息，不输出密钥）。 */
export function resolveProjectRef(supabaseUrl) {
  try {
    return new URL(supabaseUrl).hostname.split('.')[0];
  } catch {
    return '(无法解析)';
  }
}

/** 生成统一规则的来源对象地址（内容哈希路径）；仅确认对象存在后才允许写入数据库。 */
export function buildSourceRef(fileName, index, contentSha256, baseUrl) {
  const storagePath = buildVersionedStoragePath(fileName, index, contentSha256);
  return {
    storagePath,
    publicUrl: `${baseUrl}/storage/v1/object/public/${COST_ANALYSIS_BUCKET}/${storagePath}`,
  };
}

function parseSqlString(token) {
  if (!token || token === 'null') return null;
  return token.slice(1, -1).replace(/''/g, "'");
}

/**
 * 解析既有种子文件里每个来源文件的定位（source_excel_path / source_excel_url），
 * 用于“未确认新对象时保留现有定位”，避免把数据库引用改回不存在的地址。
 */
export function parsePreviousSeedSourceRefs(seedSql) {
  const refs = new Map();
  if (typeof seedSql !== 'string' || seedSql.length === 0) return refs;
  const pattern = /limit 1\), '([^']*)', '([^']*)', '([^']*)', (null|'(?:[^']|'')*'), (null|'(?:[^']|'')*'),/g;
  for (const match of seedSql.matchAll(pattern)) {
    const fileName = match[2];
    if (!fileName) continue;
    const storagePath = parseSqlString(match[4]);
    const publicUrl = parseSqlString(match[5]);
    if (storagePath === null && publicUrl === null) continue;
    if (!refs.has(fileName)) refs.set(fileName, { storagePath, publicUrl });
  }
  return refs;
}

/**
 * 构建种子用的来源定位：
 * - 已确认存在（本次已验证）→ 使用统一的内容哈希版本路径；
 * - 未确认 → 沿用既有种子中的定位；
 * - 两者都没有 → 省略引用（写 null），不构造不存在的地址。
 */
export function resolveSeedSourceRefs(sourceFiles, baseUrl, verifiedFileNames, previousSeedSql) {
  const previous = parsePreviousSeedSourceRefs(previousSeedSql);
  const map = new Map();
  const stats = { verified: 0, retained: 0, missing: 0 };
  sourceFiles.forEach((file, index) => {
    if (verifiedFileNames.has(file.fileName)) {
      map.set(file.fileName, { ...buildSourceRef(file.fileName, index, file.sha256, baseUrl), verified: true });
      stats.verified += 1;
      return;
    }
    const fallback = previous.get(file.fileName);
    if (fallback && (fallback.storagePath || fallback.publicUrl)) {
      map.set(file.fileName, {
        storagePath: fallback.storagePath,
        publicUrl: fallback.publicUrl,
        verified: false,
        retained: true,
      });
      stats.retained += 1;
      return;
    }
    stats.missing += 1;
  });
  return { map, stats };
}

export function updateMaterialStatementParams(item, harnessMaterialId, urlInfo) {
  return [
    item.totalCost,
    item.salesPrice,
    item.samplePrice,
    item.quotePrice,
    urlInfo?.publicUrl || null,
    harnessMaterialId,
    item.productName || null,
  ];
}

const UPSERT_MATERIAL_SQL = `insert into public.finished_harness_materials
   (source_material_id, platform_no, son_name, total_cost, sales_price, sample_price, quote_price, has_cost_analysis, source_excel_url)
   values ($1, $2, $3, $4, $5, $6, $7, true, $8)
   returning id`;

// 只更新成本相关列；CRM 字段（son_price_low / son_unit / source_material_id / 图纸绑定等）一律不动。
// son_name 仅在自动建档（source_material_id 为空）时同步，CRM 来源名称永不覆盖。
// source_excel_url 使用 coalesce，避免缺失回退时清空历史来源定位。
const UPDATE_MATERIAL_SQL = `update public.finished_harness_materials
   set total_cost = $1, sales_price = $2, sample_price = $3, quote_price = $4,
       has_cost_analysis = true,
       source_excel_url = coalesce($5, source_excel_url),
       son_name = case when source_material_id is null then $7 else son_name end,
       updated_at = now()
   where id = $6`;

const UPSERT_COST_ANALYSIS_SQL = `insert into public.finished_harness_cost_analyses
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
    source_excel_url = coalesce(excluded.source_excel_url, finished_harness_cost_analyses.source_excel_url),
    source_excel_path = coalesce(excluded.source_excel_path, finished_harness_cost_analyses.source_excel_path),
    updated_at = now()`;

/**
 * 在单个事务中新增或更新成品方案与成本分析；任何失败回滚。
 * 只新增或更新，不删除任何未出现在本次来源中的已有记录。
 * 来源定位只在对象已确认存在（fileUrlMap 条目 verified === true，通常由同步上传后标记）时才写入；
 * 否则写 null 并依赖 coalesce 保留既有引用，避免构造不存在的地址。
 * 返回 { createdCount, updatedCount, createdPlatformNos, updatedPlatformNos }。
 */
export async function applyCostAnalysisBatch(client, analyses, fileUrlMap) {
  const createdPlatformNos = [];
  const updatedPlatformNos = [];
  await client.query('begin');
  try {
    for (const item of analyses) {
      const urlInfo = fileUrlMap.get(item.sourceExcelFile);
      const verifiedUrlInfo = urlInfo?.verified === true ? urlInfo : null;
      const sourceExcelUrl = verifiedUrlInfo?.publicUrl || null;
      const sourceExcelPath = verifiedUrlInfo?.storagePath || null;

      const existRes = await client.query(
        'select id from public.finished_harness_materials where platform_no = $1',
        [item.platformNo],
      );

      let harnessMaterialId;
      if (existRes.rows.length > 0) {
        harnessMaterialId = existRes.rows[0].id;
        await client.query(UPDATE_MATERIAL_SQL, updateMaterialStatementParams(item, harnessMaterialId, verifiedUrlInfo));
        updatedPlatformNos.push(item.platformNo);
      } else {
        const insertRes = await client.query(UPSERT_MATERIAL_SQL, [
          null,
          item.platformNo,
          item.productName || null,
          item.totalCost,
          item.salesPrice,
          item.samplePrice,
          item.quotePrice,
          sourceExcelUrl,
        ]);
        harnessMaterialId = insertRes.rows[0].id;
        createdPlatformNos.push(item.platformNo);
      }

      await client.query(UPSERT_COST_ANALYSIS_SQL, [
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
        JSON.stringify(item.formulaConfig ?? {}),
        JSON.stringify(item.calculationSteps ?? []),
        JSON.stringify(item.bomItems ?? []),
        JSON.stringify(item.laborItems ?? []),
        sourceExcelUrl,
        sourceExcelPath,
      ]);
    }
    await client.query('commit');
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // 回滚失败时保留原始错误，由调用方以非零退出码中止。
    }
    throw error;
  }
  return {
    createdCount: createdPlatformNos.length,
    updatedCount: updatedPlatformNos.length,
    createdPlatformNos,
    updatedPlatformNos,
  };
}

/** 生成本次同步的预览清单：来源文件、哈希、解析数量与计划平台号列表。 */
export function buildSyncManifest({ sourceFiles, analyses }) {
  return {
    generatedAt: new Date().toISOString(),
    sourceFiles: sourceFiles.map((file) => ({
      fileName: file.fileName,
      bytes: file.bytes,
      sha256: file.sha256,
    })),
    analysisCount: analyses.length,
    platformNos: analyses.map((item) => item.platformNo),
  };
}

/**
 * 判定单个来源定位的状态，明确区分：
 * - verified：数据库引用与统一版本路径一致（若已知对象不存在则视为问题）；
 * - retained：数据库保留未验证的历史引用，且统一版本对象尚未确认存在（允许，但需提示）；
 * - problem：其余情况，包括“对象已存在但数据库仍引用旧定位”的路径回退。
 */
export function evaluateSourceRefState({ dbPath, dbUrl, candidatePath, candidateUrl, retained, candidateExists }) {
  const dbPathValue = dbPath ?? null;
  const dbUrlValue = dbUrl ?? null;
  const candidatePathValue = candidatePath ?? null;
  const candidateUrlValue = candidateUrl ?? null;
  if (dbPathValue === candidatePathValue && dbUrlValue === candidateUrlValue) {
    if (candidateExists === false) {
      return { state: 'problem', message: '数据库引用了未确认存在的版本路径' };
    }
    return { state: 'verified' };
  }
  const retainedPath = retained?.storagePath ?? null;
  const retainedUrl = retained?.publicUrl ?? null;
  if (retained && dbPathValue === retainedPath && dbUrlValue === retainedUrl) {
    if (candidateExists === true) {
      return {
        state: 'problem',
        message: '来源对象已存在但数据库仍引用未验证的旧定位（请同步刷新引用或重新导出种子）',
      };
    }
    return { state: 'retained' };
  }
  return { state: 'problem', message: '来源定位既不是统一版本路径也不是既有定位' };
}

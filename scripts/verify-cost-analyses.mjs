import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import XLSX from 'xlsx';
import { parseCostWorkbook, toSafeStorageKey } from './import-cost-analyses.mjs';

const require = createRequire(import.meta.url);

function loadEnv() {
  const envPath = path.resolve('.env');
  if (!fs.existsSync(envPath)) return {};
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return env;
}

const num = (v) => {
  if (v == null || v === '' || v === 'null') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const close = (a, b, tol = 0.001) => {
  const x = num(a), y = num(b);
  if (x == null || y == null) return x == null && y == null;
  return Math.abs(x - y) <= tol;
};
const cellVal = (ws, addr) => (ws[addr] ? ws[addr].v : undefined);
const cellFormula = (ws, addr) => (ws[addr] ? ws[addr].f : undefined);
const text = (ws, addr) => String(cellVal(ws, addr) || '').trim();
const round4 = (v) => {
  const n = num(v);
  return n == null ? null : Math.round(n * 10000) / 10000;
};
const isNote = (s) => s.length > 15 || s.includes('管销') || s.includes('请不要') || s.includes('插入行');

function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canonical(v[k]);
    return out;
  }
  return v;
}
const sameJson = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

function evalExpr(expr) {
  const s = String(expr).replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '');
  if (!/^[0-9+\-*/().\s]+$/.test(s)) return null;
  try {
    const v = Function(`"use strict";return (${s})`)();
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

function splitSqlValuesLine(line) {
  let s = line.trim();
  if (s.endsWith(',')) s = s.slice(0, -1);
  if (!s.startsWith('(') || !s.endsWith(')')) return null;
  s = s.slice(1, -1);
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    while (s[i] === ' ') i++;
    if (s[i] === "'") {
      let j = i + 1;
      let buf = '';
      while (j < s.length) {
        if (s[j] === "'" && s[j + 1] === "'") { buf += "'"; j += 2; continue; }
        if (s[j] === "'") break;
        buf += s[j];
        j++;
      }
      tokens.push(buf);
      i = j + 1;
      while (s[i] === ' ' || s[i] === ':') i++;
      if (s.startsWith('jsonb', i)) i += 5;
    } else if (s[i] === '(') {
      let depth = 1;
      let j = i + 1;
      while (j < s.length && depth > 0) {
        if (s[j] === '(') depth++;
        else if (s[j] === ')') depth--;
        j++;
      }
      tokens.push(s.slice(i, j));
      i = j;
    } else {
      let j = i;
      while (j < s.length && s[j] !== ',') j++;
      const raw = s.slice(i, j).trim();
      tokens.push(raw === 'null' ? null : raw);
      i = j;
    }
    while (s[i] === ' ' || s[i] === ',') i++;
  }
  return tokens;
}

const COST_FIELDS = [
  'harness_material_id', 'platform_no', 'source_excel_file', 'source_sheet_name', 'source_excel_path',
  'source_excel_url', 'customer_name', 'customer_part_no', 'material_cost', 'material_loss', 'labor_cost',
  'labor_loss', 'total_cost', 'tax_cost', 'sales_price', 'sample_price', 'quote_price',
  'formula_config', 'calculation_steps', 'bom_items', 'labor_items',
];
const JSON_FIELDS = new Set(['formula_config', 'calculation_steps', 'bom_items', 'labor_items']);
const NUM_FIELDS = new Set(['material_cost', 'material_loss', 'labor_cost', 'labor_loss', 'total_cost', 'tax_cost', 'sales_price', 'sample_price', 'quote_price']);

function parseSeedCostAnalyses(sql) {
  const map = new Map();
  for (const line of sql.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('((select id from public.finished_harness_materials')) continue;
    const tokens = splitSqlValuesLine(t);
    if (!tokens || tokens.length !== COST_FIELDS.length) continue;
    const rec = {};
    COST_FIELDS.forEach((f, i) => { rec[f] = tokens[i]; });
    map.set(rec.platform_no, rec);
  }
  return map;
}

function parseSeedMaterialCrmPrices(sql) {
  const map = new Map();
  for (const line of sql.split('\n')) {
    const t = line.trim();
    if (!t.startsWith("('")) continue;
    const tokens = splitSqlValuesLine(t);
    if (!tokens || tokens.length !== 10) continue;
    map.set(tokens[2], { source_material_id: tokens[0], crmPriceLow: tokens[9] });
  }
  return map;
}

function parseAllExcel(platformSet) {
  const excelDir = path.resolve('excel');
  const files = fs.readdirSync(excelDir).filter((f) => f.endsWith('.xlsx')).sort();
  const analyses = [];
  for (const fileName of files) {
    for (const item of parseCostWorkbook(path.join(excelDir, fileName))) {
      if (!platformSet.has(item.platformNo)) {
        platformSet.add(item.platformNo);
        analyses.push(item);
      } else {
        const altNo = `${item.platformNo}-${item.sourceSheetName.replace(/\s+/g, '')}`;
        if (!platformSet.has(altNo)) {
          item.platformNo = altNo;
          platformSet.add(altNo);
          analyses.push(item);
        }
      }
    }
  }
  return { files, analyses };
}

async function main() {
  const env = loadEnv();
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || 'https://wioaznspvchiogdxvtun.supabase.co';
  const problems = [];
  const notes = [];
  const addProblem = (section, msg) => problems.push(`[${section}] ${msg}`);

  const { files, analyses } = parseAllExcel(new Set());
  const byPlatform = new Map(analyses.map((a) => [a.platformNo, a]));

  const urlMap = new Map();
  for (let i = 0; i < files.length; i++) {
    const storagePath = toSafeStorageKey(files[i], i);
    urlMap.set(files[i], {
      storagePath,
      publicUrl: `${supabaseUrl}/storage/v1/object/public/cost-analysis-sources/${storagePath}`,
    });
  }

  const seedPath = path.resolve('supabase/sql/40_seed/06_finished_harness_cost_analyses.sql');
  const seedSql = fs.existsSync(seedPath) ? fs.readFileSync(seedPath, 'utf8') : '';
  const seedMap = parseSeedCostAnalyses(seedSql);
  for (const [platformNo, item] of byPlatform) {
    const seedRec = seedMap.get(platformNo);
    if (!seedRec) {
      addProblem('Seed', `${platformNo} 未出现在 06 seed 中（请执行 npm run supabase:export-cost-seed）`);
      continue;
    }
    const urlInfo = urlMap.get(item.sourceExcelFile);
    if ((seedRec.source_excel_path || null) !== (urlInfo?.storagePath || null)) {
      addProblem('Seed', `${platformNo} source_excel_path 与当前 storage key 不一致`);
    }
  }

  const pgPath = path.resolve('.tmp/db-runtime/node_modules/pg');
  if (!fs.existsSync(pgPath)) {
    throw new Error(`缺少数据库驱动：${pgPath}（请先准备 .tmp/db-runtime 运行时依赖）`);
  }
  const pg = require(pgPath);
  const client = new pg.Client({
    host: env.SUPABASE_DB_HOST,
    port: Number(env.SUPABASE_DB_PORT || 6543),
    user: env.SUPABASE_DB_USER,
    password: env.SUPABASE_DB_PASSWORD,
    database: env.SUPABASE_DB_NAME,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await client.connect();
  const dbCostRes = await client.query('select * from public.finished_harness_cost_analyses order by platform_no');
  const dbMatRes = await client.query(
    'select * from public.finished_harness_materials where platform_no in (select platform_no from public.finished_harness_cost_analyses)',
  );
  await client.end();

  const dbCostMap = new Map(dbCostRes.rows.map((r) => [r.platform_no, r]));
  const dbMatMap = new Map(dbMatRes.rows.map((r) => [r.platform_no, r]));

  for (const p of byPlatform.keys()) {
    if (!dbCostMap.has(p)) addProblem('覆盖', `Excel 有方案 ${p}，数据库缺失`);
  }
  for (const p of dbCostMap.keys()) {
    if (!byPlatform.has(p)) addProblem('覆盖', `数据库有方案 ${p}，Excel 中不存在`);
  }

  const wbCache = new Map();
  const getSheet = (file, sheetName) => {
    if (!wbCache.has(file)) wbCache.set(file, XLSX.readFile(path.join('excel', file), { cellFormula: true }));
    return wbCache.get(file).Sheets[sheetName];
  };

  const stats = { fields: 0, json: 0, steps: 0, bomRows: 0, laborRows: 0, rawCells: 0, crmRows: 0 };

  for (const [platformNo, item] of byPlatform) {
    const db = dbCostMap.get(platformNo);
    if (!db) continue;

    const urlInfo = urlMap.get(item.sourceExcelFile);
    const expected = {
      source_excel_file: item.sourceExcelFile,
      source_sheet_name: item.sourceSheetName,
      source_excel_path: urlInfo?.storagePath ?? null,
      source_excel_url: urlInfo?.publicUrl ?? null,
      customer_name: item.customerName || null,
      customer_part_no: item.customerPartNo || null,
      material_cost: item.materialCost,
      material_loss: item.materialLoss,
      labor_cost: item.laborCost,
      labor_loss: item.laborLoss,
      total_cost: item.totalCost,
      tax_cost: item.taxCost,
      sales_price: item.salesPrice,
      sample_price: item.samplePrice,
      quote_price: item.quotePrice,
    };
    for (const [field, expectedValue] of Object.entries(expected)) {
      stats.fields++;
      if (NUM_FIELDS.has(field)) {
        if (!close(expectedValue, db[field], 1e-9)) {
          addProblem('字段', `${platformNo} ${field}: 解析=${expectedValue} 数据库=${db[field]}`);
        }
      } else if ((expectedValue ?? null) !== (db[field] ?? null)) {
        addProblem('字段', `${platformNo} ${field}: 解析=${JSON.stringify(expectedValue)} 数据库=${JSON.stringify(db[field])}`);
      }
    }

    const jsonExpected = {
      formula_config: item.formulaConfig,
      calculation_steps: item.calculationSteps,
      bom_items: item.bomItems,
      labor_items: item.laborItems,
    };
    for (const [field, expectedValue] of Object.entries(jsonExpected)) {
      stats.json++;
      if (!sameJson(expectedValue, db[field])) addProblem('结构', `${platformNo} ${field} 与解析结果语义不一致`);
    }

    // 推导步骤内部数值自洽（缺失值允许为 null）
    for (const step of Array.isArray(db.calculation_steps) ? db.calculation_steps : []) {
      stats.steps++;
      const evaluated = evalExpr(step.expression);
      if (evaluated != null && num(step.result) != null && Math.abs(evaluated - num(step.result)) > 0.005) {
        addProblem('推导', `${platformNo} ${step.stepKey}: expression="${step.expression}"=${evaluated.toFixed(4)} result=${step.result}`);
      }
    }

    // 主表价格回填核查
    const mat = dbMatMap.get(platformNo);
    if (!mat) {
      addProblem('主表', `${platformNo} 缺少 finished_harness_materials 行`);
    } else {
      if (db.harness_material_id !== mat.id) addProblem('主表', `${platformNo} harness_material_id 关联错误`);
      if (!close(mat.total_cost, db.total_cost, 1e-9)) addProblem('主表', `${platformNo} total_cost=${mat.total_cost} 与成本分析 ${db.total_cost} 不一致`);
      if (!close(mat.sales_price, db.sales_price, 1e-9)) addProblem('主表', `${platformNo} sales_price=${mat.sales_price} 与成本分析 ${db.sales_price} 不一致`);
      if (!close(mat.sample_price, db.sample_price, 1e-9)) addProblem('主表', `${platformNo} sample_price=${mat.sample_price} 与成本分析 ${db.sample_price} 不一致`);
      if (!close(mat.quote_price, db.quote_price, 1e-9)) addProblem('主表', `${platformNo} quote_price=${mat.quote_price} 与成本分析 ${db.quote_price} 不一致`);
      if (mat.has_cost_analysis !== true) addProblem('主表', `${platformNo} has_cost_analysis 应为 true`);
    }

    // 原始 Excel 独立核对（数值/公式/缺失即 null/售价候选）
    const ws = getSheet(item.sourceExcelFile, item.sourceSheetName);
    if (!ws) {
      addProblem('原始表', `${platformNo} 无法打开 ${item.sourceExcelFile} / ${item.sourceSheetName}`);
      continue;
    }
    const pickByLabel = (labels) => {
      for (let r = 10; r <= 40; r++) {
        for (let c = 0; c <= 20; c++) {
          const v = text(ws, XLSX.utils.encode_col(c) + r);
          if (!v || isNote(v)) continue;
          if (labels.some((l) => v.includes(l))) {
            const addr = 'I' + r;
            const value = num(cellVal(ws, addr));
            if (value != null) return { value, addr, formula: cellFormula(ws, addr) || '' };
          }
        }
      }
      return null;
    };
    const rawCells = {
      material_cost: pickByLabel(['材料总价']),
      material_loss: pickByLabel(['材料损耗']),
      labor_cost: pickByLabel(['工时费用']),
      labor_loss: pickByLabel(['工时损耗']),
      total_cost: pickByLabel(['总成本']),
    };

    let taxLabel = null;
    outer: for (let r = 10; r <= 40; r++) {
      for (let c = 0; c <= 20; c++) {
        const v = text(ws, XLSX.utils.encode_col(c) + r);
        if (!v || isNote(v)) continue;
        if (v === '成本含税' || v.includes('含税成本')) {
          for (const col of ['K', 'M', 'I']) {
            for (const addr of [col + r, col + (r + 1)]) {
              const value = num(cellVal(ws, addr));
              if (value != null) { taxLabel = { value, addr, formula: cellFormula(ws, addr) || '' }; break outer; }
            }
          }
        }
      }
    }

    const totalFormula = rawCells.total_cost?.formula || '';
    const embeddedMatch = totalFormula.match(/\*\s*([0-9.]+)\s*$/);
    const embeddedMult = embeddedMatch ? parseFloat(embeddedMatch[1]) : 1;
    const usesEmbeddedTax = embeddedMult > 1 && embeddedMult < 2;
    const expectedTotal = usesEmbeddedTax
      ? round4(rawCells.total_cost.value / embeddedMult)
      : round4(rawCells.total_cost?.value);
    const expectedTotalFormula = usesEmbeddedTax
      ? totalFormula.replace(/\*\s*[0-9.]+\s*$/, '').trim()
      : totalFormula;
    const expectedTax = usesEmbeddedTax ? round4(rawCells.total_cost.value) : round4(taxLabel?.value);
    const expectedTaxFormula = usesEmbeddedTax ? totalFormula : (taxLabel?.formula || '');

    const rawChecks = [
      ['material_cost', 'materialCostFormula', rawCells.material_cost],
      ['material_loss', 'materialLossFormula', rawCells.material_loss],
      ['labor_cost', 'laborCostFormula', rawCells.labor_cost],
      ['labor_loss', 'laborLossFormula', rawCells.labor_loss],
    ];
    for (const [field, formulaField, raw] of rawChecks) {
      stats.rawCells++;
      if (!close(round4(raw?.value), db[field], 0.00011)) {
        addProblem('原始表', `${platformNo} ${field}: 原始单元格=${raw?.value} 数据库=${db[field]}`);
      }
      if ((item.formulaConfig[formulaField] || '') !== (raw?.formula || '')) {
        addProblem('原始表', `${platformNo} ${formulaField}: 解析="${item.formulaConfig[formulaField]}" 原始="${raw?.formula}"`);
      }
    }
    stats.rawCells++;
    if (!close(expectedTotal, db.total_cost, 0.00011)) {
      addProblem('原始表', `${platformNo} total_cost: 原始单元格推算=${expectedTotal} 数据库=${db.total_cost}`);
    }
    stats.rawCells++;
    if (!close(expectedTax, db.tax_cost, 0.00011)) {
      addProblem('原始表', `${platformNo} tax_cost: 原始表含税=${expectedTax} 数据库=${db.tax_cost}`);
    }
    if ((item.formulaConfig.totalCostFormula || '') !== expectedTotalFormula) {
      addProblem('原始表', `${platformNo} totalCostFormula: 预期="${expectedTotalFormula}" 实际="${item.formulaConfig.totalCostFormula}"`);
    }
    if ((item.formulaConfig.taxCostFormula || '') !== (expectedTaxFormula || '')) {
      addProblem('原始表', `${platformNo} taxCostFormula: 预期="${expectedTaxFormula}" 实际="${item.formulaConfig.taxCostFormula}"`);
    }

    const collectCandidates = (labels) => {
      const out = [];
      for (let r = 10; r <= 40; r++) {
        for (let c = 0; c <= 20; c++) {
          const v = text(ws, XLSX.utils.encode_col(c) + r);
          if (!labels.includes(v)) continue;
          const down = XLSX.utils.encode_col(c) + (r + 1);
          const right = XLSX.utils.encode_col(c + 1) + r;
          const addr = num(cellVal(ws, down)) != null ? down : num(cellVal(ws, right)) != null ? right : null;
          if (addr) out.push({ value: num(cellVal(ws, addr)), addr, formula: cellFormula(ws, addr) || '' });
        }
      }
      return out;
    };
    const checkPriceCandidate = (field, formulaField, labels) => {
      const actual = db[field];
      if (actual == null) return;
      const candidates = collectCandidates(labels);
      const hit = candidates.find((x) => close(x.value, actual, 0.00011));
      if (!hit) {
        addProblem('原始表', `${platformNo} ${field}=${actual} 不在原始表候选值 [${candidates.map((x) => x.value).join(', ')}] 中`);
      } else if ((db.formula_config?.[formulaField] || '') !== (hit.formula || '')) {
        addProblem('原始表', `${platformNo} ${field} 公式: 数据库="${db.formula_config?.[formulaField]}" 原始(${hit.addr})="${hit.formula}"`);
      }
    };
    checkPriceCandidate('sales_price', 'salesPriceFormula', ['售价', '最低售价']);
    checkPriceCandidate('sample_price', 'samplePriceFormula', ['样品价']);

    // BOM 明细逐行核对（缺失即 null）
    let bomStart = -1;
    for (let r = 1; r <= 15; r++) {
      if (text(ws, 'A' + r) === '序号' && text(ws, 'B' + r).includes('类型')) { bomStart = r + 1; break; }
    }
    const rawBom = [];
    if (bomStart > 0) {
      for (let r = bomStart; r <= 35; r++) {
        const aVal = text(ws, 'A' + r);
        const gVal = text(ws, 'G' + r);
        const hVal = text(ws, 'H' + r);
        if (hVal.includes('材料总价') || gVal.includes('材料总价') || hVal.includes('总成本') || aVal.includes('总成本')) break;
        const rowItem = {
          type: text(ws, 'B' + r) || null,
          spec: text(ws, 'D' + r) || null,
          brand: text(ws, 'C' + r) || null,
          qty: round4(cellVal(ws, 'F' + r)),
          unit: text(ws, 'G' + r) || null,
          unitPrice: round4(cellVal(ws, 'H' + r)),
          totalPrice: round4(cellVal(ws, 'I' + r)),
        };
        if (rowItem.type || rowItem.spec || rowItem.qty != null || rowItem.unitPrice != null) rawBom.push(rowItem);
      }
    }
    const dbBom = Array.isArray(db.bom_items) ? db.bom_items : [];
    if (rawBom.length !== dbBom.length) {
      addProblem('BOM', `${platformNo} 条数: 原始=${rawBom.length} 数据库=${dbBom.length}`);
    } else {
      for (let i = 0; i < rawBom.length; i++) {
        stats.bomRows++;
        for (const key of ['type', 'spec', 'brand', 'unit']) {
          if ((rawBom[i][key] ?? null) !== (dbBom[i][key] ?? null)) {
            addProblem('BOM', `${platformNo} 第${i + 1}行 ${key}: 原始=${JSON.stringify(rawBom[i][key])} 数据库=${JSON.stringify(dbBom[i][key])}`);
          }
        }
        for (const key of ['qty', 'unitPrice', 'totalPrice']) {
          if (!close(rawBom[i][key], dbBom[i][key], 0.00011)) {
            addProblem('BOM', `${platformNo} 第${i + 1}行 ${key}: 原始=${rawBom[i][key]} 数据库=${dbBom[i][key]}`);
          }
        }
      }
    }

    // 工序明细逐行核对（缺失即 null）
    let laborStart = -1;
    for (let r = (bomStart > 0 ? bomStart + 10 : 15); r <= 45; r++) {
      if (text(ws, 'A' + r) === '序号' && text(ws, 'C' + r).includes('工序')) { laborStart = r + 1; break; }
    }
    const rawLabor = [];
    if (laborStart > 0) {
      for (let r = laborStart; r <= 65; r++) {
        const name = text(ws, 'C' + r);
        const hVal = text(ws, 'H' + r);
        if (name.includes('计划总工时') || hVal.includes('合计') || name.includes('核准') || name.includes('审核')) break;
        if (!name) continue;
        rawLabor.push({
          name,
          ratePerPoint: round4(cellVal(ws, 'D' + r)),
          points: round4(cellVal(ws, 'H' + r)),
          cost: round4(cellVal(ws, 'I' + r)),
          note: text(ws, 'K' + r) || null,
        });
      }
    }
    const dbLabor = Array.isArray(db.labor_items) ? db.labor_items : [];
    if (rawLabor.length !== dbLabor.length) {
      addProblem('工序', `${platformNo} 条数: 原始=${rawLabor.length} 数据库=${dbLabor.length}`);
    } else {
      for (let i = 0; i < rawLabor.length; i++) {
        stats.laborRows++;
        if (rawLabor[i].name !== dbLabor[i].name || (rawLabor[i].note ?? null) !== (dbLabor[i].note ?? null)) {
          addProblem('工序', `${platformNo} 第${i + 1}行 名称/说明不一致`);
        }
        for (const key of ['ratePerPoint', 'points', 'cost']) {
          if (!close(rawLabor[i][key], dbLabor[i][key], 0.00011)) {
            addProblem('工序', `${platformNo} 第${i + 1}行 ${key}: 原始=${rawLabor[i][key]} 数据库=${dbLabor[i][key]}`);
          }
        }
      }
    }
  }

  // son_price_low 只读守卫：CRM 导入值必须原样保留
  const seed05Path = path.resolve('supabase/sql/40_seed/05_finished_harness_materials.sql');
  if (fs.existsSync(seed05Path)) {
    const crmPrices = parseSeedMaterialCrmPrices(fs.readFileSync(seed05Path, 'utf8'));
    for (const [platformNo, crm] of crmPrices) {
      const mat = dbMatMap.get(platformNo);
      if (!mat) continue;
      stats.crmRows++;
      if (!close(crm.crmPriceLow, mat.son_price_low, 1e-9)) {
        addProblem('CRM价格', `${platformNo} son_price_low: CRM导入=${crm.crmPriceLow} 数据库=${mat.son_price_low}`);
      }
    }
    notes.push(`CRM 导入价核对 ${stats.crmRows} 行（seed 05 中与成本方案关联的行）`);
  } else {
    notes.push('未找到 40_seed/05_finished_harness_materials.sql，跳过 CRM 导入价守卫');
  }

  console.log('================ 成本方案一致性核对 ================');
  console.log(`Excel 方案数: ${byPlatform.size}，数据库方案数: ${dbCostMap.size}`);
  console.log(`核对明细: 字段 ${stats.fields}、结构 ${stats.json}、推导步骤 ${stats.steps}、原始单元格 ${stats.rawCells}`);
  console.log(`明细行: BOM ${stats.bomRows}、工序 ${stats.laborRows}`);
  notes.forEach((n) => console.log(`说明: ${n}`));
  console.log('----------------------------------------------------');
  if (problems.length === 0) {
    console.log('结果: 全部一致，未发现差异。');
    return;
  }
  console.log(`结果: 发现 ${problems.length} 个问题`);
  problems.forEach((p) => console.log('  ' + p));
  process.exitCode = 1;
}

main().catch((err) => {
  console.error('核对脚本执行失败:', err);
  process.exit(1);
});

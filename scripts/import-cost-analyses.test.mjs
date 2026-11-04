import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import XLSX from 'xlsx';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  generateSeedSql,
  listExcelWorkbooks,
  parseCostWorkbook,
  resolvePriceDerivation,
} from './import-cost-analyses.mjs';
import { buildVersionedStoragePath, evaluateSourceRefState, resolveSeedSourceRefs, sha256File } from './lib/costAnalysisSync.mjs';

describe('Excel source precision', () => {
  it('keeps raw numbers and individual cell formats throughout the parsed analysis', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cost-precision-'));
    try {
      const ws = XLSX.utils.aoa_to_sheet([['BOM'], ['万连料号', 'WL-TEST']]);
      Object.assign(ws, {
        A4: { t: 's', v: '序号' }, B4: { t: 's', v: '类型' },
        B5: { t: 's', v: '导线' }, F5: { t: 'n', v: 1.2, z: '0.00' },
        H5: { t: 'n', v: 0.123456789, z: '0.000000' },
        I5: { t: 'n', v: 0.0000833333333333333, z: 'General' },
        H15: { t: 's', v: '材料总价' }, I15: { t: 'n', v: 0.1481481468, z: '0.000000' },
        H16: { t: 's', v: '工时费用' }, I16: { t: 'n', v: 1.2, z: '0.00' },
        H17: { t: 's', v: '总成本' }, I17: { t: 'n', v: 1.3481481468, z: '0.000000' },
        K17: { t: 's', v: '最低售价' }, K18: { t: 'n', v: 2.3, z: '0.00', f: 'I5+2.3' },
        M17: { t: 's', v: '报价3.400000' },
        A25: { t: 's', v: '序号' }, C25: { t: 's', v: '工序名称' },
        C26: { t: 's', v: '组装' }, D26: { t: 'n', v: 0.123456, z: '0.000000' },
        H26: { t: 'n', v: 1.2, z: '0.00' }, I26: { t: 'n', v: 1.2, z: '0.00' },
        C27: { t: 's', v: '计划总工时' }, '!ref': 'A1:M27',
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'WL-TEST');
      const file = path.join(dir, 'precision.xlsx');
      XLSX.writeFile(wb, file);
      const [item] = parseCostWorkbook(file);
      expect(item.totalCost).toBe(1.3481481468);
      expect(item.calculationSteps.find(s => s.stepKey === 'total_cost')).toMatchObject({ displayExpression: '1.348148' });
      expect(item.calculationSteps.find(s => s.stepKey === 'material_cost').displayExpression).toBe('0.000083(导线)');
      expect(item.calculationSteps.find(s => s.stepKey === 'sales_price').displayExpression).toBe('0.000083 + 2.3');
      expect(item.formulaConfig.numberFormats).toMatchObject({ total_cost: '0.000000', sales_price: '0.00', quote_price: '0.000000' });
      expect(item.bomItems[0]).toMatchObject({ unitPrice: 0.123456789, numberFormats: { qty: '0.00', unitPrice: '0.000000' } });
      expect(item.laborItems[0]).toMatchObject({ ratePerPoint: 0.123456, numberFormats: { ratePerPoint: '0.000000', points: '0.00' } });
      expect(item.calculationSteps.find(s => s.stepKey === 'total_cost')).toMatchObject({ result: 1.3481481468, numberFormat: '0.000000' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function resolveSeedBaseUrl() {
  const envPath = '.env';
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      if (key !== 'VITE_SUPABASE_URL' && key !== 'SUPABASE_URL') continue;
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value) return value;
    }
  }
  return 'https://wioaznspvchiogdxvtun.supabase.co';
}

describe('resolvePriceDerivation', () => {
  it('substitutes referenced cells and preserves trailing constants', () => {
    const result = resolvePriceDerivation(
      'K23/0.7+7',
      15.7989,
      19.1982,
      '含税总成本',
      {
        K23: { v: 8.53876744583333 },
      },
    );

    expect(result).toEqual({
      formula: '公式: K23/0.7+7 (目标毛利率 30%)',
      expression: '8.53876744583333 ÷ 0.7 + 7',
    });
  });

  it('substitutes multiple referenced cells in a formula', () => {
    const result = resolvePriceDerivation(
      'K21/0.7+K20',
      10.7908,
      14.0124,
      '含税总成本',
      {
        K20: { v: 2.646 },
        K21: { v: 7.95646744583333 },
      },
    );

    expect(result.expression).toBe('7.95646744583333 ÷ 0.7 + 2.646');
  });

  it('keeps range references untouched instead of corrupting SUM ranges', () => {
    const result = resolvePriceDerivation(
      'SUM(I5:I16)/0.7',
      15.7989,
      19.1982,
      '含税总成本',
      {
        I16: { v: 0.0006 },
        I5: { v: 10.5085 },
      },
    );

    expect(result.expression).toBe('SUM(I5:I16) ÷ 0.7');
  });

  it('does not fabricate a derivation when the sheet has no formula', () => {
    const result = resolvePriceDerivation('', 10.7908, 14.0124, '含税总成本');

    expect(result).toEqual({ formula: '源表未提供公式', expression: '14.0124' });
  });

  const workbookPath = 'excel/成本分析-WL-B21-499,500/成本分析-WL-B21-499,500.xlsx';
  it.skipIf(!existsSync(workbookPath))(
    'uses the source sheet values when parsing the affected workbooks',
    () => {
      const analyses = parseCostWorkbook(workbookPath);
      const byPlatform = new Map(analyses.map((item) => [item.platformNo, item]));

      expect(byPlatform.get('WL-B21-499-A').calculationSteps).toContainEqual(
        expect.objectContaining({
          stepKey: 'sales_price',
          expression: '8.53876744583333 ÷ 0.7 + 7',
          result: 19.1982392083333,
        }),
      );
      expect(byPlatform.get('WL-B21-500-A').calculationSteps).toContainEqual(
        expect.objectContaining({
          stepKey: 'sales_price',
          expression: '7.95646744583333 ÷ 0.7 + 2.646',
          result: 14.0123820654762,
        }),
      );
    },
  );
});

describe('tax embedded in total cost cell', () => {
  const workbookPath = 'excel/WL-B21-592 593 成本分析/WL-B21-592 593 成本分析.xlsx';
  it.skipIf(!existsSync(workbookPath))(
    'splits a tax-inclusive total cell into base total and tax cost',
    () => {
      const byPlatform = new Map(
        parseCostWorkbook(workbookPath).map((item) => [item.platformNo, item]),
      );
      const item = byPlatform.get('WL-B21-592');

      expect(item.totalCost).toBe(18.0055424458333);
      expect(item.taxCost).toBe(18.5457087192083);
      expect(item.formulaConfig.totalCostFormula).toBe('SUM(I11:I14)');
      expect(item.formulaConfig.taxCostFormula).toBe('SUM(I11:I14)*1.03');
      expect(item.calculationSteps).toContainEqual(
        expect.objectContaining({
          stepKey: 'total_cost',
          expression: '13.8010120833333 + 0.4140303625 + 3.61 + 0.1805',
          result: 18.0055424458333,
        }),
      );
      expect(item.calculationSteps).toContainEqual(
        expect.objectContaining({
          stepKey: 'tax_cost',
          expression: '18.0055424458333 × 1.03',
          result: 18.5457087192083,
        }),
      );
    },
  );

  const plainPath = 'excel/WL-B21-534-成本分析/WL-B21-534-成本分析.xlsx';
  it.skipIf(!existsSync(plainPath))(
    'keeps tax null when the sheet has no tax cell',
    () => {
      const byPlatform = new Map(
        parseCostWorkbook(plainPath).map((item) => [item.platformNo, item]),
      );
      const item = byPlatform.get('WL-B21-534');

      expect(item.formulaConfig.taxCostFormula).toBe('');
      expect(item.taxCost).toBeNull();
      expect(item.calculationSteps).toContainEqual(
        expect.objectContaining({
          stepKey: 'tax_cost',
          formula: '源表未提供公式',
          expression: '源表未提供含税成本',
          result: null,
        }),
      );
      expect(item.calculationSteps).toContainEqual(
        expect.objectContaining({
          stepKey: 'total_cost',
          expression: '28.0390120833333 + 0.8411703625 + 5.42 + 0.271',
          result: 34.5711824458333,
        }),
      );
    },
  );

  const zeroPath = 'excel/成本分析-WL-B21-126/成本分析-WL-B21-126.xlsx';
  it.skipIf(!existsSync(zeroPath))(
    'preserves explicit zero loss values and keeps missing tax as null',
    () => {
      const byPlatform = new Map(
        parseCostWorkbook(zeroPath).map((item) => [item.platformNo, item]),
      );
      const item = byPlatform.get('WL-B21-126');

      expect(item.materialLoss).toBe(0);
      expect(item.laborLoss).toBe(0);
      expect(item.taxCost).toBeNull();
      expect(item.calculationSteps).toContainEqual(
        expect.objectContaining({
          stepKey: 'material_loss',
          formula: '源表未提供公式',
          expression: '0',
          result: 0,
        }),
      );
    },
  );
});

describe('generated cost analysis seed', () => {
  it('stores the corrected substitution expressions for both affected harnesses', () => {
    const seed = readFileSync(
      'supabase/sql/40_seed/06_finished_harness_cost_analyses.sql',
      'utf8',
    );

    expect(seed).toContain('"expression":"8.53876744583333 ÷ 0.7 + 7"');
    expect(seed).toContain('"expression":"7.95646744583333 ÷ 0.7 + 2.646"');
    expect(seed).not.toContain('"expression":"15.7989 ÷ 0.7","result":19.1982');
  });

  it.skipIf(!existsSync('excel'))(
    'regenerates the committed seed exactly from the current excel directory',
    () => {
      const excelDir = 'excel';
      const files = listExcelWorkbooks(excelDir);
      const sourceFiles = files.map(({ fileName, filePath }) => ({
        fileName,
        filePath,
        bytes: Buffer.byteLength(readFileSync(filePath)),
        sha256: sha256File(filePath),
      }));
      const seen = new Set();
      const allAnalyses = [];
      for (const { filePath } of files) {
        for (const item of parseCostWorkbook(filePath)) {
          if (!seen.has(item.platformNo)) {
            seen.add(item.platformNo);
            allAnalyses.push(item);
          } else {
            const altNo = `${item.platformNo}-${item.sourceSheetName.replace(/\s+/g, '')}`;
            if (!seen.has(altNo)) {
              item.platformNo = altNo;
              seen.add(altNo);
              allAnalyses.push(item);
            }
          }
        }
      }

      const baseUrl = resolveSeedBaseUrl();
      const committed = readFileSync(
        'supabase/sql/40_seed/06_finished_harness_cost_analyses.sql',
        'utf8',
      ).replace(/\r\n/g, '\n');
      // 与脚本一致：本次未做存储存在性确认时保留既有种子里的来源定位。
      const { map: fileUrlMap } = resolveSeedSourceRefs(sourceFiles, baseUrl, new Set(), committed);

      const expected = generateSeedSql(allAnalyses, fileUrlMap);
      expect(committed).toBe(expected);
    },
  );

  it('uses the same content-hash storage path rule as the sync pipeline', () => {
    const fileName = '成本分析-WL-B21-777.xlsx';
    const contentHash = 'a'.repeat(64);
    const path = buildVersionedStoragePath(fileName, 0, contentHash);
    expect(path).toContain(contentHash.slice(0, 12));
    expect(path.startsWith('cost-analyses/01_')).toBe(true);

    const sourceFiles = [{ fileName, filePath: 'x', bytes: 1, sha256: contentHash }];
    const { map, stats } = resolveSeedSourceRefs(sourceFiles, 'https://example.test', new Set([fileName]), '');
    expect(stats).toEqual({ verified: 1, retained: 0, missing: 0 });
    expect(map.get(fileName)).toMatchObject({
      storagePath: path,
      publicUrl: `https://example.test/storage/v1/object/public/cost-analysis-sources/${path}`,
      verified: true,
    });
  });

  it('retains previous source references when the new object is not verified', () => {
    const sourceFiles = [{ fileName: 'source.xlsx', filePath: 'x', bytes: 1, sha256: 'b'.repeat(64) }];
    const previousSeedSql = [
      "  (select id from public.finished_harness_materials where platform_no = 'P1' limit 1), 'P1', 'source.xlsx', 'S1', 'cost-analyses/old-name.xlsx', 'https://old.test/cost-analyses/old-name.xlsx', null, null,",
    ].join('\n');

    const unverified = resolveSeedSourceRefs(sourceFiles, 'https://example.test', new Set(), previousSeedSql);
    expect(unverified.stats).toEqual({ verified: 0, retained: 1, missing: 0 });
    expect(unverified.map.get('source.xlsx')).toMatchObject({
      storagePath: 'cost-analyses/old-name.xlsx',
      publicUrl: 'https://old.test/cost-analyses/old-name.xlsx',
      verified: false,
      retained: true,
    });

    const noPrevious = resolveSeedSourceRefs(sourceFiles, 'https://example.test', new Set(), '');
    expect(noPrevious.stats).toEqual({ verified: 0, retained: 0, missing: 1 });
    expect(noPrevious.map.has('source.xlsx')).toBe(false);
    const seedSql = generateSeedSql([{
      platformNo: 'P1', productName: null, sourceExcelFile: 'source.xlsx', sourceSheetName: 'S1',
      customerName: null, customerPartNo: null, materialCost: 1, materialLoss: 0, laborCost: 2, laborLoss: 0,
      totalCost: 3, taxCost: null, salesPrice: 4, samplePrice: null, quotePrice: 4,
      formulaConfig: {}, calculationSteps: [], bomItems: [], laborItems: [],
    }], noPrevious.map);
    expect(seedSql).toContain("'source.xlsx', 'S1', null, null, null, null, 1,");
  });
});

describe('parser warnings', () => {
  it.skipIf(!existsSync('excel'))(
    'parses every workbook without unresolved structure warnings',
    () => {
      const excelDir = 'excel';
      const warnings = [];
      for (const { filePath } of listExcelWorkbooks(excelDir)) {
        parseCostWorkbook(filePath, {
          onWarning: (message) => warnings.push(message),
        });
      }

      expect(warnings).toEqual([]);
    },
  );
});

const SEED_SCHEMA_SQL = `
  create table public.finished_harness_materials (
    id uuid primary key default gen_random_uuid(),
    source_material_id bigint,
    platform_no text not null unique,
    son_name text,
    total_cost numeric,
    sales_price numeric,
    sample_price numeric,
    quote_price numeric,
    has_cost_analysis boolean not null default false,
    source_excel_url text,
    updated_at timestamptz not null default now()
  );
  create table public.finished_harness_cost_analyses (
    id uuid primary key default gen_random_uuid(),
    harness_material_id uuid references public.finished_harness_materials(id) on delete cascade,
    platform_no text not null unique,
    source_excel_file text not null,
    source_sheet_name text not null,
    source_excel_path text,
    source_excel_url text,
    customer_name text,
    customer_part_no text,
    material_cost numeric,
    material_loss numeric,
    labor_cost numeric,
    labor_loss numeric,
    total_cost numeric,
    tax_cost numeric,
    sales_price numeric,
    sample_price numeric,
    quote_price numeric,
    formula_config jsonb not null default '{}'::jsonb,
    calculation_steps jsonb not null default '[]'::jsonb,
    bom_items jsonb not null default '[]'::jsonb,
    labor_items jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now()
  );
`;

function seedAnalysis(platformNo, sourceExcelFile = 'source.xlsx') {
  return {
    platformNo,
    productName: '名称',
    sourceExcelFile,
    sourceSheetName: 'S1',
    customerName: null,
    customerPartNo: null,
    materialCost: 1,
    materialLoss: 0,
    laborCost: 2,
    laborLoss: 0,
    totalCost: 3,
    taxCost: null,
    salesPrice: 4,
    samplePrice: null,
    quotePrice: 4,
    formulaConfig: {},
    calculationSteps: [],
    bomItems: [],
    laborItems: [],
  };
}

describe('offline seed source references (isolated PGlite)', () => {
  let db;

  afterEach(async () => {
    await db?.close();
  });

  it('never overwrites newer references with retained legacy paths and replaces only when verified', async () => {
    db = new PGlite();
    await db.exec(SEED_SCHEMA_SQL);

    const analyses = [seedAnalysis('P1')];
    const retainedMap = new Map([['source.xlsx', {
      storagePath: 'cost-analyses/old-name.xlsx',
      publicUrl: 'https://old.test/old-name.xlsx',
      verified: false,
      retained: true,
    }]]);
    const verifiedMap = new Map([['source.xlsx', {
      storagePath: 'cost-analyses/01_newhash.xlsx',
      publicUrl: 'https://new.test/01_newhash.xlsx',
      verified: true,
    }]]);
    const offlineSeed = generateSeedSql(analyses, retainedMap);
    const verifiedSeed = generateSeedSql(analyses, verifiedMap);

    // 场景 A：数据库已有同步写入的较新地址；离线种子（仅历史定位）不得改回旧地址
    await db.exec(`
      insert into public.finished_harness_materials (platform_no, son_name, total_cost, source_excel_url)
        values ('P1', '新版', 1, 'https://new.test/01_newhash.xlsx');
      insert into public.finished_harness_cost_analyses
        (platform_no, source_excel_file, source_sheet_name, total_cost, source_excel_path, source_excel_url)
        values ('P1', 'source.xlsx', 'S1', 1, 'cost-analyses/01_newhash.xlsx', 'https://new.test/01_newhash.xlsx');
    `);
    await db.exec(offlineSeed);
    let costRow = (await db.query(
      'select source_excel_path, source_excel_url from public.finished_harness_cost_analyses where platform_no = $1',
      ['P1'],
    )).rows[0];
    let matRow = (await db.query(
      'select source_excel_url from public.finished_harness_materials where platform_no = $1',
      ['P1'],
    )).rows[0];
    expect(costRow).toEqual({
      source_excel_path: 'cost-analyses/01_newhash.xlsx',
      source_excel_url: 'https://new.test/01_newhash.xlsx',
    });
    expect(matRow.source_excel_url).toBe('https://new.test/01_newhash.xlsx');

    // 场景 B：已验证来源允许替换旧引用
    await db.exec(`
      update public.finished_harness_cost_analyses
        set source_excel_path = 'cost-analyses/legacy.xlsx', source_excel_url = 'https://old.test/legacy.xlsx'
        where platform_no = 'P1';
      update public.finished_harness_materials set source_excel_url = 'https://old.test/legacy.xlsx' where platform_no = 'P1';
    `);
    await db.exec(verifiedSeed);
    costRow = (await db.query(
      'select source_excel_path, source_excel_url from public.finished_harness_cost_analyses where platform_no = $1',
      ['P1'],
    )).rows[0];
    matRow = (await db.query(
      'select source_excel_url from public.finished_harness_materials where platform_no = $1',
      ['P1'],
    )).rows[0];
    expect(costRow).toEqual({
      source_excel_path: 'cost-analyses/01_newhash.xlsx',
      source_excel_url: 'https://new.test/01_newhash.xlsx',
    });
    expect(matRow.source_excel_url).toBe('https://new.test/01_newhash.xlsx');

    // 场景 C：新库空值由离线种子填补（历史定位只填补空值）
    await db.exec('delete from public.finished_harness_cost_analyses; delete from public.finished_harness_materials;');
    await db.exec(offlineSeed);
    costRow = (await db.query(
      'select source_excel_path, source_excel_url from public.finished_harness_cost_analyses where platform_no = $1',
      ['P1'],
    )).rows[0];
    matRow = (await db.query(
      'select source_excel_url from public.finished_harness_materials where platform_no = $1',
      ['P1'],
    )).rows[0];
    expect(costRow).toEqual({
      source_excel_path: 'cost-analyses/old-name.xlsx',
      source_excel_url: 'https://old.test/old-name.xlsx',
    });
    expect(matRow.source_excel_url).toBe('https://old.test/old-name.xlsx');
  });

  it('keeps a sync-written version path when the offline seed is re-run afterwards', async () => {
    db = new PGlite();
    await db.exec(SEED_SCHEMA_SQL);

    const analyses = [seedAnalysis('P1')];
    const retainedMap = new Map([['source.xlsx', {
      storagePath: 'cost-analyses/00_legacy.xlsx',
      publicUrl: 'https://old.test/00_legacy.xlsx',
      verified: false,
      retained: true,
    }]]);
    const offlineSeed = generateSeedSql(analyses, retainedMap);

    // 先执行离线种子（模拟历史数据），再模拟同步写入版本路径，最后再次执行旧离线种子
    await db.exec(offlineSeed);
    await db.exec(`
      update public.finished_harness_cost_analyses
        set source_excel_path = 'cost-analyses/01_syncedhash.xlsx', source_excel_url = 'https://new.test/01_syncedhash.xlsx'
        where platform_no = 'P1';
    `);
    await db.exec(offlineSeed);

    const costRow = (await db.query(
      'select source_excel_path, source_excel_url from public.finished_harness_cost_analyses where platform_no = $1',
      ['P1'],
    )).rows[0];
    expect(costRow).toEqual({
      source_excel_path: 'cost-analyses/01_syncedhash.xlsx',
      source_excel_url: 'https://new.test/01_syncedhash.xlsx',
    });
  });
});

describe('source reference state evaluation', () => {
  const candidate = { path: 'cost-analyses/01_new.xlsx', url: 'https://new.test/01_new.xlsx' };
  const retained = { storagePath: 'cost-analyses/00_old.xlsx', publicUrl: 'https://old.test/00_old.xlsx' };

  it('accepts a verified match and flags a missing object behind a version path', () => {
    expect(evaluateSourceRefState({
      dbPath: candidate.path, dbUrl: candidate.url,
      candidatePath: candidate.path, candidateUrl: candidate.url,
      retained, candidateExists: true,
    }).state).toBe('verified');
    expect(evaluateSourceRefState({
      dbPath: candidate.path, dbUrl: candidate.url,
      candidatePath: candidate.path, candidateUrl: candidate.url,
      retained, candidateExists: false,
    }).state).toBe('problem');
  });

  it('accepts a retained legacy reference only while the new object is unconfirmed', () => {
    expect(evaluateSourceRefState({
      dbPath: retained.storagePath, dbUrl: retained.publicUrl,
      candidatePath: candidate.path, candidateUrl: candidate.url,
      retained, candidateExists: false,
    }).state).toBe('retained');
    // 新对象已存在却仍引用旧定位 = 路径回退，必须报问题
    expect(evaluateSourceRefState({
      dbPath: retained.storagePath, dbUrl: retained.publicUrl,
      candidatePath: candidate.path, candidateUrl: candidate.url,
      retained, candidateExists: true,
    }).state).toBe('problem');
  });

  it('flags unknown references', () => {
    expect(evaluateSourceRefState({
      dbPath: 'cost-analyses/unknown.xlsx', dbUrl: 'https://x.test/unknown.xlsx',
      candidatePath: candidate.path, candidateUrl: candidate.url,
      retained, candidateExists: undefined,
    }).state).toBe('problem');
  });
});

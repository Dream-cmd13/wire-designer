import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import {
  applyCostAnalysisBatch,
  collectSourceFiles,
  readVerifiedSourceFile,
  uploadVersionedSource,
  commitCostAnalysisBatch,
  dedupeAnalysesByPlatformNo,
  validateCostAnalysisBatch,
} from './costAnalysisSync.mjs';

const SCHEMA_SQL = `
  create table public.finished_harness_materials (
    id uuid primary key default gen_random_uuid(),
    source_material_id bigint unique,
    source_goods_id bigint,
    platform_no text not null,
    son_name text,
    file_2d text,
    packing_way text,
    packing integer,
    son_unit text,
    son_price_low numeric(12,6),
    total_cost numeric,
    sales_price numeric,
    sample_price numeric,
    quote_price numeric,
    has_cost_analysis boolean not null default false,
    source_excel_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint finished_harness_materials_platform_no_key unique (platform_no)
  );

  create table public.finished_harness_cost_analyses (
    id uuid primary key default gen_random_uuid(),
    harness_material_id uuid references public.finished_harness_materials(id) on delete cascade,
    platform_no text not null,
    source_excel_file text not null,
    source_excel_path text,
    source_excel_url text,
    source_sheet_name text not null,
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
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint finished_harness_cost_analyses_platform_no_key unique (platform_no),
    constraint finished_cost_non_negative_check check (
      (material_cost is null or material_cost >= 0)
      and (material_loss is null or material_loss >= 0)
      and (labor_cost is null or labor_cost >= 0)
      and (labor_loss is null or labor_loss >= 0)
      and (total_cost is null or total_cost >= 0)
      and (tax_cost is null or tax_cost >= 0)
      and (sales_price is null or sales_price >= 0)
      and (sample_price is null or sample_price >= 0)
      and (quote_price is null or quote_price >= 0)
    )
  );
`;

function makeAnalysis(platformNo, overrides = {}) {
  return {
    platformNo,
    productName: null,
    sourceExcelFile: 'source.xlsx',
    sourceSheetName: platformNo,
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
    ...overrides,
  };
}

const urlMap = new Map([['source.xlsx', { storagePath: 'cost-analyses/v1/source.xlsx', publicUrl: 'https://example.test/cost-analyses/v1/source.xlsx', verified: true }]]);

describe('cost analysis sync (isolated PGlite)', () => {
  let db;

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(SCHEMA_SQL);
  });

  afterEach(async () => {
    await db.close();
  });

  it('keeps existing records that are absent from the parsed batch', async () => {
    await db.exec(`
      insert into public.finished_harness_materials (platform_no, son_name, total_cost, sales_price, has_cost_analysis)
        values ('KEEP-1', '保留一', 10, 12, true), ('KEEP-2', '保留二', 20, 24, true);
      insert into public.finished_harness_cost_analyses (platform_no, source_excel_file, source_sheet_name, total_cost, harness_material_id)
        select platform_no, 'legacy.xlsx', platform_no, total_cost, id from public.finished_harness_materials;
    `);

    const result = await applyCostAnalysisBatch(db, [makeAnalysis('KEEP-1', { productName: '保留一', totalCost: 11 })], urlMap);

    expect(result).toMatchObject({ createdCount: 0, updatedCount: 1 });
    const rows = await db.query('select platform_no, son_name, total_cost from public.finished_harness_materials order by platform_no');
    expect(rows.rows).toEqual([
      { platform_no: 'KEEP-1', son_name: '保留一', total_cost: '11' },
      { platform_no: 'KEEP-2', son_name: '保留二', total_cost: '20' },
    ]);
    const analyses = await db.query('select platform_no, source_excel_file from public.finished_harness_cost_analyses order by platform_no');
    expect(analyses.rows).toEqual([
      { platform_no: 'KEEP-1', source_excel_file: 'source.xlsx' },
      { platform_no: 'KEEP-2', source_excel_file: 'legacy.xlsx' },
    ]);
  });

  it('rolls back the whole batch when a later write fails', async () => {
    const batch = [
      makeAnalysis('ROLL-A'),
      makeAnalysis('ROLL-B', { totalCost: -1 }),
    ];
    await expect(applyCostAnalysisBatch(db, batch, urlMap)).rejects.toThrow(/non_negative|check/i);

    const materials = await db.query('select count(*)::int as count from public.finished_harness_materials');
    const analyses = await db.query('select count(*)::int as count from public.finished_harness_cost_analyses');
    expect(materials.rows[0].count).toBe(0);
    expect(analyses.rows[0].count).toBe(0);
  });

  it('is idempotent across repeated runs and reports created/updated plan', async () => {
    const batch = [makeAnalysis('IDEM-1'), makeAnalysis('IDEM-2')];
    const first = await applyCostAnalysisBatch(db, batch, urlMap);
    expect(first).toMatchObject({
      createdCount: 2,
      updatedCount: 0,
      createdPlatformNos: ['IDEM-1', 'IDEM-2'],
      updatedPlatformNos: [],
    });

    const second = await applyCostAnalysisBatch(db, batch, urlMap);
    expect(second).toMatchObject({ createdCount: 0, updatedCount: 2 });
    for (const table of ['finished_harness_materials', 'finished_harness_cost_analyses']) {
      const count = await db.query(`select count(*)::int as count from public.${table}`);
      expect(count.rows[0].count).toBe(2);
    }
  });

  it('preserves CRM fields, drawing binding and historical source references', async () => {
    await db.exec(`
      insert into public.finished_harness_materials
        (source_material_id, source_goods_id, platform_no, son_name, file_2d, packing_way, packing, son_unit, son_price_low,
         total_cost, sales_price, has_cost_analysis, source_excel_url)
        values (42, 7, 'CRM-1', 'CRM 名称', 'drawing.png', '纸箱', 3, '条', 5.500000, 10, 12, true, 'old.xlsx');
      insert into public.finished_harness_cost_analyses
        (harness_material_id, platform_no, source_excel_file, source_sheet_name, source_excel_path, source_excel_url, total_cost)
        select id, 'CRM-1', 'old-source.xlsx', 'CRM-1', 'cost-analyses/old.xlsx', 'old.xlsx', 10
        from public.finished_harness_materials where platform_no = 'CRM-1';
    `);

    await applyCostAnalysisBatch(db, [makeAnalysis('CRM-1', { totalCost: 33 })], urlMap);

    const material = (await db.query(
      'select * from public.finished_harness_materials where platform_no = $1',
      ['CRM-1'],
    )).rows[0];
    expect(material).toMatchObject({
      source_material_id: 42,
      source_goods_id: 7,
      son_name: 'CRM 名称',
      file_2d: 'drawing.png',
      packing_way: '纸箱',
      packing: 3,
      son_unit: '条',
      son_price_low: '5.500000',
      total_cost: '33',
      source_excel_url: 'https://example.test/cost-analyses/v1/source.xlsx',
    });

    const analysis = (await db.query(
      'select source_excel_path, source_excel_url, total_cost from public.finished_harness_cost_analyses where platform_no = $1',
      ['CRM-1'],
    )).rows[0];
    expect(analysis).toEqual({
      source_excel_path: 'cost-analyses/v1/source.xlsx',
      source_excel_url: 'https://example.test/cost-analyses/v1/source.xlsx',
      total_cost: '33',
    });

    await applyCostAnalysisBatch(db, [makeAnalysis('CRM-1', { totalCost: 34 })], new Map());
    const afterMissingUrl = (await db.query(
      'select source_excel_url from public.finished_harness_materials where platform_no = $1',
      ['CRM-1'],
    )).rows[0];
    expect(afterMissingUrl.source_excel_url).toBe('https://example.test/cost-analyses/v1/source.xlsx');
    const analysisAfter = (await db.query(
      'select source_excel_path, source_excel_url from public.finished_harness_cost_analyses where platform_no = $1',
      ['CRM-1'],
    )).rows[0];
    expect(analysisAfter).toEqual({
      source_excel_path: 'cost-analyses/v1/source.xlsx',
      source_excel_url: 'https://example.test/cost-analyses/v1/source.xlsx',
    });
  });

  it('keeps six-decimal precision, explicit zero and null values', async () => {
    const batch = [
      makeAnalysis('NUM-1', {
        totalCost: 0.1481481468,
        materialLoss: 0,
        laborLoss: 0,
        taxCost: null,
        samplePrice: null,
        quotePrice: 3.400000,
      }),
    ];
    await applyCostAnalysisBatch(db, batch, urlMap);

    const material = (await db.query(
      'select total_cost, sample_price, quote_price from public.finished_harness_materials where platform_no = $1',
      ['NUM-1'],
    )).rows[0];
    expect(material).toEqual({ total_cost: '0.1481481468', sample_price: null, quote_price: '3.4' });

    const analysis = (await db.query(
      'select total_cost, material_loss, labor_loss, tax_cost, sample_price from public.finished_harness_cost_analyses where platform_no = $1',
      ['NUM-1'],
    )).rows[0];
    expect(analysis).toEqual({
      total_cost: '0.1481481468',
      material_loss: '0',
      labor_loss: '0',
      tax_cost: null,
      sample_price: null,
    });
  });

  it('keeps the source reference when the candidate object is not verified', async () => {
    await applyCostAnalysisBatch(db, [makeAnalysis('REF-1', { totalCost: 11 })], urlMap);

    const verifiedRef = (await db.query(
      'select source_excel_path, source_excel_url from public.finished_harness_cost_analyses where platform_no = $1',
      ['REF-1'],
    )).rows[0];
    expect(verifiedRef).toEqual({
      source_excel_path: 'cost-analyses/v1/source.xlsx',
      source_excel_url: 'https://example.test/cost-analyses/v1/source.xlsx',
    });

    // “同步后再次导入”回归：来源内容变化后候选路径不同，但对象未确认存在，
    // 必须保留既有版本定位，不能改回旧的按文件名路径或不存在的地址。
    const unverifiedMap = new Map([['source.xlsx', {
      storagePath: 'cost-analyses/02_newhash.xlsx',
      publicUrl: 'https://example.test/cost-analyses/02_newhash.xlsx',
      verified: false,
    }]]);
    await applyCostAnalysisBatch(db, [makeAnalysis('REF-1', { totalCost: 12 })], unverifiedMap);
    const kept = (await db.query(
      'select source_excel_path, source_excel_url, total_cost from public.finished_harness_cost_analyses where platform_no = $1',
      ['REF-1'],
    )).rows[0];
    expect(kept).toEqual({
      source_excel_path: 'cost-analyses/v1/source.xlsx',
      source_excel_url: 'https://example.test/cost-analyses/v1/source.xlsx',
      total_cost: '12',
    });

    // 对象确认存在后才切换到统一版本路径
    const verifiedNew = new Map([['source.xlsx', {
      storagePath: 'cost-analyses/02_newhash.xlsx',
      publicUrl: 'https://example.test/cost-analyses/02_newhash.xlsx',
      verified: true,
    }]]);
    await applyCostAnalysisBatch(db, [makeAnalysis('REF-1', { totalCost: 13 })], verifiedNew);
    const switched = (await db.query(
      'select source_excel_path, source_excel_url from public.finished_harness_cost_analyses where platform_no = $1',
      ['REF-1'],
    )).rows[0];
    expect(switched).toEqual({
      source_excel_path: 'cost-analyses/02_newhash.xlsx',
      source_excel_url: 'https://example.test/cost-analyses/02_newhash.xlsx',
    });
  });

  it('keeps the auto-created name when the record is not from CRM', async () => {
    await applyCostAnalysisBatch(db, [makeAnalysis('AUTO-1', { productName: '首次名称' })], urlMap);
    await applyCostAnalysisBatch(db, [makeAnalysis('AUTO-1', { productName: '更新名称' })], urlMap);

    const material = (await db.query(
      'select son_name from public.finished_harness_materials where platform_no = $1',
      ['AUTO-1'],
    )).rows[0];
    expect(material.son_name).toBe('更新名称');
  });
});

describe('cost analysis batch validation', () => {
  const sourceFiles = [{ fileName: 'source.xlsx', filePath: 'source.xlsx', bytes: 10, sha256: 'a'.repeat(64) }];

  it('rejects parse failures, warnings, empty input and unknown source files', () => {
    expect(() => validateCostAnalysisBatch([makeAnalysis('V-1')], sourceFiles, ['bad.xlsx: 读取失败'], []))
      .toThrow(/读取\/解析失败/);
    expect(() => validateCostAnalysisBatch([makeAnalysis('V-1')], sourceFiles, [], ['source.xlsx [S1]: 缺少字段']))
      .toThrow(/结构不完整告警/);
    expect(() => validateCostAnalysisBatch([], sourceFiles, [], []))
      .toThrow(/未解析出任何成本方案/);
    expect(() => validateCostAnalysisBatch([], [], [], []))
      .toThrow(/未扫描到任何来源/);
    expect(() => validateCostAnalysisBatch(
      [makeAnalysis('V-1', { sourceExcelFile: 'other.xlsx' })],
      sourceFiles,
      [],
      [],
    )).toThrow(/不在本次扫描清单中/);
  });

  it('rejects duplicate platform numbers after disambiguation', () => {
    expect(() => validateCostAnalysisBatch(
      [makeAnalysis('V-1'), makeAnalysis('V-1', { sourceSheetName: 'S2' })],
      sourceFiles,
      [],
      [],
    )).toThrow(/料号重复/);
  });

  it('disambiguates the same platform number from different sheets and rejects true duplicates', () => {
    const deduped = dedupeAnalysesByPlatformNo([
      makeAnalysis('D-1', { sourceSheetName: 'S1' }),
      makeAnalysis('D-1', { sourceSheetName: 'S2' }),
      makeAnalysis('D-1', { sourceSheetName: 'S2' }),
    ].slice(0, 2));
    expect(deduped.map((item) => item.platformNo)).toEqual(['D-1', 'D-1-S2']);

    expect(() => dedupeAnalysesByPlatformNo([
      makeAnalysis('D-2', { sourceSheetName: 'S1' }),
      makeAnalysis('D-2', { sourceSheetName: 'S2' }),
      makeAnalysis('D-2', { sourceSheetName: 'S2' }),
    ])).toThrow(/料号重复且无法区分/);
  });
});


describe('immutable source upload and partial-save recovery', () => {
  let directory;
  let files;
  let bucket;
  let supabase;
  let dbClient;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-source-test-'));
    files = ['first.xlsx', 'second.xlsx'].map((fileName) => {
      const filePath = path.join(directory, fileName);
      fs.writeFileSync(filePath, `original-${fileName}`);
      return { fileName, filePath };
    });
    bucket = {
      upload: vi.fn().mockResolvedValue({ error: null }),
      download: vi.fn(),
      getPublicUrl: vi.fn((key) => ({ data: { publicUrl: `https://example.test/${key}` } })),
    };
    supabase = { storage: { from: vi.fn(() => bucket) } };
    dbClient = { connect: vi.fn().mockResolvedValue(), query: vi.fn().mockResolvedValue({ rows: [] }), end: vi.fn().mockResolvedValue() };
  });
  afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });

  it('rejects bytes changed after preflight before upload or parsing', () => {
    const [source] = collectSourceFiles(files);
    fs.writeFileSync(source.filePath, 'changed-after-preflight');
    expect(() => readVerifiedSourceFile(source)).toThrow(/变化/);
  });

  it('uses insert-only uploads and verifies duplicate object bytes before reuse', async () => {
    const buffer = Buffer.from('original');
    bucket.upload.mockResolvedValue({ error: { statusCode: '409', message: 'already exists' } });
    bucket.download.mockResolvedValue({ data: new Blob([buffer]), error: null });
    await uploadVersionedSource(bucket, 'hash.xlsx', buffer);
    expect(bucket.upload).toHaveBeenCalledWith('hash.xlsx', buffer, expect.objectContaining({ upsert: false }));
    expect(bucket.download).toHaveBeenCalledWith('hash.xlsx');
    bucket.download.mockResolvedValue({ data: new Blob(['different-content']), error: null });
    await expect(uploadVersionedSource(bucket, 'hash.xlsx', buffer)).rejects.toThrow(/不一致/);
  });

  it('does not claim a conflicting or unreadable object is verified', async () => {
    bucket.upload.mockResolvedValue({ error: { statusCode: '409', message: 'already exists' } });
    bucket.download.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await expect(uploadVersionedSource(bucket, 'hash.xlsx', Buffer.from('original'))).rejects.toThrow(/核验/);
  });

  it('aborts changed later files and reports earlier uploads without touching the database', async () => {
    const sources = collectSourceFiles(files);
    const report = vi.fn();
    bucket.upload.mockImplementation(async () => {
      fs.writeFileSync(files[1].filePath, 'saved-during-first-upload');
      return { error: null };
    });
    await expect(commitCostAnalysisBatch(supabase, dbClient, sources, [], report)).rejects.toThrow(/变化/);
    expect(bucket.upload).toHaveBeenCalledTimes(1);
    expect(dbClient.query).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith([expect.stringContaining(crypto.createHash('sha256').update('original-first.xlsx').digest('hex').slice(0, 12))]);
    expect(dbClient.end).toHaveBeenCalled();
  });

  it('reports the first uploaded object when a later upload fails', async () => {
    bucket.upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: 'offline' } });
    const report = vi.fn();
    await expect(commitCostAnalysisBatch(supabase, dbClient, collectSourceFiles(files), [], report)).rejects.toThrow(/offline/);
    expect(report).toHaveBeenCalledWith([expect.stringContaining('01_first_'), expect.stringContaining('02_second_')]);
    expect(dbClient.query).not.toHaveBeenCalled();
  });

  it('reports uploaded objects if database connection fails and closes the client', async () => {
    dbClient.connect.mockRejectedValue(new Error('database offline'));
    const report = vi.fn();
    await expect(commitCostAnalysisBatch(supabase, dbClient, collectSourceFiles(files), [], report)).rejects.toThrow(/database offline/);
    expect(report.mock.calls[0][0]).toHaveLength(2);
    expect(dbClient.end).toHaveBeenCalledTimes(1);
  });
});

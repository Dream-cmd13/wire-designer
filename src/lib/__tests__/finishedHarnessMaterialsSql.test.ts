import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync('supabase/sql/10_schema/05_finished_harness_materials.sql', 'utf8');
const costSchema = readFileSync('supabase/sql/10_schema/06_finished_harness_cost_analyses.sql', 'utf8');
const seed = readFileSync('supabase/sql/40_seed/05_finished_harness_materials.sql', 'utf8');
const resetSql = readFileSync('supabase/sql/00_reset/01_drop_all_tables.sql', 'utf8');
const readme = readFileSync('supabase/sql/README.md', 'utf8');

describe('finished harness material SQL', () => {
  it('keeps the table readable only by authenticated users', () => {
    expect(schema).toContain('revoke all on public.finished_harness_materials from anon, authenticated');
    expect(schema).toContain('grant select on public.finished_harness_materials to authenticated');
    expect(schema).toContain('for select to authenticated using (true)');
    expect(schema).not.toMatch(/grant select[^;]*\banon\b/i);
  });

  it('uses source material id for rerunnable seed upserts', () => {
    expect(seed).toContain('source_material_id');
    expect(seed).toContain('on conflict (source_material_id) do update');
    expect(seed).toContain('file_2d');
    expect(seed).toContain('delete from public.finished_harness_materials where file_2d is null');
  });

  it('secures cost analyses schema and extends material table columns', () => {
    expect(costSchema).toContain('create table if not exists public.finished_harness_cost_analyses');
    expect(costSchema).toContain('revoke all on public.finished_harness_cost_analyses from anon, authenticated');
    expect(costSchema).toContain('grant select on public.finished_harness_cost_analyses to authenticated');
    expect(costSchema).toContain('add column if not exists total_cost');
    expect(costSchema).toContain('add column if not exists sales_price');
    expect(costSchema).toContain('add column if not exists sample_price');
    expect(costSchema).toContain('add column if not exists quote_price');
    expect(costSchema).toContain('add column if not exists has_cost_analysis');
    expect(costSchema).toContain('add column if not exists source_excel_url');
  });

  it('drops cost analyses, materials and supplier tables in reset script', () => {
    expect(resetSql).toContain('drop table if exists public.finished_harness_cost_analyses cascade;');
    expect(resetSql).toContain('drop table if exists public.finished_harness_materials cascade;');
    expect(resetSql).toContain('drop table if exists public.suppliers cascade;');
  });

  it('includes 06_finished_harness_cost_analyses in README execution sequence', () => {
    expect(readme).toContain('10_schema/06_finished_harness_cost_analyses.sql');
  });
});


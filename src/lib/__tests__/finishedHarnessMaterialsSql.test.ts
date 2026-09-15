import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync('supabase/sql/10_schema/05_finished_harness_materials.sql', 'utf8');
const seed = readFileSync('supabase/sql/40_seed/05_finished_harness_materials.sql', 'utf8');

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
  });
});

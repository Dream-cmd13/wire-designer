import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('drawing workbench SQL resources', () => {
  it('defines canonical and upgrade tables with idempotent seed data', () => {
    const catalog = read('supabase/sql/10_schema/02_catalog.sql');
    const integrity = read('supabase/sql/10_schema/03_integrity.sql');
    const drawing = read('supabase/sql/10_schema/04_drawing_resources.sql');
    const reset = read('supabase/sql/00_reset/01_drop_all_tables.sql');
    const rls = read('supabase/sql/30_security/01_rls.sql');
    const upgrade = read('supabase/sql/50_upgrade/01_drawing_workbench_resources.sql');
    const seed = read('supabase/sql/40_seed/03_drawing_workbench_resources.sql');

    for (const value of ['model', 'accessory', 'packaging']) {
      expect(`${catalog}\n${upgrade}`).toContain(`'${value}'`);
    }
    for (const table of ['model_specs', 'accessory_specs', 'packaging_specs', 'wire_spec_cores']) {
      expect(`${catalog}\n${upgrade}`).toContain(`table if not exists public.${table}`);
    }
    expect(catalog).toContain('wire_type_id uuid references public.wire_types(id)');
    expect(catalog).toContain('wire_gauge_id uuid references public.wire_gauges(id)');
    expect(catalog).toContain('conductor_color_id uuid references public.wire_colors(id)');
    expect(catalog).toContain('jacket_color_id uuid references public.wire_colors(id)');
    expect(integrity).toContain('prevent_active_catalog_spec_delete');
    expect(integrity).toContain("'wire_spec_cores'");
    expect(reset).toContain('drop table if exists public.wire_spec_cores cascade;');
    expect(reset).toContain('drop table if exists public.drawing_template_versions cascade;');
    for (const table of ['drawing_templates', 'drawing_template_versions', 'drawing_common_phrases', 'drawing_icons']) {
      expect(`${drawing}\n${upgrade}`).toContain(`table if not exists public.${table}`);
    }
    expect(drawing).toContain('unique (template_id, version_no)');
    expect(seed).toContain('on conflict');
    expect(seed).toContain('begin;');
    expect(seed).toContain('commit;');
    expect(seed).toContain('UL1007');
    expect(seed).toContain('XH2.54');
    expect(rls).toContain("'public catalog items read'");
    expect(rls).toContain("'catalog assets public read'");
    expect(rls).toContain('catalog_item_images image');
    expect(rls).toContain('public wire spec cores read');
    expect(rls).toContain('image.storage_path = storage.objects.name');
    expect(upgrade).toContain("'public catalog items read', 'catalog_items'");
    expect(upgrade).toContain('to anon, authenticated');
    for (const value of ['model', 'accessory', 'packaging']) {
      expect(integrity).toContain(`enforce_catalog_spec_item_type('${value}')`);
      expect(`${integrity}\n${upgrade}`).toContain(`when '${value}' then exists`);
    }
  });
});

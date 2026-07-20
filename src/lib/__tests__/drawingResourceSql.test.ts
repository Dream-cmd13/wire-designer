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
    const legacyUpgrade = read('supabase/sql/50_upgrade/01_drawing_workbench_resources.sql');
    const upgrade = read('supabase/sql/50_upgrade/03_catalog_resource_main_tables.sql');
    const seed = read('supabase/sql/40_seed/03_drawing_workbench_resources.sql');
    const upgradeSql = `${legacyUpgrade}\n${upgrade}`;

    for (const value of ['model', 'accessory', 'packaging']) {
      expect(`${catalog}\n${upgradeSql}`).toContain(`'${value}'`);
    }
    for (const table of ['connectors', 'wires', 'protective_sleeves', 'overmolds', 'models', 'accessories', 'packagings']) {
      expect(catalog).toContain(`create table if not exists public.${table}`);
    }
    expect(catalog).toContain('pin_labels jsonb');
    expect(catalog).toContain('core_specs jsonb');
    expect(catalog).not.toContain('create table if not exists public.connector_pins');
    expect(catalog).not.toContain('create table if not exists public.wire_spec_cores');
    expect(catalog).toContain('wire_type_id uuid references public.wire_types(id)');
    expect(catalog).toContain('wire_gauge_id uuid references public.wire_gauges(id)');
    expect(catalog).toContain('conductor_color_id uuid references public.wire_colors(id)');
    expect(catalog).toContain('jacket_color_id uuid references public.wire_colors(id)');
    expect(integrity).toContain('prevent_active_catalog_spec_delete');
    expect(integrity).toContain("'connectors'");
    expect(integrity).not.toContain("'wire_spec_cores'");
    expect(reset).toContain('drop table if exists public.wire_spec_cores cascade;');
    expect(reset).toContain('drop table if exists public.drawing_template_versions cascade;');
    for (const table of ['drawing_templates', 'drawing_template_versions', 'drawing_common_phrases', 'drawing_icons']) {
      expect(`${drawing}\n${upgradeSql}`).toContain(`table if not exists public.${table}`);
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
    expect(rls).toContain('public wires read');
    expect(rls).not.toContain('public wire spec cores read');
    expect(rls).toContain('image.storage_path = storage.objects.name');
    expect(upgradeSql).toContain("'public catalog items read', 'catalog_items'");
    expect(upgradeSql).toContain('to anon, authenticated');
    expect(upgrade).toContain('drop table public.connector_pins cascade');
    expect(upgrade).toContain('drop table public.wire_spec_cores cascade');
    for (const value of ['model', 'accessory', 'packaging']) {
      expect(integrity).toContain(`enforce_catalog_spec_item_type('${value}')`);
      expect(`${integrity}\n${upgradeSql}`).toContain(`when '${value}' then exists`);
    }
  });
});

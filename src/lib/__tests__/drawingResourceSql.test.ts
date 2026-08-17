import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('drawing workbench SQL resources', () => {
  it('defines canonical and upgrade tables with idempotent seed data', () => {
    const catalog = read('supabase/sql/10_schema/02_catalog.sql');
    const integrity = read('supabase/sql/10_schema/03_integrity.sql');
    const drawing = read('supabase/sql/10_schema/04_drawing_resources.sql');
    const business = read('supabase/sql/10_schema/05_business_options.sql');
    const persistence = read('supabase/sql/10_schema/06_document_persistence.sql');
    const reset = read('supabase/sql/00_reset/01_drop_all_tables.sql');
    const rls = read('supabase/sql/30_security/01_rls.sql');
    const legacyUpgrade = read('supabase/sql/50_upgrade/01_drawing_workbench_resources.sql');
    const upgrade = read('supabase/sql/50_upgrade/03_catalog_resource_main_tables.sql');
    const businessUpgrade = read('supabase/sql/50_upgrade/04_frontend_business_data.sql');
    const resourceRenameUpgrade = read('supabase/sql/50_upgrade/05_resource_master_rename.sql');
    const sleeveUpgradePath = 'supabase/sql/50_upgrade/06_normalize_drawing_heat_shrink.sql';
    const sleeveUpgrade = existsSync(sleeveUpgradePath) ? read(sleeveUpgradePath) : '';
    const seed = read('supabase/sql/40_seed/03_drawing_workbench_resources.sql');
    const exampleSeed = read('supabase/sql/40_seed/01_example_catalog.sql');
    const businessSeed = read('supabase/sql/40_seed/05_business_options.sql');
    const catalogRepository = read('src/lib/catalogRepository.ts');
    const drawingCatalogRepository = read('src/lib/drawingCatalogRepository.ts');
    const upgradeSql = `${legacyUpgrade}\n${upgrade}\n${businessUpgrade}\n${resourceRenameUpgrade}`;

    for (const value of ['model', 'accessory', 'packaging']) {
      expect(`${catalog}\n${upgradeSql}`).toContain(`'${value}'`);
    }
    expect(catalog).toContain('create table if not exists public.resource_items');
    expect(catalog).toContain('create table if not exists public.resource_item_images');
    expect(catalog).toContain('resource_group text not null default \'\'');
    expect(catalog).not.toContain('create table if not exists public.catalog_categories');
    expect(catalog).not.toContain('category_id uuid');
    expect(catalog).not.toContain('catalog_item_id uuid primary key');
    expect(catalogRepository).toContain("from('resource_items')");
    expect(catalogRepository).toContain('resource_item_images(storage_path,is_primary,display_order)');
    expect(drawingCatalogRepository).toContain("this.rows('resource_items'");
    expect(drawingCatalogRepository).toContain('resource_group');
    expect(drawingCatalogRepository).toContain('wires(wire_kind)');
    expect(drawingCatalogRepository).not.toContain('wires(cable_type)');
    for (const table of ['connectors', 'wires', 'protective_sleeves', 'overmolds', 'models', 'accessories', 'packagings']) {
      expect(catalog).toContain(`create table if not exists public.${table}`);
    }
    expect(catalog).toContain('pin_labels jsonb');
    expect(catalog).toContain('wire_kind text not null');
    expect(catalog).toContain('awg numeric(8, 2) not null');
    expect(catalog).toContain('ul_number text');
    expect(catalog).toContain('core_colors jsonb not null');
    expect(catalog).toContain("wire_kind in ('electronic', 'jacketed')");
    expect(catalog).not.toContain('spool_length_m numeric');
    expect(catalog).not.toContain('wire_type_id uuid references public.wire_types(id)');
    expect(catalog).not.toContain('wire_gauge_id uuid references public.wire_gauges(id)');
    expect(catalog).not.toContain('conductor_color_id uuid references public.wire_colors(id)');
    expect(catalog).not.toContain('jacket_color_id uuid references public.wire_colors(id)');
    expect(catalog).not.toContain('cable_type text');
    expect(catalog).not.toContain('core_specs jsonb');
    expect(catalog).not.toContain('create table if not exists public.connector_pins');
    expect(catalog).not.toContain('create table if not exists public.wire_spec_cores');
    expect(integrity).toContain('wires_lookup_idx on public.wires (wire_kind, awg, core_count)');
    for (const table of ['lead_time_options', 'protection_options', 'pricing_rules', 'quantity_discount_rules']) {
      expect(business).toContain(`create table if not exists public.${table}`);
      expect(businessUpgrade).toContain(`create table if not exists public.${table}`);
      expect(rls).toContain(`public.${table}`);
      expect(reset).toContain(`drop table if exists public.${table} cascade;`);
    }
    for (const table of ['project_document_versions', 'drawing_documents', 'drawing_document_versions']) {
      expect(persistence).toContain(`create table if not exists public.${table}`);
      expect(businessUpgrade).toContain(`create table if not exists public.${table}`);
      expect(rls).toContain(`public.${table}`);
      expect(reset).toContain(`drop table if exists public.${table} cascade;`);
    }
    expect(integrity).toContain('prevent_version_mutation');
    expect(integrity).toContain('lead_time_options_active_code_key');
    expect(integrity).toContain('prevent_active_resource_spec_delete');
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
    expect(seed).toContain('wire_kind');
    expect(seed).toContain("'UL20276'");
    expect(exampleSeed).toContain("'UL2464'");
    expect(seed).toContain('XH2.54');
    expect(seed).toContain("'protective_sleeve', 'heat-shrink-6'");
    expect(seed).toContain('insert into public.protective_sleeves');
    expect(seed).not.toContain("'heat-shrink', 'Φ6mm 2:1'");
    expect(businessSeed).toContain('lead_time_options');
    expect(businessSeed).toContain('pricing_rules');
    expect(businessSeed).toContain('quantity_discount_rules');
    expect(businessSeed).toContain('on conflict');
    expect(rls).toContain("'public resource items read'");
    expect(rls).toContain("'catalog assets public read'");
    expect(rls).toContain('resource_item_images image');
    expect(rls).toContain('public wires read');
    expect(rls).not.toContain('public wire spec cores read');
    expect(rls).toContain('image.storage_path = storage.objects.name');
    expect(resourceRenameUpgrade).toContain('public.catalog_items');
    expect(resourceRenameUpgrade).toContain('public.resource_items');
    expect(resourceRenameUpgrade).toContain('drop table if exists public.catalog_categories');
    expect(upgradeSql).toContain('to anon, authenticated');
    expect(upgrade).toContain('drop table public.connector_pins cascade');
    expect(upgrade).toContain('drop table public.wire_spec_cores cascade');
    expect(existsSync(sleeveUpgradePath)).toBe(true);
    expect(sleeveUpgrade).toContain("legacy_key = 'heat-shrink-6'");
    expect(sleeveUpgrade).toContain('delete from public.accessories');
    expect(sleeveUpgrade).toContain("resource_type = 'protective_sleeve'");
    expect(sleeveUpgrade).toContain('insert into public.protective_sleeves');
    expect(sleeveUpgrade).toContain('begin;');
    expect(sleeveUpgrade).toContain('commit;');
    for (const value of ['model', 'accessory', 'packaging']) {
      expect(integrity).toContain(`enforce_resource_spec_item_type('${value}')`);
      expect(`${integrity}\n${upgradeSql}`).toContain(`when '${value}' then exists`);
    }
  });
});

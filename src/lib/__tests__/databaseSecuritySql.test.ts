import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const coreSql = read('supabase/sql/10_schema/01_core.sql');
const rlsSql = read('supabase/sql/30_security/01_rls.sql');
const suppliersSql = read('supabase/sql/10_schema/04_suppliers.sql');
const storageSql = read('supabase/sql/20_storage/01_buckets.sql');
const resetSql = read('supabase/sql/00_reset/01_drop_all_tables.sql');

describe('minimal database security', () => {
  it('uses auth.users directly and exposes only the required table policies', () => {
    expect(coreSql.match(/references auth\.users\(id\) on delete cascade/g)).toHaveLength(2);
    expect(rlsSql).toContain('create policy "projects owner access"');
    expect(rlsSql).toContain('create policy "drawings owner access"');
    expect(rlsSql).toContain('create policy "catalog authenticated read"');
    expect(rlsSql).toContain('create policy "catalog accessory insert"');
    expect(rlsSql).not.toContain('is_catalog_admin');
    expect(rlsSql).not.toContain('public."user"');
    expect(rlsSql).not.toContain('pg_temp');
  });

  it('denies anonymous access to catalog items and suppliers', () => {
    expect(rlsSql).toContain('grant select on public.catalog_items to authenticated;');
    expect(rlsSql).not.toMatch(/grant [^;]*\bcatalog_items\b[^;]*\banon\b/i);
    expect(rlsSql).not.toMatch(/on public\.catalog_items[^;]*to anon/i);
    expect(rlsSql).not.toContain('create policy "catalog public read"');

    expect(suppliersSql).toContain('grant select on public.suppliers to authenticated;');
    expect(suppliersSql).not.toMatch(/grant [^;]*\bsuppliers\b[^;]*\banon\b/i);
    expect(suppliersSql).not.toMatch(/on public\.suppliers[^;]*to anon/i);
  });

  it('authorizes private catalog images through catalog_items.image_path', () => {
    expect(rlsSql).toContain("bucket_id = 'catalog-assets'");
    expect(rlsSql).toContain('item.image_path = storage.objects.name');
    expect(rlsSql).toContain('jsonb_each_text(item.image_variants)');
    expect(rlsSql).toContain('create policy "cost analysis sources authenticated read"');
    expect(rlsSql).not.toContain('on storage.objects for select to anon');
    expect(rlsSql).not.toContain('resource_item_images');
    expect(rlsSql).not.toContain('project-assets');
  });

  it('keeps finished harness drawings in a private bucket readable only by authenticated users', () => {
    expect(rlsSql).toContain('create policy "finished harness drawings authenticated read"');
    expect(rlsSql).toMatch(/bucket_id = 'finished-harness-drawings'/);
    expect(rlsSql).not.toMatch(/on storage\.objects[^;]*finished-harness-drawings[^;]*to anon/i);
    expect(storageSql).toContain("values ('finished-harness-drawings', 'finished-harness-drawings', false)");
    expect(storageSql).not.toContain("values ('finished-harness-drawings', 'finished-harness-drawings', true)");
  });

  it('bootstraps only catalog-assets and leaves Storage deletion to the API', () => {
    expect(storageSql).toContain("values ('catalog-assets'::text)");
    expect(storageSql).not.toContain('project-assets');
    expect(resetSql).not.toMatch(/delete\s+from\s+storage\.(objects|buckets)/i);
  });
});

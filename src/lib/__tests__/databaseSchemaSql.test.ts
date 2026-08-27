import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const core = read('supabase/sql/10_schema/01_core.sql');
const catalog = read('supabase/sql/10_schema/02_catalog.sql');
const schema = `${core}\n${catalog}`;
const seed = read('supabase/sql/40_seed/01_catalog_items.sql');

function columns(sql: string, table: string): string[] {
  const match = sql.match(new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`, 'i'));
  if (!match) throw new Error(`missing table ${table}`);
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[a-z][a-z0-9_]*\s/i.test(line))
    .filter((line) => !/^(constraint|primary|foreign|unique|check)\b/i.test(line))
    .map((line) => line.match(/^([a-z][a-z0-9_]*)/i)?.[1] ?? '');
}

describe('minimal database schema', () => {
  it('defines only the three application tables with 23 columns', () => {
    const names = [...schema.matchAll(/create table(?: if not exists)? public\.([a-z_]+)/gi)]
      .map((match) => match[1]);
    expect(names).toEqual(['projects', 'drawings', 'catalog_items']);
    expect(columns(core, 'projects')).toEqual([
      'id', 'owner_id', 'name', 'description', 'config', 'created_at', 'updated_at',
    ]);
    expect(columns(core, 'drawings')).toEqual([
      'id', 'owner_id', 'document', 'updated_at',
    ]);
    expect(columns(catalog, 'catalog_items')).toEqual([
      'id', 'kind', 'code', 'name', 'model', 'manufacturer', 'resource_group',
      'description', 'image_path', 'image_variants', 'sort_order', 'spec',
    ]);
  });

  it('keeps JSON documents and removes database history fields', () => {
    expect(core).toContain('config jsonb not null');
    expect(core).toContain('document jsonb not null');
    expect(schema).not.toMatch(
      /\b(deleted_at|deleted_by|created_by|updated_by|schema_version|revision)\b/,
    );
  });

  it('seeds exactly 49 unified catalog items with the expected distribution', () => {
    const kinds = [...seed.matchAll(
      /\(\s*'[0-9a-f-]{36}'\s*,\s*'(connector|wire|protective_sleeve|overmold|model|accessory|packaging)'\s*,/gi,
    )].map((match) => match[1]);
    expect(kinds).toHaveLength(49);
    expect(
      kinds.reduce<Record<string, number>>((counts, kind) => {
        counts[kind] = (counts[kind] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({
      connector: 37,
      wire: 3,
      protective_sleeve: 2,
      overmold: 4,
      model: 1,
      accessory: 1,
      packaging: 1,
    });
    expect(
      [...seed.matchAll(/insert into public\.([a-z_]+)/gi)].map((match) => match[1]),
    ).toEqual(['catalog_items']);
    expect(seed).toContain('demo-m12-4pin');
    expect(seed).toContain('xh254-4p-f');
    expect(seed).toContain('jst-xh-2');
    expect(seed).toContain('pvc-45p-pe');
    expect(seed).toContain('pvc-45p-bent');
    expect(seed).toContain('tpe-straight');
    expect(seed).toContain('tpe-bent');
    expect(seed).toContain('coil-bag');
    expect(seed).toContain('on conflict (kind, code)');
  });

  it('enforces the final overmold contract and one shared outer image', () => {
    expect(catalog).toContain("spec->>'outerMaterial' in ('黑色PVC', '黑色TPE')");
    expect(catalog).toContain("spec->>'outerForm' in ('straight', 'bent')");
    expect(catalog).toContain("spec->>'outerHardness' = '45P'");
    expect(catalog).toContain("spec->>'innerMaterial' = '低密度透明PE'");
    expect(catalog).toContain("spec->>'innerForm' = spec->>'outerForm'");
    expect(catalog).toContain("not (spec ? 'innerMaterialOptional')");
    expect(catalog).toContain(') is true');

    const sharedImagePath = 'catalog/overmold/40000000-0000-4000-8000-000000000201/overmold.png';
    expect(seed.split(sharedImagePath)).toHaveLength(5);
    expect(seed).not.toContain('demo-pvc-overmold');
    expect(seed).not.toContain('innerMaterialOptional');
  });
});

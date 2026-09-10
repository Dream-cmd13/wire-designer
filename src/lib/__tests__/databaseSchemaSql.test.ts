import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCatalogItemRow } from '@/lib/catalogItem';

const read = (path: string) => readFileSync(path, 'utf8');
const core = read('supabase/sql/10_schema/01_core.sql');
const catalog = read('supabase/sql/10_schema/02_catalog.sql');
const priceSchema = read('supabase/sql/10_schema/03_material_prices.sql');
const schema = `${core}\n${catalog}\n${priceSchema}`;
const seed = read('supabase/sql/40_seed/01_catalog_items.sql');
const realSeed = read('supabase/sql/40_seed/02_real_harness_catalog.sql');

function realSeedCatalogRows(sql: string): unknown[] {
  return [...sql.matchAll(
    /\(\s*'([0-9a-f-]{36})'\s*,\s*'(connector|wire)'\s*,\s*'([^']+)'[\s\S]*?,\s*'(\{"(?:connectorType|kind)"[\s\S]*?\})'::jsonb\s*\)/gi,
  )].map((match) => ({
    id: match[1],
    kind: match[2],
    code: match[3],
    name: match[3],
    model: match[3],
    manufacturer: '',
    resource_group: '',
    description: '',
    image_path: null,
    image_variants: {},
    sort_order: 0,
    spec: JSON.parse(match[4]),
  }));
}

function columns(sql: string, table: string): string[] {
  const match = sql.match(new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`, 'i'));
  if (!match) throw new Error(`missing table ${table}`);
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[a-z][a-z0-9_]*\s/i.test(line))
    .filter((line) => !/^(constraint|primary|foreign|unique|check|not|and|or)\b/i.test(line))
    .map((line) => line.match(/^([a-z][a-z0-9_]*)/i)?.[1] ?? '');
}

describe('minimal database schema', () => {
  it('defines project, drawing, catalog and shared price tables', () => {
    const names = [...schema.matchAll(/create table(?: if not exists)? public\.([a-z_]+)/gi)]
      .map((match) => match[1]);
    expect(names).toEqual(['projects', 'drawings', 'catalog_items', 'material_prices']);
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

  it('seeds the baseline catalog with the expected distribution', () => {
    const kinds = [...seed.matchAll(
      /\(\s*'[0-9a-f-]{36}'\s*,\s*'(connector|wire|protective_sleeve|overmold|model|accessory|packaging)'\s*,/gi,
    )].map((match) => match[1]);
    expect(kinds).toHaveLength(2);
    expect(
      kinds.reduce<Record<string, number>>((counts, kind) => {
        counts[kind] = (counts[kind] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({
      overmold: 2,
    });
    expect(
      [...seed.matchAll(/insert into public\.([a-z_]+)/gi)].map((match) => match[1]),
    ).toEqual(['catalog_items']);
    expect(seed).not.toContain('demo-m12-4pin');
    expect(seed).not.toContain('xh254-4p-f');
    expect(seed).not.toContain('jst-xh-2');
    expect(seed).toContain('pvc-45p-pe');
    expect(seed).toContain('pvc-45p-bent');
    expect(seed).not.toContain('tpe-straight');
    expect(seed).not.toContain('tpe-bent');
    expect(seed).not.toContain('coil-bag');
    expect(seed).toContain('on conflict (kind, code)');
  });

  it('keeps the real Excel catalog in a separate idempotent seed', () => {
    const connectorCodes = [...realSeed.matchAll(/\(\s*'[0-9a-f-]{36}'\s*,\s*'connector'\s*,\s*'([^']+)'/gi)]
      .map((match) => match[1]);
    const wireCodes = [...realSeed.matchAll(/\(\s*'[0-9a-f-]{36}'\s*,\s*'wire'\s*,\s*'([^']+)'/gi)]
      .map((match) => match[1]);
    expect(connectorCodes).toHaveLength(12);
    expect(wireCodes).toHaveLength(10);
    expect(realSeed).toContain('conductorAreaMm2');
    expect(realSeed).not.toContain('image_variants = excluded.image_variants');
    expect(realSeed).toContain('M12A04-07-093');
    expect(realSeed).toContain('WL-HTX-PVC-033');
    expect(realSeed).toContain('WL-HTX-PVC-034');
    expect(realSeed).toContain('65%');
    expect(realSeed).toContain('on conflict (kind, code)');
    expect(seed).not.toContain("'m12a04-07-093'");
  });

  it('parses every real connector and wire seed row through the catalog contract', () => {
    const rows = realSeedCatalogRows(realSeed);
    expect(rows).toHaveLength(22);
    expect(rows.filter((row) => (row as { kind: string }).kind === 'connector')).toHaveLength(12);
    expect(rows.filter((row) => (row as { kind: string }).kind === 'wire')).toHaveLength(10);
    rows.forEach((row) => expect(() => parseCatalogItemRow(row)).not.toThrow());
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
    expect(seed.split(sharedImagePath)).toHaveLength(3);
    expect(seed).not.toContain('demo-pvc-overmold');
    expect(seed).not.toContain('innerMaterialOptional');
  });

  it('enforces valid connector and wire engineering ranges', () => {
    expect(catalog).toContain("(spec->>'pinCount')::numeric = trunc((spec->>'pinCount')::numeric)");
    expect(catalog).toContain("(spec->>'matingCyclesMin')::numeric = trunc((spec->>'matingCyclesMin')::numeric)");
    expect(catalog).toContain("(spec->'temperatureRangeC'->>'min')::numeric <= (spec->'temperatureRangeC'->>'max')::numeric");
    for (const field of [
      'ingressProtection', 'flammabilityRating', 'flameTest', 'conductorMaterial',
      'conductorStructure', 'insulationMaterial', 'insulationDiameterMm',
      'insulationDiameterToleranceMm', 'braidStructure', 'braidStructureDescription',
      'shieldCoverageDescription', 'jacketHardnessP', 'tensileStrengthPsi',
      'elongationPercent', 'conductorResistanceOhmPerKmAt20C',
      'insulationResistanceMOhmKm', 'coreColorDescription',
    ]) {
      expect(catalog).toContain(`spec ? '${field}'`);
    }
  });
});

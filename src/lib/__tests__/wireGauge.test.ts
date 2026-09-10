import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseCatalogItemRow } from '@/lib/catalogItem';
import { applyCatalogWireSpec, generateWireDefaultName, parseCatalogWireSpec } from '@/lib/wireCatalog';
import { formatWireGauge, geometryAwg, isValidWireGauge } from '@/lib/wireGauge';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';
import { parseHarnessConfig } from '@/lib/harnessConfigSchema';
import { getQuoteMaterials, materialPriceKey } from '@/lib/quoteMaterials';
import { createPriceTemplate, parsePriceWorkbook } from '@/lib/priceImport';
import { formatWireBomSpecification } from '@/lib/bom';

const base = { kind: 'jacketed' as const, conductorAreaMm2: 0.2, coreCount: 8,
  jacketMaterial: 'PVC' as const, jacketColor: 'black' as const, shielded: true,
  coreColors: ['白色', '棕色', '绿色', '黄色', '灰色', '紫色', '蓝色', '红色'] };

describe('area-based wire specifications', () => {
  it('validates one positive gauge unit and uses area only for geometry', () => {
    expect(isValidWireGauge(base)).toBe(true);
    for (const gauge of [{}, { awg: 22, conductorAreaMm2: 0.3 }, { conductorAreaMm2: 0 }, { conductorAreaMm2: NaN }]) {
      expect(isValidWireGauge(gauge)).toBe(false);
    }
    expect(formatWireGauge(base)).toBe('0.2mm²');
    expect(geometryAwg(base)).toBeCloseTo(24.10, 2);
    expect(base).not.toHaveProperty('awg');
  });

  it('loads a database row without inventing AWG and rejects ambiguous units', () => {
    const row = { id: 'wire', kind: 'wire', code: 'area-wire', name: '真实线材', model: 'area-wire',
      manufacturer: '', resource_group: '', description: '', sort_order: 0,
      image_path: null, image_variants: {}, spec: base };
    expect(parseCatalogItemRow(row).spec).toMatchObject(base);
    expect(() => parseCatalogItemRow({ ...row, spec: { ...base, awg: 24 } })).toThrow();
  });

  it('retains area through canvas save, BOM and price import, keeping gauges distinct', () => {
    const catalogSpec = parseCatalogWireSpec({ wire_kind: 'jacketed', conductor_area_mm2: 0.2,
      core_count: 8, jacket_material: 'PVC', jacket_color: 'black', is_shielded: true,
      core_colors: base.coreColors, outer_diameter_mm: 5.8 });
    const config = createFallbackConfig();
    const spec = applyCatalogWireSpec({ kind: 'electronic', awg: 24, color: 'red', ulNumber: '1007', lengthMm: 500,
      endTreatment: { start: { stripped: false, termination: 'none' }, end: { stripped: false, termination: 'none' } } }, catalogSpec);
    const material = { id: 'material', resourceItemId: 'wire', name: '真实线材', position: { x: 0, y: 0 }, width: 200, circuits: [], spec };
    config.materials = [material];
    expect(generateWireDefaultName(spec)).toContain('0.2mm²');
    expect(formatWireBomSpecification(material, null)).toContain('0.2mm²');
    const restored = parseHarnessConfig(JSON.parse(JSON.stringify(config)));
    expect(restored.success).toBe(true);
    if (!restored.success) throw new Error('Save failed');
    expect(restored.data.materials[0].spec).toMatchObject({ conductorAreaMm2: 0.2, odMm: 5.8 });
    expect(restored.data.materials[0].spec.awg).toBeUndefined();
    const materials = getQuoteMaterials(config, null);
    const price = { ...materials[0], taxIncludedPrice: '1.2345' };
    const data = XLSX.write(createPriceTemplate(materials, [price]), { type: 'array', bookType: 'xlsx' });
    expect(parsePriceWorkbook(data, materials)[0]).toMatchObject(price);
    if (spec.kind !== 'jacketed') throw new Error('Expected jacketed wire');
    spec.conductorAreaMm2 = 0.3;
    expect(materialPriceKey(getQuoteMaterials(config, null)[0])).not.toBe(materialPriceKey(price));
    spec.awg = 22;
    expect(parseHarnessConfig(config).success).toBe(false);
  });
});

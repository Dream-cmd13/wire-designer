import { describe, expect, it } from 'vitest';
import {
  applyCatalogWireSpec,
  findMatchingCatalogWire,
  generateWireDefaultName,
  parseCatalogWireSpec,
  WireCatalogError,
} from '@/lib/wireCatalog';

const endTreatment = {
  start: { stripped: true, stripLengthMm: 4, termination: 'tinned' as const },
  end: { stripped: false, termination: 'none' as const },
};

describe('wire catalog adapters', () => {
  it('parses an electronic catalog row', () => {
    expect(parseCatalogWireSpec({
      wire_kind: 'electronic', awg: 24, ul_number: '1007', conductor_color: 'red',
      jacket_material: null, jacket_color: null, core_count: null,
      is_shielded: false, core_colors: [],
    })).toEqual({ kind: 'electronic', awg: 24, ulNumber: '1007', color: 'red' });
  });

  it('parses a jacketed catalog row and preserves ordered core colors', () => {
    expect(parseCatalogWireSpec({
      wire_kind: 'jacketed', awg: 26, ul_number: 'UL20276', conductor_color: null,
      jacket_material: 'PVC', jacket_color: 'black', core_count: 2,
      is_shielded: true, core_colors: ['red', 'black'],
    })).toEqual({
      kind: 'jacketed', awg: 26, ulNumber: 'UL20276', jacketMaterial: 'PVC',
      jacketColor: 'black', coreCount: 2, shielded: true, coreColors: ['red', 'black'],
    });
  });

  it('parses engineering fields without normalizing away source descriptions', () => {
    expect(parseCatalogWireSpec({
      wire_kind: 'jacketed', awg: 22, ul_number: 'UL2464', conductor_color: null,
      jacket_material: 'PVC', jacket_color: 'black', core_count: 5,
      is_shielded: true, core_colors: ['棕色', '白色', '蓝色', '黑色', '灰色'],
      rated_voltage_v: 300, temperature_range_c: { max: 80 }, flame_test: 'VW-1', rohs_compliant: true,
      conductor_material: '镀锡铜丝', conductor_structure: '17/0.16TC', insulation_material: 'PVC',
      insulation_diameter_mm: 1.3, insulation_diameter_tolerance_mm: 0.05,
      braid_structure: '16*5/0.10TC', braid_structure_description: 'B16/6/0.10TC',
      shield_coverage_ratio: 0.6, shield_coverage_description: '65%', jacket_hardness_p: 60,
      outer_diameter_mm: 5.5, outer_diameter_tolerance_mm: 0.2, tensile_strength_psi: 1500,
      elongation_percent: 100, conductor_resistance_ohm_per_km_at_20c: 59.4,
      insulation_resistance_mohm_km: 10, core_color_description: '棕白蓝黑灰',
    })).toMatchObject({
      kind: 'jacketed', awg: 22, coreCount: 5, outerDiameterMm: 5.5,
      shieldCoverageRatio: 0.6, shieldCoverageDescription: '65%',
      braidStructureDescription: 'B16/6/0.10TC', coreColorDescription: '棕白蓝黑灰',
    });
  });

  it('keeps project length and end treatment while applying catalog defaults', () => {
    const current = {
      kind: 'electronic' as const, color: 'blue', awg: 22, ulNumber: '1007' as const,
      lengthMm: 720, endTreatment,
    };
    expect(applyCatalogWireSpec(current, {
      kind: 'jacketed', jacketMaterial: 'PUR', jacketColor: 'green', awg: 24,
      coreCount: 4, shielded: false, coreColors: ['red', 'black', 'white', 'green'],
      ulNumber: 'UL2464',
    })).toMatchObject({
      kind: 'jacketed', awg: 24, lengthMm: 720, endTreatment,
      jacketMaterial: 'PUR', coreCount: 4, odMm: expect.any(Number),
    });
  });

  it('prefers a catalog outer diameter over the calculated estimate', () => {
    const current = {
      kind: 'jacketed' as const, jacketMaterial: 'PVC' as const, jacketColor: 'black' as const,
      awg: 22, coreCount: 5, shielded: true, odMm: 1, coreColors: ['棕色', '白色', '蓝色', '黑色', '灰色'],
      lengthMm: 500, endTreatment,
    };
    expect(applyCatalogWireSpec(current, {
      kind: 'jacketed', jacketMaterial: 'PVC', jacketColor: 'black', awg: 22,
      coreCount: 5, shielded: true, coreColors: ['棕色', '白色', '蓝色', '黑色', '灰色'],
      ulNumber: 'UL2464', outerDiameterMm: 5.5, outerDiameterToleranceMm: 0.2,
    })).toMatchObject({ odMm: 5.5, outerDiameterToleranceMm: 0.2 });
  });

  it('rejects a mismatched core color array and unknown kind', () => {
    expect(() => parseCatalogWireSpec({
      wire_kind: 'jacketed', awg: 24, ul_number: null, conductor_color: null,
      jacket_material: 'PVC', jacket_color: 'black', core_count: 2,
      is_shielded: false, core_colors: ['red'],
    })).toThrow(WireCatalogError);
    expect(() => parseCatalogWireSpec({ wire_kind: 'other' })).toThrow(WireCatalogError);
  });

  it('generates professional default wire names for custom specs', () => {
    expect(generateWireDefaultName({
      kind: 'electronic',
      color: 'red',
      awg: 22,
      ulNumber: '1007',
      lengthMm: 300,
      endTreatment,
    })).toBe('UL1007 22AWG 红色电子线');

    expect(generateWireDefaultName({
      kind: 'jacketed',
      jacketMaterial: 'PVC',
      jacketColor: 'black',
      awg: 24,
      coreCount: 4,
      shielded: true,
      odMm: 5.2,
      coreColors: ['red', 'black', 'white', 'green'],
      ulNumber: 'UL2464',
      lengthMm: 500,
      endTreatment,
    })).toBe('UL2464 PVC 24AWG 4芯 黑色屏蔽护套线');
  });

  it('matches catalog wires from specs bidirectionally', () => {
    const catalogWires = [
      {
        id: 'w1',
        resourceItemId: 'res-wire-1',
        name: 'UL1007 24AWG 红色电子线',
        spec: { kind: 'electronic' as const, awg: 24, ulNumber: '1007' as const, color: 'red' },
      },
      {
        id: 'w2',
        resourceItemId: 'res-wire-2',
        name: 'UL2464 22AWG 4芯 黑色屏蔽护套线',
        spec: {
          kind: 'jacketed' as const,
          awg: 22,
          coreCount: 4 as const,
          jacketMaterial: 'PVC' as const,
          jacketColor: 'black' as const,
          shielded: true,
          coreColors: ['red', 'black', 'white', 'green'],
          ulNumber: 'UL2464' as const,
        },
      },
    ];

    // Electronic match
    const matchedElectronic = findMatchingCatalogWire(catalogWires, {
      kind: 'electronic',
      color: 'red',
      awg: 24,
      ulNumber: '1007',
      lengthMm: 300,
      endTreatment,
    });
    expect(matchedElectronic?.resourceItemId).toBe('res-wire-1');

    // Jacketed match (length and endTreatment differ, but material spec matches)
    const matchedJacketed = findMatchingCatalogWire(catalogWires, {
      kind: 'jacketed',
      awg: 22,
      coreCount: 4,
      jacketMaterial: 'PVC',
      jacketColor: 'black',
      shielded: true,
      odMm: 4.8,
      coreColors: ['red', 'black', 'white', 'green'],
      ulNumber: 'UL2464',
      lengthMm: 1200,
      endTreatment,
    });
    expect(matchedJacketed?.resourceItemId).toBe('res-wire-2');

    // Unmatched custom spec returns undefined
    const unmatched = findMatchingCatalogWire(catalogWires, {
      kind: 'electronic',
      color: 'blue',
      awg: 18,
      ulNumber: '1007',
      lengthMm: 300,
      endTreatment,
    });
    expect(unmatched).toBeUndefined();
  });
});

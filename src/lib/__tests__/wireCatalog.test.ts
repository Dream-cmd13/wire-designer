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


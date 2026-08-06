import { describe, expect, it } from 'vitest';
import { applyCatalogWireSpec, parseCatalogWireSpec, WireCatalogError } from '@/lib/wireCatalog';

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
});

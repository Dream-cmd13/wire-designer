import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDwgHarnessModel, suggestDwgHarness } from '@/lib/dwg/dwgHarnessPreview';
import { parseDwg } from '@/lib/dwg/parseDwg';
import type { DwgRenderEntity } from '@/lib/dwg/dwgTypes';

function text(line: string, isDimension = false): DwgRenderEntity {
  return { kind: 'text', lines: [line], isDimension, layer: '0', bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    position: { x: 0, y: 0 }, height: 1, rotation: 0, align: 'left', baseline: 'top', color: '#000', bold: false };
}

describe('DWG harness preview', () => {
  it('uses marked nominal dimensions and cable OD, not mating dimensions or other numbers', () => {
    const hints = suggestDwgHarness('renamed.dwg', [text('M12A04-07-068'), text('*500±10', true),
      text('⌀14.5', true), text('500次'), text('4C*0.3mm² OD：5.00±0.15 PVC')]);
    expect(hints).toMatchObject({ partNumber: 'M12A04-07-068', connector: 'male',
      length: { mm: 500, note: '*500±10' }, diameter: { mm: 5, note: 'OD:5.00' } });
  });

  it('leaves conflicting and missing values empty and refuses multiple part numbers', () => {
    expect(suggestDwgHarness('M12A04-07-068-3-10-500.dwg', [text('OD:4.5'), text('OD:5'), text('*500±10')]))
      .toMatchObject({ length: null, diameter: null, connector: 'male' });
    expect(suggestDwgHarness('M12A04-07-068-3-10-500.dwg', [text('M12A04-08-085')]).partNumber).toBeNull();
    expect(suggestDwgHarness('other.dwg', [text('M12*1', true)]).partNumber).toBeNull();
    expect(suggestDwgHarness('M12A04-07-068.dwg', [text('*5±1 cm', true), text('OD:0.2 inch')]))
      .toMatchObject({ length: null, diameter: null });
  });

  it.each(['male', 'female'] as const)('creates a straight, scaled assembly with a %s placeholder', (connector) => {
    const model = buildDwgHarnessModel({ lengthMm: 500, diameterMm: 5, connector });
    expect(model.boundsMm.min[0]).toBeCloseTo(0);
    expect(model.boundsMm.max[0]).toBeCloseTo(500);
    const cable = model.meshes.find((mesh) => mesh.name === '线缆');
    expect(cable).toBeDefined();
    expect(Math.max(...cable!.positions.filter((_, index) => index % 3 === 2))).toBeCloseTo(2.5);
    expect(model.meshes.some((mesh) => mesh.name.includes('占位'))).toBe(true);
  });

  it('rejects invalid or incompatible dimensions before creating meshes', () => {
    for (const [lengthMm, diameterMm] of [[NaN, 5], [500, Infinity], [500, 0], [10, 15], [1e10, 5]]) {
      expect(() => buildDwgHarnessModel({ lengthMm, diameterMm, connector: 'male' })).toThrow();
    }
  });

  const samples = [
    ['M12A04-07-068-3-10-500.dwg', 5, 'male'],
    ['M12A04-07-093-1-10-500.dwg', 4.5, 'male'],
    ['M12A04-08-085-1-10-500.dwg', 4.5, 'female'],
  ] as const;
  it.each(samples)('reads the real DWG annotation for %s', async (fileName, diameter, connector) => {
    if (!existsSync(fileName)) return;
    const drawing = await parseDwg(Uint8Array.from(readFileSync(fileName)).buffer, { fileName });
    expect(suggestDwgHarness(fileName, drawing.entities)).toMatchObject({ length: { mm: 500 }, diameter: { mm: diameter }, connector });
  });
});

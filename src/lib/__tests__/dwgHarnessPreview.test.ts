import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDwgHarnessModel, suggestDwgHarness as readHarnessHints } from '@/lib/dwg/dwgHarnessPreview';
import { parseDwg } from '@/lib/dwg/parseDwg';
import type { DwgRenderEntity } from '@/lib/dwg/dwgTypes';

function text(line: string, isDimension = false): Extract<DwgRenderEntity, { kind: 'text' }> {
  return { kind: 'text', lines: [line], isDimension, layer: '0', bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    position: { x: 0, y: 0 }, height: 1, rotation: 0, align: 'left', baseline: 'top', color: '#000', bold: false };
}

function suggestDwgHarness(fileName: string, entities: DwgRenderEntity[], units = 4) {
  return readHarnessHints(fileName, entities, units);
}

describe('DWG harness preview', () => {
  it('uses marked nominal dimensions and cable OD, not mating dimensions or other numbers', () => {
    const hints = suggestDwgHarness('M12A04-07-068-3-10-500.dwg', [text('M12A04-07-068'), text('*500±10', true),
      text('⌀14.5', true), text('500次'), text('4C*0.3mm² OD：5.00±0.15 PVC')]);
    expect(hints).toMatchObject({ partNumber: 'M12A04-07-068', connector: 'male',
      length: { mm: 500, note: '*500±10', basis: 'cable' }, diameter: { mm: 5, note: 'OD:5.00' } });
  });

  it.each(['4,50 mm', '1/4 inch', '4.5–5.0 mm', '4.5 mil', '4.5±0,15 cm'])('does not prefill an ambiguous OD: %s', (value) => {
    expect(suggestDwgHarness('M12A04-07-068-3-10-500.dwg', [text(`OD:${value}`)]).diameter).toBeNull();
  });

  it('does not ignore an unsupported unit alongside a valid outer diameter', () => {
    expect(suggestDwgHarness('M12A04-07-068-3-10-500.dwg', [text('OD:4.5 mm'), text('OD:0.2 in')]).diameter).toBeNull();
  });

  it('uses an unqualified OD only when DWG units are millimeters', () => {
    expect(suggestDwgHarness('renamed.dwg', [text('OD:4.5')], 1).diameter).toBeNull();
    expect(suggestDwgHarness('renamed.dwg', [text('OD:4.5 mm')], 1).diameter?.mm).toBe(4.5);
  });

  it('requires an explicit overall length or corroboration from a known template', () => {
    expect(suggestDwgHarness('M12A04-07-068-3-10-500.dwg', [text('*15±1', true)]).length).toBeNull();
    expect(suggestDwgHarness('M12A04-07-068-3-10-500.dwg', [text('*500±10', true)], 1).length).toBeNull();
    expect(suggestDwgHarness('renamed.dwg', [text('M12A04-07-068'), text('*500±10', true)]).length).toBeNull();
    expect(suggestDwgHarness('renamed.dwg', [text('M12A04-07-068'), text('总长:500 mm')]).length?.mm).toBe(500);
  });

  it('checks every named overall length in the same MTEXT', () => {
    const annotation = { ...text(''), lines: ['总长:500 mm', '总长度:800 mm'] };
    expect(suggestDwgHarness('renamed.dwg', [annotation]).length).toBeNull();
    expect(suggestDwgHarness('renamed.dwg', [text(annotation.lines.join(' '))]).length).toBeNull();
  });

  it.each([['总长: 500 mm to 800 mm'], ['总长:', '500 mm', '到 800 mm'], ['总长:500 mm', '–800 mm']])(
    'leaves a length range blank (%j)', (...lines) => {
      expect(suggestDwgHarness('renamed.dwg', [{ ...text(''), lines }]).length).toBeNull();
    },
  );

  it('preserves MTEXT field boundaries and checks continuations', () => {
    const hints = (...lines: string[]) => suggestDwgHarness('renamed.dwg', [{ ...text(''), lines }]);
    expect(hints('OD:', '5 mm', 'JACKET MATERIAL: PVC').diameter?.mm).toBe(5);
    expect(hints('OD:5 mm', 'to 6 mm').diameter).toBeNull();
    expect(hints('线长:500 mm', '总长:500 mm').length).toBeNull();
    expect(hints('线长:0.5 m', '备注: PVC').length).toMatchObject({ mm: 500, basis: 'cable' });
    expect(hints('总长:526 mm').length).toMatchObject({ mm: 526, basis: 'overall' });
  });

  it('recognizes two explicitly identified connectors and allows a labeled cut end', () => {
    const name = 'M12A04-07-068-3-10-500.dwg';
    expect(suggestDwgHarness(name, [text('P1 M12A04-07-068'), text('P2 M12A04-07-068')]).multipleEnds).toBe(true);
    expect(suggestDwgHarness(name, [text('P1 M12A04-07-068'), text('P2 切断')]).multipleEnds).toBe(false);
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
    const model = buildDwgHarnessModel({ lengthMm: 500, diameterMm: 5, connector, lengthBasis: 'overall' });
    expect(model.boundsMm.min[0]).toBeCloseTo(0);
    expect(model.boundsMm.max[0]).toBeCloseTo(500);
    const cable = model.meshes.find((mesh) => mesh.name === '线缆');
    expect(cable).toBeDefined();
    expect(Math.max(...cable!.positions.filter((_, index) => index % 3 === 2))).toBeCloseTo(2.5);
    expect(model.meshes.some((mesh) => mesh.name.includes('占位'))).toBe(true);
  });

  it('adds the connector outside the cable length and limits the detailed P1 profile to the known part', () => {
    const params = { lengthMm: 500, lengthBasis: 'cable' as const, diameterMm: 5, connector: 'male' as const };
    const model = buildDwgHarnessModel({ ...params, partNumber: 'M12A04-07-068' });
    const cable = model.meshes.find((mesh) => mesh.name === '线缆')!;
    const xs = cable.positions.filter((_, index) => index % 3 === 0);
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(500);
    expect(model.meshes.filter((mesh) => mesh.name.startsWith('P1 针位'))).toHaveLength(4);
    expect(buildDwgHarnessModel(params).meshes.some((mesh) => mesh.name.startsWith('P1 针位'))).toBe(false);
    expect(buildDwgHarnessModel({ ...params, partNumber: 'M12A04-07-068', connector: 'female' }).meshes.some((mesh) => mesh.name.startsWith('P1 针位'))).toBe(false);
  });

  it('renders four corner pins and the center pin for the documented five-pin male connector', () => {
    const model = buildDwgHarnessModel({ lengthMm: 500, lengthBasis: 'cable', diameterMm: 5.5,
      connector: 'male', partNumber: 'M12A05-07-068' });
    const pins = model.meshes.filter((mesh) => mesh.name.startsWith('P1 针位'));
    expect(pins).toHaveLength(5);
    const pin = pins.find((mesh) => mesh.name === 'P1 针位 5 · 示意')!;
    for (const axis of [1, 2]) {
      const coordinates = pin.positions.filter((_, index) => index % 3 === axis);
      expect(Math.min(...coordinates)).toBeLessThan(0);
      expect(Math.max(...coordinates)).toBeCloseTo(-Math.min(...coordinates));
    }
  });

  it('rejects invalid or incompatible dimensions before creating meshes', () => {
    for (const [lengthMm, diameterMm] of [[NaN, 5], [500, Infinity], [500, 0], [10, 15], [1e10, 5]]) {
      expect(() => buildDwgHarnessModel({ lengthMm, diameterMm, connector: 'male', lengthBasis: 'cable' })).toThrow();
    }
  });

  const samples = [
    ['M12A04-07-068-3-10-500.dwg', 5, 'male'],
    ['M12A04-07-093-1-10-500.dwg', 4.5, 'male'],
    ['M12A04-08-085-1-10-500.dwg', 4.5, 'female'],
    ['M12A05-07-068-3-10-500.dwg', 5.5, 'male'],
    ['M12A05-07-093-1-10-500.dwg', 5, 'male'],
    ['M12A05-08-085-1-10-500.dwg', 5, 'female'],
    ['M12A08-07-068-3-10-500.dwg', 5.8, 'male'],
    ['M12A08-07-093-1-10-500.dwg', 5.5, 'male'],
  ] as const;
  it.each(samples)('reads the real DWG annotation for %s', async (fileName, diameter, connector) => {
    if (!existsSync(fileName)) return;
    const drawing = await parseDwg(Uint8Array.from(readFileSync(fileName)).buffer, { fileName });
    expect(readHarnessHints(fileName, drawing.entities, drawing.units)).toMatchObject({ length: { mm: 500, basis: 'cable' }, diameter: { mm: diameter }, connector, multipleEnds: false });
  });
});

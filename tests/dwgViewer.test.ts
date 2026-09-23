import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DwgDatabase } from '@mlightcad/libredwg-web';
import { aciToRgb, hexToRgb, isDarkColor, resolveDisplayHex, rgbFromTrueColor } from '@/lib/dwg/aciColor';
import { applyAffine, multiplyAffine, rotationAffine, scaleAffine, similarityOf, translationAffine } from '@/lib/dwg/affine';
import { fitView, panView, zoomViewAt } from '@/lib/dwg/dwgView';
import { decodePercentCodes, parseMText } from '@/lib/dwg/mtextFormat';
import { normalizeDwgDatabase, parseDwg } from '@/lib/dwg/parseDwg';
import { visibleWorldBounds } from '@/lib/dwg/renderDwg';

describe('aciColor', () => {
  it('resolves standard ACI colors', () => {
    expect(aciToRgb(1)).toEqual({ r: 255, g: 0, b: 0 });
    expect(aciToRgb(6)).toEqual({ r: 255, g: 0, b: 255 });
    expect(aciToRgb(7)).toEqual({ r: 255, g: 255, b: 255 });
    expect(aciToRgb(8)).toEqual({ r: 128, g: 128, b: 128 });
  });

  it('resolves the 10-249 color cube and 250-255 grays', () => {
    expect(aciToRgb(20)).toEqual({ r: 255, g: 63, b: 0 });
    expect(aciToRgb(190)).toEqual({ r: 127, g: 0, b: 255 });
    expect(aciToRgb(250)).toEqual({ r: 0, g: 0, b: 0 });
    expect(aciToRgb(254)).toEqual({ r: 204, g: 204, b: 204 });
    expect(aciToRgb(255)).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('parses true color values (0x00RRGGBB)', () => {
    expect(rgbFromTrueColor(0xffffff)).toEqual({ r: 255, g: 255, b: 255 });
    expect(rgbFromTrueColor(0x0000ff)).toEqual({ r: 0, g: 0, b: 255 });
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('maps white/black lines to contrast colors based on background', () => {
    expect(resolveDisplayHex({ r: 255, g: 255, b: 255 }, false)).toBe('#111827');
    expect(resolveDisplayHex({ r: 255, g: 255, b: 255 }, true)).toBe('#ffffff');
    expect(resolveDisplayHex({ r: 0, g: 0, b: 0 }, true)).toBe('#e2e8f0');
    expect(resolveDisplayHex({ r: 255, g: 0, b: 0 }, false)).toBe('#ff0000');
    expect(resolveDisplayHex({ r: 255, g: 0, b: 0 }, true)).toBe('#ff0000');
    expect(isDarkColor('#111827')).toBe(true);
    expect(isDarkColor('#ffffff')).toBe(false);
  });
});

describe('affine', () => {
  it('composes translation, rotation and scale', () => {
    const transform = multiplyAffine(
      multiplyAffine(translationAffine(10, 20), rotationAffine(Math.PI / 2)),
      scaleAffine(2, 2),
    );
    const point = applyAffine(transform, { x: 1, y: 0 });
    expect(point.x).toBeCloseTo(10, 6);
    expect(point.y).toBeCloseTo(22, 6);
  });

  it('detects similarity and mirroring', () => {
    expect(similarityOf(scaleAffine(3, 3))).toEqual({ scale: 3, rotation: 0, mirrored: false });
    const mirrored = scaleAffine(-2, 2);
    expect(similarityOf(mirrored)?.mirrored).toBe(true);
    expect(similarityOf(mirrored)?.scale).toBeCloseTo(2, 6);
    expect(similarityOf(scaleAffine(2, 1))).toBeNull();
  });
});

describe('mtextFormat', () => {
  it('strips font and color codes', () => {
    const content = parseMText('{\\fSimSun|b0|i0|c0|p2;M12XXX-07-093}');
    expect(content.lines).toEqual(['M12XXX-07-093']);
    expect(content.bold).toBe(false);
    expect(content.colorIndex).toBeNull();
  });

  it('keeps the last inline color code and splits paragraphs', () => {
    const content = parseMText('{\\H1.524x;\\C256;Coding  }');
    expect(content.lines).toEqual(['Coding']);
    expect(content.colorIndex).toBe(256);

    const multiline = parseMText('Rated \\PVoltage');
    expect(multiline.lines).toEqual(['Rated', 'Voltage']);
  });

  it('decodes %% control codes', () => {
    expect(decodePercentCodes('45%%d')).toBe('45°');
    expect(decodePercentCodes('%%c10 %%p0.1 100%%%')).toBe('⌀10 ±0.1 100%');
  });
});

describe('dwgView', () => {
  const bounds = { minX: 0, minY: 0, maxX: 200, maxY: 100 };

  it('fits bounds into the viewport with padding and centers content', () => {
    const view = fitView(bounds, { width: 1000, height: 600 }, 50);
    expect(view.scale).toBeCloseTo(4.5);
    expect(view.offsetX).toBeCloseTo(500 - 200 * 4.5 / 2);
    expect(view.offsetY).toBeCloseTo(300 + 100 * 4.5 / 2);
  });

  it('keeps the anchor point fixed while zooming', () => {
    const view = fitView(bounds, { width: 1000, height: 600 }, 50);
    const anchor = { x: 250, y: 180 };
    const next = zoomViewAt(view, 2, anchor.x, anchor.y);
    expect(next.scale).toBeCloseTo(view.scale * 2);
    const worldX = (anchor.x - view.offsetX) / view.scale;
    const worldY = (view.offsetY - anchor.y) / view.scale;
    expect(worldX * next.scale + next.offsetX).toBeCloseTo(anchor.x);
    expect(-worldY * next.scale + next.offsetY).toBeCloseTo(anchor.y);
  });

  it('translates the view by pan deltas', () => {
    const view = fitView(bounds, { width: 1000, height: 600 }, 50);
    const next = panView(view, 30, -20);
    expect(next.offsetX).toBe(view.offsetX + 30);
    expect(next.offsetY).toBe(view.offsetY - 20);
    expect(next.scale).toBe(view.scale);
  });

  it('computes the visible world bounds for culling', () => {
    const world = visibleWorldBounds({ scale: 2, offsetX: 100, offsetY: 400, lineWidth: 1 }, 1000, 500);
    expect(world).toEqual({ minX: -50, maxX: 450, maxY: 200, minY: -50 });
  });
});

function makeDatabase(entities: unknown[], blockRecords: unknown[] = [], layers: unknown[] = []): DwgDatabase {
  return {
    tables: {
      APPID: { entries: [] },
      BLOCK_RECORD: { entries: blockRecords },
      DIMSTYLE: { entries: [] },
      LAYER: { entries: layers },
      LTYPE: { entries: [] },
      STYLE: { entries: [] },
      VPORT: { entries: [] },
    },
    objects: {
      DICTIONARY: [],
      IMAGEDEF: [],
      LAYER_FILTER: [],
      LAYER_INDEX: [],
      LAYOUT: [],
      MLEADERSTYLE: [],
      SPATIAL_FILTER: [],
      XRECORD: [],
    },
    header: { EXTMIN: { x: 0, y: 0, z: 0 }, EXTMAX: { x: 100, y: 100, z: 0 } },
    entities,
    classes: [],
  } as unknown as DwgDatabase;
}

const layerEntries = [
  { name: '0', handle: '10', ownerHandle: '0', colorIndex: 7, color: 0xffffff },
  { name: 'WIRE', handle: '11', ownerHandle: '0', colorIndex: 1, color: 0xff0000 },
];

describe('normalizeDwgDatabase', () => {
  it('expands block references with position, rotation, scale and color inheritance', () => {
    const database = makeDatabase(
      [
        {
          type: 'INSERT',
          handle: '20',
          layer: 'WIRE',
          colorIndex: 6,
          name: 'SYM',
          insertionPoint: { x: 10, y: 20, z: 0 },
          xScale: 2,
          yScale: 2,
          rotation: Math.PI / 2,
          columnCount: 1,
          rowCount: 1,
          columnSpacing: 0,
          rowSpacing: 0,
          attribs: [],
        },
      ],
      [
        {
          name: 'SYM',
          basePoint: { x: 0, y: 0, z: 0 },
          entities: [
            { type: 'LINE', handle: '21', layer: '0', colorIndex: 256, startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 1, y: 0, z: 0 } },
            { type: 'CIRCLE', handle: '22', layer: '0', colorIndex: 0, center: { x: 0, y: 0, z: 0 }, radius: 0.5 },
          ],
        },
      ],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'blocks.dwg');
    expect(drawing.stats.rendered).toBe(2);
    const [line, circle] = drawing.entities;
    expect(line.kind).toBe('line');
    if (line.kind !== 'line') throw new Error('expected line');
    expect(line.a.x).toBeCloseTo(10, 6);
    expect(line.a.y).toBeCloseTo(20, 6);
    expect(line.b.x).toBeCloseTo(10, 6);
    expect(line.b.y).toBeCloseTo(22, 6);
    // 块内图层 "0" 继承 INSERT 的图层，BYLAYER 颜色取该图层颜色（红）
    expect(line.layer).toBe('WIRE');
    expect(line.color).toBe('#ff0000');
    // 块内 BYBLOCK 颜色取 INSERT 的颜色（品红）
    expect(circle.kind).toBe('circle');
    if (circle.kind !== 'circle') throw new Error('expected circle');
    expect(circle.radius).toBeCloseTo(1, 6);
    expect(circle.color).toBe('#ff00ff');
  });

  it('expands MINSERT arrays along rotated axes', () => {
    const database = makeDatabase(
      [
        {
          type: 'INSERT',
          handle: '30',
          layer: 'WIRE',
          colorIndex: 256,
          name: 'DOT',
          insertionPoint: { x: 0, y: 0, z: 0 },
          xScale: 1,
          yScale: 1,
          rotation: 0,
          columnCount: 2,
          rowCount: 1,
          columnSpacing: 5,
          rowSpacing: 0,
          attribs: [],
        },
      ],
      [
        {
          name: 'DOT',
          basePoint: { x: 0, y: 0, z: 0 },
          entities: [
            { type: 'LINE', handle: '31', layer: 'WIRE', colorIndex: 256, startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 1, y: 0, z: 0 } },
          ],
        },
      ],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'minsert.dwg');
    expect(drawing.stats.rendered).toBe(2);
    const lines = drawing.entities.filter((entity) => entity.kind === 'line');
    expect(lines.map((entity) => (entity.kind === 'line' ? entity.a.x : 0))).toEqual([0, 5]);
  });

  it('samples circles into polylines when the block transform is non-uniform', () => {
    const database = makeDatabase(
      [
        {
          type: 'INSERT',
          handle: '40',
          layer: 'WIRE',
          colorIndex: 256,
          name: 'SYM',
          insertionPoint: { x: 0, y: 0, z: 0 },
          xScale: 2,
          yScale: 1,
          rotation: 0,
          columnCount: 1,
          rowCount: 1,
          columnSpacing: 0,
          rowSpacing: 0,
          attribs: [],
        },
      ],
      [
        {
          name: 'SYM',
          basePoint: { x: 0, y: 0, z: 0 },
          entities: [
            { type: 'CIRCLE', handle: '41', layer: 'WIRE', colorIndex: 256, center: { x: 0, y: 0, z: 0 }, radius: 1 },
          ],
        },
      ],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'stretch.dwg');
    expect(drawing.entities).toHaveLength(1);
    const [entity] = drawing.entities;
    expect(entity.kind).toBe('polyline');
    if (entity.kind !== 'polyline') throw new Error('expected polyline');
    expect(entity.closed).toBe(true);
    expect(entity.bounds.maxX).toBeCloseTo(2, 3);
    expect(entity.bounds.maxY).toBeCloseTo(1, 3);
  });

  it('samples ellipses into closed polylines', () => {
    const database = makeDatabase(
      [
        {
          type: 'ELLIPSE',
          handle: '50',
          layer: 'WIRE',
          colorIndex: 256,
          center: { x: 0, y: 0, z: 0 },
          majorAxisEndPoint: { x: 10, y: 0, z: 0 },
          axisRatio: 0.5,
          startAngle: 0,
          endAngle: Math.PI * 2,
        },
      ],
      [],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'ellipse.dwg');
    expect(drawing.entities).toHaveLength(1);
    const [entity] = drawing.entities;
    expect(entity.kind).toBe('polyline');
    if (entity.kind !== 'polyline') throw new Error('expected polyline');
    expect(entity.closed).toBe(true);
    expect(entity.points.length).toBeGreaterThan(16);
    expect(entity.bounds.maxX).toBeCloseTo(10, 6);
    expect(entity.bounds.minY).toBeCloseTo(-5, 6);
  });

  it('skips unsupported entities and invisible attributes', () => {
    const database = makeDatabase(
      [
        { type: 'REGION', handle: '60', layer: '0', colorIndex: 256 },
        {
          type: 'ATTRIB',
          handle: '61',
          layer: '0',
          colorIndex: 256,
          flags: 1,
          text: { text: 'hidden', startPoint: { x: 0, y: 0, z: 0 }, textHeight: 1 },
        },
      ],
      [],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'skip.dwg');
    expect(drawing.stats.rendered).toBe(0);
    expect(drawing.stats.skipped).toEqual({ REGION: 1, ATTRIB: 1 });
  });
});

const samplePath = resolve(process.cwd(), '线束设计器.dwg');

describe.skipIf(!existsSync(samplePath))('parseDwg (示例 DWG)', () => {
  it('parses the harness drawing into render primitives', async () => {
    const buffer = readFileSync(samplePath);
    const drawing = await parseDwg(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer, {
      fileName: '线束设计器.dwg',
    });

    expect(drawing.stats.total).toBe(3651);
    expect(drawing.stats.rendered).toBe(3650);
    expect(drawing.stats.text).toBe(216);
    expect(drawing.stats.skipped).toEqual({ MTEXT: 1 });
    expect(drawing.layers.map((layer) => layer.name)).toEqual(['0', 'C00-00-00']);

    expect(drawing.bounds.minX).toBeCloseTo(39486.269, 2);
    expect(drawing.bounds.maxX).toBeCloseTo(42028.874, 2);

    const kinds = new Set(drawing.entities.map((entity) => entity.kind));
    expect(kinds).toEqual(new Set(['line', 'polyline', 'circle', 'arc', 'solid', 'hatch', 'text']));

    const layers = new Set(drawing.entities.map((entity) => entity.layer));
    expect([...layers].sort()).toEqual(['0', 'C00-00-00']);

    const texts = drawing.entities.filter((entity) => entity.kind === 'text');
    const contents = texts.flatMap((entity) => entity.lines);
    expect(contents).toContain('M12A-04');
    expect(contents).toContain('公头');
    expect(contents).toContain('额定电流');

    const lines = drawing.entities.filter((entity) => entity.kind === 'line');
    expect(lines.length).toBe(239);
    const lineColors = lines.reduce<Record<string, number>>((acc, entity) => {
      acc[entity.color] = (acc[entity.color] ?? 0) + 1;
      return acc;
    }, {});
    expect(lineColors).toEqual({ '#ffffff': 195, '#ff0000': 44 });
    expect(texts.filter((entity) => entity.color === '#ff00ff').length).toBe(40);
  }, 120_000);
});

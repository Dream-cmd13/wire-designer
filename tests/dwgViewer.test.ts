import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DwgDatabase } from '@mlightcad/libredwg-web';
import { aciToRgb, hexToRgb, inkHex, isDarkColor, rgbFromTrueColor } from '@/lib/dwg/aciColor';
import { applyAffine, multiplyAffine, rotationAffine, scaleAffine, similarityOf, translationAffine } from '@/lib/dwg/affine';
import { fitView, panView, zoomLimitsFor, zoomViewAt } from '@/lib/dwg/dwgView';
import { decodePercentCodes, parseMText } from '@/lib/dwg/mtextFormat';
import { hasDwgHeader, normalizeDwgDatabase, parseDwg } from '@/lib/dwg/parseDwg';
import { renderDwgToCanvas, visibleWorldBounds } from '@/lib/dwg/renderDwg';
import { isWideChar, textWidthOf } from '@/lib/dwg/textMetrics';

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

  it('renders every entity in pure black/white according to the background', () => {
    expect(inkHex(false)).toBe('#000000');
    expect(inkHex(true)).toBe('#ffffff');
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
    expect(content.height).toEqual({ value: 1.524, relative: true });

    const multiline = parseMText('Rated \\PVoltage');
    expect(multiline.lines).toEqual(['Rated', 'Voltage']);
  });

  it('parses inline height codes and rejects conflicting ones', () => {
    expect(parseMText('plain').height).toBeNull();
    expect(parseMText('\\H2.5x;标注').height).toEqual({ value: 2.5, relative: true });
    expect(parseMText('\\H0.8x;\\H0.8x;*500±10').height).toEqual({ value: 0.8, relative: true });
    expect(parseMText('\\H3;绝对高度').height).toEqual({ value: 3, relative: false });
    // 多个不同取值无法用单一字号表达，退回实体字高
    expect(parseMText('\\H2x;大\\H1x;小').height).toBeNull();
  });

  it('decodes %% control codes', () => {
    expect(decodePercentCodes('45%%d')).toBe('45°');
    expect(decodePercentCodes('%%c10 %%p0.1 100%%%')).toBe('⌀10 ±0.1 100%');
    expect(decodePercentCodes('%%uUnder%%u %%oOver%%o')).toBe('Under Over');
  });
});

describe('textMetrics', () => {
  it('treats symbols SimSun renders full-width as wide characters', () => {
    // 实测 SimSun：° ± × ÷ · — ‰ 为全角，² µ Ø ® 为半角
    for (const char of ['°', '±', '×', '÷', '·', '—', '‰']) {
      expect(isWideChar(char), char).toBe(true);
    }
    for (const char of ['²', 'µ', 'Ø', '®', 'A']) {
      expect(isWideChar(char), char).toBe(false);
    }
    expect(textWidthOf('±', 1.5)).toBeCloseTo(1.5 * 1.35, 6);
    expect(textWidthOf('²', 1.5)).toBeCloseTo(1.5 * 1.35 * 0.5, 6);
  });
});

describe('hasDwgHeader', () => {
  it('accepts DWG headers and rejects other files', () => {
    const dwg = new TextEncoder().encode('AC1018\u0000\u0000\u0000\u0000\u0000');
    expect(hasDwgHeader(dwg.buffer as ArrayBuffer)).toBe(true);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(hasDwgHeader(png.buffer as ArrayBuffer)).toBe(false);
    expect(hasDwgHeader(new Uint8Array([0x41, 0x43]).buffer as ArrayBuffer)).toBe(false);
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

  it('derives zoom limits from the fit scale so large-coordinate drawings still fit', () => {
    const view = fitView({ minX: 0, minY: 0, maxX: 1e6, maxY: 1e6 }, { width: 1400, height: 900 }, 32);
    expect(view.scale).toBeGreaterThan(0);
    expect(view.scale).toBeLessThan(0.01);
    const limits = zoomLimitsFor(view.scale);
    expect(limits.min).toBeLessThan(view.scale);
    expect(limits.max).toBeGreaterThan(view.scale);
    // 适应比例本身不应被缩放上下限截断
    expect(view.scale).toBeGreaterThan(limits.min);
    expect(view.scale).toBeLessThan(limits.max);
  });
});

function makeDatabase(
  entities: unknown[],
  blockRecords: unknown[] = [],
  layers: unknown[] = [],
  lineTypes: unknown[] = [],
  imageDefs: unknown[] = [],
): DwgDatabase {
  return {
    tables: {
      APPID: { entries: [] },
      BLOCK_RECORD: { entries: blockRecords },
      DIMSTYLE: { entries: [] },
      LAYER: { entries: layers },
      LTYPE: { entries: lineTypes },
      STYLE: { entries: [] },
      VPORT: { entries: [] },
    },
    objects: {
      DICTIONARY: [],
      IMAGEDEF: imageDefs,
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

  it('wraps MTEXT at its reference width without breaking Latin words', () => {
    const database = makeDatabase(
      [
        {
          type: 'MTEXT', handle: 'M1', layer: '0', colorIndex: 256,
          text: '中文 ABCD 中文',
          insertionPoint: { x: 0, y: 0, z: 0 }, textHeight: 2, attachmentPoint: 1, rectWidth: 10,
        },
      ],
      [],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'mtext-wrap.dwg');
    const [entity] = drawing.entities;
    if (entity.kind !== 'text') throw new Error('expected text');
    // CJK 每个宽 2.7、拉丁/空格每个宽 1.35：中文（5.4）换行后 ABCD 中（9.45）再换行
    expect(entity.lines).toEqual(['中文', 'ABCD 中', '文']);
    expect(entity.bounds.maxX).toBeCloseTo(9.45, 6);
  });

  it('keeps a Latin word wider than the reference box on one line', () => {
    const database = makeDatabase(
      [
        {
          type: 'MTEXT', handle: 'M7', layer: '0', colorIndex: 256,
          text: 'ABCDEFGHIJKLMNOP',
          insertionPoint: { x: 0, y: 0, z: 0 }, textHeight: 2, attachmentPoint: 1, rectWidth: 10,
        },
      ],
      [],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'mtext-long-word.dwg');
    const [entity] = drawing.entities;
    if (entity.kind !== 'text') throw new Error('expected text');
    // 与 `10` 窄框数字串的实测一致：西文单词不逐字断行，放不下时整体溢出
    expect(entity.lines).toEqual(['ABCDEFGHIJKLMNOP']);
    expect(entity.bounds.maxX).toBeCloseTo(21.6, 6);
  });

  it('stacks MTEXT characters when the reference width is narrower than one glyph', () => {
    const database = makeDatabase(
      [
        {
          type: 'MTEXT', handle: 'M2', layer: '0', colorIndex: 256,
          text: '切断',
          insertionPoint: { x: 0, y: 0, z: 0 }, textHeight: 2, attachmentPoint: 1, rectWidth: 1.31,
        },
      ],
      [],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'mtext-narrow.dwg');
    const [entity] = drawing.entities;
    if (entity.kind !== 'text') throw new Error('expected text');
    // 参考宽小于一个字宽时 AutoCAD 逐字换行（接线图“切断”的上下两行显示）
    expect(entity.lines).toEqual(['切', '断']);
  });

  it('fits to rendered entities instead of stale header extents', () => {
    const database = makeDatabase(
      [
        { type: 'LINE', handle: 'H1', layer: '0', colorIndex: 256, startPoint: { x: 10, y: 20, z: 0 }, endPoint: { x: 30, y: 40, z: 0 } },
      ],
      [],
      layerEntries,
    );

    // makeDatabase 的图纸头范围是 (0,0)-(100,100)，不应把实体范围撑大
    const drawing = normalizeDwgDatabase(database, 'bounds-entities.dwg');
    expect(drawing.bounds).toEqual({ minX: 10, minY: 20, maxX: 30, maxY: 40 });
  });

  it('falls back to header extents when nothing is rendered', () => {
    const database = makeDatabase(
      [{ type: 'REGION', handle: 'H2', layer: '0', colorIndex: 256 }],
      [],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'bounds-header.dwg');
    expect(drawing.bounds).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
  });

  it('computes tight text bounds honouring alignment and rotation', () => {
    const database = makeDatabase(
      [
        {
          type: 'TEXT', handle: 'T1', layer: '0', colorIndex: 256,
          text: 'ABCD', startPoint: { x: 0, y: 0, z: 0 }, textHeight: 2, halign: 2, valign: 2,
          rotation: Math.PI / 2,
        },
      ],
      [],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'text-bounds.dwg');
    const [entity] = drawing.entities;
    if (entity.kind !== 'text') throw new Error('expected text');
    // 右中锚点：盒在锚点左侧 [-5.4, 0] × [-1, 1]，绕锚点逆时针 90° 后为 [-1, 1] × [-5.4, 0]
    expect(entity.bounds.minX).toBeCloseTo(-1, 6);
    expect(entity.bounds.maxX).toBeCloseTo(1, 6);
    expect(entity.bounds.minY).toBeCloseTo(-5.4, 6);
    expect(entity.bounds.maxY).toBeCloseTo(0, 6);
  });

  it('anchors justified TEXT at its second alignment point', () => {
    const database = makeDatabase(
      [
        {
          type: 'TEXT', handle: 'T2', layer: '0', colorIndex: 256,
          text: 'AB', startPoint: { x: 1, y: 0, z: 0 }, endPoint: { x: 2, y: 1, z: 0 },
          textHeight: 2, halign: 1, valign: 2,
        },
        {
          type: 'TEXT', handle: 'T3', layer: '0', colorIndex: 256,
          text: 'CD', startPoint: { x: 5, y: 0, z: 0 }, endPoint: { x: 7, y: 0, z: 0 },
          textHeight: 2, halign: 4,
        },
      ],
      [],
      layerEntries,
    );

    const [center, middle] = normalizeDwgDatabase(database, 'text-anchor.dwg').entities;
    if (center.kind !== 'text' || middle.kind !== 'text') throw new Error('expected text');
    // 对齐方式非“左/基线”时第一个对齐点被忽略，锚点是第二个对齐点
    expect(center.position).toEqual({ x: 2, y: 1 });
    expect(center.align).toBe('center');
    expect(center.baseline).toBe('middle');
    // halign 4（Middle）= 水平与垂直都居中
    expect(middle.position).toEqual({ x: 7, y: 0 });
    expect(middle.align).toBe('center');
    expect(middle.baseline).toBe('middle');
  });

  it('applies the TEXT width factor to the primitive and its bounds', () => {
    const database = makeDatabase(
      [
        {
          type: 'TEXT', handle: 'T4', layer: '0', colorIndex: 256,
          text: 'ABCD', startPoint: { x: 0, y: 0, z: 0 }, textHeight: 2, xScale: 0.5,
        },
      ],
      [],
      layerEntries,
    );

    const [entity] = normalizeDwgDatabase(database, 'text-width-factor.dwg').entities;
    if (entity.kind !== 'text') throw new Error('expected text');
    expect(entity.widthScale).toBeCloseTo(0.5, 6);
    // 4 字符 × 0.5 em × 字号 2 × 1.35 × 0.5；基线锚点，文字盒在基线上方
    expect(entity.bounds.maxX).toBeCloseTo(2.7, 6);
    expect(entity.bounds.minY).toBeCloseTo(0, 6);
    expect(entity.bounds.maxY).toBeCloseTo(2, 6);
  });

  it('stretches FIT text between its two alignment points', () => {
    const database = makeDatabase(
      [
        {
          type: 'TEXT', handle: 'T5', layer: '0', colorIndex: 256,
          text: 'AB', startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 10, y: 0, z: 0 },
          textHeight: 2, halign: 5,
        },
      ],
      [],
      layerEntries,
    );

    const [entity] = normalizeDwgDatabase(database, 'text-fit.dwg').entities;
    if (entity.kind !== 'text') throw new Error('expected text');
    // 自然宽度 2.7，拉伸到 10
    expect(entity.widthScale).toBeCloseTo(10 / 2.7, 6);
    expect(entity.position).toEqual({ x: 0, y: 0 });
    expect(entity.bounds.maxX).toBeCloseTo(10, 6);
  });

  it('computes FIT text bounds with the same measurement used for layout', () => {
    const database = makeDatabase(
      [
        {
          type: 'TEXT', handle: 'T6', layer: '0', colorIndex: 256,
          text: 'AB', startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 40, y: 0, z: 0 },
          textHeight: 2, halign: 5,
        },
      ],
      [],
      layerEntries,
    );
    // 真实度量自然宽度 40（估算仅 2.7）；FIT 后渲染宽度仍为 40，包围盒必须一致
    const measureText = (text: string, height: number) => text.length * height * 10;
    const [entity] = normalizeDwgDatabase(database, 'text-fit-measured.dwg', { measureText }).entities;
    if (entity.kind !== 'text') throw new Error('expected text');
    expect(entity.widthScale ?? 1).toBeCloseTo(1, 6);
    expect(entity.bounds.maxX - entity.bounds.minX).toBeCloseTo(40, 6);
  });

  it('rotates MTEXT according to its x-axis direction vector', () => {
    const database = makeDatabase(
      [
        {
          type: 'MTEXT', handle: 'M4', layer: '0', colorIndex: 256,
          text: 'M12*1', insertionPoint: { x: 0, y: 0, z: 0 }, textHeight: 2,
          attachmentPoint: 1, direction: { x: 0, y: 1, z: 0 },
        },
      ],
      [],
      layerEntries,
    );

    const [entity] = normalizeDwgDatabase(database, 'mtext-direction.dwg').entities;
    if (entity.kind !== 'text') throw new Error('expected text');
    expect(entity.rotation).toBeCloseTo(Math.PI / 2, 6);
    // 文字宽 5 × 1.35 = 6.75、高 2；绕左上锚点逆时针 90° 后包围盒为 [0, 2] × [0, 6.75]
    expect(entity.bounds.minX).toBeCloseTo(0, 6);
    expect(entity.bounds.maxX).toBeCloseTo(2, 6);
    expect(entity.bounds.minY).toBeCloseTo(0, 6);
    expect(entity.bounds.maxY).toBeCloseTo(6.75, 6);
  });

  it('applies CENTER linetype dashes from the entity and its layer', () => {
    const database = makeDatabase(
      [
        {
          type: 'LINE', handle: 'L1', layer: '0', colorIndex: 256, lineType: 'CENTER', lineTypeScale: 0.5,
          startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 10, y: 0, z: 0 },
        },
        {
          type: 'LINE', handle: 'L2', layer: 'WIRE', colorIndex: 256, lineType: 'ByLayer',
          startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 10, y: 0, z: 0 },
        },
      ],
      [],
      [
        { name: '0', handle: '10', ownerHandle: '0', colorIndex: 7, color: 0xffffff },
        { name: 'WIRE', handle: '11', ownerHandle: '0', colorIndex: 1, color: 0xff0000, lineType: 'CENTER' },
      ],
      [{ name: 'CENTER', pattern: [{ elementLength: 20 }, { elementLength: -5 }, { elementLength: 5 }, { elementLength: -5 }] }],
    );

    const [direct, viaLayer] = normalizeDwgDatabase(database, 'linetype.dwg').entities;
    if (direct.kind !== 'line' || viaLayer.kind !== 'line') throw new Error('expected lines');
    // 实体比例 0.5；负段取绝对值转成 canvas 交替实/空段
    expect(direct.dash).toEqual([10, 2.5, 2.5, 2.5]);
    expect(viaLayer.dash).toEqual([20, 5, 5, 5]);
  });

  it('inherits the INSERT linetype for ByBlock entities with the block scale', () => {
    const database = makeDatabase(
      [
        {
          type: 'INSERT', handle: 'I1', layer: '0', colorIndex: 256, name: 'SYM', lineType: 'CENTER',
          insertionPoint: { x: 0, y: 0, z: 0 }, xScale: 2, yScale: 2, rotation: 0,
          columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs: [],
        },
      ],
      [
        {
          name: 'SYM',
          basePoint: { x: 0, y: 0, z: 0 },
          entities: [
            {
              type: 'LINE', handle: 'L3', layer: '0', colorIndex: 256, lineType: 'ByBlock',
              startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 1, y: 0, z: 0 },
            },
          ],
        },
      ],
      layerEntries,
      [{ name: 'CENTER', pattern: [{ elementLength: 20 }, { elementLength: -5 }] }],
    );

    const [line] = normalizeDwgDatabase(database, 'linetype-block.dwg').entities;
    if (line.kind !== 'line') throw new Error('expected line');
    // 块缩放 2：虚线长度随块缩放
    expect(line.dash).toEqual([40, 10]);
  });

  it('closes hatch boundary paths when isClosed is reported as a number', () => {
    const database = makeDatabase(
      [
        {
          type: 'HATCH', handle: 'H4', layer: '0', colorIndex: 256, solidFill: 1,
          boundaryPaths: [{
            boundaryPathTypeFlag: 7,
            isClosed: 1,
            vertices: [{ x: 1, y: 0, bulge: 1 }, { x: -1, y: 0, bulge: 1 }],
          }],
        },
      ],
      [],
      layerEntries,
    );

    const [entity] = normalizeDwgDatabase(database, 'hatch-circle.dwg').entities;
    if (entity.kind !== 'hatch') throw new Error('expected hatch');
    const points = entity.paths[0].points;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    // 闭合段由最后一个顶点的 bulge 定义：两段半圆拼成整圆（圆心 0,0、半径 1）；
    // 若闭合标志被误判，只会剩一个半圆
    expect(Math.min(...xs)).toBeCloseTo(-1, 3);
    expect(Math.max(...xs)).toBeCloseTo(1, 3);
    expect(Math.min(...ys)).toBeCloseTo(-1, 3);
    expect(Math.max(...ys)).toBeCloseTo(1, 3);
  });

  it('converts hatch pattern definition lines into world coordinates', () => {
    const database = makeDatabase(
      [
        {
          type: 'HATCH', handle: 'H1', layer: '0', colorIndex: 256, solidFill: 0,
          boundaryPaths: [{
            boundaryPathTypeFlag: 1,
            isClosed: true,
            vertices: [
              { x: 0, y: 0, bulge: 0 }, { x: 10, y: 0, bulge: 0 },
              { x: 10, y: 10, bulge: 0 }, { x: 0, y: 10, bulge: 0 },
            ],
          }],
          definitionLines: [
            { angle: Math.PI / 4, base: { x: 1, y: 2 }, offset: { x: -0.6735, y: 0.6735 }, dashLengths: [4, -2] },
          ],
        },
      ],
      [],
      layerEntries,
    );

    const [entity] = normalizeDwgDatabase(database, 'hatch-pattern.dwg').entities;
    if (entity.kind !== 'hatch') throw new Error('expected hatch');
    expect(entity.solid).toBe(false);
    expect(entity.pattern).toHaveLength(1);
    expect(entity.pattern![0].angle).toBeCloseTo(Math.PI / 4, 6);
    expect(entity.pattern![0].base).toEqual({ x: 1, y: 2 });
    expect(entity.pattern![0].offset.x).toBeCloseTo(-0.6735, 6);
    expect(entity.pattern![0].dashes).toEqual([4, 2]);
  });

  it('keeps ellipse coordinates in WCS when the extrusion is mirrored', () => {
    const database = makeDatabase(
      [
        {
          type: 'ELLIPSE',
          handle: 'E1',
          layer: 'WIRE',
          colorIndex: 256,
          center: { x: 10, y: 20, z: 0 },
          majorAxisEndPoint: { x: 4, y: 0, z: 0 },
          axisRatio: 0.5,
          startAngle: 0,
          endAngle: Math.PI * 2,
          extrusionDirection: { x: 0, y: 0, z: -1 },
        },
      ],
      [],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'ellipse-mirrored.dwg');
    expect(drawing.entities).toHaveLength(1);
    const [entity] = drawing.entities;
    expect(entity.kind).toBe('polyline');
    if (entity.kind !== 'polyline') throw new Error('expected polyline');
    // 中心 (10,20)、长轴 4、短轴 2：法线 -Z 只翻转扫掠方向，不应镜像到负坐标
    expect(entity.bounds.minX).toBeCloseTo(6, 6);
    expect(entity.bounds.maxX).toBeCloseTo(14, 6);
    expect(entity.bounds.minY).toBeCloseTo(18, 6);
    expect(entity.bounds.maxY).toBeCloseTo(22, 6);
  });

  it('projects the minor axis of a tilted ellipse through the extrusion normal', () => {
    const database = makeDatabase(
      [
        {
          type: 'ELLIPSE',
          handle: 'E2',
          layer: 'WIRE',
          colorIndex: 256,
          center: { x: 0, y: 0, z: 0 },
          majorAxisEndPoint: { x: 0, y: 4, z: 0 },
          axisRatio: 0.5,
          startAngle: 0,
          endAngle: Math.PI * 2,
          // 长轴 (0,4) 与法线垂直：N × M = (-0.866, 0, 0.5)，短轴 XY 分量为 (-1.732, 0)
          extrusionDirection: { x: 0.5, y: 0, z: Math.sqrt(3) / 2 },
        },
      ],
      [],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'ellipse-tilted.dwg');
    const [entity] = drawing.entities;
    if (entity.kind !== 'polyline') throw new Error('expected polyline');
    expect(entity.bounds.minX).toBeCloseTo(-1.732, 3);
    expect(entity.bounds.maxX).toBeCloseTo(1.732, 3);
    expect(entity.bounds.minY).toBeCloseTo(-4, 6);
    expect(entity.bounds.maxY).toBeCloseTo(4, 6);
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

  it('uses model space entities and hides off/frozen layers by default', () => {
    const modelLine = {
      type: 'LINE', handle: '70', layer: '0', colorIndex: 256,
      startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 1, y: 0, z: 0 },
    };
    const paperLine = {
      type: 'LINE', handle: '71', layer: '0', colorIndex: 256,
      startPoint: { x: 50, y: 50, z: 0 }, endPoint: { x: 51, y: 50, z: 0 },
    };
    const database = makeDatabase(
      [modelLine, paperLine],
      [
        { name: '*Model_Space', basePoint: { x: 0, y: 0, z: 0 }, entities: [modelLine] },
        { name: '*Paper_Space', basePoint: { x: 0, y: 0, z: 0 }, entities: [paperLine] },
      ],
      [
        ...layerEntries,
        { name: 'HIDDEN_OFF', handle: '12', ownerHandle: '0', colorIndex: 3, color: 0x00ff00, off: true },
        { name: 'HIDDEN_FROZEN', handle: '13', ownerHandle: '0', colorIndex: 4, color: 0x00ffff, frozen: true },
      ],
    );

    const drawing = normalizeDwgDatabase(database, 'layout.dwg');
    expect(drawing.stats.rendered).toBe(1);
    const [line] = drawing.entities;
    if (line.kind !== 'line') throw new Error('expected line');
    expect(line.a.x).toBeCloseTo(0, 6);
    expect(drawing.hiddenLayers).toEqual(['HIDDEN_OFF', 'HIDDEN_FROZEN']);
    expect(drawing.layers.find((layer) => layer.name === 'HIDDEN_OFF')?.off).toBe(true);
  });

  it('treats negative color index as by-layer and expands text bounds by width', () => {
    const database = makeDatabase(
      [
        { type: 'LINE', handle: '80', layer: 'WIRE', colorIndex: -1, startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 1, y: 0, z: 0 } },
        {
          type: 'TEXT', handle: '81', layer: '0', colorIndex: 256,
          text: 'M12A-04-CONNECTOR-LONG-TEXT', startPoint: { x: 0, y: 0, z: 0 }, textHeight: 2,
        },
      ],
      [],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'colors.dwg');
    const line = drawing.entities.find((entity) => entity.kind === 'line');
    expect(line?.color).toBe('#ff0000');
    const text = drawing.entities.find((entity) => entity.kind === 'text');
    expect(text?.bounds.maxX ?? 0).toBeGreaterThan(20);
  });

  it('renders top-level insert attributes once when model space record lacks them', () => {
    // 真实转换器行为：*Model_Space 记录不含 ATTRIB，ATTRIB 由转换器额外 push 到 db.entities
    const attrib = {
      type: 'ATTRIB', handle: 'A2', layer: '0', colorIndex: 256, flags: 0,
      text: { text: 'VAL-1', startPoint: { x: 7, y: 9, z: 0 }, textHeight: 1 },
    };
    const insert = {
      type: 'INSERT', handle: 'A1', layer: '0', colorIndex: 256, name: 'SYM',
      insertionPoint: { x: 2, y: 3, z: 0 }, xScale: 1, yScale: 1, rotation: 0,
      columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs: [attrib],
    };
    const database = makeDatabase(
      [insert, attrib],
      [
        { name: '*Model_Space', basePoint: { x: 0, y: 0, z: 0 }, entities: [insert] },
        {
          name: 'SYM',
          basePoint: { x: 0, y: 0, z: 0 },
          entities: [
            { type: 'LINE', handle: 'A3', layer: '0', colorIndex: 256, startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 1, y: 0, z: 0 } },
          ],
        },
      ],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'attrib-model.dwg');
    const texts = drawing.entities.filter((entity) => entity.kind === 'text');
    expect(texts).toHaveLength(1);
    if (texts[0].kind !== 'text') throw new Error('expected text');
    expect(texts[0].lines).toEqual(['VAL-1']);
    // 顶层 INSERT 的属性位置本身已是 WCS，不应再叠加插入点偏移
    expect(texts[0].position.x).toBeCloseTo(7, 6);
    expect(texts[0].position.y).toBeCloseTo(9, 6);
    expect(drawing.entities.filter((entity) => entity.kind === 'line')).toHaveLength(1);
  });

  it('renders top-level insert attributes once in the fallback path', () => {
    const attrib = {
      type: 'ATTRIB', handle: 'B2', layer: '0', colorIndex: 256, flags: 0,
      text: { text: 'VAL-2', startPoint: { x: 0, y: 0, z: 0 }, textHeight: 1 },
    };
    const insert = {
      type: 'INSERT', handle: 'B1', layer: '0', colorIndex: 256, name: 'SYM',
      insertionPoint: { x: 0, y: 0, z: 0 }, xScale: 1, yScale: 1, rotation: 0,
      columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs: [attrib],
    };
    // 无 *Model_Space 记录时回退到 db.entities，其中同时存在 INSERT 与其 ATTRIB
    const database = makeDatabase(
      [insert, attrib],
      [
        {
          name: 'SYM',
          basePoint: { x: 0, y: 0, z: 0 },
          entities: [
            { type: 'LINE', handle: 'B3', layer: '0', colorIndex: 256, startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 1, y: 0, z: 0 } },
          ],
        },
      ],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'attrib-fallback.dwg');
    const texts = drawing.entities.filter((entity) => entity.kind === 'text');
    expect(texts).toHaveLength(1);
    if (texts[0].kind !== 'text') throw new Error('expected text');
    expect(texts[0].lines).toEqual(['VAL-2']);
  });

  it('excludes paper space entities in the fallback path by owner block record', () => {
    const modelLine = {
      type: 'LINE', handle: 'C1', layer: '0', colorIndex: 256, ownerBlockRecordSoftId: '1F',
      startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 1, y: 0, z: 0 },
    };
    const paperLine = {
      type: 'LINE', handle: 'C2', layer: '0', colorIndex: 256, ownerBlockRecordSoftId: 'D2',
      startPoint: { x: 50, y: 50, z: 0 }, endPoint: { x: 51, y: 50, z: 0 },
    };
    const database = makeDatabase(
      [modelLine, paperLine],
      [
        { name: '*Model_Space', handle: '1F', basePoint: { x: 0, y: 0, z: 0 }, entities: [] },
        { name: '*Paper_Space', handle: 'D2', basePoint: { x: 0, y: 0, z: 0 }, entities: [] },
      ],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'fallback-paper.dwg');
    expect(drawing.stats.rendered).toBe(1);
    const [line] = drawing.entities;
    if (line.kind !== 'line') throw new Error('expected line');
    expect(line.a.x).toBeCloseTo(0, 6);
  });

  it('samples hatch elliptical edges with center-relative major axis and sweep', () => {
    const database = makeDatabase(
      [
        {
          type: 'HATCH', handle: 'D1', layer: '0', colorIndex: 256, solidFill: 1,
          boundaryPaths: [{
            boundaryPathTypeFlag: 3,
            edges: [{
              type: 3,
              center: { x: 100, y: 50 },
              end: { x: 10, y: 0 },
              lengthOfMinorAxis: 0.5,
              startAngle: 0,
              endAngle: Math.PI / 2,
              isCCW: true,
            }],
          }],
        },
      ],
      [],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'hatch-ellipse.dwg');
    const [entity] = drawing.entities;
    if (entity.kind !== 'hatch') throw new Error('expected hatch');
    const points = entity.paths[0].points;
    expect(points[0].x).toBeCloseTo(110, 6);
    expect(points[0].y).toBeCloseTo(50, 6);
    const last = points[points.length - 1];
    expect(last.x).toBeCloseTo(100, 6);
    expect(last.y).toBeCloseTo(55, 6);
    expect(entity.bounds.maxX).toBeCloseTo(110, 6);
    expect(entity.bounds.maxY).toBeCloseTo(55, 6);
    expect(entity.bounds.minX).toBeCloseTo(100, 6);
  });

  it('honours the counterclockwise flag of hatch arc edges', () => {
    const buildHatch = (isCCW: boolean) => makeDatabase(
      [
        {
          type: 'HATCH', handle: 'E1', layer: '0', colorIndex: 256, solidFill: 0,
          boundaryPaths: [{
            boundaryPathTypeFlag: 3,
            edges: [{ type: 2, center: { x: 0, y: 0 }, radius: 1, startAngle: 0, endAngle: Math.PI / 2, isCCW }],
          }],
        },
      ],
      [],
      layerEntries,
    );

    const shortWay = normalizeDwgDatabase(buildHatch(true), 'arc-ccw.dwg').entities[0];
    const longWay = normalizeDwgDatabase(buildHatch(false), 'arc-cw.dwg').entities[0];
    if (shortWay.kind !== 'hatch' || longWay.kind !== 'hatch') throw new Error('expected hatch');
    expect(shortWay.paths[0].points.length).toBeLessThan(20);
    expect(longWay.paths[0].points.length).toBeGreaterThan(30);
  });

  it('renders attributes of nested block references', () => {
    const database = makeDatabase(
      [
        {
          type: 'INSERT', handle: '90', layer: '0', colorIndex: 256, name: 'SYM',
          insertionPoint: { x: 5, y: 5, z: 0 }, xScale: 1, yScale: 1, rotation: 0,
          columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs: [],
        },
      ],
      [
        {
          name: 'SYM',
          basePoint: { x: 0, y: 0, z: 0 },
          entities: [
            {
              type: 'INSERT', handle: '91', layer: '0', colorIndex: 256, name: 'SUB',
              insertionPoint: { x: 0, y: 0, z: 0 }, xScale: 1, yScale: 1, rotation: 0,
              columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0,
              attribs: [
                {
                  type: 'ATTRIB', handle: '92', layer: '0', colorIndex: 256, flags: 0,
                  text: { text: 'TAG-1', startPoint: { x: 0, y: 0, z: 0 }, textHeight: 1 },
                },
              ],
            },
          ],
        },
        {
          name: 'SUB',
          basePoint: { x: 0, y: 0, z: 0 },
          entities: [
            { type: 'LINE', handle: '93', layer: '0', colorIndex: 256, startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 1, y: 0, z: 0 } },
          ],
        },
      ],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'nested.dwg');
    const text = drawing.entities.find((entity) => entity.kind === 'text');
    if (!text || text.kind !== 'text') throw new Error('expected text');
    expect(text.lines).toEqual(['TAG-1']);
    expect(text.position.x).toBeCloseTo(5, 6);
    expect(text.position.y).toBeCloseTo(5, 6);
  });

  it('expands dimension geometry and text from its anonymous block', () => {
    const dimension = {
      type: 'DIMENSION', handle: 'D1', layer: 'WIRE', colorIndex: 256, name: '*D1',
      definitionPoint: { x: 0, y: 0, z: 0 }, textPoint: { x: 5, y: 1, z: 0 },
      measurement: 10, text: '10', textRotation: 0,
    };
    const database = makeDatabase(
      [dimension],
      [
        { name: '*Model_Space', basePoint: { x: 0, y: 0, z: 0 }, entities: [dimension] },
        {
          name: '*D1',
          basePoint: { x: 0, y: 0, z: 0 },
          entities: [
            { type: 'LINE', handle: 'D2', layer: '0', colorIndex: 0, startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 10, y: 0, z: 0 } },
            {
              type: 'MTEXT', handle: 'D3', layer: '0', colorIndex: 0,
              text: '{\\fSimSun|b0|i0|c0|p2;\\H0.8x;500±10}',
              insertionPoint: { x: 5, y: 1, z: 0 }, textHeight: 2.5, attachmentPoint: 5,
            },
          ],
        },
      ],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'dimension.dwg');
    expect(drawing.stats.rendered).toBe(2);
    expect(drawing.stats.text).toBe(1);
    expect(drawing.stats.skipped).toEqual({});
    const line = drawing.entities.find((entity) => entity.kind === 'line');
    if (!line || line.kind !== 'line') throw new Error('expected line');
    expect(line.a).toEqual({ x: 0, y: 0 });
    expect(line.b).toEqual({ x: 10, y: 0 });
    // 标注块内 BYBLOCK 颜色继承 DIMENSION 所在图层（红）
    expect(line.color).toBe('#ff0000');
    const text = drawing.entities.find((entity) => entity.kind === 'text');
    if (!text || text.kind !== 'text') throw new Error('expected text');
    expect(text.lines).toEqual(['500±10']);
    expect(text.position).toEqual({ x: 5, y: 1 });
    // 块内 \\H0.8x; 生效：2.5 × 0.8
    expect(text.height).toBeCloseTo(2.0, 6);
  });

  it('uses the absolute inline height when present', () => {
    const database = makeDatabase(
      [
        {
          type: 'MTEXT', handle: 'M3', layer: '0', colorIndex: 256,
          text: '\\H1.5;ABS',
          insertionPoint: { x: 0, y: 0, z: 0 }, textHeight: 2.5, attachmentPoint: 1,
        },
      ],
      [],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'mtext-abs-height.dwg');
    const [entity] = drawing.entities;
    if (entity.kind !== 'text') throw new Error('expected text');
    expect(entity.height).toBeCloseTo(1.5, 6);
  });

  it('skips dimensions whose anonymous block is missing', () => {
    const database = makeDatabase(
      [{ type: 'DIMENSION', handle: 'D1', layer: 'WIRE', colorIndex: 256, name: '*D9', text: '10' }],
      [],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'dimension-broken.dwg');
    expect(drawing.stats.rendered).toBe(0);
    expect(drawing.stats.skipped).toEqual({ DIMENSION: 1 });
  });

  it('renders leaders as open polylines through their vertices', () => {
    const database = makeDatabase(
      [
        {
          type: 'LEADER', handle: 'L1', layer: 'WIRE', colorIndex: 256,
          numberOfVertices: 3,
          vertices: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 3, z: 0 }, { x: 5, y: 3, z: 0 }],
        },
      ],
      [],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'leader.dwg');
    expect(drawing.entities).toHaveLength(1);
    const [entity] = drawing.entities;
    expect(entity.kind).toBe('polyline');
    if (entity.kind !== 'polyline') throw new Error('expected polyline');
    expect(entity.closed).toBe(false);
    expect(entity.points).toEqual([{ x: 0, y: 0 }, { x: 2, y: 3 }, { x: 5, y: 3 }]);
    expect(entity.color).toBe('#ff0000');
  });

  it('renders an image frame from its position, pixel vectors and size', () => {
    const database = makeDatabase(
      [
        {
          type: 'IMAGE', handle: 'I1', layer: '0', colorIndex: 256,
          position: { x: 10, y: 20, z: 0 },
          uPixel: { x: 0.5, y: 0, z: 0 },
          vPixel: { x: 0, y: 0.5, z: 0 },
          imageSize: { x: 4, y: 2 },
        },
      ],
      [],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'image.dwg');
    expect(drawing.entities).toHaveLength(1);
    const [entity] = drawing.entities;
    expect(entity.kind).toBe('polyline');
    if (entity.kind !== 'polyline') throw new Error('expected polyline');
    expect(entity.closed).toBe(true);
    expect(entity.points).toEqual([
      { x: 10, y: 20 },
      { x: 12, y: 20 },
      { x: 12, y: 21 },
      { x: 10, y: 21 },
    ]);
    expect(entity.bounds).toEqual({ minX: 10, minY: 20, maxX: 12, maxY: 21 });
  });

  it('shows the image path inside the frame when the raster is unavailable', () => {
    const database = makeDatabase(
      [
        {
          type: 'IMAGE', handle: 'I2', layer: '0', colorIndex: 256,
          position: { x: 0, y: 0, z: 0 },
          uPixel: { x: 0.5, y: 0, z: 0 },
          vPixel: { x: 0, y: 0.5, z: 0 },
          imageSize: { x: 4, y: 2 },
          imageDefHandle: 'ID1',
        },
      ],
      [],
      layerEntries,
      [],
      [{ handle: 'ID1', fileName: 'C:\\Users\\79574\\Desktop\\样品照.jpg' }],
    );

    const drawing = normalizeDwgDatabase(database, 'image-path.dwg');
    expect(drawing.entities).toHaveLength(2);
    const text = drawing.entities.find((entity) => entity.kind === 'text');
    if (!text || text.kind !== 'text') throw new Error('expected text');
    expect(text.lines).toEqual(['C:\\Users\\79574\\Desktop\\样品照.jpg']);
    // 居中显示在图像边框内（框范围 (0,0)-(2,1)）
    expect(text.position).toEqual({ x: 1, y: 0.5 });
    expect(text.align).toBe('center');
    expect(text.baseline).toBe('middle');
    expect(text.wrapWidth).toBeCloseTo(2 * 0.92, 6);
    expect(text.height).toBeGreaterThan(0);
    expect(drawing.externalImages).toEqual([{ path: 'C:\\Users\\79574\\Desktop\\样品照.jpg' }]);
  });

  it('records placed images without IMAGEDEF as missing external images', () => {
    const database = makeDatabase(
      [
        {
          type: 'IMAGE', handle: 'I3', layer: '0', colorIndex: 256,
          position: { x: 0, y: 0, z: 0 },
          uPixel: { x: 0.5, y: 0, z: 0 },
          vPixel: { x: 0, y: 0.5, z: 0 },
          imageSize: { x: 4, y: 2 },
          imageDefHandle: 'ID9',
        },
      ],
      [],
      layerEntries,
    );

    const drawing = normalizeDwgDatabase(database, 'image-missing-def.dwg');
    expect(drawing.entities).toHaveLength(1);
    expect(drawing.externalImages).toEqual([{ path: null }]);
  });

  it('wraps MTEXT with the provided font measurement and keeps bounds in sync', () => {
    const database = makeDatabase(
      [
        {
          type: 'MTEXT', handle: 'M7', layer: '0', colorIndex: 256,
          text: 'AB CD EF', insertionPoint: { x: 0, y: 0, z: 0 }, textHeight: 2,
          attachmentPoint: 1, rectWidth: 10,
        },
      ],
      [],
      layerEntries,
    );
    const estimate = normalizeDwgDatabase(database, 'mtext-measure.dwg');
    const measured = normalizeDwgDatabase(database, 'mtext-measure.dwg', {
      measureText: (text, height) => textWidthOf(text, height) * 2,
    });
    const estimateText = estimate.entities[0];
    const measuredText = measured.entities[0];
    if (estimateText.kind !== 'text' || measuredText.kind !== 'text') throw new Error('expected text');

    expect(estimateText.lines).toEqual(['AB CD', 'EF']);
    expect(measuredText.lines).toEqual(['AB', 'CD', 'EF']);
    // 折行变化必须同步反映到包围盒（多了一行更高），否则视口裁剪会用到过期范围
    expect(measuredText.bounds.maxY - measuredText.bounds.minY)
      .toBeGreaterThan(estimateText.bounds.maxY - estimateText.bounds.minY);
  });
});

describe('renderDwgToCanvas', () => {
  function createMockContext(measureWidth: (text: string) => number) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const record = (method: string) => (...args: unknown[]) => {
      calls.push({ method, args });
    };
    const context = {
      canvas: { width: 800, height: 600 },
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineJoin: 'round',
      lineCap: 'round',
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      setTransform: record('setTransform'),
      fillRect: record('fillRect'),
      save: record('save'),
      restore: record('restore'),
      translate: record('translate'),
      rotate: record('rotate'),
      scale: record('scale'),
      beginPath: record('beginPath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      arc: record('arc'),
      closePath: record('closePath'),
      stroke: record('stroke'),
      fill: record('fill'),
      clip: record('clip'),
      setLineDash: record('setLineDash'),
      fillText: record('fillText'),
      measureText: (text: string) => ({ width: measureWidth(text) }),
    };
    return { context: context as unknown as CanvasRenderingContext2D, calls };
  }

  /** 取出 HATCH 裁剪之后记录的图案线段（moveTo/lineTo 成对出现）。 */
  function patternSegments(calls: Array<{ method: string; args: unknown[] }>) {
    const clipIndex = calls.findIndex((call) => call.method === 'clip');
    const segments: Array<{ a: { x: number; y: number }; b: { x: number; y: number } }> = [];
    let pending: { x: number; y: number } | null = null;
    for (let index = clipIndex + 1; index < calls.length; index += 1) {
      const call = calls[index];
      if (call.method === 'moveTo') {
        pending = { x: call.args[0] as number, y: call.args[1] as number };
      } else if (call.method === 'lineTo' && pending) {
        segments.push({ a: pending, b: { x: call.args[0] as number, y: call.args[1] as number } });
        pending = null;
      }
    }
    return segments;
  }

  function clipSegmentToRect(
    segment: { a: { x: number; y: number }; b: { x: number; y: number } },
    rect: { minX: number; minY: number; maxX: number; maxY: number },
  ): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
    let t0 = 0;
    let t1 = 1;
    const dx = segment.b.x - segment.a.x;
    const dy = segment.b.y - segment.a.y;
    const p = [-dx, dx, -dy, dy];
    const q = [
      segment.a.x - rect.minX,
      rect.maxX - segment.a.x,
      segment.a.y - rect.minY,
      rect.maxY - segment.a.y,
    ];
    for (let index = 0; index < 4; index += 1) {
      if (p[index] === 0) {
        if (q[index] < 0) return null;
        continue;
      }
      const r = q[index] / p[index];
      if (p[index] < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return null;
    }
    return {
      a: { x: segment.a.x + t0 * dx, y: segment.a.y + t0 * dy },
      b: { x: segment.a.x + t1 * dx, y: segment.a.y + t1 * dy },
    };
  }

  function segmentHitsRect(
    segment: { a: { x: number; y: number }; b: { x: number; y: number } },
    rect: { minX: number; minY: number; maxX: number; maxY: number },
  ): boolean {
    return clipSegmentToRect(segment, rect) !== null;
  }

  const regionBounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

  function renderHatch(
    definitionLines: Array<{ angle: number; base: { x: number; y: number }; offset: { x: number; y: number }; dashLengths?: number[] }>,
    translation = { x: 0, y: 0 },
    boundaryPaths?: unknown[],
  ) {
    const { x, y } = translation;
    const database = makeDatabase(
      [
        {
          type: 'HATCH', handle: 'H30', layer: '0', colorIndex: 256, solidFill: 0,
          boundaryPaths: boundaryPaths ?? [{
            isClosed: true,
            vertices: [
              { x: x + 0, y: y + 0, bulge: 0 }, { x: x + 10, y: y + 0, bulge: 0 },
              { x: x + 10, y: y + 10, bulge: 0 }, { x: x + 0, y: y + 10, bulge: 0 },
            ],
          }],
          definitionLines: definitionLines.map((line) => ({
            angle: line.angle,
            base: { x: line.base.x + x, y: line.base.y + y },
            offset: line.offset,
            dashLengths: line.dashLengths ?? [],
          })),
        },
      ],
      [],
      layerEntries,
    );
    const drawing = normalizeDwgDatabase(database, 'hatch-render.dwg');
    const { context, calls } = createMockContext((line) => line.length * 20);
    // 平移夹具时同步平移视图，避免图元被视口裁剪（屏幕 y 为 -worldY + offsetY）
    renderDwgToCanvas(context, drawing, {
      scale: 1,
      offsetX: -x,
      offsetY: y,
      lineWidth: 1,
      fontFamily: 'test',
    });
    return { segments: patternSegments(calls), calls };
  }

  function translateSegments(
    segments: Array<{ a: { x: number; y: number }; b: { x: number; y: number } }>,
    dx: number,
    dy: number,
  ) {
    return segments
      .map((segment) => ({
        a: { x: segment.a.x - dx, y: segment.a.y - dy },
        b: { x: segment.b.x - dx, y: segment.b.y - dy },
      }))
      .sort((left, right) => (left.a.x - right.a.x) || (left.a.y - right.a.y) || (left.b.x - right.b.x));
  }

  it('covers the region when the pattern base is far away along the line direction', () => {
    // 04-093 锁紧环滚花的实际形态：45°/135° 交叉图案，基点远离区域（合成夹具）
    const { segments } = renderHatch([
      { angle: Math.PI / 4, base: { x: 620000, y: 380000 }, offset: { x: -0.6735, y: 0.6735 } },
      { angle: (3 * Math.PI) / 4, base: { x: 620000, y: 380000 }, offset: { x: -0.6735, y: -0.6735 } },
    ]);

    const hitting = segments.filter((segment) => segmentHitsRect(segment, regionBounds));
    expect(hitting.length).toBeGreaterThan(5);
    for (const segment of hitting) {
      // 每条线段必须平行于其图案线方向（±45°）
      const dx = Math.abs(segment.b.x - segment.a.x);
      const dy = Math.abs(segment.b.y - segment.a.y);
      expect(Math.abs(dx - dy)).toBeLessThan(1e-6);
    }
  });

  it('keeps hatch intersection geometry translation-invariant', () => {
    const pattern = [
      { angle: Math.PI / 4, base: { x: 3, y: -2 }, offset: { x: -0.6735, y: 0.6735 } },
      { angle: (3 * Math.PI) / 4, base: { x: 3, y: -2 }, offset: { x: -0.6735, y: -0.6735 } },
    ];
    const clipToRegion = (segments: ReturnType<typeof renderHatch>['segments'], dx: number, dy: number) => (
      translateSegments(segments, dx, dy)
        .map((segment) => clipSegmentToRect(segment, regionBounds))
        .filter((segment): segment is NonNullable<typeof segment> => segment !== null)
    );
    const local = clipToRegion(renderHatch(pattern).segments, 0, 0);
    const shifted = clipToRegion(renderHatch(pattern, { x: 100000, y: -100000 }).segments, 100000, -100000);

    expect(local.length).toBeGreaterThan(5);
    expect(shifted).toHaveLength(local.length);
    for (let index = 0; index < local.length; index += 1) {
      expect(shifted[index].a.x).toBeCloseTo(local[index].a.x, 6);
      expect(shifted[index].a.y).toBeCloseTo(local[index].a.y, 6);
      expect(shifted[index].b.x).toBeCloseTo(local[index].b.x, 6);
      expect(shifted[index].b.y).toBeCloseTo(local[index].b.y, 6);
    }
  });

  it('anchors dash phase to the pattern base point when segments are extended', () => {
    const base = { x: 120000, y: -80000 };
    const databaseDash = [2, 1];
    const period = databaseDash[0] + databaseDash[1];
    const direction = { x: Math.cos(Math.PI / 4), y: Math.sin(Math.PI / 4) };
    const { segments } = renderHatch([
      { angle: Math.PI / 4, base, offset: { x: -0.6735, y: 0.6735 }, dashLengths: databaseDash },
    ]);

    const hitting = segments.filter((segment) => segmentHitsRect(segment, regionBounds));
    expect(hitting.length).toBeGreaterThan(5);
    for (const segment of hitting) {
      const distance = (segment.a.x - base.x) * direction.x + (segment.a.y - base.y) * direction.y;
      const phase = ((distance % period) + period) % period;
      expect(Math.min(phase, period - phase)).toBeLessThan(1e-6);
    }
  });

  it('repeats odd-length dash arrays when aligning hatch phase', () => {
    // Canvas 对 [2] 按 [2,2] 绘制，周期为 4；奇数数组必须先补成偶数再算相位。
    // 区域 x∈[10,20]，k=0 图案线（y=0）minT=10 → 相位 2 → 起点 8。
    const renderDashed = (dashLengths: number[]) => {
      const database = makeDatabase(
        [
          {
            type: 'HATCH', handle: 'H9', layer: '0', colorIndex: 256, solidFill: 0,
            boundaryPaths: [{
              isClosed: true,
              vertices: [
                { x: 10, y: 0.5, bulge: 0 }, { x: 20, y: 0.5, bulge: 0 },
                { x: 20, y: 10.5, bulge: 0 }, { x: 10, y: 10.5, bulge: 0 },
              ],
            }],
            definitionLines: [{ angle: 0, base: { x: 0, y: 0 }, offset: { x: 0, y: 1 }, dashLengths }],
          },
        ],
        [],
        layerEntries,
      );
      const drawing = normalizeDwgDatabase(database, 'hatch-dash-odd.dwg');
      const { context, calls } = createMockContext((line) => line.length * 20);
      // 视口必须覆盖区域（y 0.5..10.5），否则整个填充会被视口剔除
      renderDwgToCanvas(context, drawing, { scale: 1, offsetX: 0, offsetY: 600, lineWidth: 1, fontFamily: 'test' });
      return patternSegments(calls);
    };

    const oddStart = renderDashed([2]).find((segment) => segment.a.y === 0 && segment.b.y === 0);
    const evenStart = renderDashed([2, 2]).find((segment) => segment.a.y === 0 && segment.b.y === 0);
    expect(oddStart?.a.x).toBeCloseTo(8, 6);
    expect(evenStart?.a.x).toBeCloseTo(8, 6);
  });

  it('handles rotated, negative-spacing and cross patterns inside the region', () => {
    const cases = [
      { angle: 0, offset: { x: 0, y: 1 } },
      { angle: Math.PI / 2, offset: { x: -1, y: 0 } },
      { angle: Math.PI / 4, offset: { x: 0.6735, y: -0.6735 } },
      { angle: (3 * Math.PI) / 4, offset: { x: -0.6735, y: -0.6735 } },
      { angle: Math.PI / 4, offset: { x: 0.3, y: -0.9735 } },
    ];
    for (const pattern of cases) {
      const { segments } = renderHatch([{ ...pattern, base: { x: 50000, y: -30000 } }]);
      const hitting = segments.filter((segment) => segmentHitsRect(segment, regionBounds));
      expect(hitting.length, JSON.stringify(pattern)).toBeGreaterThan(3);
      const direction = { x: Math.cos(pattern.angle), y: Math.sin(pattern.angle) };
      for (const segment of hitting) {
        const dx = segment.b.x - segment.a.x;
        const dy = segment.b.y - segment.a.y;
        const cross = dx * direction.y - dy * direction.x;
        expect(Math.abs(cross), JSON.stringify(pattern)).toBeLessThan(1e-6);
      }
    }
  });

  it('traces island paths before clipping crosshatch patterns', () => {
    const outer = [
      { x: 0, y: 0, bulge: 0 }, { x: 10, y: 0, bulge: 0 },
      { x: 10, y: 10, bulge: 0 }, { x: 0, y: 10, bulge: 0 },
    ];
    const hole = [
      { x: 4, y: 4, bulge: 0 }, { x: 6, y: 4, bulge: 0 },
      { x: 6, y: 6, bulge: 0 }, { x: 4, y: 6, bulge: 0 },
    ];
    const { segments, calls } = renderHatch(
      [{ angle: Math.PI / 4, base: { x: 80000, y: 60000 }, offset: { x: -0.6735, y: 0.6735 } }],
      { x: 0, y: 0 },
      [{ isClosed: true, vertices: outer }, { isClosed: true, vertices: hole }],
    );

    const clipIndex = calls.findIndex((call) => call.method === 'clip');
    const boundaryMoves = calls.slice(0, clipIndex).filter((call) => call.method === 'moveTo');
    expect(boundaryMoves).toHaveLength(2);
    expect(calls[clipIndex].args[0]).toBe('evenodd');
    expect(segments.filter((segment) => segmentHitsRect(segment, regionBounds)).length).toBeGreaterThan(5);
  });

  it('rotates text by its direction and squeezes wrapped lines into the reference box', () => {
    const database = makeDatabase(
      [
        {
          type: 'MTEXT', handle: 'M5', layer: '0', colorIndex: 256,
          text: 'M12*1', insertionPoint: { x: 0, y: 0, z: 0 }, textHeight: 2,
          attachmentPoint: 1, rectWidth: 10, direction: { x: 0, y: 1, z: 0 },
        },
      ],
      [],
      layerEntries,
    );
    const drawing = normalizeDwgDatabase(database, 'mtext-render.dwg');
    const { context, calls } = createMockContext((line) => line.length * 20);

    renderDwgToCanvas(context, drawing, { scale: 1, offsetX: 0, offsetY: 0, lineWidth: 1, fontFamily: 'test' });

    const rotateCall = calls.find((call) => call.method === 'rotate');
    expect(rotateCall?.args[0] as number).toBeCloseTo(-Math.PI / 2, 6);
    // 实测 5 字符 100px，参考框 10 → 压缩到 10 / 100
    const scaleCall = calls.find((call) => call.method === 'scale');
    expect(scaleCall?.args[0] as number).toBeCloseTo(0.1, 6);
    expect(scaleCall?.args[1]).toBe(1);
    expect(calls.some((call) => call.method === 'fillText' && call.args[0] === 'M12*1')).toBe(true);
  });

  it('converts device-pixel line width into world units with a hairline floor', () => {
    const database = makeDatabase(
      [
        {
          type: 'LINE', handle: 'L10', layer: '0', colorIndex: 256,
          startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 10, y: 0, z: 0 },
        },
      ],
      [],
      layerEntries,
    );
    const drawing = normalizeDwgDatabase(database, 'line-width.dwg');

    const normal = createMockContext(() => 10);
    renderDwgToCanvas(normal.context, drawing, { scale: 4, offsetX: 0, offsetY: 0, lineWidth: 2, fontFamily: 'test' });
    expect(normal.context.lineWidth).toBeCloseTo(0.5, 6);

    const floored = createMockContext(() => 10);
    renderDwgToCanvas(floored.context, drawing, { scale: 4, offsetX: 0, offsetY: 0, lineWidth: 0.1, fontFamily: 'test' });
    expect(floored.context.lineWidth).toBeCloseTo(0.75 / 4, 6);
  });

  it('strokes dashed linetypes with setLineDash', () => {
    const database = makeDatabase(
      [
        {
          type: 'LINE', handle: 'L9', layer: '0', colorIndex: 256, lineType: 'CENTER', lineTypeScale: 0.5,
          startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 10, y: 0, z: 0 },
        },
      ],
      [],
      layerEntries,
      [{ name: 'CENTER', pattern: [{ elementLength: 20 }, { elementLength: -5 }] }],
    );
    const drawing = normalizeDwgDatabase(database, 'dashed.dwg');
    const { context, calls } = createMockContext((line) => line.length * 20);

    renderDwgToCanvas(context, drawing, { scale: 1, offsetX: 0, offsetY: 0, lineWidth: 1, fontFamily: 'test' });

    const dashCall = calls.find((call) => call.method === 'setLineDash');
    expect(dashCall?.args[0]).toEqual([10, 2.5]);
  });

  it('clips hatch pattern lines to the boundary path', () => {
    const database = makeDatabase(
      [
        {
          type: 'HATCH', handle: 'H2', layer: '0', colorIndex: 256, solidFill: 0,
          boundaryPaths: [{
            boundaryPathTypeFlag: 1,
            isClosed: true,
            vertices: [
              { x: 0, y: 0, bulge: 0 }, { x: 10, y: 0, bulge: 0 },
              { x: 10, y: 10, bulge: 0 }, { x: 0, y: 10, bulge: 0 },
            ],
          }],
          definitionLines: [{ angle: Math.PI / 4, base: { x: 0, y: 0 }, offset: { x: -0.6735, y: 0.6735 }, dashLengths: [] }],
        },
      ],
      [],
      layerEntries,
    );
    const drawing = normalizeDwgDatabase(database, 'hatch-render.dwg');
    const { context, calls } = createMockContext((line) => line.length * 20);

    renderDwgToCanvas(context, drawing, { scale: 1, offsetX: 0, offsetY: 0, lineWidth: 1, fontFamily: 'test' });

    expect(calls.some((call) => call.method === 'clip' && call.args[0] === 'evenodd')).toBe(true);
    expect(calls.some((call) => call.method === 'stroke')).toBe(true);
    // 包围盒 10×10、斜线间距 0.9525：应生成十几条平行线
    const lineCount = calls.filter((call) => call.method === 'lineTo').length;
    expect(lineCount).toBeGreaterThan(5);
    expect(lineCount).toBeLessThan(40);
  });

  it('keeps text inside its reference box when the font measures wider than estimated', () => {
    const database = makeDatabase(
      [
        {
          type: 'MTEXT', handle: 'M6', layer: '0', colorIndex: 256,
          text: 'ABCDEFG', insertionPoint: { x: 0, y: 0, z: 0 }, textHeight: 2,
          attachmentPoint: 1, rectWidth: 10,
        },
      ],
      [],
      layerEntries,
    );
    const drawing = normalizeDwgDatabase(database, 'mtext-clamp.dwg');
    // 解析估算每行不超过 10（7 字符 × 1.35 = 9.45），但渲染字体实测更宽
    const { context, calls } = createMockContext((line) => line.length * 20);

    renderDwgToCanvas(context, drawing, { scale: 1, offsetX: 0, offsetY: 0, lineWidth: 1, fontFamily: 'test' });

    const scaleCall = calls.find((call) => call.method === 'scale');
    expect(scaleCall?.args[0] as number).toBeCloseTo(10 / 140, 6);
  });

  it('does not cull FIT text when the viewport only intersects its measured part', () => {
    const database = makeDatabase(
      [
        {
          type: 'TEXT', handle: 'T7', layer: '0', colorIndex: 256,
          text: 'AB', startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 40, y: 0, z: 0 },
          textHeight: 2, halign: 5,
        },
      ],
      [],
      layerEntries,
    );
    const measureText = (text: string, height: number) => text.length * height * 10;
    const drawing = normalizeDwgDatabase(database, 'text-fit-cull.dwg', { measureText });
    const { context, calls } = createMockContext((line) => line.length * 20);

    // 视口世界范围 x ∈ [10, 810]：只与真实文字（0..40）相交，不与估算包围盒（0..2.7）相交
    renderDwgToCanvas(context, drawing, { scale: 1, offsetX: -10, offsetY: 100, lineWidth: 1, fontFamily: 'test' });

    expect(calls.some((call) => call.method === 'fillText')).toBe(true);
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
    // CENTER 线型（中心线）按虚线绘制
    expect(lines.filter((entity) => entity.dash && entity.dash.length > 0).length).toBeGreaterThan(0);
    expect(texts.filter((entity) => entity.color === '#ff00ff').length).toBe(40);
  }, 120_000);
});

const m12DrawingNames = [
  'M12A04-07-068-3-10-500.dwg',
  'M12A04-07-093-1-10-500.dwg',
  'M12A04-08-085-1-10-500.dwg',
  'M12A05-07-068-3-10-500.dwg',
  'M12A05-07-093-1-10-500.dwg',
  'M12A05-08-085-1-10-500.dwg',
  'M12A08-07-068-3-10-500.dwg',
  'M12A08-07-093-1-10-500.dwg',
];

describe.skipIf(m12DrawingNames.every((name) => !existsSync(resolve(process.cwd(), name))))('parseDwg (M12 图纸)', () => {
  it('renders dimensions, leaders and image frames instead of skipping them', async () => {
    for (const name of m12DrawingNames) {
      const path = resolve(process.cwd(), name);
      if (!existsSync(path)) continue;
      const buffer = readFileSync(path);
      const drawing = await parseDwg(
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
        { fileName: name },
      );

      expect(drawing.stats.rendered).toBeGreaterThan(1000);
      expect(drawing.stats.text).toBeGreaterThan(100);
      expect(drawing.stats.skipped.DIMENSION ?? 0).toBe(0);
      expect(drawing.stats.skipped.LEADER ?? 0).toBe(0);
      expect(drawing.stats.skipped.IMAGE ?? 0).toBe(0);
      if (name === 'M12A04-07-093-1-10-500.dwg') {
        // ANSI37 图案填充按定义线绘制，而不是只描边界
        const patterned = drawing.entities.filter((entity) => entity.kind === 'hatch' && (entity.pattern?.length ?? 0) > 0);
        expect(patterned.length).toBeGreaterThan(0);
      }
      if (name === 'M12A04-07-068-3-10-500.dwg') {
        // 对插端针脚填充是整圆（此前闭合标志误判导致只画出半圆）
        const pinHatch = drawing.entities.find((entity) => entity.kind === 'hatch'
          && entity.bounds.minX > 2800 && entity.bounds.maxX < 2820);
        expect(pinHatch?.kind).toBe('hatch');
        expect(pinHatch?.bounds.minY ?? 0).toBeLessThan(1855.7);
        // 缺失的外部参照图片在边框内显示图片路径
        const imagePathText = drawing.entities.find((entity) => {
          if (entity.kind !== 'text') return false;
          const joined = entity.lines.join('');
          return joined.includes('79574') && joined.includes('.jpg');
        });
        expect(imagePathText?.kind).toBe('text');
      }
    }
  }, 180_000);
});

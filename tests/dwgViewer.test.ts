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
      fillText: record('fillText'),
      measureText: (text: string) => ({ width: measureWidth(text) }),
    };
    return { context: context as unknown as CanvasRenderingContext2D, calls };
  }

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
    }
  }, 180_000);
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web';

const [directory, dwgread, stockDirectory] = process.argv.slice(2);
if (!directory || !dwgread) throw new Error('Usage: node server/dwg-edit/verify-roundtrip.mjs EVIDENCE_DIR DWGREAD_EXE [STOCK_DIR]');
const engine = await LibreDwg.create();
const sampleNames = readdirSync('.').filter((name) => name.endsWith('.dwg'));
assert.equal(sampleNames.length, 9);

function inspect(path) {
  const bytes = readFileSync(path);
  const command = spawnSync(dwgread, ['-v2', '-O', 'JSON', path], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(command.status, 0, command.error?.message ?? command.stderr.slice(-2000));
  const native = JSON.parse(command.stdout);
  let status = 0;
  const warn = console.warn;
  console.warn = (message, ...details) => {
    if (message === 'Open dwg file with error code:') status = Number(details[0]);
    else warn(message, ...details);
  };
  let pointer;
  try {
    pointer = engine.dwg_read_data(Uint8Array.from(bytes).buffer, Dwg_File_Type.DWG);
  } finally {
    console.warn = warn;
  }
  assert.ok(pointer, path);
  try {
    const database = engine.convert(pointer);
    return { native, database, status, sha256: createHash('sha256').update(bytes).digest('hex') };
  } finally {
    engine.dwg_free(pointer);
  }
}

const kind = (object) => object.entity ?? object.object;
const records = (drawing, types) => drawing.native.OBJECTS.filter((object) => types.includes(kind(object)));
const handle = (reference) => reference?.at(-1) ?? 0;
const layout = (object) => Object.fromEntries(Object.entries(object).filter(([key]) => key.startsWith('plotsettings.') ||
  ['layout_name', 'tab_order', 'layout_flags', 'LIMMIN', 'LIMMAX'].includes(key)));
const fields = (object, keys) => keys.map((key) => object[key]);

for (const name of sampleNames) {
  const outputName = `${basename(name, '.dwg')}_roundtrip.dwg`;
  console.log(name);
  const source = inspect(name);
  assert.equal(source.status, 4);
  if (stockDirectory) {
    const stock = inspect(join(stockDirectory, outputName));
    assert.equal(stock.status, 64);
    console.log(`  stock ${stock.sha256} | LibreDWG ${stock.status}`);
  }
  const rewritten = inspect(join(directory, outputName));
  assert.equal(rewritten.status, 0);
  assert.equal(rewritten.native.FILEHEADER.version, 'AC1018');
  assert.equal(rewritten.native.FILEHEADER.codepage, source.native.FILEHEADER.codepage);
  assert.notEqual(rewritten.sha256, source.sha256);
  assert.equal(rewritten.database.entities.length, source.database.entities.length);
  const blocks = (drawing) => drawing.database.tables.BLOCK_RECORD.entries
    .map((block) => [block.name, block.entities.length]).sort();
  assert.deepEqual(blocks(rewritten), blocks(source), `${name} blocks`);
  for (const [type, project] of [
    ['LAYER', (object) => fields(object, ['name', 'flag0', 'linewt'])],
    ['LTYPE', (object) => fields(object, ['name', 'description', 'pattern_len', 'numdashes'])],
    ['STYLE', (object) => fields(object, ['name', 'font_file', 'bigfont_file', 'text_size', 'width_factor'])],
    ['LAYOUT', (object) => [layout(object), handle(object.active_viewport)]],
    ['IMAGEDEF', (object) => fields(object, ['file_path', 'image_size', 'is_loaded', 'resunits', 'pixel_size'])],
    ['IMAGE', (object) => fields(object, ['pt0', 'uvec', 'vvec', 'image_size', 'display_props', 'clipping',
      'brightness', 'contrast', 'fade', 'clip_boundary_type', 'clip_verts', 'preview'])],
  ]) {
    const before = records(source, [type]);
    const after = records(rewritten, [type]);
    assert.equal(after.length, before.length, `${name} ${type} count`);
    const byHandle = new Map(after.map((object) => [handle(object.handle), object]));
    for (const original of before) {
      const result = byHandle.get(handle(original.handle));
      assert.ok(result, `${name} ${type} ${handle(original.handle)}`);
      assert.deepEqual(project(result), project(original), `${name} ${type} ${handle(original.handle)}`);
      if (type === 'IMAGE') {
        assert.equal(handle(result.imagedef), handle(original.imagedef));
        const reactor = records(rewritten, ['IMAGEDEF_REACTOR']).find((object) => handle(object.handle) === handle(result.imagedefreactor));
        assert.equal(handle(reactor?.ownerhandle), handle(result.handle));
      }
    }
  }
  const unread = new Set(rewritten.native.OBJECTS.map((object) => handle(object.handle)));
  const missing = [...new Set(source.native.OBJECTS.filter((object) => !unread.has(handle(object.handle))).map(kind))];
  console.log(`  ${source.sha256} -> ${rewritten.sha256} | LibreDWG ${source.status} -> ${rewritten.status} | ${rewritten.database.entities.length} entities, ${blocks(rewritten).length} blocks`);
  if (missing.length) console.log(`  original handles absent after rewrite: ${missing.join(', ')}`);
}

const revised = inspect(join(directory, 'M12_浏览器下载_修订.dwg'));
const recordsByHandle = new Map(revised.native.OBJECTS.map((object) => [handle(object.handle), object]));
const parent = recordsByHandle.get(0x9F0);
const picture = recordsByHandle.get(handle(parent.block));
const label = picture.entities.map((reference) => recordsByHandle.get(handle(reference))).find((object) => kind(object) === 'MTEXT');
assert.ok(revised.database.tables.BLOCK_RECORD.entries.some((block) => block.name === '*D5' &&
  Number.parseInt(block.handle, 16) === handle(parent.block)));
assert.match(parent.user_text, /\*750±10/);
assert.equal(parent.user_text, label.text);
assert.equal(parent.flag, 32);
assert.ok(Math.abs(parent.act_measurement - 105.64114870914818) < 1e-8);
assert.match(recordsByHandle.get(0xB72).text, /插拔次数：500次/);
console.log(`Browser download ${revised.sha256}`);

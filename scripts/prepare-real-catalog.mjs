import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

// Read-only database preparation. The source retains unresolved prices verbatim.
const source = process.argv[2];
if (!source) throw new Error('Usage: node --env-file=.env scripts/prepare-real-catalog.mjs <source.xlsx>');
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing database URL or administrator key');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: existing, error } = await client.from('catalog_items').select('*');
if (error) throw new Error(error.message);
const file = fs.readFileSync(source);
const book = XLSX.read(file, { type: 'buffer' });
const sheet = book.Sheets['成本分析-M12单线'];
if (!sheet) throw new Error('Missing 成本分析-M12单线');
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }).slice(1)
  .map((cells, i) => ({ cells, row: i + 2 }))
  .filter(({ cells }) => String(cells[1]).trim());
if (rows.length !== 96) throw new Error('Source changed: expected 96 product rows');
const wireGroups = new Map();
const connectorGroups = new Map();
for (const row of rows) {
  const model = String(row.cells[1]).split('-').slice(0, 3).join('-');
  if (!/^M12A(04|05|08)-(07|08)-(093|085|068|067)$/.test(model)) throw new Error(`Unknown connector at row ${row.row}`);
  connectorGroups.set(model, [...(connectorGroups.get(model) || []), row]);
  const spec = String(row.cells[3]).trim();
  wireGroups.set(spec, [...(wireGroups.get(spec) || []), row]);
}
const keepIds = new Set();
const proposals = [];
for (const [model, sourceRows] of connectorGroups) {
  const matches = existing.filter(r => r.kind === 'connector' && r.model === model);
  if (matches.length !== 1) throw new Error(`Expected one existing connector: ${model}`);
  const item = matches[0];
  keepIds.add(item.id);
  proposals.push({ ...item, manufacturer: String(sourceRows[0].cells[7]),
    sourcePrices: sourceRows.map(r => ({ row: r.row, price: r.cells[8] })) });
}
const ulModels = {
  '4-false': 'WL-HTX-PVC-037', '5-false': 'WL-HTX-PVC-036',
  '4-true': 'WL-HTX-PVC-033', '5-true': 'WL-HTX-PVC-034',
};
const blockers = [];
for (const [description, sourceRows] of wireGroups) {
  const cores = Number(/(?:^|\*)(\d+)C/.exec(description)?.[1]);
  const shielded = description.includes('编织');
  const od = Number(/OD([\d.]+)/.exec(description)?.[1]);
  if (!cores || !od) throw new Error(`Cannot parse wire: ${description}`);
  const area = /\*([\d.]+)平方/.exec(description)?.[1];
  const ul = description.startsWith('UL2464');
  const model = ul ? ulModels[`${cores}-${shielded}`] : `PVC-${cores}C-${area}MM2-${shielded ? 'SH' : 'NS'}-OD${od}`;
  const matches = existing.filter(r => r.kind === 'wire' && r.model === model);
  if (matches.length > 1) throw new Error(`Duplicate wire model: ${model}`);
  const previous = matches[0];
  if (previous) keepIds.add(previous.id);
  const colors = [...String(sourceRows[0].cells[4])].map(c => `${c}色`);
  if (colors.length !== cores) throw new Error(`Invalid colors: ${description}`);
  const spec = { ...(previous?.spec || {}), kind: 'jacketed', coreCount: cores,
    shielded, jacketMaterial: 'PVC', jacketColor: 'black', coreColors: colors,
    outerDiameterMm: od, ...(ul ? { awg: 22, ulNumber: 'UL2464' } : { conductorAreaMm2: Number(area) }) };
  if (!ul && !Number.isFinite(Number(area))) blockers.push({ model, reason: 'Invalid conductor area' });
  proposals.push({ ...(previous || {}), kind: 'wire', model,
    code: previous?.code || model.toLowerCase().replaceAll('.', '_'),
    name: previous?.name || description, manufacturer: '', resource_group: '护套线',
    description, spec, image_path: previous?.image_path || 'catalog/wire/shared/jacketed-wire.png',
    image_variants: previous?.image_variants || {}, sort_order: previous?.sort_order || 500,
    sourcePrices: sourceRows.map(r => ({ row: r.row,
      // Confirmed business exception: this source row represents a 0.5 m wire.
      lengthCode: r.row === 2 && String(r.cells[1]).trim() === 'M12A04-07-093-1-10-L'
        ? '500' : String(r.cells[1]).split('-').at(-1), price: r.cells[9] })) });
}
for (const form of ['straight', 'bent']) {
  const matches = existing.filter(r => r.kind === 'overmold' && r.spec.outerMaterial === '黑色PVC'
    && r.spec.outerHardness === '45P' && r.spec.outerForm === form);
  if (matches.length !== 1) throw new Error(`Expected one PVC mold: ${form}`);
  keepIds.add(matches[0].id);
  proposals.push({ ...matches[0], sourcePrices: rows.map(r => ({ row: r.row, price: r.cells[10] })) });
}
const directory = fs.mkdtempSync(path.resolve('.tmp', 'real-catalog-'));
const pendingPrices = proposals.flatMap(p => {
  const groups = new Map();
  for (const price of p.sourcePrices) {
    const length = price.lengthCode || '0';
    groups.set(length, [...(groups.get(length) || []), price]);
  }
  return [...groups].filter(([length, prices]) => length === 'L' || new Set(prices.map(p => p.price)).size !== 1)
    .map(([length, prices]) => ({ model: p.model, length, prices }));
});
const plan = { source: path.resolve(source), sourceSha256: createHash('sha256').update(file).digest('hex'),
  databaseHost: new URL(url).host, createdAt: new Date().toISOString(),
  beforeCount: existing.length, proposals, blockers, pendingPrices,
  deletionCandidates: existing.filter(r => !keepIds.has(r.id)).map(r => ({ id: r.id, kind: r.kind, code: r.code, name: r.name })) };
fs.writeFileSync(path.join(directory, 'catalog-backup.json'), JSON.stringify(existing, null, 2));
fs.writeFileSync(path.join(directory, 'replacement-plan.json'), JSON.stringify(plan, null, 2));
console.log(JSON.stringify({ directory, beforeCount: existing.length, targetCount: proposals.length,
  retained: keepIds.size, newItems: proposals.filter(r => !r.id).length,
  deletionCandidates: plan.deletionCandidates.length, schemaBlockers: blockers.length,
  unresolvedPrices: pendingPrices.length, databaseWrites: 0 }, null, 2));

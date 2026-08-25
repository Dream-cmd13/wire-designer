import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'catalog-assets';
const ROOT = process.cwd();
const APPLY = process.argv.includes('--apply');

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    const [, key, rawValue] = match;
    const quoted = rawValue.match(/^(\"|')(.*)\1$/);
    process.env[key] = quoted ? quoted[2] : rawValue;
  }
}

loadEnvFile(resolve(ROOT, '.env'));

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secretKey) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) or SUPABASE_SECRET_KEY.');
  process.exit(1);
}

const client = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const files = [
  ['连接器注塑前.png', 'catalog/connector/40000000-0000-4000-8000-000000000131/connector-before.png'],
  ['连接器注塑后.png', 'catalog/connector/40000000-0000-4000-8000-000000000131/connector-after.png'],
  ['连接器pin位图.png', 'catalog/connector/40000000-0000-4000-8000-000000000131/connector-pin-map.png'],
  ['护套线.png', 'catalog/wire/shared/jacketed-wire.png'],
  ['外模.png', 'catalog/overmold/40000000-0000-4000-8000-000000000201/overmold.png'],
];

function contentType(path) {
  return extname(path).toLowerCase() === '.jpg' ? 'image/jpeg' : 'image/png';
}

function localPath(name) {
  return resolve(ROOT, name);
}

function printPlan() {
  console.log('Dry run. No Storage or database changes were made.');
  for (const [file, path] of files) console.log(`${file} -> ${BUCKET}/${path}`);
  console.log('Run with --apply after confirming the paths and database schema.');
}

async function upload(file, path) {
  const source = localPath(file);
  if (!existsSync(source)) throw new Error(`Missing local image: ${file}`);
  const body = readFileSync(source);
  const { error } = await client.storage.from(BUCKET).upload(path, body, {
    contentType: contentType(file),
    upsert: true,
  });
  if (error) throw new Error(`Upload failed for ${file}: ${error.message}`);
}

if (!APPLY) {
  printPlan();
} else {
  try {
    for (const [file, path] of files) {
      await upload(file, path);
      console.log(`Uploaded: ${file}`);
    }

    const before = files[0][1];
    const after = files[1][1];
    const pinMap = files[2][1];
    const { error: connectorError } = await client
      .from('catalog_items')
      .update({ image_path: before, image_variants: { before, after, pinMap } })
      .eq('kind', 'connector')
      .eq('code', 'm12a04-07-093');
    if (connectorError) throw new Error(`Connector update failed: ${connectorError.message}`);

    const { data: wires, error: wireQueryError } = await client
      .from('catalog_items')
      .select('id,spec')
      .eq('kind', 'wire');
    if (wireQueryError) throw new Error(`Wire query failed: ${wireQueryError.message}`);

    const wirePath = files[3][1];
    for (const wire of wires ?? []) {
      if (wire.spec?.kind !== 'jacketed') continue;
      const { error } = await client.from('catalog_items').update({ image_path: wirePath }).eq('id', wire.id);
      if (error) throw new Error(`Wire update failed for ${wire.id}: ${error.message}`);
    }

    const { error: overmoldError } = await client
      .from('catalog_items')
      .update({ image_path: files[4][1] })
      .eq('kind', 'overmold')
      .eq('code', 'pvc-45p-pe');
    if (overmoldError) throw new Error(`Overmold update failed: ${overmoldError.message}`);
    console.log('Catalog image upload and database update completed.');
  } catch (error) {
    console.error(`Catalog image upload failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

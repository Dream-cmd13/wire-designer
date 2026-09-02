import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'catalog-assets';
const ROOT = process.cwd();
const SOURCE_DIR = resolve(ROOT, 'wire-harness-designer图片备份', 'pin_crops_22');
const APPLY = process.argv.includes('--apply');

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    const [, key, rawValue] = match;
    const quoted = rawValue.match(/^("|')(.*)\1$/);
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

// Pin layouts are shared by shielded/non-shielded rows with the same M12 code,
// while male/female remain separate images.
const pinMaps = [
  ['M12A-04_Male.png', 'M12A-04-Male'],
  ['M12A-04_Female.png', 'M12A-04-Female'],
  ['M12A-05_Male.png', 'M12A-05-Male'],
  ['M12A-05_Female.png', 'M12A-05-Female'],
  ['M12A-08_Male.png', 'M12A-08-Male'],
  ['M12A-08_Female.png', 'M12A-08-Female'],
];

const modelRules = [
  { model: 'M12A04-07-093', key: 'M12A-04-Male' },
  { model: 'M12A05-07-093', key: 'M12A-05-Male' },
  { model: 'M12A08-07-093', key: 'M12A-08-Male' },
  { model: 'M12A04-08-085', key: 'M12A-04-Female' },
  { model: 'M12A05-08-085', key: 'M12A-05-Female' },
  { model: 'M12A08-08-085', key: 'M12A-08-Female' },
  { model: 'M12A04-07-068', key: 'M12A-04-Male' },
  { model: 'M12A05-07-068', key: 'M12A-05-Male' },
  { model: 'M12A08-07-068', key: 'M12A-08-Male' },
  { model: 'M12A04-08-067', key: 'M12A-04-Female' },
  { model: 'M12A05-08-067', key: 'M12A-05-Female' },
  { model: 'M12A08-08-067', key: 'M12A-08-Female' },
];

const storagePath = (key) => `catalog/connector/pin-maps/${key}.png`;

function printPlan() {
  console.log(`Source: ${SOURCE_DIR}`);
  console.log('Dry run. No Storage or database changes were made.');
  for (const [file, key] of pinMaps) console.log(`${file} -> ${BUCKET}/${storagePath(key)}`);
  console.log('Database rows to update:');
  for (const rule of modelRules) console.log(`${rule.model} -> ${storagePath(rule.key)}`);
  console.log('Run with --apply after confirming the paths and credentials.');
}

function validateLocalFiles() {
  const missing = pinMaps
    .map(([file]) => resolve(SOURCE_DIR, file))
    .filter((filePath) => !existsSync(filePath));
  if (missing.length > 0) {
    throw new Error(`Missing local image(s):\n${missing.map((file) => `  - ${file}`).join('\n')}`);
  }
}

async function main() {
  validateLocalFiles();
  if (!APPLY) return printPlan();

  for (const [file, key] of pinMaps) {
    const source = resolve(SOURCE_DIR, file);
    const { error } = await client.storage.from(BUCKET).upload(storagePath(key), readFileSync(source), {
      contentType: extname(file).toLowerCase() === '.jpg' ? 'image/jpeg' : 'image/png',
      upsert: true,
    });
    if (error) throw new Error(`Upload failed for ${file}: ${error.message}`);
    console.log(`Uploaded: ${file}`);
  }

  for (const rule of modelRules) {
    const { data, error: queryError } = await client
      .from('catalog_items')
      .select('id,code,model,name,image_variants')
      .eq('kind', 'connector')
      .eq('model', rule.model);
    if (queryError) throw new Error(`Connector query failed for ${rule.model}: ${queryError.message}`);
    if (!data || data.length !== 1) throw new Error(`Expected one connector row for ${rule.model}, found ${data?.length ?? 0}`);
    const row = data[0];
    const variants = row.image_variants && typeof row.image_variants === 'object' && !Array.isArray(row.image_variants)
      ? row.image_variants
      : {};
    const { error: updateError } = await client
      .from('catalog_items')
      .update({ image_variants: { ...variants, pinMap: storagePath(rule.key) } })
      .eq('id', row.id);
    if (updateError) throw new Error(`Connector update failed for ${row.code}: ${updateError.message}`);
    console.log(`Updated: ${row.name} (${row.model})`);
  }
  console.log('M12 pin-map upload and catalog update completed.');
}

main().catch((error) => {
  console.error(`M12 pin-map upload failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

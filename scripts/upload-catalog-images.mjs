import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'catalog-assets';
const ROOT = process.cwd();
const CONNECTOR_DIR = resolve('C:/Users/Redmi/Pictures/M12连接器注释前后图片');
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

const connectorGroups = [
  { suffix: '07-068', before: 'M12XXX-07-068-注塑前.png', after: 'M12XXX-07-068-注塑后.png' },
  { suffix: '07-093', before: 'M12XXX-07-093-注塑前.png', after: 'M12XXX-07-093-注塑后.png' },
  { suffix: '08-067', before: 'M12XXX-08-067-注塑前.png', after: 'M12XXX-08-067-注塑后.png' },
  { suffix: '08-085', before: 'M12XXX-08-085-注塑前.png', after: 'M12XXX-08-085-注塑后.png' },
];

const files = [
  ...connectorGroups.flatMap(({ suffix, before, after }) => [
    [before, `catalog/connector/m12-${suffix}/connector-before.png`, CONNECTOR_DIR],
    [after, `catalog/connector/m12-${suffix}/connector-after.png`, CONNECTOR_DIR],
  ]),
];

function contentType(path) {
  return extname(path).toLowerCase() === '.jpg' ? 'image/jpeg' : 'image/png';
}

function localPath(name, sourceDir = ROOT) {
  return resolve(sourceDir, name);
}

function printPlan() {
  console.log('Dry run. No Storage or database changes were made.');
  for (const [file, path] of files) console.log(`${file} -> ${BUCKET}/${path}`);
  console.log('Run with --apply after confirming the paths and database schema.');
}

async function upload(file, path, sourceDir = ROOT) {
  const source = localPath(file, sourceDir);
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
    for (const [file, path, sourceDir] of files) {
      await upload(file, path, sourceDir);
      console.log(`Uploaded: ${file}`);
    }

    for (const { suffix, before, after } of connectorGroups) {
      const beforePath = `catalog/connector/m12-${suffix}/connector-before.png`;
      const afterPath = `catalog/connector/m12-${suffix}/connector-after.png`;
      const { data: connectors, error: connectorQueryError } = await client
        .from('catalog_items')
        .select('id,code,model')
        .eq('kind', 'connector')
        .like('model', `M12A%-${suffix}`);
      if (connectorQueryError) throw new Error(`Connector query failed for ${suffix}: ${connectorQueryError.message}`);
      if (!connectors || connectors.length === 0) throw new Error(`No connector seed rows matched M12A%-${suffix}`);
      for (const connector of connectors) {
        const { error: connectorError } = await client
          .from('catalog_items')
          .update({ image_path: null, image_variants: { before: beforePath, after: afterPath } })
          .eq('id', connector.id);
        if (connectorError) throw new Error(`Connector update failed for ${connector.code}: ${connectorError.message}`);
        console.log(`Updated connector: ${connector.code}`);
      }
    }

    console.log('Catalog image upload and database update completed.');
  } catch (error) {
    console.error(`Catalog image upload failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

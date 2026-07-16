import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;

    const [, key, rawValue] = match;
    const quoted = rawValue.match(/^(["'])(.*)\1$/);
    process.env[key] = quoted ? quoted[2] : rawValue;
  }
}

function usage() {
  console.error('Usage: npm run user:create -- <email> <password> [display name]');
}

loadEnvFile(resolve(process.cwd(), '.env'));

const [email, password, displayName] = process.argv.slice(2);
const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !password) {
  usage();
  process.exit(1);
}

if (!url || !secretKey) {
  console.error(
    'Missing SUPABASE_URL (or VITE_SUPABASE_URL) or SUPABASE_SECRET_KEY. Add a valid server-side key from Supabase Dashboard → Settings → API.'
  );
  process.exit(1);
}

const supabase = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const { error: userCheckError } = await supabase.from('user').select('id').limit(1);

if (userCheckError) {
  console.error(
    `User creation preflight failed: ${userCheckError.message}. Run supabase/sql/10_schema/01_foundation.sql, then supabase/sql/10_schema/03_integrity.sql.`
  );
  process.exit(1);
}

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: displayName ? { display_name: displayName } : undefined,
});

if (error || !data.user) {
  console.error(`User creation failed: ${error?.message ?? 'No user returned.'}`);
  process.exit(1);
}

const { data: appUser, error: appUserError } = await supabase
  .from('user')
  .select('id')
  .eq('id', data.user.id)
  .maybeSingle();

if (appUserError || !appUser) {
  console.warn('User created, but its user record was not confirmed. Run supabase/sql/10_schema/03_integrity.sql and check the on_auth_user_created trigger.');
}

console.log(`Created user: ${data.user.email} (${data.user.id})`);

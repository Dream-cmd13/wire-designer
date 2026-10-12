import { build } from 'esbuild';
await build({
  entryPoints: ['server/quoteService.ts'], bundle: true, platform: 'neutral', format: 'esm',
  outfile: 'supabase/functions/quote/engine.js', tsconfig: 'tsconfig.app.json',
});

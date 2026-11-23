import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');
const args = process.argv.slice(2);

function runTests(options) {
  const result = spawnSync(process.execPath, [playwrightCli, 'test', ...options], { stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (args.length === 0) {
  const designerStatus = runTests(['--config', 'playwright.designer.config.ts']);
  const previewStatus = runTests([]);
  process.exitCode = designerStatus || previewStatus;
} else {
  process.exitCode = runTests(args);
}

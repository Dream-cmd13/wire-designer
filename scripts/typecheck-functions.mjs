import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function findDeno() {
  const candidates = process.platform === 'win32'
    ? [join(root, 'node_modules', 'deno', 'deno.exe')]
    : [join(root, 'node_modules', '.bin', 'deno')];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return 'deno';
}

const deno = findDeno();
const version = spawnSync(deno, ['--version'], { stdio: 'ignore', shell: false });
if (version.error || version.status !== 0) {
  console.error('未找到 Deno 运行工具（已尝试本地 node_modules 与全局 deno）。');
  console.error('请执行: npm install（项目已固定 deno 开发依赖），或全局安装 https://deno.com 后重试。');
  process.exit(1);
}

// quote/engine.js 是生成物：检查前必须先构建，保证 quote 入口的类型与当前服务端源码一致。
const build = spawnSync(process.execPath, [join(root, 'scripts', 'build-quote-function.mjs')], {
  stdio: 'inherit',
  cwd: root,
});
if (build.status !== 0) {
  console.error('quote engine 构建失败，函数类型检查中止。');
  process.exit(build.status ?? 1);
}

const targets = [
  'supabase/functions/_shared/passwordService.ts',
  'supabase/functions/account-password/index.ts',
  'supabase/functions/quote/index.ts',
];
const check = spawnSync(deno, ['check', '--config', 'supabase/functions/deno.json', ...targets], {
  stdio: 'inherit',
  cwd: root,
});
process.exit(check.status ?? 1);

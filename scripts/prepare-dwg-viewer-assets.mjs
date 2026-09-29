import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * DWG 查看页只需要把解析引擎 wasm 复制到 public/；图纸本体存在 Supabase Storage
 * 私有桶（dwg-drawings），由 scripts/upload-dwg-drawings.mjs 上传。
 */
const root = process.cwd();
const source = resolve(root, 'node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm');
const target = resolve(root, 'public/libredwg/libredwg-web.wasm');

if (!existsSync(source)) {
  console.error(`[dwg-viewer] 缺少 libredwg wasm：${source}，请先执行 npm install`);
  process.exit(1);
}

const sourceStat = statSync(source);
const targetStat = existsSync(target) ? statSync(target) : null;
if (targetStat && targetStat.size === sourceStat.size && targetStat.mtimeMs >= sourceStat.mtimeMs) {
  process.exit(0);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`[dwg-viewer] 已复制 libredwg wasm -> ${target}`);

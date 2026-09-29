import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const publicDwgDir = resolve(root, 'public/dwg');
const manifestPath = resolve(publicDwgDir, 'manifest.json');

let failed = false;

function needsCopy(source, target) {
  if (!existsSync(target)) return true;
  const sourceStat = statSync(source);
  const targetStat = statSync(target);
  return targetStat.size !== sourceStat.size || targetStat.mtimeMs < sourceStat.mtimeMs;
}

function copy(source, target) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

const wasmSource = resolve(root, 'node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm');
const wasmTarget = resolve(root, 'public/libredwg/libredwg-web.wasm');
if (!existsSync(wasmSource)) {
  console.error(`[dwg-viewer] 缺少 libredwg wasm：${wasmSource}，请先执行 npm install`);
  failed = true;
} else if (needsCopy(wasmSource, wasmTarget)) {
  copy(wasmSource, wasmTarget);
  console.log(`[dwg-viewer] 已复制 libredwg wasm -> ${wasmTarget}`);
}

// 根目录的 DWG 全部作为内置图纸复制，供查看页下拉切换
const dwgFiles = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.dwg'))
  .map((entry) => entry.name)
  .sort();

if (dwgFiles.length === 0) {
  console.warn('[dwg-viewer] 根目录未找到 DWG 文件，DWG 页面只能手动打开文件');
}

for (const name of dwgFiles) {
  const source = resolve(root, name);
  const target = resolve(publicDwgDir, name);
  if (!needsCopy(source, target)) continue;
  copy(source, target);
  console.log(`[dwg-viewer] 已复制 DWG -> ${target}`);
}

// 清理已从根目录移除的旧副本
if (existsSync(publicDwgDir)) {
  for (const entry of readdirSync(publicDwgDir, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === 'manifest.json') continue;
    if (!entry.name.toLowerCase().endsWith('.dwg') || dwgFiles.includes(entry.name)) continue;
    rmSync(resolve(publicDwgDir, entry.name));
    console.log(`[dwg-viewer] 已移除过期图纸副本 ${entry.name}`);
  }
}

// 清单供查看页列出内置图纸；无图纸时删除清单，页面回退为手动打开
if (dwgFiles.length > 0) {
  const content = `${JSON.stringify(dwgFiles, null, 2)}\n`;
  const current = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : null;
  if (current !== content) {
    mkdirSync(publicDwgDir, { recursive: true });
    writeFileSync(manifestPath, content, 'utf8');
    console.log(`[dwg-viewer] 已写入图纸清单 ${manifestPath}`);
  }
} else if (existsSync(manifestPath)) {
  rmSync(manifestPath);
  console.log('[dwg-viewer] 已删除图纸清单');
}

if (failed) process.exit(1);

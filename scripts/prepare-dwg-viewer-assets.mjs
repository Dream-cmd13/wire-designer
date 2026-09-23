import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = process.cwd();

const tasks = [
  {
    label: 'libredwg wasm',
    source: resolve(root, 'node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm'),
    target: resolve(root, 'public/libredwg/libredwg-web.wasm'),
    required: true,
  },
  {
    label: '示例 DWG',
    source: resolve(root, '线束设计器.dwg'),
    target: resolve(root, 'public/dwg/线束设计器.dwg'),
    required: false,
  },
];

let failed = false;

for (const task of tasks) {
  if (!existsSync(task.source)) {
    if (task.required) {
      console.error(`[dwg-viewer] 缺少 ${task.label}：${task.source}，请先执行 npm install`);
      failed = true;
    } else {
      console.warn(`[dwg-viewer] 未找到${task.label}（${task.source}），DWG 页面将只能手动打开文件`);
    }
    continue;
  }

  const sourceStat = statSync(task.source);
  const targetStat = existsSync(task.target) ? statSync(task.target) : null;
  if (targetStat && targetStat.size === sourceStat.size && targetStat.mtimeMs >= sourceStat.mtimeMs) {
    continue;
  }

  mkdirSync(dirname(task.target), { recursive: true });
  copyFileSync(task.source, task.target);
  console.log(`[dwg-viewer] 已复制${task.label} -> ${task.target}`);
}

if (failed) process.exit(1);

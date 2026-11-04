import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve('node_modules/occt-import-js');
const target = resolve('public/model-engine');
mkdirSync(target, { recursive: true });
// Keep the published Emscripten factory intact; expose it to a module Worker.
writeFileSync(resolve(target, 'occt-import-js.mjs'), `${readFileSync(resolve(source, 'dist/occt-import-js.js'), 'utf8')}\nexport default occtimportjs;\n`);
copyFileSync(resolve(source, 'dist/occt-import-js.wasm'), resolve(target, 'occt-import-js.wasm'));
copyFileSync(resolve(source, 'LICENSE.md'), resolve(target, 'LICENSE.occt-import-js.md'));
console.log('[model-viewer] 已准备同站点 OCCT JS/WASM 及许可证');

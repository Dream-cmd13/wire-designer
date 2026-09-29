import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(new URL('../../pages/DwgViewerPage.tsx', import.meta.url), 'utf8');
const librarySource = readFileSync(new URL('../dwg/dwgLibrary.ts', import.meta.url), 'utf8');
const routeSource = readFileSync(new URL('../appRoute.ts', import.meta.url), 'utf8');
const routeHookSource = readFileSync(new URL('../../hooks/useAppRoute.ts', import.meta.url), 'utf8');
const prepareScriptSource = readFileSync(new URL('../../../scripts/prepare-dwg-viewer-assets.mjs', import.meta.url), 'utf8');
const uploadScriptSource = readFileSync(new URL('../../../scripts/upload-dwg-drawings.mjs', import.meta.url), 'utf8');

describe('DWG viewer UI contract', () => {
  it('loads built-in drawings from the private bucket through signed urls', () => {
    expect(librarySource).toContain("DWG_BUCKET = 'dwg-drawings'");
    expect(librarySource).toContain('resolveStorageSignedUrl');
    expect(librarySource).toContain('manifest.json');
    expect(pageSource).toContain('fetchDwgManifest');
    expect(pageSource).toContain('resolveDwgFileUrl');
    expect(pageSource).toContain('availableDrawings.map');
    expect(pageSource).toContain('selectBuiltInFile');
  });

  it('caches parsed drawings, pre-signs the list and prefetches the next drawing', () => {
    expect(pageSource).toContain('getCachedDrawing');
    expect(pageSource).toContain('setCachedDrawing');
    expect(pageSource).toContain('takeCachedBuffer');
    expect(pageSource).toContain('prefetchDwgBuffer');
    expect(pageSource).toContain('primeDwgSignedUrls');
  });

  it('shows a loading overlay while a drawing is signed, downloaded, parsed and first rendered', () => {
    expect(pageSource).toContain("phase: 'loading'");
    expect(pageSource).toContain('正在加载图纸');
    expect(pageSource).toContain('正在解析图纸');
    expect(pageSource).toContain("phase: 'rendering'");
    expect(pageSource).toContain('正在渲染图纸');
    // 工具栏同样显示加载/失败状态，避免只依赖画布遮罩
    expect(pageSource).toContain('加载中');
    expect(pageSource).toContain('加载失败');
    // 遮罩必须等首次绘制完成后才撤下，解析前也要先让遮罩绘制一帧
    expect(pageSource).toContain('nextPaint');
    expect(pageSource).toContain('firstRenderRef');
  });

  it('uploads root DWG files and the manifest to the bucket before runtime', () => {
    expect(uploadScriptSource).toContain("BUCKET = 'dwg-drawings'");
    expect(uploadScriptSource).toContain('manifest.json');
    expect(uploadScriptSource).toContain('function asciiKey');
    expect(uploadScriptSource).toContain("extname(entry.name).toLowerCase() === '.dwg'");
    expect(prepareScriptSource).toContain('libredwg-web.wasm');
    expect(prepareScriptSource).not.toContain("endsWith('.dwg')");
  });

  it('removes stale drawings that are no longer in the source directory', () => {
    expect(uploadScriptSource).toContain('listExistingObjects');
    expect(uploadScriptSource).toContain('.remove(');
    expect(uploadScriptSource).toContain("endsWith('.dwg')");
  });

  it('explains a missing bucket object instead of a raw 404', () => {
    expect(pageSource).toContain('未找到内置图纸「');
    expect(pageSource).toContain('请重新上传或打开本地文件');
  });

  it('requires login before built-in drawings can be viewed', () => {
    expect(routeSource).toContain("route.id !== 'drawing-workbench'");
    expect(routeSource).not.toContain("route.id !== 'dwg-viewer'");
  });

  it('keeps the shareable ?file= link in sync with the loaded drawing', () => {
    expect(routeSource).toContain("dwgFileQueryKey = 'file'");
    expect(routeSource).toContain('buildRoutePath');
    expect(routeHookSource).toContain('buildRoutePath');
    expect(pageSource).toContain('getDwgFileFromSearch');
    expect(pageSource).toContain('buildDwgViewerRoutePath');
    expect(pageSource).toContain('window.history.replaceState');
  });

  it('allows retrying the same built-in drawing after a failed load', () => {
    // 失败相位下下拉回到占位值，重新选择同一文件会触发 onChange
    expect(pageSource).toContain("value={state.phase === 'error' ? '' : builtInFile ?? ''}");
    expect(pageSource).toContain('void loadFromUrl(entry)');
    expect(pageSource).not.toContain('fileName === state.fileName');
  });

  it('falls back to manual file opening when the manifest is missing', () => {
    expect(pageSource).toContain('未找到内置图纸');
    expect(pageSource).toContain('打开 DWG 文件');
  });
});

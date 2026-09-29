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

  it('uploads root DWG files and the manifest to the bucket before runtime', () => {
    expect(uploadScriptSource).toContain("BUCKET = 'dwg-drawings'");
    expect(uploadScriptSource).toContain('manifest.json');
    expect(uploadScriptSource).toContain('function asciiKey');
    expect(uploadScriptSource).toContain("extname(entry.name).toLowerCase() === '.dwg'");
    expect(prepareScriptSource).toContain('libredwg-web.wasm');
    expect(prepareScriptSource).not.toContain("endsWith('.dwg')");
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

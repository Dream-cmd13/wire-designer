import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(new URL('../../pages/DwgViewerPage.tsx', import.meta.url), 'utf8');
const routeSource = readFileSync(new URL('../appRoute.ts', import.meta.url), 'utf8');
const routeHookSource = readFileSync(new URL('../../hooks/useAppRoute.ts', import.meta.url), 'utf8');
const assetScriptSource = readFileSync(new URL('../../../scripts/prepare-dwg-viewer-assets.mjs', import.meta.url), 'utf8');

describe('DWG viewer UI contract', () => {
  it('lists built-in drawings from the generated manifest and switches from the toolbar', () => {
    expect(assetScriptSource).toContain('manifest.json');
    expect(assetScriptSource).toContain("endsWith('.dwg')");
    expect(pageSource).toContain('manifest.json');
    expect(pageSource).toContain('parseManifest');
    expect(pageSource).toContain('availableFiles.map');
    expect(pageSource).toContain('selectBuiltInFile');
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
    expect(pageSource).toContain('void loadFromUrl(fileName)');
    expect(pageSource).not.toContain('fileName === state.fileName');
  });

  it('falls back to manual file opening when the manifest is missing', () => {
    expect(pageSource).toContain('未找到内置图纸');
    expect(pageSource).toContain('打开 DWG 文件');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(new URL('../../pages/DrawingWorkbenchPage.tsx', import.meta.url), 'utf8');
const toolbarSource = readFileSync(new URL('../../components/drawings/standalone/DrawingWorkbenchToolbar.tsx', import.meta.url), 'utf8');
const resourceSource = readFileSync(new URL('../../components/drawings/standalone/DrawingResourcePanel.tsx', import.meta.url), 'utf8');
const inspectorSource = readFileSync(new URL('../../components/drawings/standalone/StandaloneDrawingInspector.tsx', import.meta.url), 'utf8');

describe('drawing workbench UI contract', () => {
  it('exposes the required editing commands and shortcuts', () => {
    ['清空画板', '图层上移', '图层下移', '置于顶层', '置于底层', '锁定/解锁', '正交', '自由画笔'].forEach((label) => expect(toolbarSource).toContain(label));
    expect(pageSource).toContain("event.key.toLowerCase() === 'x'");
    expect(pageSource).toContain('splitDrawingObjects');
    expect(pageSource).toContain('clearDrawingCanvas');
    expect(pageSource).toContain('moveDrawingLayers');
  });

  it('loads public Supabase drawing resources', () => {
    expect(resourceSource).toContain('drawingCatalogRepository');
    expect(resourceSource).toContain('公共资源');
    expect(resourceSource).toContain('常用语');
    expect(resourceSource).toContain('图标');
  });

  it('routes multi-selection edits through a batch update contract', () => {
    expect(inspectorSource).toContain('selectedObjectIds');
    expect(inspectorSource).toContain('onUpdateObjects');
    expect(pageSource).toContain('updateSelectedObjects');
  });

  it('reports PDF export failures instead of dropping rejected promises', () => {
    expect(pageSource).toContain('exportError');
    expect(pageSource).toContain('await downloadDrawingPdf');
  });
});

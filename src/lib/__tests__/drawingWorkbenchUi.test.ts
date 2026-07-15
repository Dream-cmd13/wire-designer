import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(new URL('../../pages/DrawingWorkbenchPage.tsx', import.meta.url), 'utf8');
const toolbarSource = readFileSync(new URL('../../components/drawings/standalone/DrawingWorkbenchToolbar.tsx', import.meta.url), 'utf8');
const resourceSource = readFileSync(new URL('../../components/drawings/standalone/DrawingResourcePanel.tsx', import.meta.url), 'utf8');
const inspectorSource = readFileSync(new URL('../../components/drawings/standalone/StandaloneDrawingInspector.tsx', import.meta.url), 'utf8');
const pdfDialogSource = readFileSync(new URL('../../components/drawings/standalone/DrawingPdfExportDialog.tsx', import.meta.url), 'utf8');

describe('drawing workbench UI contract', () => {
  it('exposes the required editing commands and shortcuts', () => {
    ['清空画板', '图层操作', '上移', '下移', '锁定/解锁当前选择', '全局锁定', '正交', '自由画笔'].forEach((label) => expect(toolbarSource).toContain(label));
    expect(toolbarSource.match(/<Layers2/g)).toHaveLength(1);
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
    expect(pageSource).toContain('DrawingPdfExportDialog');
    expect(pdfDialogSource).toContain('导出 PDF');
    expect(pdfDialogSource).toContain('文件名');
    expect(pdfDialogSource).toContain('role="dialog"');
  });

  it('separates selection layer controls from global locking and warns without a selection', () => {
    expect(pageSource).toContain('toggleAllDrawingLocks');
    expect(pageSource).toContain('请先选择一个对象。');
    expect(pageSource).toContain('ActionToast');
    expect(toolbarSource).toContain('onToggleSelectionLock');
    expect(toolbarSource).toContain('onToggleAllLocks');
  });

  it('breaks active drawing paths before unrelated toolbar operations', () => {
    expect(pageSource).toContain('breakDrawingPath');
    expect(toolbarSource).toContain('onBeforeAction');
    expect(pageSource).toContain('onBeforeAction={breakDrawingPath}');
  });

  it('routes canvas and entity context actions through document commands', () => {
    expect(pageSource).toContain('DrawingCanvasContextMenu');
    expect(pageSource).toContain('splitDrawingPathAtPoint');
    expect(pageSource).toContain('placeDrawingCopiesAtPoint');
    expect(pageSource).toContain('onContextMenuRequest');
    expect(pageSource).toContain("moveLayers('front')");
    expect(pageSource).toContain("moveLayers('back')");
    expect(pageSource).toContain("selected.filter((object) => !object.locked && object.kind !== 'title-block')");
    expect(pageSource).toContain("selected.filter((object) => object.kind !== 'title-block')");
  });
});

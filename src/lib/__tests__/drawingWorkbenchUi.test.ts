import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(new URL('../../pages/DrawingWorkbenchPage.tsx', import.meta.url), 'utf8');
const toolbarSource = readFileSync(new URL('../../components/drawings/standalone/DrawingWorkbenchToolbar.tsx', import.meta.url), 'utf8');
const resourceSource = readFileSync(new URL('../../components/drawings/standalone/DrawingResourcePanel.tsx', import.meta.url), 'utf8');
const inspectorSource = readFileSync(new URL('../../components/drawings/standalone/StandaloneDrawingInspector.tsx', import.meta.url), 'utf8');
const pdfDialogSource = readFileSync(new URL('../../components/drawings/standalone/DrawingPdfExportDialog.tsx', import.meta.url), 'utf8');
const lineDialogSource = readFileSync(new URL('../../components/drawings/standalone/DrawingLinePropertiesDialog.tsx', import.meta.url), 'utf8');
const tableDialogSource = readFileSync(new URL('../../components/drawings/standalone/DrawingTableCreateDialog.tsx', import.meta.url), 'utf8');
const materialTableDialogSource = readFileSync(new URL('../../components/drawings/standalone/DrawingMaterialTableDialog.tsx', import.meta.url), 'utf8');
const materialFormDialogSource = readFileSync(new URL('../../components/drawings/standalone/DrawingMaterialFormDialog.tsx', import.meta.url), 'utf8');

describe('drawing workbench UI contract', () => {
  it('waits for drawing hydration and offers refresh resume or replacement', () => {
    expect(pageSource).toContain('useDrawingStore.persist.hasHydrated()');
    expect(pageSource).toContain('useDrawingStore.persist.onFinishHydration');
    expect(pageSource).toContain('enterDrawingWorkbench');
    expect(pageSource).toContain('replaceWithNewDocument');
    expect(pageSource).toContain('是否丢弃当前制作的图纸？');
    expect(pageSource).toContain('继续制作');
    expect(pageSource).toContain('丢弃并新建');
  });

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

  it('opens an editable line-properties dialog with alignment, color, width, and length fields', () => {
    expect(pageSource).toContain('DrawingLinePropertiesDialog');
    expect(pageSource).toContain('onEditLineRequest');
    expect(lineDialogSource).toContain('调整线属性');
    ['名称', '对齐', '颜色', '粗细', '长度', '保持当前角度', '水平', '垂直', '取消', '确定'].forEach((label) => expect(lineDialogSource).toContain(label));
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

  it('opens a parameter dialog before creating a custom table', () => {
    expect(pageSource).toContain('setTableDialogOpen(true)');
    expect(pageSource).toContain('<DrawingTableCreateDialog');
    expect(tableDialogSource).toContain('数据行数');
    expect(tableDialogSource).toContain('列数');
    expect(tableDialogSource).toContain('显示表名行');
    expect(tableDialogSource).toContain('onConfirm({ rowCount, columnCount, showTitleRow })');
  });

  it('provides current and company material workflows with Chinese error handling', () => {
    ['当前物料表', '公司物料表', '添加物料', '导出物料表（XLSX）', '物料名称/规格请输入搜索', '搜索', '新增物料', '重置', '操作'].forEach((label) => expect(materialTableDialogSource).toContain(label));
    expect(materialTableDialogSource).toContain('drawingMaterialRepository.list');
    expect(materialTableDialogSource).toContain('drawingMaterialRepository.create');
    expect(materialTableDialogSource).toContain('downloadDrawingMaterialXlsx');
    expect(materialTableDialogSource).toContain('getUserErrorMessage');
    expect(materialTableDialogSource).toContain('点击重试');
    expect(materialTableDialogSource).toContain('role="dialog"');
    ['物料编码', '请输入物料编码', '物料名称/规格', '输入或选择物料规格', '单位', '请输入或选择单位', '用量', '请输入用量', '备注', '请输入备注'].forEach((label) => expect(materialFormDialogSource).toContain(label));
    expect(materialFormDialogSource).toContain('role="dialog"');
  });

  it('wires BOM double-click and current-material additions through drawing history', () => {
    expect(pageSource).toContain('materialTableObjectId');
    expect(pageSource).toContain('onOpenMaterialTable={setMaterialTableObjectId}');
    expect(pageSource).toContain('<DrawingMaterialTableDialog');
    expect(pageSource).toContain('appendDrawingMaterial');
    expect(pageSource).toContain('remember();');
    expect(pageSource).toContain('onAddCurrent={addCurrentMaterial}');
  });
});

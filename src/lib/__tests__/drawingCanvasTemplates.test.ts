import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createDrawingFromWizard } from '@/lib/drawingGenerator';
import { defaultDrawingObjectStyle } from '@/lib/drawingDocument';
import { renderDrawingCanvas } from '@/lib/drawingRenderer';
import type { DrawingDocument, DrawingWizardDraft } from '@/types/drawing';

function createRecordingContext() {
  let currentFillStyle = '';
  const textCalls: Array<{ text: string; fillStyle: string }> = [];
  const context = {
    get fillStyle() { return currentFillStyle; },
    set fillStyle(value: string) { currentFillStyle = value; },
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    setLineDash: () => undefined,
    clearRect: () => undefined,
    fillRect: () => undefined,
    strokeRect: () => undefined,
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    rect: () => undefined,
    clip: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => undefined,
    stroke: () => undefined,
    translate: () => undefined,
    rotate: () => undefined,
    fillText: (text: string) => textCalls.push({ text, fillStyle: currentFillStyle }),
  };
  return { context: context as unknown as CanvasRenderingContext2D, textCalls };
}

describe('standalone drawing table templates', () => {
  it('keeps non-table canvas text edits from drawing a second visible input value', () => {
    const source = readFileSync('src/components/drawings/standalone/StandaloneDrawingCanvas.tsx', 'utf8');

    expect(source).toContain('const updateEditorValue = (value: string, selectionStart = value.length) =>');
    expect(source).toContain('onChange={(event) => updateEditorValue(event.target.value, event.target.selectionStart');
    expect(source).toContain('text-transparent');
    expect(source).toContain('left: (editor.x + editor.textInsetX) * zoom');
    expect(source).toContain('onFocus={(event) => event.currentTarget.setSelectionRange(caretIndex, caretIndex)}');
  });

  it('keeps Canvas text visible and renders only a measured caret overlay while editing', () => {
    const source = readFileSync('src/components/drawings/standalone/StandaloneDrawingCanvas.tsx', 'utf8');
    const rendererSource = readFileSync('src/lib/drawingRenderer.ts', 'utf8');

    expect(source).toContain('await document.fonts.ready;');
    expect(source).toContain('measureDrawingCaret');
    expect(source).toContain('editorInputRef.current?.setSelectionRange(caretIndex, caretIndex)');
    expect(source).toContain("caretColor: 'transparent'");
    expect(source).toContain('<line');
    expect(source).not.toContain('ref={textEditorRef}');
    expect(source).not.toContain('hiddenTextObjectIds');
    expect(rendererSource).toContain('getEditableDrawingTextRuns');
  });

  it('uses a DOM table layer for in-place table editing', () => {
    const source = readFileSync('src/components/drawings/standalone/StandaloneDrawingCanvas.tsx', 'utf8');

    expect(source).toContain('function DrawingTableLayer');
    expect(source).toContain('contentEditable={isEditing}');
    expect(source).toContain('hiddenObjectIds: tableObjectIds');
    expect(source).toContain('resolveDrawingTableCells');
    expect(source).toContain('data-table-cell={cell.key}');
    expect(source).toContain('getDrawingTableTextFontSize');
    expect(source).toContain('whitespace-nowrap');
    expect(source).not.toContain('whitespace-normal break-all');
    expect(source).toContain('justify-center text-center');
    expect(source).toContain('border-0 bg-white text-slate-900');
    expect(source).toContain('boxShadow: `inset 0 0 0 1px ${DRAWING_TABLE_LINE_COLOR}`');
  });

  it('opens the semantic BOM table before local cell editing', () => {
    const source = readFileSync('src/components/drawings/standalone/StandaloneDrawingCanvas.tsx', 'utf8');

    expect(source).toContain('onOpenMaterialTable?: (objectId: string) => void');
    expect(source).toContain("object.tableRole !== 'bom'");
    expect(source).toContain('onDoubleClickCapture');
    expect(source).toContain('onOpenMaterialTable(object.id)');
  });

  it('renders one SVG transform overlay with eight resize handles and a rotation control', () => {
    const overlay = readFileSync('src/components/drawings/standalone/StandaloneDrawingSelectionOverlay.tsx', 'utf8');
    expect(overlay).toContain("const resizeHandles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']");
    expect(overlay).toContain('stroke="#60a5fa"');
    expect(overlay).toContain('HANDLE_SIZE_CSS');
    expect(overlay).toContain('HANDLE_HIT_SIZE_CSS');
    expect(overlay).toContain('pointerEvents="all"');
    expect(overlay).not.toContain('className="pointer-events-all"');
    expect(overlay).toContain('onResizePointerDown(handle, event)');
    expect(overlay).toContain('onPointerDown={props.onRotatePointerDown}');
  });

  it('uses immutable transform interactions and rotates DOM tables without a duplicate selection ring', () => {
    const source = readFileSync('src/components/drawings/standalone/StandaloneDrawingCanvas.tsx', 'utf8');
    const renderer = readFileSync('src/lib/drawingRenderer.ts', 'utf8');
    expect(source).toContain("type TransformInteraction =");
    expect(source).toContain("kind: 'resize'");
    expect(source).toContain("kind: 'rotate'");
    expect(source).toContain('moveDrawingObject(interaction.object');
    expect(source).toContain('resizeDrawingObject(interaction.object');
    expect(source).toContain('rotateDrawingObject(interaction.object');
    expect(source).toContain('<StandaloneDrawingSelectionOverlay');
    expect(source).toContain('transform: `rotate(${object.rotation}deg)`');
    expect(source).toContain("transformOrigin: 'center center'");
    expect(source).not.toContain('ring-2 ring-blue-500 ring-offset-1');
    expect(renderer).not.toContain('context.strokeRect(object.x - 4');
  });

  it('keeps table cells in the grid while allowing the grid and its text to move independently', () => {
    const canvasSource = readFileSync('src/components/drawings/standalone/StandaloneDrawingCanvas.tsx', 'utf8');
    const rendererSource = readFileSync('src/lib/drawingRenderer.ts', 'utf8');

    expect(canvasSource).toContain('onPointerMove={handleTablePointerMove}');
    expect(canvasSource).toContain('textOffsets');
    expect(canvasSource).toContain('overflow-visible');
    expect(rendererSource).toContain('object.textOffsets?.[key]');
    expect(rendererSource).toContain("context.textAlign = centered ? 'center' : 'left'");
    expect(rendererSource).toContain('x + cellWidth / 2');
    expect(rendererSource).not.toContain('context.clip()');
  });

  it('renders table text using the configured ink color instead of the white table fill', () => {
    const document: DrawingDocument = {
      schemaVersion: 1,
      id: 'drawing-1',
      name: 'table text',
      createdAt: 0,
      updatedAt: 0,
      page: { size: 'A4', orientation: 'landscape', width: 1200, height: 800 },
      titleBlock: { title: 'title', drawingNo: 'drawing-1', revision: 'A' },
      revisionTable: [],
      techRequirements: [],
      objects: [{
        id: 'wiring-table-1', kind: 'wiring-table', x: 100, y: 100, width: 300, height: 120,
        rotation: 0, zIndex: 1, locked: false, visible: true, style: defaultDrawingObjectStyle,
        title: '接线表', columns: ['P1', '颜色', 'P2', '长度'],
        rows: [{ P1: '黑', 颜色: '1', P2: '黑', 长度: '2' }],
      }],
    };
    const { context, textCalls } = createRecordingContext();

    renderDrawingCanvas(context, document);

    expect(textCalls.find((call) => call.text === '接线表')?.fillStyle).toBe(defaultDrawingObjectStyle.color);
    expect(textCalls.find((call) => call.text === '黑')?.fillStyle).toBe(defaultDrawingObjectStyle.color);
  });

  it('selects one table, cell, or text target and reuses the eight-handle overlay', () => {
    const canvasSource = readFileSync('src/components/drawings/standalone/StandaloneDrawingCanvas.tsx', 'utf8');
    const overlaySource = readFileSync('src/components/drawings/standalone/StandaloneDrawingSelectionOverlay.tsx', 'utf8');
    expect(canvasSource).toContain("kind: 'table-cell'");
    expect(canvasSource).toContain("kind: 'table-text'");
    expect(canvasSource).toContain('onSelectTarget={setTableTarget}');
    expect(canvasSource).toContain('getDrawingTableTargetObject');
    expect(canvasSource).toContain('activeTransformObject');
    expect(canvasSource).toContain('resolveTablePointerAction(selected, activeTarget');
    expect(canvasSource).toContain('resolveTableDoubleClickAction(activeTarget, localTarget)');
    expect(canvasSource).toContain("compactHitTargets={activeTableTarget?.kind === 'table-text'}");
    expect(overlaySource).toContain('props.compactHitTargets ? HANDLE_SIZE_CSS : HANDLE_HIT_SIZE_CSS');
    expect(canvasSource).toContain('activeTarget={activeTableTarget?.objectId === object.id ? activeTableTarget : null}');
    expect(overlaySource).toContain('showRotation');
    expect(overlaySource).toContain('props.showRotation !== false');
  });

  it('omits disabled table title rows from Canvas rendering', () => {
    const document: DrawingDocument = {
      schemaVersion: 1, id: 'drawing-no-title', name: 'no title', createdAt: 0, updatedAt: 0,
      page: { size: 'A4', orientation: 'landscape', width: 1200, height: 800 },
      titleBlock: { title: 'title', drawingNo: 'D-1', revision: 'A' }, revisionTable: [], techRequirements: [],
      objects: [{
        id: 'table-no-title', kind: 'table', x: 10, y: 10, width: 200, height: 54,
        rotation: 0, zIndex: 1, locked: false, visible: true, style: defaultDrawingObjectStyle,
        title: '不要显示', columns: ['列1', '列2'], rows: [{ 列1: '甲', 列2: '乙' }],
        showTitleRow: false, columnWidths: [70, 130], headerRowHeight: 20, rowHeights: [34],
      }],
    };
    const { context, textCalls } = createRecordingContext();
    renderDrawingCanvas(context, document);
    expect(textCalls.map((call) => call.text)).not.toContain('不要显示');
    expect(textCalls.map((call) => call.text)).toEqual(expect.arrayContaining(['列1', '列2', '甲', '乙']));
  });

  it('can omit DOM-managed table objects from the interactive canvas render', () => {
    const document: DrawingDocument = {
      schemaVersion: 1,
      id: 'drawing-2',
      name: 'DOM table',
      createdAt: 0,
      updatedAt: 0,
      page: { size: 'A4', orientation: 'landscape', width: 1200, height: 800 },
      titleBlock: { title: 'title', drawingNo: 'drawing-2', revision: 'A' },
      revisionTable: [],
      techRequirements: [],
      objects: [{
        id: 'dom-table-1', kind: 'table', x: 100, y: 100, width: 300, height: 120,
        rotation: 0, zIndex: 1, locked: false, visible: true, style: defaultDrawingObjectStyle,
        title: '变更记录', columns: ['版本'], rows: [{ 版本: 'A' }],
      }],
    };
    const { context, textCalls } = createRecordingContext();

    renderDrawingCanvas(context, document, null, { hiddenObjectIds: new Set(['dom-table-1']) });

    expect(textCalls).toHaveLength(0);
  });

  it('creates the requested revision, title, wiring, and BOM table defaults', () => {
    const draft: DrawingWizardDraft = {
      topology: { drawingType: 'internal', topology: 'single-end', wireKind: 'electronic' },
      singleConnector: { id: 'c20', name: 'AC电源插座C20公座-1', gender: 'male', pinCount: 2, category: 'power', series: 'C20', rowCount: 1, scope: 'public' },
      drawingNo: 'WH-001', totalLengthMm: 2, toleranceMm: 0, hasMold: false,
      wireResource: { id: 'ul1007', catalogItemId: 'wire-1', resourceType: 'wire', name: 'UL1007', model: 'UL1007', category: '线材' },
      wires: [{ pin: 1, color: '黑', lengthMm: 2, wireNo: '黑', connectionNo: '1', targetPin: 2 }],
    };

    const drawing = createDrawingFromWizard(draft);
    const tables = drawing.objects.filter((object) => object.kind === 'table' || object.kind === 'bom-table' || object.kind === 'wiring-table');

    expect(tables.some((table) => table.title === '变更记录' && table.columns.includes('变更内容'))).toBe(true);
    expect(tables.some((table) => table.tableRole === 'title-block' && table.rows.some((row) => row.C6 === '单位' && row.C7 === 'mm'))).toBe(true);
    expect(tables.some((table) => table.tableRole === 'title-block' && table.rows.some((row) => row.C3 === '工程图号' && row.C4 === 'WH-001'))).toBe(true);
    expect(tables.some((table) => table.title === '接线表' && table.rows.some((row) => row.P1 === '1' && row.颜色 === '黑' && row.P2 === '2' && row.长度 === '2'))).toBe(true);
    expect(tables.some((table) => table.kind === 'bom-table' && table.rows.some((row) => row['物料名称/规格'] === 'AC电源插座C20公座-1' && row.单位 === 'PCS' && row.用量 === '1'))).toBe(true);
    expect(tables.some((table) => table.kind === 'bom-table' && table.rows.some((row) => row['物料名称/规格'] === 'UL1007'))).toBe(true);
  });
});

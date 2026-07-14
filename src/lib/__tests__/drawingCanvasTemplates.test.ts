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

    expect(source).toContain('const updateEditorValue = (value: string) =>');
    expect(source).toContain('onChange={(event) => updateEditorValue(event.target.value)}');
    expect(source).toContain('text-transparent');
    expect(source).toContain('left: (editor.x + editor.textInsetX) * zoom');
    expect(source).toContain('onFocus={(event) => event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length)}');
  });

  it('uses the same visible DOM text run for text glyphs and the native caret while editing', () => {
    const source = readFileSync('src/components/drawings/standalone/StandaloneDrawingCanvas.tsx', 'utf8');
    const rendererSource = readFileSync('src/lib/drawingRenderer.ts', 'utf8');

    expect(source).toContain('const textEditorRef = useRef<HTMLDivElement | null>(null);');
    expect(source).toContain('await document.fonts.ready;');
    expect(source).toContain('contentEditable');
    expect(source).toContain("fontFamily: 'Arial, sans-serif'");
    expect(source).toContain('transform: `rotate(${editingTextObject.rotation}deg)`');
    expect(source).toContain('hiddenTextObjectIds: editingTextObjectIds');
    expect(rendererSource).toContain('hiddenTextObjectIds?: ReadonlySet<string>');
  });

  it('uses a DOM table layer for in-place table editing', () => {
    const source = readFileSync('src/components/drawings/standalone/StandaloneDrawingCanvas.tsx', 'utf8');

    expect(source).toContain('function DrawingTableLayer');
    expect(source).toContain('contentEditable={isEditing}');
    expect(source).toContain('hiddenObjectIds: tableObjectIds');
  });

  it('keeps table cells in the grid while allowing the grid and its text to move independently', () => {
    const canvasSource = readFileSync('src/components/drawings/standalone/StandaloneDrawingCanvas.tsx', 'utf8');
    const rendererSource = readFileSync('src/lib/drawingRenderer.ts', 'utf8');

    expect(canvasSource).toContain('onPointerMove={handleTablePointerMove}');
    expect(canvasSource).toContain('textOffsets');
    expect(rendererSource).toContain('object.textOffsets?.[key]');
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
      wires: [{ pin: 1, color: '黑', lengthMm: 2, wireNo: '黑', connectionNo: '1', targetPin: 2 }],
    };

    const drawing = createDrawingFromWizard(draft);
    const tables = drawing.objects.filter((object) => object.kind === 'table' || object.kind === 'bom-table' || object.kind === 'wiring-table');

    expect(tables.some((table) => table.title === '变更记录' && table.columns.includes('变更内容'))).toBe(true);
    expect(tables.some((table) => table.title === 'XXx公司' && table.rows.some((row) => row.字段 === '单位' && row.内容 === 'mm'))).toBe(true);
    expect(tables.some((table) => table.title === 'XXx公司' && table.rows.some((row) => row.字段 === '工程图号' && row.内容 === 'WH-001'))).toBe(true);
    expect(tables.some((table) => table.title === '接线表' && table.rows.some((row) => row.P1 === '黑' && row.长度 === '2'))).toBe(true);
    expect(tables.some((table) => table.kind === 'bom-table' && table.rows.some((row) => row['物料名称/规格'] === 'AC电源插座C20公座-1俯面' && row.单位 === 'PCS' && row.用量 === '1'))).toBe(true);
  });
});

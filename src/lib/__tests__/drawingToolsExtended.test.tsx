// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrawingCrossWireDialog } from '@/components/drawings/standalone/DrawingCrossWireDialog';
import { DrawingDrawToolFloatingBar } from '@/components/drawings/standalone/DrawingDrawToolFloatingBar';
import { DrawingMaterialFormDialog } from '@/components/drawings/standalone/DrawingMaterialFormDialog';
import { DrawingResourcePanel } from '@/components/drawings/standalone/DrawingResourcePanel';
import { DrawingWiringRelationDialog } from '@/components/drawings/standalone/DrawingWiringRelationDialog';
import { StandaloneDrawingInspector } from '@/components/drawings/standalone/StandaloneDrawingInspector';
import { createBlankDrawingDocument, defaultDrawingObjectStyle } from '@/lib/drawingDocument';
import { isDrawingDocument } from '@/lib/drawingDocumentSchema';
import { serializeDrawingSvg } from '@/lib/drawingExport';
import { renderDrawingCanvas } from '@/lib/drawingRenderer';
import { listStaticDrawingComponentGraphics } from '@/lib/drawingStaticResources';

describe('extended drawing tools and styles', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('creates crossed wire bundles with configurable rows and geometry', () => {
    const onConfirm = vi.fn();
    render(<DrawingCrossWireDialog onClose={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: '添加一行交叉线' }));
    fireEvent.change(screen.getByLabelText('线1接线'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: '确定' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const group = onConfirm.mock.calls[0][0];
    expect(group.kind).toBe('group');
    expect(group.children).toHaveLength(2);
    expect(group.children[0].points).toHaveLength(4);
  });

  it('pairs non-overlapping twisted wires and inserts wiring diagram', () => {
    const onConfirm = vi.fn();
    render(<DrawingWiringRelationDialog onClose={vi.fn()} onConfirm={onConfirm} />);

    const twistButtons = screen.getAllByRole('button', { name: '对绞' });
    fireEvent.click(twistButtons[0]);
    expect(screen.getByText('共 4 条 · 对绞 1 对 (相邻两条为一对)')).toBeTruthy();
    expect(screen.getAllByText('1-2 (已对绞)')).toHaveLength(2);
    // Second row cannot overlap with row 1-2 pair
    expect((screen.getAllByRole('button', { name: '对绞' })[0] as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '插入到画板' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const group = onConfirm.mock.calls[0][0];
    expect(group.children.some((item: { kind: string; text?: string }) => item.text === '接线图')).toBe(true);
    expect(group.children.some((item: { kind: string; style?: { dash?: string } }) => item.kind === 'curve' && item.style?.dash === 'dashed')).toBe(true);
  });

  it('exposes dash style, line count, color, and exit on floating draw-tool bar', () => {
    const onChangeSettings = vi.fn();
    const onExit = vi.fn();
    render(
      <DrawingDrawToolFloatingBar
        toolMode="line"
        orthogonal={false}
        settings={{ stroke: '#111827', strokeWidth: 1, dash: 'solid', lineCount: 1, snapEnabled: true }}
        onChangeSettings={onChangeSettings}
        onToggleOrthogonal={vi.fn()}
        onExit={onExit}
      />,
    );

    fireEvent.change(screen.getByLabelText('线数量'), { target: { value: '3' } });
    expect(onChangeSettings).toHaveBeenCalledWith({ lineCount: 3 });

    fireEvent.click(screen.getByRole('button', { name: '实线' }));
    fireEvent.click(screen.getByRole('button', { name: '虚线' }));
    expect(onChangeSettings).toHaveBeenCalledWith({ dash: 'dashed' });

    fireEvent.click(screen.getByRole('button', { name: '退出绘制' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('validates and exports dashed lines and dimension variants', () => {
    const doc = createBlankDrawingDocument('样式测试');
    doc.objects.push(
      {
        id: 'line-dash',
        kind: 'line',
        x: 100,
        y: 100,
        width: 120,
        height: 1,
        rotation: 0,
        zIndex: 10,
        locked: false,
        visible: true,
        orthogonal: true,
        points: [{ x: 100, y: 100 }, { x: 220, y: 100 }],
        style: { ...defaultDrawingObjectStyle, dash: 'dash-dot' },
      },
      {
        id: 'dim-vert',
        kind: 'dimension',
        x: 300,
        y: 100,
        width: 45,
        height: 120,
        rotation: 0,
        zIndex: 11,
        locked: false,
        visible: true,
        label: '120mm',
        start: { x: 322.5, y: 100 },
        end: { x: 322.5, y: 220 },
        variant: 'vertical',
        style: { ...defaultDrawingObjectStyle },
      },
    );

    expect(isDrawingDocument(doc)).toBe(true);
    const svg = serializeDrawingSvg(doc);
    expect(svg).toContain('stroke-dasharray="8 4 2 4"');
    expect(svg).toContain('120mm');
  });

  it('renders and exports vector svgGraphic for packaging and component graphics', () => {
    const pkg = listStaticDrawingComponentGraphics('包装方式').find((item) => item.id === 'pkg-figure8')!;
    const doc = createBlankDrawingDocument('包装矢量图');
    doc.objects.push({
      id: 'pkg-1',
      kind: 'accessory',
      x: 200,
      y: 260,
      width: 240,
      height: 120,
      rotation: 0,
      zIndex: 10,
      locked: false,
      visible: true,
      label: pkg.name,
      accessoryType: 'packaging',
      svgGraphic: pkg.svgPreview,
      style: { ...defaultDrawingObjectStyle },
    });

    expect(isDrawingDocument(doc)).toBe(true);
    const svg = serializeDrawingSvg(doc);
    expect(svg).toContain('总长度小于120');
    expect(svg).toContain('30~40');

    const textCalls: string[] = [];
    const context = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      setLineDash: () => undefined,
      clearRect: () => undefined,
      fillRect: () => undefined,
      strokeRect: () => undefined,
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      rect: () => undefined,
      roundRect: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      arc: () => undefined,
      ellipse: () => undefined,
      closePath: () => undefined,
      fill: () => undefined,
      stroke: () => undefined,
      translate: () => undefined,
      rotate: () => undefined,
      scale: () => undefined,
      fillText: (text: string) => textCalls.push(text),
    } as unknown as CanvasRenderingContext2D;

    renderDrawingCanvas(context, doc, null, { hiddenObjectIds: new Set(doc.objects.filter((o) => o.kind !== 'accessory').map((o) => o.id)) });
    expect(textCalls).toContain('总长度小于120');
    expect(textCalls).toContain('30~40');
    expect(textCalls).not.toContain('扎线8字');
  });

  it('renders dashed crosshair guides only while hovering inside the drawing frame', () => {
    const canvasSource = readFileSync('src/components/drawings/standalone/StandaloneDrawingCanvas.tsx', 'utf8');
    expect(canvasSource).toContain('const [hoverPoint, setHoverPoint] = useState<DrawingPoint | null>(null)');
    expect(canvasSource).toContain('onPointerLeave={() => setHoverPoint(null)}');
    expect(canvasSource).toContain('{hoverPoint && (');
    expect(canvasSource).toContain('y1={hoverPoint.y}');
    expect(canvasSource).toContain('x1={hoverPoint.x}');
  });

  it('allows editing current BOM materials with blank material code and displays edit title', () => {
    const onSubmit = vi.fn();
    render(
      <DrawingMaterialFormDialog
        mode="current"
        isEdit
        initial={{ code: '', nameAndSpecification: '热缩套管', unit: 'mm', quantity: '8', note: '' }}
        suggestions={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('编辑物料')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ code: '', nameAndSpecification: '热缩套管', unit: 'mm', quantity: '8' }));
  });

  it('exports arrowheads and markers for vertical-inward, diameter, and radius dimensions', () => {
    const doc = createBlankDrawingDocument('标注变体测试');
    doc.objects.push(
      {
        id: 'dim-vin',
        kind: 'dimension',
        x: 100,
        y: 100,
        width: 45,
        height: 120,
        rotation: 0,
        zIndex: 10,
        locked: false,
        visible: true,
        label: '120',
        start: { x: 122.5, y: 100 },
        end: { x: 122.5, y: 220 },
        variant: 'vertical-inward',
        style: { ...defaultDrawingObjectStyle },
      },
      {
        id: 'dim-dia',
        kind: 'dimension',
        x: 200,
        y: 100,
        width: 140,
        height: 30,
        rotation: 0,
        zIndex: 11,
        locked: false,
        visible: true,
        label: 'Ø 10mm',
        start: { x: 200, y: 115 },
        end: { x: 340, y: 115 },
        variant: 'diameter',
        style: { ...defaultDrawingObjectStyle },
      },
      {
        id: 'dim-rad',
        kind: 'dimension',
        x: 400,
        y: 100,
        width: 120,
        height: 30,
        rotation: 0,
        zIndex: 12,
        locked: false,
        visible: true,
        label: 'R 5mm',
        start: { x: 400, y: 115 },
        end: { x: 520, y: 115 },
        variant: 'radius',
        style: { ...defaultDrawingObjectStyle },
      },
    );

    const svg = serializeDrawingSvg(doc);
    expect(svg).toContain('points="18.5,8 22.5,0 26.5,8"');
    expect(svg).toContain('Ø 10mm');
    expect(svg).toContain('<circle cx="4" cy="15" r="2.5"');
    expect(svg).toContain('R 5mm');
  });

  it('commits scale on Enter and edits line dash style in inspector', () => {
    const doc = createBlankDrawingDocument('属性面板测试');
    doc.objects.push({
      id: 'line-edit-1',
      kind: 'line',
      x: 100,
      y: 100,
      width: 100,
      height: 20,
      rotation: 0,
      zIndex: 10,
      locked: false,
      visible: true,
      orthogonal: true,
      points: [{ x: 100, y: 100 }, { x: 200, y: 120 }],
      style: { ...defaultDrawingObjectStyle, dash: 'solid' },
    });
    const onUpdateObject = vi.fn();

    render(
      <StandaloneDrawingInspector
        drawing={doc}
        selectedObjectId="line-edit-1"
        selectedObjectIds={['line-edit-1']}
        onStartEdit={vi.fn()}
        onUpdateObject={onUpdateObject}
        onUpdateObjects={vi.fn()}
        onSetLayer={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('线型'), { target: { value: 'dashed' } });
    expect(onUpdateObject).toHaveBeenCalledWith(
      'line-edit-1',
      expect.objectContaining({ style: expect.objectContaining({ dash: 'dashed' }) }),
    );

    const xScale = screen.getByLabelText('X 轴') as HTMLInputElement;
    xScale.focus();
    fireEvent.change(xScale, { target: { value: '2' } });
    fireEvent.keyDown(xScale, { key: 'Enter' });
    expect(onUpdateObject).toHaveBeenCalledWith('line-edit-1', { width: 200 });
  });

  it('routes resource panel BOM table button to onOpenBomTable and loads static phrases in workbench', () => {
    const onOpenBomTable = vi.fn();
    render(
      <DrawingResourcePanel
        open
        onClose={vi.fn()}
        onAddKind={vi.fn()}
        onAddCatalog={vi.fn()}
        onAddPhrase={vi.fn()}
        onAddIcon={vi.fn()}
        onOpenBomTable={onOpenBomTable}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '物料表' }));
    expect(onOpenBomTable).toHaveBeenCalledTimes(1);

    const workbenchSource = readFileSync('src/pages/DrawingWorkbenchPage.tsx', 'utf8');
    expect(workbenchSource).toContain('phrases={listStaticDrawingCommonPhrases()}');
    expect(workbenchSource).toContain('onOpenBomTable={() => {');
  });
});

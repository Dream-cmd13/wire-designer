// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrawingCrossWireDialog } from '@/components/drawings/standalone/DrawingCrossWireDialog';
import { DrawingDrawToolFloatingBar } from '@/components/drawings/standalone/DrawingDrawToolFloatingBar';
import { DrawingWiringRelationDialog } from '@/components/drawings/standalone/DrawingWiringRelationDialog';
import { createBlankDrawingDocument, defaultDrawingObjectStyle } from '@/lib/drawingDocument';
import { isDrawingDocument } from '@/lib/drawingDocumentSchema';
import { serializeDrawingSvg } from '@/lib/drawingExport';

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
    expect(onConfirm.mock.calls[0][0].children.some((item: { kind: string; text?: string }) => item.text === '接线图')).toBe(true);
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
});

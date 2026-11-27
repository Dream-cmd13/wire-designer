// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StandaloneDrawingWizard } from '@/components/drawings/standalone/StandaloneDrawingWizard';
import { drawingCatalogRepository } from '@/lib/drawingCatalogRepository';
import type { DrawingDocument } from '@/types/drawing';

describe('StandaloneDrawingWizard', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders unified 内线 / 外线 / 图库 tabs with live preview and wire table', () => {
    const html = renderToStaticMarkup(
      <StandaloneDrawingWizard open canUseCatalog onClose={vi.fn()} onGenerate={vi.fn()} />,
    );

    expect(html).toContain('配置向导');
    expect(html).toContain('内线');
    expect(html).toContain('外线');
    expect(html).toContain('图库');
    expect(html).toContain('基本参数');
    expect(html).toContain('实时预览');
    expect(html).toContain('线材明细');
    expect(html).not.toContain('1. 连接器/模型');
  });

  it('requires login for new drawings and keeps the built-in library templates available', async () => {
    const listResources = vi.spyOn(drawingCatalogRepository, 'listResources');
    const onGenerate = vi.fn();
    const onLoadTemplate = vi.fn();
    render(<StandaloneDrawingWizard open onClose={vi.fn()} onGenerate={onGenerate} onLoadTemplate={onLoadTemplate} />);

    expect(screen.getByRole('button', { name: '登录' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '确定' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '图库' }));
    fireEvent.click(await screen.findByRole('button', { name: /双头四芯屏蔽线模板/ }));
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    await vi.waitFor(() => expect(onLoadTemplate).toHaveBeenCalledTimes(1));
    expect(listResources).not.toHaveBeenCalled();
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('generates a complete default drawing after login on single-screen internal mode', async () => {
    vi.spyOn(drawingCatalogRepository, 'listResources').mockResolvedValue([]);
    const onGenerate = vi.fn<(drawing: DrawingDocument) => void>();
    const props = { open: true, onClose: vi.fn(), onGenerate };
    const { rerender } = render(<StandaloneDrawingWizard {...props} />);
    rerender(<StandaloneDrawingWizard {...props} canUseCatalog />);

    expect(screen.getByLabelText('内线实时预览')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '确定' }));

    expect(onGenerate).toHaveBeenCalledTimes(1);
    const drawing = onGenerate.mock.calls[0][0];
    expect(drawing.objects.filter((object) => object.kind === 'connector')).toHaveLength(2);
    expect(drawing.wizardSource?.wires.map(({ pin, targetPin }) => [pin, targetPin])).toEqual([[1, 1], [2, 2], [3, 3], [4, 4]]);
    expect(drawing.objects.find((object) => object.kind === 'bom-table')?.rows).toContainEqual(
      expect.objectContaining({ 用量: '0.32', 单位: 'M', 物料编码: '' }),
    );
  });

  it('supports external tail styles, slot picker, process notes modal, and cable validation', async () => {
    const onGenerate = vi.fn<(drawing: DrawingDocument) => void>();
    vi.spyOn(drawingCatalogRepository, 'listResources').mockResolvedValue([
      { id: 'catalog-connector', resourceItemId: 'catalog-connector', name: '目录连接器', model: 'M12-4', resourceType: 'connector', resourceGroup: '连接器', pinCount: 4 },
      { id: 'catalog-cable', resourceItemId: 'catalog-cable', name: '目录护套线', model: 'CAT-4C', resourceType: 'wire', resourceGroup: '线材', wireKind: 'jacketed', coreColors: ['棕色', '白色', '蓝色', '黑色'] },
    ]);

    render(<StandaloneDrawingWizard open canUseCatalog onClose={vi.fn()} onGenerate={onGenerate} />);

    fireEvent.click(screen.getByRole('button', { name: '外线' }));
    expect(screen.getByLabelText('外线实时预览')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /单头尾部上锡/ }));
    expect(screen.getByText('线尾 线材明细')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '工艺说明' }));
    expect(screen.getByRole('dialog', { name: '选择工艺说明' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /包装说明/ }));
    fireEvent.click(screen.getByRole('button', { name: '技术' }));
    fireEvent.click(screen.getByRole('button', { name: /L尺寸公差表/ }));
    fireEvent.click(screen.getByRole('button', { name: '确定' }));

    expect(screen.getByText('已附加 2 项说明')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '包装方式' }));
    const packagingDialog = screen.getByRole('dialog', { name: '选择包装方式' });
    fireEvent.click(within(packagingDialog).getByRole('button', { name: /扎线8字/ }));
    fireEvent.click(within(packagingDialog).getByRole('button', { name: '确定' }));
    expect(screen.getByText('包装：扎线8字')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '绘制到画板' }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
    const generated = onGenerate.mock.calls[0][0];
    expect(generated.techRequirements.join('\n')).toContain('包装说明');
    expect(generated.techRequirements.join('\n')).toContain('L尺寸公差表');
    expect(generated.objects).toContainEqual(expect.objectContaining({
      kind: 'accessory',
      accessoryType: 'packaging',
      label: '扎线示意图 · 扎线8字',
    }));
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('renders three drawing steps with endpoint form and a separate template command', () => {
    const html = renderToStaticMarkup(
      <StandaloneDrawingWizard open onClose={vi.fn()} onGenerate={vi.fn()} />,
    );

    expect(html).toContain('1. 连接器/模型');
    expect(html).toContain('2. 属性与颜色');
    expect(html).toContain('3. 预览');
    expect(html).toContain('端头形式');
    expect(html).toContain('从模板创建');
    expect(html).not.toContain('>类型<');
    expect(html).not.toContain('>子类型<');
    expect(html).not.toContain('线材类型');
    expect(html).not.toContain('4. 预览');
  });

  it('generates a complete local example without catalog access or manual input', async () => {
    const listResources = vi.spyOn(drawingCatalogRepository, 'listResources');
    const onGenerate = vi.fn<(drawing: DrawingDocument) => void>();
    render(<StandaloneDrawingWizard open onClose={vi.fn()} onGenerate={onGenerate} />);

    const next = screen.getByRole<HTMLButtonElement>('button', { name: '下一步' });
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByRole('img', { name: '待生成的线束图纸' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '确认生成' }));

    expect(listResources).not.toHaveBeenCalled();
    expect(onGenerate).toHaveBeenCalledTimes(1);
    const drawing = onGenerate.mock.calls[0][0];
    expect(drawing.objects.filter((object) => object.kind === 'connector')).toHaveLength(2);
    expect(drawing.wizardSource?.wires.map(({ pin, targetPin }) => [pin, targetPin])).toEqual([[1, 1], [2, 2], [3, 3], [4, 4]]);
    expect(drawing.objects.find((object) => object.kind === 'bom-table')?.rows).toContainEqual(expect.objectContaining({ 用量: '0.32', 单位: 'M', 物料编码: '' }));

    fireEvent.click(screen.getByRole('button', { name: '从模板创建' }));
    await screen.findByRole('button', { name: /双头四芯屏蔽线模板/ });
    expect(listResources).not.toHaveBeenCalled();
  });

  it('keeps the example selected after the catalog loads and validates a manually chosen cable', async () => {
    const onGenerate = vi.fn();
    vi.spyOn(drawingCatalogRepository, 'listResources').mockResolvedValue([
      { id: 'catalog-connector', resourceItemId: 'catalog-connector', name: '目录连接器', model: 'M12-4', resourceType: 'connector', resourceGroup: '连接器', pinCount: 4 },
      { id: 'catalog-cable', resourceItemId: 'catalog-cable', name: '目录护套线', model: 'CAT-4C', resourceType: 'wire', resourceGroup: '线材', wireKind: 'jacketed', coreColors: ['棕色', '白色', '蓝色', '黑色'] },
    ]);
    const props = { canUseCatalog: true, onClose: vi.fn(), onGenerate };
    const { rerender } = render(<StandaloneDrawingWizard open {...props} />);
    await screen.findAllByRole('button', { name: /目录连接器/ });

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByLabelText<HTMLInputElement>('护套线下料长度 (mm)').value).toBe('320');
    fireEvent.change(screen.getByLabelText('线材规格'), { target: { value: 'catalog-cable' } });
    expect(screen.getByLabelText<HTMLInputElement>('护套线下料长度 (mm)').value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '确认生成' }).disabled).toBe(true);
    expect(onGenerate).not.toHaveBeenCalled();

    rerender(<StandaloneDrawingWizard open={false} {...props} />);
    rerender(<StandaloneDrawingWizard open {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    fireEvent.click(screen.getByRole('button', { name: '确认生成' }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
    await screen.findByRole('img', { name: '待生成的线束图纸' });
  });
});

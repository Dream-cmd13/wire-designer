import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StandaloneDrawingWizard } from '@/components/drawings/standalone/StandaloneDrawingWizard';

describe('StandaloneDrawingWizard', () => {
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
});

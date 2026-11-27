import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DrawingResourcePanel } from '@/components/drawings/standalone/DrawingResourcePanel';
import { StandaloneDrawingWizard } from '@/components/drawings/standalone/StandaloneDrawingWizard';

const noop = vi.fn();

describe('workbench catalog gates', () => {
  it('shows a login hint instead of the public catalog in the resource panel for anonymous users', () => {
    const anonymous = renderToStaticMarkup(
      <DrawingResourcePanel
        open
        canUseCatalog={false}
        onClose={noop}
        onAddKind={noop}
        onAddCatalog={noop}
        onAddPhrase={noop}
        onAddIcon={noop}
      />,
    );

    expect(anonymous).toContain('登录后可查看公共物料目录。');
    // 本地工具与静态资源入口保持可用
    expect(anonymous).toContain('连接器/模型');
    expect(anonymous).toContain('常用语');
    expect(anonymous).toContain('图标');

    const signedIn = renderToStaticMarkup(
      <DrawingResourcePanel
        open
        canUseCatalog
        onClose={noop}
        onAddKind={noop}
        onAddCatalog={noop}
        onAddPhrase={noop}
        onAddIcon={noop}
      />,
    );

    expect(signedIn).not.toContain('登录后可查看公共物料目录。');
  });

  it('shows a login hint instead of new drawing configuration for anonymous users', () => {
    const anonymous = renderToStaticMarkup(
      <StandaloneDrawingWizard open canUseCatalog={false} onClose={noop} onGenerate={noop} />,
    );

    expect(anonymous).toContain('登录后可使用配置向导新建图纸。');
    expect(anonymous).not.toContain('左端子');

    const signedIn = renderToStaticMarkup(
      <StandaloneDrawingWizard open canUseCatalog onClose={noop} onGenerate={noop} />,
    );

    expect(signedIn).not.toContain('登录后可使用配置向导新建图纸。');
    expect(signedIn).toContain('左端子');
    expect(signedIn).toContain('实时预览');
  });
});

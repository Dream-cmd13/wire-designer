import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AdminShell } from '@/components/layout/AdminShell';
import { appRoutes } from '@/lib/appRoute';

describe('AdminShell view toggle buttons', () => {
  it('renders design drawing and product image toggle buttons to the left of project name when project exists', () => {
    const html = renderToStaticMarkup(
      <AdminShell
        route={appRoutes['designer-design']}
        currentUser={{ id: 'u-1', name: '测试用户', email: 'test@example.com', createdAt: Date.now() }}
        currentProjectName="测试线束项目"
        saveBlocked={false}
        canUndo={false}
        canRedo={false}
        onNavigate={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onOpenAuth={vi.fn()}
        onCloseProject={vi.fn()}
      >
        <div>工作区内容</div>
      </AdminShell>,
    );

    expect(html).toContain('aria-label="视图切换"');
    expect(html).toContain('title="设计图"');
    expect(html).toContain('title="成品图"');
    expect(html).toContain('设计图');
    expect(html).toContain('成品图');
    expect(html).toContain('value="测试线束项目"');

    // Verify toggle appears before project name in the HTML
    const toggleIndex = html.indexOf('aria-label="视图切换"');
    const projectNameIndex = html.indexOf('value="测试线束项目"');
    expect(toggleIndex).toBeGreaterThan(-1);
    expect(projectNameIndex).toBeGreaterThan(-1);
    expect(toggleIndex).toBeLessThan(projectNameIndex);
  });

  it('marks design drawing button as active when on designer-design route', () => {
    const html = renderToStaticMarkup(
      <AdminShell
        route={appRoutes['designer-design']}
        currentUser={null}
        currentProjectName="项目A"
        saveBlocked={false}
        canUndo={false}
        canRedo={false}
        onNavigate={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onOpenAuth={vi.fn()}
        onCloseProject={vi.fn()}
      >
        <div>工作区</div>
      </AdminShell>,
    );

    expect(html).toMatch(/title="设计图"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/title="成品图"[^>]*aria-pressed="false"/);
  });

  it('marks product image button as active when on designer-product-image route', () => {
    const html = renderToStaticMarkup(
      <AdminShell
        route={appRoutes['designer-product-image']}
        currentUser={null}
        currentProjectName="项目B"
        saveBlocked={false}
        canUndo={false}
        canRedo={false}
        onNavigate={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onOpenAuth={vi.fn()}
        onCloseProject={vi.fn()}
      >
        <div>工作区</div>
      </AdminShell>,
    );

    expect(html).toMatch(/title="成品图"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/title="设计图"[^>]*aria-pressed="false"/);
  });

  it('does not render toggle buttons, BOM, quote, or project name when currentProjectName is undefined', () => {
    const html = renderToStaticMarkup(
      <AdminShell
        route={appRoutes.home}
        currentUser={null}
        saveBlocked={false}
        canUndo={false}
        canRedo={false}
        onNavigate={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onOpenAuth={vi.fn()}
        onCloseProject={vi.fn()}
        onOpenBom={vi.fn()}
        onOpenQuote={vi.fn()}
      >
        <div>首页</div>
      </AdminShell>,
    );

    expect(html).not.toContain('aria-label="视图切换"');
    expect(html).not.toContain('项目名称');
    expect(html).not.toContain('BOM清单');
    expect(html).not.toContain('线束报价');
  });

  it('does not render BOM, quote, view toggle, or project name on non-designer sidebar tabs even if project exists', () => {
    const nonDesignerRoutes = [
      appRoutes.home,
      appRoutes['drawing-workbench'],
      appRoutes.materials,
    ];

    for (const route of nonDesignerRoutes) {
      const html = renderToStaticMarkup(
        <AdminShell
          route={route}
          currentUser={null}
          currentProjectName="test"
          saveBlocked={false}
          canUndo={false}
          canRedo={false}
          onNavigate={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          onOpenAuth={vi.fn()}
          onCloseProject={vi.fn()}
          onOpenBom={vi.fn()}
          onOpenQuote={vi.fn()}
        >
          <div>内容</div>
        </AdminShell>,
      );

      expect(html).not.toContain('aria-label="视图切换"');
      expect(html).not.toContain('BOM清单');
      expect(html).not.toContain('线束报价');
      expect(html).not.toContain('value="test"');
      // context subtitle should also not leak the project name on other sidebar tabs
      expect(html).not.toMatch(/<p class="hidden text-xs text-slate-500 sm:block">\s*test\s*<\/p>/);
    }
  });

  it('renders BOM, quote, view toggle, and project name in designer header when project exists', () => {
    const html = renderToStaticMarkup(
      <AdminShell
        route={appRoutes['designer-design']}
        currentUser={null}
        currentProjectName="test"
        saveBlocked={false}
        canUndo={false}
        canRedo={false}
        onNavigate={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onOpenAuth={vi.fn()}
        onCloseProject={vi.fn()}
        onOpenBom={vi.fn()}
        onOpenQuote={vi.fn()}
      >
        <div>线束设计器内容</div>
      </AdminShell>,
    );

    expect(html).toContain('aria-label="视图切换"');
    expect(html).toContain('BOM清单');
    expect(html).toContain('线束报价');
    expect(html).toContain('value="test"');
    expect(html).toContain('设计图');
    expect(html).toContain('成品图');
  });

  it('prevents narrow viewport header regression by hiding project name on small screens and protecting title and action buttons', () => {
    const html = renderToStaticMarkup(
      <AdminShell
        route={appRoutes['designer-design']}
        currentUser={{ id: 'u-1', name: '测试用户', email: 'test@example.com', createdAt: Date.now() }}
        currentProjectName="超长测试线束项目名称用于测试极端排版"
        saveBlocked={false}
        canUndo={true}
        canRedo={true}
        onNavigate={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onOpenAuth={vi.fn()}
        onCloseProject={vi.fn()}
      >
        <div>工作区</div>
      </AdminShell>,
    );

    // 1. Project name editor has `hidden sm:flex` to avoid taking 180px+ on small viewports (e.g. 375px)
    expect(html).toMatch(/class="[^"]*hidden\s+sm:flex[^"]*"[^>]*>[^<]*<span[^>]*>项目名称<\/span>/);

    // 2. Title container and undo/redo action container have shrink-0 so they never collapse to 0px/1px
    expect(html).toMatch(/class="[^"]*min-w-0\s+shrink-0[^"]*"[^>]*>[^<]*<p[^>]*>设计图<\/p>/);
    expect(html).toMatch(/class="[^"]*flex\s+shrink-0\s+items-center[^"]*"[^>]*>[^<]*<span[^>]*>[^<]*<button[^>]*title="撤销/);

    // 3. Toggle button text labels have `hidden sm:inline` so buttons collapse to icon-only on mobile
    expect(html).toMatch(/<span\s+class="hidden\s+sm:inline">设计图<\/span>/);
    expect(html).toMatch(/<span\s+class="hidden\s+sm:inline">成品图<\/span>/);
  });
});

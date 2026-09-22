import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AdminShell } from '@/components/layout/AdminShell';
import { appRoutes } from '@/lib/appRoute';

function renderShell(currentUser: null | { id: string; name: string; email: string; createdAt: number }) {
  return renderToStaticMarkup(
    <AdminShell
      route={appRoutes.home}
      currentUser={currentUser}
      saveBlocked={false}
      canUndo={false}
      canRedo={false}
      onNavigate={vi.fn()}
      onUndo={vi.fn()}
      onRedo={vi.fn()}
      onOpenAuth={vi.fn()}
      onCloseProject={vi.fn()}
    >
      <div>内容</div>
    </AdminShell>,
  );
}

describe('AdminShell access menu', () => {
  it('hides designer and materials menus for anonymous visitors', () => {
    const html = renderShell(null);

    expect(html).not.toContain('设计图');
    expect(html).not.toContain('物料库');
    expect(html).toContain('制作图纸');
    expect(html).toContain('首页');
  });

  it('shows the full menu for signed-in users', () => {
    const html = renderShell({
      id: 'u-1',
      name: '测试用户',
      email: 'test@example.com',
      createdAt: 1,
    });

    expect(html).toContain('设计图');
    expect(html).toContain('物料库');
    expect(html).toContain('制作图纸');
  });
});

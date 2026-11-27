import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AdminShell } from '@/components/layout/AdminShell';
import { appRoutes } from '@/lib/appRoute';
import type { User } from '@/types/user';

function renderShell(currentUser: User | null, route = appRoutes['designer-projects']) {
  return renderToStaticMarkup(
    <AdminShell
      route={route}
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
    expect(html).not.toContain('自动报价');
    expect(html).toContain('制作图纸');
    expect(html).toContain('title="询价"');
    expect(html).not.toContain('title="询价管理"');
    expect(html).toContain('3D 模型');
    expect(html).not.toContain('aria-label="线束设计器"');
    expect(html).not.toContain('首页');
  });

  it.each(['engineer', 'admin'] as const)('shows the project list first for %s, with no editor items before opening a project', (role) => {
    const html = renderShell({
      id: 'u-1',
      name: '测试用户',
      email: 'test@example.com',
      createdAt: 1,
      role,
    });

    expect(html).toMatch(/<nav[^>]*>.*?<button[^>]*aria-current="page"[^>]*aria-label="线束设计器"/);
    expect(html).not.toContain('title="设计图"');
    expect(html).not.toContain('title="成品图"');
    expect(html).not.toContain('首页');
    expect(html).toContain('物料库');
    expect(html).toContain('自动报价');
    expect(html).not.toContain('自动报价2');
    expect(html).not.toContain('自动报价3');
    expect(html).not.toContain('自动报价4');
    expect(html).not.toContain('自动报价5');
    expect(html).toContain('制作图纸');
    expect(html).toContain('aria-label="收缩侧边栏"');
    expect(html).not.toContain('title="询价管理"');
  });
  it('shows sales the quote routes, without giving unresolved roles the staff menu', () => {
    for (const role of ['sales', undefined] as const) {
      const html = renderShell({ id: 'sales', name: '业务员', email: 'sales@test', createdAt: 1, role });
      expect(html).toContain('title="自动报价"');
      expect(html).toContain('title="询价"');
      expect(html).not.toContain('title="询价管理"');
      for (const title of ['首页','制作图纸','DWG 图纸','3D 模型','物料库','设计图','成品图']) {
        expect(html).not.toContain(`title="${title}"`);
      }
      expect(html).not.toContain('aria-label="线束设计器"');
    }
  });
});

it.each(['request-quote', 'quote-requests'] as const)('highlights one sidebar item and identifies the current quote view on %s', (id) => {
  const html = renderShell({ id: 's', name: '销售', email: 'sales@example.invalid', createdAt: 1, role: 'sales' }, appRoutes[id]);
  const nav = html.match(/<nav[^>]*>.*?<\/nav>/)?.[0];
  expect(nav).toMatch(/aria-current="page"[^>]*aria-label="询价"/);
  expect(nav).not.toMatch(/title="(提交询价|询价管理)"/);
  expect(html).toContain('aria-label="询价切换"');
  expect(html).toContain(`title="${appRoutes[id].title}" aria-pressed="true"`);
  expect(html).toContain(`title="${appRoutes[id === 'request-quote' ? 'quote-requests' : 'request-quote'].title}" aria-pressed="false"`);
});

it('allows visitors to submit without showing staff view controls', () => {
  const html = renderShell(null, appRoutes['request-quote']);
  expect(html).toContain('aria-label="询价"');
  expect(html).not.toContain('aria-label="询价切换"');
  expect(html).not.toContain('title="询价管理"');
});

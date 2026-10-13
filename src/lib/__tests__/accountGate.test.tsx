import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccountGate } from '@/components/auth/AccountGate';
import { useUserStore } from '@/stores/userStore';

vi.mock('@/stores/userStore', async () => {
  const actual = await vi.importActual<typeof import('@/stores/userStore')>('@/stores/userStore');
  const store = actual.useUserStore;
  return { useUserStore: Object.assign((selector: (state: ReturnType<typeof store.getState>) => unknown) => selector(store.getState()), store) };
});

afterEach(() => useUserStore.setState({ currentUser: null, authReady: false }));

it('does not mount business pages until a required password change completes', () => {
  useUserStore.setState({ authReady: true, currentUser: { id: 'new', email: 'new@test', name: '新用户', createdAt: 1, mustChangePassword: true } });
  const html = renderToStaticMarkup(<AccountGate><div>业务功能</div></AccountGate>);
  expect(html).toContain('首次登录，请修改密码');
  expect(html).not.toContain('<div>业务功能</div>');
  expect(html).toContain('退出登录');
});

it('opens business pages for existing accounts without the flag', () => {
  useUserStore.setState({ authReady: true, currentUser: { id: 'existing', email: 'old@test', name: '老用户', createdAt: 1, role: 'sales' } });
  expect(renderToStaticMarkup(<AccountGate><div>业务功能</div></AccountGate>)).toBe('<div>业务功能</div>');
});

it('blocks business pages when a restored session has not passed the server password check', () => {
  useUserStore.setState({ authReady: true, currentUser: { id: 'old', email: 'old@test', name: '旧账号', createdAt: 1 } });
  expect(renderToStaticMarkup(<AccountGate><div>业务功能</div></AccountGate>)).not.toContain('业务功能');
});

it('does not mount business pages while authentication is unresolved', () => {
  useUserStore.setState({ authReady: false });
  expect(renderToStaticMarkup(<AccountGate><div>业务功能</div></AccountGate>)).not.toContain('业务功能');
});

it('keeps an already checked workspace mounted during transient permission refresh failures', () => {
  useUserStore.setState({ authReady: true, currentUser: { id: 'old', email: 'old@test', name: '旧账号', createdAt: 1, passwordCheckComplete: true } });
  expect(renderToStaticMarkup(<AccountGate><div>业务功能</div></AccountGate>)).toContain('业务功能');
});

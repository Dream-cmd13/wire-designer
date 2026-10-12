import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callback: null as null | ((event: string, session: unknown) => void),
  rpc: vi.fn(),
}));
vi.mock('@/lib/supabaseClient', () => ({ supabase: {
  rpc: mocks.rpc,
  auth: {
    onAuthStateChange: (callback: typeof mocks.callback) => {
      mocks.callback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
    getSession: () => new Promise(() => {}),
  },
} }));
import { useUserStore } from '@/stores/userStore';

let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  mocks.rpc.mockReset();
  useUserStore.setState({ currentUser: { id: 'engineer', name: '工程师', email: 'e@test', role: 'engineer', createdAt: 1 } });
  cleanup = useUserStore.getState().initialize();
});
afterEach(() => { cleanup?.(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('keeps the known role during token refresh, then applies a server downgrade', async () => {
  mocks.rpc.mockResolvedValue({ data: 'sales', error: null });
  mocks.callback?.('TOKEN_REFRESHED', { user: { id: 'engineer', email: 'e@test', user_metadata: {}, created_at: '2026-01-01' } });
  expect(useUserStore.getState().currentUser?.role).toBe('engineer');
  await vi.advanceTimersByTimeAsync(0);
  expect(useUserStore.getState().currentUser?.role).toBe('sales');
});

it('does not transfer the previous account role to a different user', () => {
  mocks.callback?.('SIGNED_IN', { user: { id: 'other', email: 'other@test', user_metadata: {}, created_at: '2026-01-01' } });
  expect(useUserStore.getState().currentUser?.role).toBeUndefined();
});

it('fails closed when the server cannot confirm the role', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: new Error('offline') });
  await useUserStore.getState().refreshRole();
  expect(useUserStore.getState().currentUser?.role).toBeUndefined();
});

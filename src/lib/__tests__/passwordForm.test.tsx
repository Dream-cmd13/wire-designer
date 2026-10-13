import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ values: [] as unknown[], submit: vi.fn(), signIn: vi.fn(), notify: vi.fn() }));
vi.mock('react', async () => ({ ...await vi.importActual('react'), useState: () => [mocks.values.shift(), vi.fn()] }));
vi.mock('@/lib/accountPassword', () => ({ submitPasswordOperation: mocks.submit }));
vi.mock('@/stores/noticeStore', () => ({ notify: mocks.notify }));
vi.mock('@/stores/userStore', () => {
  const state = { currentUser: { id: 'account', email: 'account@test' }, signIn: mocks.signIn };
  return { useUserStore: Object.assign((selector: (value: typeof state) => unknown) => selector(state), { getState: () => state }) };
});
import { PasswordForm } from '@/components/auth/PasswordForm';

beforeEach(() => { vi.clearAllMocks(); mocks.signIn.mockResolvedValue(undefined); mocks.submit.mockResolvedValue(undefined); mocks.values = ['old-password', 'new-password', 'new-password', false, '']; });

it('closes the account dialog and emits a toast after changing password and signing in', async () => {
  const onDone = vi.fn();
  const form = PasswordForm({ onDone });
  await form.props.onSubmit({ preventDefault() {} });
  // The JSX event wrapper dispatches asynchronously.
  await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  expect(mocks.notify).toHaveBeenCalledWith({ message: '密码已修改。后续登录请使用新密码。', tone: 'success' });
  expect(mocks.signIn).toHaveBeenCalledWith('account@test', 'new-password');
});

it('keeps the dialog open and emits no success toast when the password update fails', async () => {
  mocks.submit.mockRejectedValue(new Error('offline'));
  const onDone = vi.fn();
  const form = PasswordForm({ onDone });
  form.props.onSubmit({ preventDefault() {} });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(onDone).not.toHaveBeenCalled();
  expect(mocks.notify).not.toHaveBeenCalled();
});

it('reports that the password changed even when establishing the new session fails', async () => {
  mocks.signIn.mockRejectedValue(new Error('offline'));
  const onDone = vi.fn();
  PasswordForm({ onDone }).props.onSubmit({ preventDefault() {} });
  await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ tone: 'danger', message: expect.stringContaining('密码已修改') }));
});

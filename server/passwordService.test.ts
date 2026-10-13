import { describe, expect, it, vi } from 'vitest';
import { changePassword, resetPassword, type PasswordService } from '../supabase/functions/_shared/passwordService';

const actor = { id: 'actor-id', email: 'actor@test', app_metadata: { must_change_password: true } };

function dependencies(): PasswordService {
  return {
    getUser: vi.fn().mockResolvedValue(actor),
    verifyPassword: vi.fn().mockResolvedValue(false),
    getRole: vi.fn().mockResolvedValue('sales'),
    updateUser: vi.fn().mockResolvedValue(undefined),
  };
}

describe('password operations', () => {
  it('rejects an incorrect current password without changing the account', async () => {
    const service = dependencies();
    await expect(changePassword(service, 'token', 'wrong', 'strong-new-password')).rejects.toThrow('原密码不正确');
    expect(service.updateUser).not.toHaveBeenCalled();
  });

  it('changes the current password and removes the forced-change flag', async () => {
    const service = dependencies();
    vi.mocked(service.verifyPassword).mockResolvedValue(true);
    await changePassword(service, 'token', '888888', 'strong-new-password');
    expect(service.updateUser).toHaveBeenCalledWith('actor-id', 'strong-new-password', false, 0);
  });

  it('rejects the initial password as a new password', async () => {
    const service = dependencies();
    await expect(changePassword(service, 'token', 'old-pass', '888888')).rejects.toThrow();
    expect(service.updateUser).not.toHaveBeenCalled();
  });

  it('rejects non-admin reset attempts', async () => {
    const service = dependencies();
    await expect(resetPassword(service, 'token', 'target-id')).rejects.toThrow('没有权限');
    expect(service.updateUser).not.toHaveBeenCalled();
  });

  it('resets another account and forces its next password change', async () => {
    const service = dependencies();
    vi.mocked(service.getUser).mockResolvedValue({ ...actor, app_metadata: {} });
    vi.mocked(service.getRole).mockResolvedValue('admin');
    await resetPassword(service, 'token', 'target-id');
    expect(service.updateUser).toHaveBeenCalledWith('target-id', '888888', true);
  });

  it('does not allow an administrator to reset their own password', async () => {
    const service = dependencies();
    vi.mocked(service.getUser).mockResolvedValue({ ...actor, app_metadata: {} });
    vi.mocked(service.getRole).mockResolvedValue('admin');
    await expect(resetPassword(service, 'token', 'actor-id')).rejects.toThrow();
    expect(service.updateUser).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated change', async () => {
    const service = dependencies();
    vi.mocked(service.getUser).mockResolvedValue(null);
    await expect(changePassword(service, 'expired', '888888', 'strong-new-password')).rejects.toThrow('登录已失效');
    expect(service.updateUser).not.toHaveBeenCalled();
  });

  it('does not let a forced-change administrator reset someone else', async () => {
    const service = dependencies();
    vi.mocked(service.getRole).mockResolvedValue('admin');
    await expect(resetPassword(service, 'token', 'target-id')).rejects.toThrow('没有权限');
    expect(service.updateUser).not.toHaveBeenCalled();
  });

  it('rejects a new password equal to the old password', async () => {
    const service = dependencies();
    await expect(changePassword(service, 'token', 'unchanged-password', 'unchanged-password')).rejects.toThrow();
    expect(service.updateUser).not.toHaveBeenCalled();
  });

  it('does not report success if Auth refuses the password update', async () => {
    const service = dependencies();
    vi.mocked(service.verifyPassword).mockResolvedValue(true);
    vi.mocked(service.updateUser).mockRejectedValue(new Error('Auth unavailable'));
    await expect(changePassword(service, 'token', '888888', 'strong-new-password')).rejects.toThrow('Auth unavailable');
  });
});

export interface PasswordService {
  getUser(token: string): Promise<{ id: string; email?: string; app_metadata: Record<string, unknown> } | null>;
  verifyPassword(email: string, password: string, userId: string): Promise<boolean>;
  getRole(userId: string): Promise<string | null>;
  updateUser(userId: string, password: string, mustChangePassword: boolean, expectedVersion?: number): Promise<void>;
}

export class PasswordError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

async function authenticated(service: PasswordService, token: string) {
  const user = await service.getUser(token);
  if (!user?.email) throw new PasswordError('登录已失效，请重新登录。', 401);
  return user;
}

export async function changePassword(service: PasswordService, token: string, currentPassword: unknown, newPassword: unknown) {
  const user = await authenticated(service, token);
  if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 128
    || typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128
    || newPassword.trim().length < 8 || newPassword === currentPassword || newPassword === '888888') {
    throw new PasswordError('新密码须为 8–128 位，不能与原密码或初始密码相同。');
  }
  if (!await service.verifyPassword(user.email!, currentPassword, user.id)) {
    throw new PasswordError('原密码不正确，请重新输入。');
  }
  await service.updateUser(user.id, newPassword, false, Number(user.app_metadata.password_version ?? 0));
}

export async function resetPassword(service: PasswordService, token: string, targetUserId: unknown) {
  const user = await authenticated(service, token);
  if (user.app_metadata.must_change_password === true || await service.getRole(user.id) !== 'admin') {
    throw new PasswordError('没有权限重置密码。', 403);
  }
  if (typeof targetUserId !== 'string' || !targetUserId || targetUserId === user.id) {
    throw new PasswordError('请选择其他账号；自己的密码请使用修改密码。');
  }
  await service.updateUser(targetUserId, '888888', true);
}

import { supabase } from './supabaseClient';
import { UserFacingError } from './userErrorMessage';

export async function submitPasswordOperation(body: { action: 'change'; currentPassword: string; newPassword: string } | { action: 'reset'; targetUserId: string }) {
  if (!supabase) throw new UserFacingError('登录服务尚未配置。');
  const { data, error } = await supabase.functions.invoke('account-password', { body });
  if (error) {
    let message = '密码操作失败，请稍后重试。';
    if (error.context instanceof Response) {
      const details = await error.context.json().catch(() => null);
      if (typeof details?.error === 'string') message = details.error;
    }
    throw new UserFacingError(message);
  }
  if (data?.success !== true) throw new UserFacingError('密码操作未完成，请重试。');
}

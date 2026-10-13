import { useEffect, type ReactNode } from 'react';
import { useUserStore } from '@/stores/userStore';
import { PasswordRequiredScreen } from './PasswordRequiredScreen';

export function AccountGate({ children }: { children: ReactNode }) {
  const user = useUserStore(state => state.currentUser);
  const ready = useUserStore(state => state.authReady);
  const initialize = useUserStore(state => state.initialize);
  useEffect(() => initialize(), [initialize]);
  if (!ready) return <div role="status" className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">正在检查登录状态…</div>;
  if (user?.mustChangePassword) return <PasswordRequiredScreen key={user.id} />;
  if (user && !user.role && !user.passwordCheckComplete) return <div role="status" className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-100 text-sm text-slate-500">
    <p>正在确认账号权限，请稍候；网络异常时可重试。</p>
    <button type="button" className="rounded border border-slate-300 px-4 py-2" onClick={() => void useUserStore.getState().refreshRole()}>重新检查</button>
  </div>;
  return children;
}

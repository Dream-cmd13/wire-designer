import { useState } from 'react';
import { LogIn, LogOut, X } from 'lucide-react';
import { useUserStore } from '@/stores/userStore';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBeforeSignOut?: () => Promise<boolean>;
}

export function AuthModal({ isOpen, onClose, onBeforeSignOut }: AuthModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { currentUser, signIn, signOut } = useUserStore();

  if (!isOpen) return null;

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await signIn(email.trim(), password);
      onClose();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : '登录失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setError('');
    setSubmitting(true);

    try {
      if (onBeforeSignOut && !(await onBeforeSignOut())) return;
      await signOut();
      onClose();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : '退出登录失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
      <section
        className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 id="auth-dialog-title" className="text-lg font-semibold text-slate-800">
            {currentUser ? '账户' : '登录'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {currentUser ? (
            <div className="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white">
                {currentUser.name[0]}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{currentUser.name}</p>
                <p className="truncate text-xs text-slate-500">{currentUser.email}</p>
              </div>
            </div>
          ) : (
            <>
              <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
                请使用由管理员创建的 Supabase 账号登录。
              </p>
              <form className="space-y-4" onSubmit={(event) => void handleLogin(event)}>
                <div>
                  <label htmlFor="auth-email" className="mb-1 block text-sm font-medium text-slate-700">邮箱</label>
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="name@example.com"
                    required
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label htmlFor="auth-password" className="mb-1 block text-sm font-medium text-slate-700">密码</label>
                  <input
                    id="auth-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    required
                    disabled={submitting}
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <LogIn className="h-4 w-4" />
                  {submitting ? '登录中…' : '登录'}
                </button>
              </form>
            </>
          )}

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        {currentUser && (
          <footer className="border-t border-slate-100 px-5 py-4">
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={submitting}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              {submitting ? '退出中…' : '退出登录'}
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}

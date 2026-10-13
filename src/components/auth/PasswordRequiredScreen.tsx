import { useState } from 'react';
import { PasswordForm } from './PasswordForm';
import { useUserStore } from '@/stores/userStore';
import { getUserErrorMessage } from '@/lib/userErrorMessage';

export function PasswordRequiredScreen() {
  const user = useUserStore(s => s.currentUser);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
    <section className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-lg">
      <p className="break-all text-sm text-slate-500">{user?.email}</p>
      <PasswordForm required />
      <button type="button" disabled={busy} className="w-full text-sm text-slate-600" onClick={() => {
        setBusy(true); setError('');
        void useUserStore.getState().signOut().catch(cause => setError(getUserErrorMessage(cause))).finally(() => setBusy(false));
      }}>退出登录</button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </section>
  </main>;
}

import { useState } from 'react';
import { submitPasswordOperation } from '@/lib/accountPassword';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import { useUserStore } from '@/stores/userStore';
import { notify } from '@/stores/noticeStore';

export function PasswordForm({ required = false, onDone }: { required?: boolean; onDone?: () => void }) {
  const email = useUserStore(state => state.currentUser?.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmation) { setError('两次输入的新密码不一致。'); return; }
    if (newPassword.trim().length < 8 || newPassword.length > 128 || newPassword === currentPassword || newPassword === '888888') {
      setError('新密码须为 8–128 位，不能与原密码或初始密码相同。'); return;
    }
    setBusy(true);
    try {
      const user = useUserStore.getState().currentUser;
      if (!user) throw new Error('Session missing');
      await submitPasswordOperation({ action: 'change', currentPassword, newPassword });
      setCurrentPassword(''); setNewPassword(''); setConfirmation('');
      // Auth Admin password changes revoke refresh tokens. Establish a fresh session.
      if (useUserStore.getState().currentUser?.id !== user.id) return;
      try {
        await useUserStore.getState().signIn(user.email, newPassword);
      } catch {
        notify({ message: '密码已修改，但重新登录失败。请退出后使用新密码登录。', tone: 'danger' });
        onDone?.();
        return;
      }
      notify({ message: '密码已修改。后续登录请使用新密码。', tone: 'success' });
      onDone?.();
    } catch (cause) { setError(getUserErrorMessage(cause, '修改密码失败，请重试。')); }
    finally { setBusy(false); }
  };
  return <form className="space-y-3" onSubmit={event => void submit(event)}>
    <input type="text" name="username" autoComplete="username" value={email} readOnly className="sr-only" tabIndex={-1} aria-hidden="true" />
    <h3 className="font-semibold text-slate-800">{required ? '首次登录，请修改密码' : '修改密码'}</h3>
    <p className="text-xs leading-5 text-slate-500">{required ? '账号使用初始密码或已被重置。完成修改后才能使用系统。' : '请输入原密码确认身份。'}新密码须为 8–128 位。</p>
    {[
      { id: 'current', label: '原密码', value: currentPassword, change: setCurrentPassword, complete: 'current-password' },
      { id: 'new', label: '新密码', value: newPassword, change: setNewPassword, complete: 'new-password' },
      { id: 'confirm', label: '确认新密码', value: confirmation, change: setConfirmation, complete: 'new-password' },
    ].map(field => <label key={field.id} className="block text-sm text-slate-700" htmlFor={`password-${field.id}`}>
      {field.label}
      <input id={`password-${field.id}`} type="password" autoComplete={field.complete} required maxLength={128}
        minLength={field.id === 'current' ? 1 : 8} value={field.value} disabled={busy}
        onChange={event => field.change(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
    </label>)}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <button type="submit" disabled={busy} className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? '正在修改…' : '确认修改密码'}</button>
  </form>;
}

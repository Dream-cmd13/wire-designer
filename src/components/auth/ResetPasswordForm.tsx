import { useState } from 'react';
import { submitPasswordOperation } from '@/lib/accountPassword';
import { supabase } from '@/lib/supabaseClient';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import { useUserStore } from '@/stores/userStore';

export function ResetPasswordForm() {
  const user = useUserStore(s => s.currentUser);
  const [users, setUsers] = useState<{ user_id: string; email: string }[]>([]);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  if (user?.role !== 'admin') return null;
  const load = async () => {
    setBusy(true); setError('');
    try {
      if (!supabase) throw new Error('unconfigured');
      const { data, error: cause } = await supabase.rpc('list_app_users');
      if (cause) throw cause;
      setUsers(data.filter((row: { user_id: string }) => row.user_id !== user.id)); setLoaded(true);
    } catch (cause) { setError(getUserErrorMessage(cause, '账号列表加载失败，请重试。')); }
    finally { setBusy(false); }
  };
  const reset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!target || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await submitPasswordOperation({ action: 'reset', targetUserId: target });
      setMessage(`已重置 ${users.find(row => row.user_id === target)?.email ?? '所选账号'} 的密码为 888888，下次登录必须修改密码。`);
      setTarget('');
    } catch (cause) { setError(getUserErrorMessage(cause, '重置失败，请重试。')); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 border-t border-slate-200 pt-4">
    <h3 className="font-semibold text-slate-800">管理员重置密码</h3>
    {!loaded ? <button type="button" disabled={busy} onClick={() => void load()} className="text-sm text-blue-600">{busy ? '加载中…' : '加载账号列表'}</button> : <form onSubmit={event => void reset(event)} className="space-y-3">
      <label className="block text-sm">目标账号
        <select required value={target} disabled={busy} onChange={event => { setTarget(event.target.value); setMessage(''); }} className="mt-1 w-full rounded border border-slate-300 p-2">
          <option value="">请选择账号</option>
          {users.map(row => <option key={row.user_id} value={row.user_id}>{row.email}</option>)}
        </select>
      </label>
      <p className="text-xs leading-5 text-slate-500">确认后原密码失效，新密码为 888888。该账号须修改密码后才能使用系统。</p>
      <button disabled={busy || !target} className="w-full rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 disabled:opacity-50">{busy ? '重置中…' : '确认重置为 888888'}</button>
    </form>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
  </section>;
}

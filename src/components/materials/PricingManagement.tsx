import { useEffect, useState } from 'react';
import { RefreshCw, Save, Users, Settings, Upload, Download } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useUserStore } from '@/stores/userStore';
import { canManageUsers, canViewPricing, type AppRole } from '@/lib/permissions';
import type { PricingSettings } from '@/types/pricingSettings';
import { parsePricingSettingsImport, validatePricingSettings } from '@/lib/pricingSettingsImport';
import { FINISHING_LABOR_NAMES, FINISHING_LENGTHS_MM } from '@/lib/finishingLaborRates';

interface RoleRow { user_id: string; email: string; role: AppRole }
const labels: Record<string, string> = {
  materialLossRate: '材料损耗率', processingLossRate: '加工损耗率', marginRate: '目标毛利率', freightRate: '运费率',
};

export function PricingManagement() {
  const role = useUserStore(s => s.currentUser?.role);
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<PricingSettings | null>(null);
  const [users, setUsers] = useState<RoleRow[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const allowed = canViewPricing(role);
  useEffect(() => {
    if (!open || !allowed || !supabase) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase!.from('pricing_settings').select('version,settings').eq('id', 1).single();
      if (error) throw error;
      if (!validatePricingSettings(data.settings)) throw new Error('定价参数格式无效');
      if (!cancelled) setSettings({ ...data.settings, version: data.version });
      if (canManageUsers(role)) {
        const result = await supabase!.rpc('list_app_users');
        if (result.error) throw result.error;
        if (!cancelled) setUsers(result.data);
      }
    })().catch(() => { if (!cancelled) setMessage('配置加载失败，请刷新重试。'); });
    return () => { cancelled = true; };
  }, [open, allowed, role, refresh]);
  if (!allowed) return null;
  const save = async () => {
    if (!settings || !supabase) return;
    setBusy(true); setMessage('');
    const { version, ...values } = settings;
    try {
      if (!validatePricingSettings(values)) throw new Error('参数无效');
      const { error } = await supabase.rpc('save_pricing_settings', { expected_version: version, new_settings: values });
      if (error) throw error;
      setMessage('参数已保存，新报价使用新版本。');
      setRefresh(n => n + 1);
    } catch { setMessage('保存失败，参数无效或版本已变化，请刷新后重试。'); }
    finally { setBusy(false); }
  };
  const assign = async (user: RoleRow, nextRole: AppRole) => {
    if (!supabase || !canManageUsers(role)) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('assign_user_role', { target_user: user.user_id, new_role: nextRole });
      if (error) throw error;
      setMessage('角色已更新。'); setRefresh(n => n + 1);
    } catch { setMessage('角色更新失败，不能修改自己的角色。'); }
    finally { setBusy(false); }
  };
  return <section className="border-b border-slate-200 bg-white p-4">
    <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 text-sm font-medium"><Settings size={16} />定价参数{canManageUsers(role) ? '与用户权限' : ''}</button>
    {open && <div className="mt-3 space-y-3">
      <button title="刷新配置" aria-label="刷新配置" onClick={() => { setSettings(null); setRefresh(n => n + 1); }} disabled={busy}><RefreshCw size={16} /></button>
      {settings && <>
        <div className="flex gap-4 text-sm text-blue-700">
          <label className="flex cursor-pointer items-center gap-2"><Upload size={16} />导入参数
            <input type="file" accept=".json,application/json" className="sr-only" disabled={busy} onChange={e => {
              const file = e.target.files?.[0]; e.target.value = '';
              if (!file) return;
              if (file.size > 100000) { setMessage('参数文件过大。'); return; }
              void file.text().then(text => { setSettings(parsePricingSettingsImport(text, settings)); setMessage('参数已导入，待保存。'); })
                .catch(() => setMessage('导入失败，参数字段、范围或精度无效。'));
            }} />
          </label>
          <button className="flex items-center gap-2" onClick={() => {
            const url = URL.createObjectURL(new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' }));
            const link = document.createElement('a'); link.href = url; link.download = 'pricing-settings.json'; link.click(); URL.revokeObjectURL(url);
          }}><Download size={16} />导出参数</button>
        </div>
        <p className="text-xs text-slate-500">版本 {settings.version}</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.entries(labels).map(([key, label]) => <label key={key} className="text-xs">{label}
            <input className="mt-1 block w-full rounded border p-1.5" type="number" min="0" max="0.999999" step="0.000001"
              value={settings[key as keyof PricingSettings] as string}
              onChange={e => setSettings({ ...settings, [key]: e.target.value })} />
          </label>)}
          {Object.entries(settings.laborRates).map(([name, rate]) => <label key={name} className="text-xs">{name}单价
            <input className="mt-1 block w-full rounded border p-1.5" type="number" min="0" step="0.000001" value={rate}
              onChange={e => setSettings({ ...settings, laborRates: { ...settings.laborRates, [name]: e.target.value } })} />
          </label>)}
        </div>
        <p className="text-xs text-slate-500">电测、外观、包装人工按以下线长档位计费（元/条），修改后保存生效。非整档长度向上匹配，超过 5 米需人工核价。</p>
        <table className="w-full text-left text-xs">
          <thead><tr><th>线长上限</th>{FINISHING_LABOR_NAMES.map(name => <th key={name}>{name}</th>)}</tr></thead>
          <tbody>{FINISHING_LENGTHS_MM.map(length => <tr key={length}>
            <td>{length / 1000} 米</td>{FINISHING_LABOR_NAMES.map(name => <td key={name}>
              <input aria-label={`${length / 1000}米${name}单价`} className="my-1 w-full rounded border p-1.5" type="number"
                min="0" max="999999999.999999" step="0.000001" disabled={busy} value={settings.finishingLaborRates[length][name]}
                onChange={e => setSettings({ ...settings, finishingLaborRates: {
                  ...settings.finishingLaborRates, [length]: { ...settings.finishingLaborRates[length], [name]: e.target.value },
                } })} />
            </td>)}
          </tr>)}</tbody>
        </table>
        <button onClick={() => void save()} disabled={busy} className="flex items-center gap-2 text-sm text-blue-700"><Save size={16} />保存参数</button>
      </>}
      {canManageUsers(role) && <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm"><Users size={16} />用户角色</p>
        {users.map(user => <label className="flex flex-wrap items-center justify-between gap-2 text-sm" key={user.user_id}>{user.email}
          <select value={user.role} disabled={busy || user.user_id === useUserStore.getState().currentUser?.id}
            onChange={e => void assign(user, e.target.value as AppRole)} aria-label={user.email + '角色'} className="rounded border p-1">
            <option value="sales">业务员</option><option value="engineer">工程师</option><option value="admin">管理员</option>
          </select>
        </label>)}
      </div>}
      {message && <p role="status" className="text-sm">{message}</p>}
    </div>}
  </section>;
}

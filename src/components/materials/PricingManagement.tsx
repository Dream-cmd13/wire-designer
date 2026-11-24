import { useEffect, useState } from 'react';
import { RefreshCw, Save, Users, Settings, Upload, Download, X, Loader2, SlidersHorizontal, Wrench, Ruler } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useUserStore } from '@/stores/userStore';
import { canManageUsers, canViewPricing, type AppRole } from '@/lib/permissions';
import type { PricingSettings } from '@/types/pricingSettings';
import { parsePricingSettingsImport, validatePricingSettings } from '@/lib/pricingSettingsImport';
import { FINISHING_LABOR_NAMES, FINISHING_LENGTHS_MM } from '@/lib/finishingLaborRates';
import { PageHeaderActions } from '@/components/layout/PageHeaderActions';

interface RoleRow { user_id: string; email: string; role: AppRole }
const labels: Record<string, string> = {
  materialLossRate: '材料损耗率', processingLossRate: '加工损耗率', marginRate: '目标毛利率', freightRate: '运费率',
};

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium tabular-nums text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';

export function PricingManagement() {
  const currentUser = useUserStore(s => s.currentUser);
  const role = currentUser?.role;
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<PricingSettings | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [users, setUsers] = useState<RoleRow[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const allowed = canViewPricing(role);
  const managesUsers = canManageUsers(role);

  useEffect(() => {
    if (!open || !allowed || !supabase) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase!.from('pricing_settings').select('version,settings').eq('id', 1).single();
      if (error) throw error;
      if (!validatePricingSettings(data.settings)) throw new Error('定价参数格式无效');
      if (!cancelled) {
        const loaded: PricingSettings = { ...data.settings, version: data.version };
        setSettings(loaded);
        setSavedSnapshot(JSON.stringify(data.settings));
      }
      if (canManageUsers(role)) {
        const result = await supabase!.rpc('list_app_users');
        if (result.error) throw result.error;
        if (!cancelled) setUsers(result.data);
      }
    })().catch(() => { if (!cancelled) setMessage('配置加载失败，请刷新重试。'); });
    return () => { cancelled = true; };
  }, [open, allowed, role, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy]);

  if (!allowed) return null;

  const hasUnsavedChanges = (() => {
    if (!settings || !savedSnapshot) return false;
    const { version: _version, ...currentValues } = settings;
    void _version;
    return JSON.stringify(currentValues) !== savedSnapshot;
  })();

  const handleToggleOpen = () => {
    if (open && busy) return;
    setMessage('');
    setOpen(v => !v);
  };

  const handleClose = () => {
    if (busy) return;
    setOpen(false);
  };

  const save = async () => {
    if (!settings || !supabase) return;
    const { version, ...values } = settings;
    if (!validatePricingSettings(values)) {
      setMessage('参数格式无效：费率须为小于 1 的非负小数，单价须为非负数（最多 6 位小数）。');
      return;
    }
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.rpc('save_pricing_settings', { expected_version: version, new_settings: values });
      if (error) throw error;
      setSavedSnapshot(JSON.stringify(values));
      setMessage('参数已保存，新报价使用新版本。');
      setRefresh(n => n + 1);
    } catch { setMessage('保存失败，参数版本可能已变化或无权限，请刷新后重试。'); }
    finally { setBusy(false); }
  };

  const assign = async (user: RoleRow, nextRole: AppRole) => {
    if (!supabase || !managesUsers) return;
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.rpc('assign_user_role', { target_user: user.user_id, new_role: nextRole });
      if (error) throw error;
      setUsers(prev => prev.map(row => (row.user_id === user.user_id ? { ...row, role: nextRole } : row)));
      setMessage('角色已更新。');
    } catch { setMessage('角色更新失败，不能修改自己的角色。'); }
    finally { setBusy(false); }
  };

  const isErrorMessage = message.includes('失败') || message.includes('过大') || message.includes('无效');
  const titleText = `定价参数${managesUsers ? '与用户权限' : ''}`;

  return <>
    <PageHeaderActions>
      <button
        type="button"
        aria-expanded={open}
        onClick={handleToggleOpen}
        className={`flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium shadow-xs transition ${
          open
            ? 'border-blue-300 bg-blue-50 text-blue-700'
            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        <Settings size={14} className={open ? 'text-blue-600' : 'text-slate-500'} />
        {titleText}
      </button>
    </PageHeaderActions>

    {open && (
      <div
        className="fixed inset-0 z-40 flex justify-end bg-slate-900/35 backdrop-blur-[1px]"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) handleClose();
        }}
      >
        <section
          aria-label="定价设置"
          className="flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl"
        >
          {/* 抽屉顶部栏 */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-5 py-3.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Settings size={16} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-sm font-bold text-slate-900">{titleText}</h2>
                  {settings && (
                    <span className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                      版本 {settings.version}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  {managesUsers
                    ? '管理报价损耗毛利参数、工序基准单价及成员访问权限'
                    : '管理报价损耗毛利参数与工序基准单价'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                title="刷新配置"
                aria-label="刷新配置"
                onClick={() => { setSettings(null); setSavedSnapshot(null); setMessage(''); setRefresh(n => n + 1); }}
                disabled={busy}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={13} className={!settings && !message ? 'animate-spin text-blue-600' : 'text-slate-500'} />
                <span className="hidden sm:inline">刷新</span>
              </button>

              {settings && (
                <>
                  <label className={`inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition ${busy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-slate-50'}`}>
                    <Upload size={13} className="text-slate-500" />
                    <span>导入参数</span>
                    <input
                      type="file"
                      accept=".json,application/json"
                      className="sr-only"
                      disabled={busy}
                      onChange={e => {
                        const file = e.target.files?.[0]; e.target.value = '';
                        if (!file) return;
                        if (file.size > 100000) { setMessage('参数文件过大。'); return; }
                        void file.text().then(text => { setSettings(parsePricingSettingsImport(text, settings)); setMessage('参数已导入，待保存。'); })
                          .catch(() => setMessage('导入失败，参数字段、范围或精度无效。'));
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const url = URL.createObjectURL(new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' }));
                      const link = document.createElement('a'); link.href = url; link.download = 'pricing-settings.json'; link.click(); URL.revokeObjectURL(url);
                    }}
                    className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download size={13} className="text-slate-500" />
                    <span>导出参数</span>
                  </button>
                </>
              )}

              <button
                type="button"
                aria-label="关闭定价设置"
                title="关闭"
                disabled={busy}
                onClick={handleClose}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* 固定状态提示条：无论滚动到顶部或底部均立即可见 */}
          {message && (
            <div
              role="status"
              className={`flex shrink-0 items-center justify-between gap-2 border-b px-5 py-2 text-xs font-medium ${
                isErrorMessage
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              <span>{message}</span>
              <button
                type="button"
                aria-label="关闭提示"
                onClick={() => setMessage('')}
                className="cursor-pointer rounded p-0.5 opacity-70 transition hover:opacity-100"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {/* 抽屉主体内容 */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-4 sm:p-5">
            {!settings && !message && (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-12 text-xs text-slate-500">
                <Loader2 size={16} className="animate-spin text-blue-600" />
                <span>正在加载定价配置...</span>
              </div>
            )}

            {settings && (
              <>
                {/* 基础费率参数 */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <SlidersHorizontal size={14} className="text-blue-600" />
                      基础费率参数
                    </h3>
                    <span className="text-[11px] text-slate-400">以小数填写（如 0.03 = 3%）</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {Object.entries(labels).map(([key, label]) => (
                      <label key={key} className="block text-xs font-medium text-slate-600">
                        {label}
                        <input
                          className={INPUT_CLASS}
                          type="number"
                          min="0"
                          max="0.999999"
                          step="0.000001"
                          disabled={busy}
                          value={settings[key as keyof PricingSettings] as string}
                          onChange={e => setSettings({ ...settings, [key]: e.target.value })}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                {/* 工序加工单价 */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <Wrench size={14} className="text-indigo-600" />
                      工序加工单价
                    </h3>
                    <span className="text-[11px] text-slate-400">单位：元 / 次</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {Object.entries(settings.laborRates).map(([name, rate]) => (
                      <label key={name} className="block text-xs font-medium text-slate-600">
                        {name}单价
                        <input
                          className={INPUT_CLASS}
                          type="number"
                          min="0"
                          step="0.000001"
                          disabled={busy}
                          value={rate}
                          onChange={e => setSettings({ ...settings, laborRates: { ...settings.laborRates, [name]: e.target.value } })}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                {/* 线长档位计费 */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <Ruler size={14} className="text-emerald-600" />
                      线长档位计费
                    </h3>
                    <span className="text-[11px] text-slate-400">单位：元 / 条</span>
                  </div>
                  <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
                    电测、外观、包装人工按以下线长档位计费（元/条），修改后保存生效。非整档长度向上匹配，超过 5 米需人工核价。
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr className="border-b border-slate-200">
                          <th className="w-24 px-3 py-2 font-semibold whitespace-nowrap">线长上限</th>
                          {FINISHING_LABOR_NAMES.map(name => (
                            <th key={name} className="px-3 py-2 font-semibold">{name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {FINISHING_LENGTHS_MM.map(length => (
                          <tr key={length} className="hover:bg-slate-50/70">
                            <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">
                              <span className="inline-block rounded bg-slate-100 px-2 py-0.5 tabular-nums">
                                {length / 1000} 米
                              </span>
                            </td>
                            {FINISHING_LABOR_NAMES.map(name => (
                              <td key={name} className="px-3 py-1.5">
                                <input
                                  aria-label={`${length / 1000}米${name}单价`}
                                  className="block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium tabular-nums text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                                  type="number"
                                  min="0"
                                  max="999999999.999999"
                                  step="0.000001"
                                  disabled={busy}
                                  value={settings.finishingLaborRates[length][name]}
                                  onChange={e => setSettings({ ...settings, finishingLaborRates: {
                                    ...settings.finishingLaborRates, [length]: { ...settings.finishingLaborRates[length], [name]: e.target.value },
                                  } })}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* 用户角色权限 */}
            {managesUsers && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Users size={14} className="text-blue-600" />
                    用户角色
                  </h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    共 {users.length} 人
                  </span>
                </div>
                {users.length === 0 ? (
                  <p className="py-3 text-center text-xs text-slate-400">暂无用户数据</p>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200/80">
                    {users.map(user => {
                      const isSelf = user.user_id === currentUser?.id;
                      return (
                        <label
                          key={user.user_id}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs transition hover:bg-slate-50/80"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold uppercase text-slate-600">
                              {user.email?.[0] || '?'}
                            </span>
                            <span className="truncate font-medium text-slate-800">{user.email}</span>
                            {isSelf && (
                              <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                                当前账号
                              </span>
                            )}
                          </span>
                          <select
                            value={user.role}
                            disabled={busy || isSelf}
                            onChange={e => void assign(user, e.target.value as AppRole)}
                            aria-label={user.email + '角色'}
                            className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            <option value="sales">业务员</option>
                            <option value="engineer">工程师</option>
                            <option value="admin">管理员</option>
                          </select>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 抽屉底部固定操作栏 */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              {hasUnsavedChanges ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                  有未保存修改
                </span>
              ) : (
                <span>{settings ? '修改费率或单价后请点击保存，新报价将自动生效' : '等待配置加载完成'}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={handleClose}
                className="h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                关闭
              </button>
              {settings && (
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={busy}
                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  保存参数
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    )}
  </>;
}

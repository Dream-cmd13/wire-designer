import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { PageHeaderActions } from '@/components/layout/PageHeaderActions';
import { canHandleQuoteRequests, downloadQuoteFile, listQuoteRequests, QUOTE_LIST_SIZE, quoteStatuses, updateQuoteRequest } from '@/lib/quoteRequests';
import type { QuoteRequestRow, QuoteStatus } from '@/lib/quoteRequests';
import type { User } from '@/types/user';

const actionClass = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const primaryClass = 'inline-flex items-center justify-center rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50';
const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' });

function RequestDetails({ row, user, onSave, onClose }: { row: QuoteRequestRow; user: User; onSave: (row: QuoteRequestRow) => void; onClose: () => void }) {
  const { payload, status } = row;
  const [note, setNote] = useState(row.follow_up_note);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState<number | null>(null);
  const saveLock = useRef(false);
  const editable = user.role === 'admin' || !row.assignee_id || user.id === row.assignee_id;

  async function save(next: QuoteStatus) {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setError('');
    try {
      onSave(await updateQuoteRequest(row, next, note));
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setSaving(false);
      saveLock.current = false;
    }
  }

  async function download(index: number) {
    setDownloading(index);
    setError('');
    try {
      await downloadQuoteFile(row, index);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <section aria-label="询价详情" className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-3">
        <div className="min-w-0">
          <h2 className="break-all text-base font-semibold text-slate-900">{row.receipt}</h2>
          <p className="mt-1 text-xs text-slate-500">{quoteStatuses[status]} · {row.assignee_id === user.id ? '我负责' : row.assignee_id ? '其他专员负责' : '待认领'}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭询价详情" className="rounded p-1.5 text-slate-600 hover:bg-slate-100"><X aria-hidden="true" className="h-4 w-4" /></button>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 text-sm">
        <div className="min-w-0"><dt className="text-xs text-slate-500">联系人</dt><dd className="mt-1 break-all font-medium">{payload.name}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-slate-500">企业名称</dt><dd className="mt-1 break-all">{payload.company || '—'}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-slate-500">手机号</dt><dd className="mt-1 break-all">{payload.phone ? <a href={`tel:${payload.phone}`} className="text-blue-700 underline">{payload.phone}</a> : '—'}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-slate-500">邮箱</dt><dd className="mt-1 break-all">{payload.email ? <a href={`mailto:${encodeURIComponent(payload.email).replace('%40', '@')}`} className="text-blue-700 underline">{payload.email}</a> : '—'}</dd></div>
      </dl>
      <div className="mt-5 border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-900">需求说明{payload.kind ? ` · ${payload.kind}` : ''}</h3>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{payload.demand || '客户已提供图纸。'}</p>
        {payload.files.length > 0 && <ul className="mt-3 space-y-2" aria-label="询价图纸">
          {payload.files.map((file, index) => <li key={index}>
            <button type="button" disabled={downloading !== null} onClick={() => void download(index)} aria-label={`下载 ${file.name}`} className={`${actionClass} w-full justify-start text-left`}><Download aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="min-w-0 break-all">{downloading === index ? '正在生成下载链接…' : file.name}</span></button>
          </li>)}
        </ul>}
      </div>
      <div className="mt-5 space-y-3 border-t border-slate-200 pt-4">
        {status !== 'pending' && <label className="block text-sm font-semibold text-slate-900">
          跟进与报价记录
          <textarea value={note} onChange={(event) => setNote(event.currentTarget.value)} readOnly={!editable || status === 'closed'} disabled={saving} rows={4} maxLength={4000} placeholder="记录沟通要点。正式报价可填写金额、币种、数量、交期和已发送渠道。" className="mt-2 w-full rounded-md border border-slate-300 p-2.5 text-sm font-normal leading-6 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </label>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {editable && status !== 'closed' && <div className="flex flex-wrap gap-2">
          {status === 'pending' ? <button type="button" disabled={saving} onClick={() => void save('following')} className={primaryClass}>认领询价</button> : <>
            <button type="button" disabled={saving || note === row.follow_up_note || (status === 'quoted' && !note.trim())} onClick={() => void save(status)} className={actionClass}>保存记录</button>
            {status === 'following' && <button type="button" disabled={saving || !note.trim()} onClick={() => void save('quoted')} className={primaryClass}>标记已报价</button>}
            <button type="button" disabled={saving} onClick={() => void save('closed')} className={actionClass}>关闭询价</button>
          </>}
        </div>}
      </div>
    </section>
  );
}

export default function QuoteRequestsPage({ user }: { user: User }) {
  const [status, setStatus] = useState<QuoteStatus | ''>('');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<QuoteRequestRow | null>(null);
  const [result, setResult] = useState<{ key: string; rows: QuoteRequestRow[]; count: number; message?: string } | null>(null);
  const key = `${status}/${page}/${revision}`;
  const current = result?.key === key ? result : null;
  const maxPage = Math.max(0, Math.ceil((current?.count ?? 0) / QUOTE_LIST_SIZE) - 1);
  const allowedRole = user.role === 'sales' || user.role === 'admin';

  useEffect(() => {
    if (!allowedRole) return;
    const controller = new AbortController();
    canHandleQuoteRequests().then(async (allowed) => {
      if (!allowed) throw new Error('当前账号没有询价处理权限。');
      const response = await listQuoteRequests(status, page, controller.signal);
      if (!controller.signal.aborted) setResult({ key, ...response });
    }).catch((problem: Error) => {
      if (!controller.signal.aborted) {
        setSelected(null);
        setResult({ key, rows: [], count: 0, message: problem.message });
      }
    });
    return () => controller.abort();
  }, [allowedRole, key, page, status]);

  function refresh() {
    setSelected(null);
    setRevision((value) => value + 1);
  }

  if (!allowedRole) return <p className="m-6 text-sm text-slate-600">当前账号没有询价处理权限。</p>;

  return (
    <div className="mx-auto max-w-7xl p-3 sm:p-6">
      <PageHeaderActions><button type="button" onClick={refresh} className={actionClass}><RefreshCw aria-hidden="true" className="h-4 w-4" />刷新</button></PageHeaderActions>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">状态
          <select value={status} onChange={(event) => { setStatus(event.currentTarget.value as QuoteStatus | ''); setPage(0); setSelected(null); }} className="rounded-md border border-slate-300 bg-white px-2 py-1.5">
            <option value="">全部</option>
            {Object.entries(quoteStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {current && !current.message && <span className="text-xs text-slate-500">共 {current.count} 条询价</span>}
      </div>
      <div className={`grid min-w-0 gap-4 ${selected ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}`}>
        <section aria-label="询价列表" className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
          {!current && <p role="status" className="p-5 text-sm text-slate-600">正在加载询价…</p>}
          {current?.message && <p role="alert" className="p-5 text-sm text-red-700">{current.message}</p>}
          {current && !current.message && (current.rows.length ? <ul className="divide-y divide-slate-200">
            {current.rows.map((row) => <li key={row.id}>
              <button type="button" aria-pressed={selected?.id === row.id} onClick={() => setSelected(row)} className="w-full px-4 py-3 text-left text-sm hover:bg-slate-50 aria-pressed:bg-blue-50">
                <span className="flex flex-wrap items-center justify-between gap-1">
                  <span className="break-all font-medium text-slate-900">{row.receipt}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{quoteStatuses[row.status]}</span>
                </span>
                <span className="mt-1.5 flex flex-wrap justify-between gap-1 text-xs text-slate-600">
                  <span className="break-all">{row.payload.name}{row.payload.company ? ` · ${row.payload.company}` : ''}</span>
                  <time dateTime={row.submitted_at}>{dateFormat.format(new Date(row.submitted_at))}</time>
                </span>
              </button>
            </li>)}
          </ul> : <p className="p-5 text-sm text-slate-600">当前没有询价。</p>)}
          {current && !current.message && (page > 0 || maxPage > 0) && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-3">
            <button type="button" disabled={page === 0} onClick={() => { setPage((value) => value - 1); setSelected(null); }} className={actionClass}>上一页</button>
            <span className="text-xs text-slate-500">第 {page + 1} 页</span>
            <button type="button" disabled={page >= maxPage} onClick={() => { setPage((value) => value + 1); setSelected(null); }} className={actionClass}>下一页</button>
          </div>}
        </section>
        {selected && <RequestDetails key={`${selected.id}:${selected.updated_at}`} row={selected} user={user} onClose={() => setSelected(null)} onSave={(saved) => { setSelected(saved); setRevision((value) => value + 1); }} />}
      </div>
    </div>
  );
}

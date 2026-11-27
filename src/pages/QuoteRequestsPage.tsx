import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { PageHeaderActions } from '@/components/layout/PageHeaderActions';
import { canHandleQuoteRequests, downloadQuoteFile, listQuoteRequests, QUOTE_LIST_SIZE, quoteStatuses, updateQuoteRequest } from '@/lib/quoteRequests';
import type { QuoteRequestRow, QuoteRequestScope, QuoteStatus } from '@/lib/quoteRequests';
import { notify } from '@/stores/noticeStore';
import type { User } from '@/types/user';

const actionClass = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const primaryClass = 'inline-flex items-center justify-center rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50';
const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' });

const scopeLabels: Record<QuoteRequestScope, string> = { all: '全部询价', unassigned: '待认领', mine: '我负责' };

function assigneeLabel(row: QuoteRequestRow, userId: string) {
  if (row.assignee_id === userId) return '我负责';
  if (row.assignee_id) return '其他专员负责';
  return row.status === 'pending' ? '待认领' : '无负责人';
}

function RequestDetails({ row, user, note, saving, saveError, onNoteChange, onSave, onClose }: {
  row: QuoteRequestRow;
  user: User;
  note: string;
  saving: boolean;
  saveError: string;
  onNoteChange: (note: string) => void;
  onSave: (status: QuoteStatus) => void;
  onClose: () => void;
}) {
  const { payload, status } = row;
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState<number | null>(null);
  const editable = user.role === 'admin' || !row.assignee_id || user.id === row.assignee_id;

  async function download(index: number) {
    setDownloading(index);
    setDownloadError('');
    try {
      await downloadQuoteFile(row, index);
    } catch (problem) {
      setDownloadError((problem as Error).message);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <section aria-label="询价详情" className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-3">
        <div className="min-w-0">
          <h2 className="break-all text-base font-semibold text-slate-900">{row.receipt}</h2>
          <p className="mt-1 text-xs text-slate-500">{quoteStatuses[status]} · {assigneeLabel(row, user.id)}</p>
        </div>
        <button type="button" onClick={onClose} disabled={saving} aria-label="关闭询价详情" className="rounded p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-50"><X aria-hidden="true" className="h-4 w-4" /></button>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 text-sm">
        <div className="min-w-0"><dt className="text-xs text-slate-500">联系人</dt><dd className="mt-1 break-all font-medium">{payload.name}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-slate-500">企业名称</dt><dd className="mt-1 break-all">{payload.company || '—'}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-slate-500">手机号</dt><dd className="mt-1 break-all">{payload.phone ? <a href={`tel:${payload.phone}`} className="text-inherit no-underline">{payload.phone}</a> : '—'}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-slate-500">邮箱</dt><dd className="mt-1 break-all">{payload.email ? <a href={`mailto:${encodeURIComponent(payload.email).replace('%40', '@')}`} className="text-inherit no-underline">{payload.email}</a> : '—'}</dd></div>
      </dl>
      <div className="mt-5 border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-900">需求说明{payload.kind ? ` · ${payload.kind}` : ''}</h3>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{payload.demand || '客户已提供图纸。'}</p>
        {payload.files.length > 0 && <ul className="mt-3 space-y-2" aria-label="询价图纸">
          {payload.files.map((file, index) => <li key={index}>
            <button type="button" disabled={downloading !== null} onClick={() => void download(index)} aria-label={`下载 ${file.name}`} className={`${actionClass} w-full justify-start text-left`}><Download aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="min-w-0 break-all">{downloading === index ? '正在生成下载链接…' : file.name}</span></button>
          </li>)}
        </ul>}
        {downloadError && <p role="alert" className="mt-2 text-sm text-red-700">{downloadError}</p>}
      </div>
      <div className="mt-5 space-y-3 border-t border-slate-200 pt-4">
        {status !== 'pending' && <label className="block text-sm font-semibold text-slate-900">
          跟进与报价记录
          <textarea value={note} onChange={(event) => onNoteChange(event.currentTarget.value)} readOnly={!editable || status === 'closed'} disabled={saving} rows={4} maxLength={4000} placeholder="记录沟通要点。正式报价可填写金额、币种、数量、交期和已发送渠道。" className="mt-2 w-full rounded-md border border-slate-300 p-2.5 text-sm font-normal leading-6 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </label>}
        {note !== row.follow_up_note && <p className="text-xs text-amber-800">有未保存的跟进记录</p>}
        {saving && <p role="status" className="text-xs text-slate-600">正在更新询价…</p>}
        {saveError && <p role="alert" className="text-sm text-red-700">{saveError}</p>}
        {editable && status !== 'closed' && <div className="flex flex-wrap gap-2">
          {status === 'pending' ? <button type="button" disabled={saving} onClick={() => onSave('following')} className={primaryClass}>认领询价</button> : <>
            <button type="button" disabled={saving || note === row.follow_up_note || (status === 'quoted' && !note.trim())} onClick={() => onSave(status)} className={actionClass}>保存记录</button>
            {status === 'following' && <button type="button" disabled={saving || !note.trim()} onClick={() => onSave('quoted')} className={primaryClass}>标记已报价</button>}
            <button type="button" disabled={saving} onClick={() => onSave('closed')} className={actionClass}>关闭询价</button>
          </>}
        </div>}
      </div>
    </section>
  );
}

type QuoteConfirmation = { title: string; message: string; label: string; onConfirm: () => void };

function QuoteConfirmDialog({ confirmation, onCancel }: { confirmation: QuoteConfirmation; onCancel: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog ref={dialogRef} role="alertdialog" aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
      className="fixed inset-0 m-auto w-[calc(100%-1.5rem)] max-w-sm rounded-lg border border-slate-200 bg-white p-4 text-slate-900 shadow-xl backdrop:bg-black/40">
      <h2 id={titleId} className="text-base font-semibold">{confirmation.title}</h2>
      <p id={descriptionId} className="mt-2 text-sm text-slate-600">{confirmation.message}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={actionClass} onClick={onCancel}>取消</button>
        <button type="button" className={primaryClass} onClick={confirmation.onConfirm}>{confirmation.label}</button>
      </div>
    </dialog>
  );
}

export default function QuoteRequestsPage({ user, registerLeaveGuard }: {
  user: User;
  registerLeaveGuard?: (guard: (proceed: () => void) => void) => () => void;
}) {
  const [scope, setScope] = useState<QuoteRequestScope>('all');
  const [status, setStatus] = useState<QuoteStatus | ''>('');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<QuoteRequestRow | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const saveLock = useRef(false);
  const [confirmation, setConfirmation] = useState<QuoteConfirmation | null>(null);
  const [result, setResult] = useState<{ key: string; rows: QuoteRequestRow[]; count: number; message?: string } | null>(null);
  const key = `${user.id}/${scope}/${status}/${page}/${revision}`;
  const current = result?.key === key ? result : null;
  const maxPage = Math.max(0, Math.ceil((current?.count ?? 0) / QUOTE_LIST_SIZE) - 1);
  const dirty = Boolean(selected && note !== selected.follow_up_note);
  const allowedRole = user.role === 'sales' || user.role === 'admin';

  useEffect(() => {
    if (!allowedRole) return;
    const controller = new AbortController();
    canHandleQuoteRequests().then(async (allowed) => {
      if (controller.signal.aborted) return;
      if (!allowed) {
        setSelected(null);
        setNote('');
        setSaveError('');
        setResult({ key, rows: [], count: 0, message: '当前账号没有询价处理权限。' });
        return;
      }
      const response = await listQuoteRequests({ status, scope, userId: user.id, page, signal: controller.signal });
      if (controller.signal.aborted) return;
      const lastPage = Math.max(0, Math.ceil(response.count / QUOTE_LIST_SIZE) - 1);
      if (page > lastPage) setPage(lastPage);
      else setResult({ key, ...response });
    }).catch((problem: Error) => {
      if (!controller.signal.aborted) {
        setResult({ key, rows: [], count: 0, message: problem.message });
      }
    });
    return () => controller.abort();
  }, [allowedRole, key, page, scope, status, user.id]);

  useEffect(() => {
    if (!dirty) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = true;
    }
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);

  const confirmDiscard = useCallback((proceed: () => void) => {
    if (saveLock.current) return;
    if (!dirty) {
      proceed();
      return;
    }
    setConfirmation({
      title: '放弃本次修改？',
      message: '跟进记录尚未保存。继续后将丢弃本次修改。',
      label: '放弃修改',
      onConfirm: () => {
        setConfirmation(null);
        proceed();
      },
    });
  }, [dirty]);

  useLayoutEffect(() => registerLeaveGuard?.(confirmDiscard), [confirmDiscard, registerLeaveGuard]);

  function changeSelection(next: QuoteRequestRow | null, afterChange?: () => void) {
    confirmDiscard(() => {
      setSelected(next);
      setNote(next?.follow_up_note ?? '');
      setSaveError('');
      afterChange?.();
    });
  }

  function requestSave(next: QuoteStatus) {
    if (!selected || saveLock.current) return;
    if (next !== 'closed') {
      void save(next);
      return;
    }
    setConfirmation({
      title: '确认关闭询价？',
      message: dirty ? '关闭后将保存当前跟进记录，且无法继续编辑。' : '关闭后将无法继续编辑。',
      label: '确认关闭',
      onConfirm: () => {
        setConfirmation(null);
        void save('closed');
      },
    });
  }

  async function save(next: QuoteStatus) {
    if (!selected || saveLock.current) return;
    const title = selected.status === 'pending' ? '询价已认领'
      : next === 'closed' ? '询价已关闭'
        : next !== selected.status ? '已标记为已报价' : '记录已保存';
    saveLock.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const saved = await updateQuoteRequest(selected, next, note);
      setSelected(saved);
      setNote(saved.follow_up_note);
      const leavesFilter = scope === 'unassigned' || (status && saved.status !== status);
      if (leavesFilter && current?.rows.some((row) => row.id === saved.id)) {
        const remainingPages = Math.ceil((current.count - 1) / QUOTE_LIST_SIZE);
        setPage(Math.min(page, Math.max(0, remainingPages - 1)));
      }
      setRevision((value) => value + 1);
      notify({ tone: 'success', title, message: `${saved.receipt} · ${quoteStatuses[saved.status]}`, dedupeKey: 'quote-management' });
    } catch (problem) {
      const message = problem instanceof Error ? problem.message : '更新询价失败，请重试。';
      setSaveError(message);
      notify({ tone: 'danger', title: '询价更新失败', message, dedupeKey: 'quote-management' });
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  if (!allowedRole) return <p className="m-6 text-sm text-slate-600">当前账号没有询价处理权限。</p>;

  return (
    <div className="mx-auto max-w-7xl p-3 sm:p-6">
      <PageHeaderActions>
        <button type="button" disabled={saving} onClick={() => {
          changeSelection(null, () => {
            if (current?.message) setPage(0);
            setRevision((value) => value + 1);
          });
        }} className={actionClass}><RefreshCw aria-hidden="true" className="h-4 w-4" />刷新</button>
      </PageHeaderActions>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="询价范围" className="flex flex-wrap gap-2">
          {(Object.keys(scopeLabels) as QuoteRequestScope[]).map((value) => (
            <button key={value} type="button" aria-pressed={scope === value} disabled={saving} className={`${actionClass} aria-pressed:border-blue-600 aria-pressed:bg-blue-50 aria-pressed:text-blue-700`} onClick={() => {
              if (scope === value) return;
              changeSelection(null, () => {
                setScope(value);
                setPage(0);
              });
            }}>{scopeLabels[value]}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">状态
          <select value={scope === 'unassigned' ? 'pending' : status} disabled={saving || scope === 'unassigned'} onChange={(event) => {
            const nextStatus = event.currentTarget.value as QuoteStatus | '';
            changeSelection(null, () => {
              setStatus(nextStatus);
              setPage(0);
            });
          }} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 disabled:bg-slate-100">
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
              <button type="button" aria-pressed={selected?.id === row.id} disabled={saving} onClick={() => { if (selected?.id !== row.id) changeSelection(row); }} className="w-full px-4 py-3 text-left text-sm hover:bg-slate-50 aria-pressed:bg-blue-50">
                <span className="flex flex-wrap items-center justify-between gap-1">
                  <span className="break-all font-medium text-slate-900">{row.receipt}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">{quoteStatuses[row.status]}</span>
                    <span className="text-slate-600">{assigneeLabel(row, user.id)}</span>
                  </span>
                </span>
                <span className="mt-1.5 flex flex-wrap justify-between gap-1 text-xs text-slate-600">
                  <span className="break-all">{row.payload.name}{row.payload.company ? ` · ${row.payload.company}` : ''}</span>
                  <time dateTime={row.submitted_at}>{dateFormat.format(new Date(row.submitted_at))}</time>
                </span>
              </button>
            </li>)}
          </ul> : <p className="p-5 text-sm text-slate-600">当前没有询价。</p>)}
          {current && !current.message && (page > 0 || maxPage > 0) && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-3">
            <button type="button" disabled={saving || page === 0} onClick={() => changeSelection(null, () => setPage((value) => value - 1))} className={actionClass}>上一页</button>
            <span className="text-xs text-slate-500">第 {page + 1} 页</span>
            <button type="button" disabled={saving || page >= maxPage} onClick={() => changeSelection(null, () => setPage((value) => value + 1))} className={actionClass}>下一页</button>
          </div>}
        </section>
        {selected && <RequestDetails
          key={`${selected.id}:${selected.updated_at}`}
          row={selected}
          user={user}
          note={note}
          saving={saving}
          saveError={saveError}
          onNoteChange={setNote}
          onClose={() => changeSelection(null)}
          onSave={requestSave}
        />}
      </div>
      {confirmation && <QuoteConfirmDialog confirmation={confirmation} onCancel={() => setConfirmation(null)} />}
    </div>
  );
}

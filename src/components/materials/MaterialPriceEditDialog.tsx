import { PriceUpdateInfo } from './PriceUpdateInfo';
import { useEffect, useRef, useState } from 'react';
import type { QuoteMaterial } from '@/lib/quoteMaterials';
import { formatMaterialSpecification } from '@/lib/quoteMaterials';
import { buildPriceEdits, createPriceDrafts } from '@/lib/materialPriceEdit';
import type { MaterialPrice } from '@/repositories/priceRepository';
import { usePriceStore } from '@/stores/priceStore';
import { useUserStore } from '@/stores/userStore';
import { canViewPricing } from '@/lib/permissions';
import { getUserErrorMessage } from '@/lib/userErrorMessage';

export function MaterialPriceEditDialog({ candidates, prices, onClose }: {
  candidates: QuoteMaterial[]; prices: MaterialPrice[]; onClose: () => void;
}) {
  const [rows, setRows] = useState(() => createPriceDrafts(candidates, prices));
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState('');
  const allowed = canViewPricing(useUserStore(s => s.currentUser?.role));
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (allowed) dialog?.showModal();
    return () => dialog?.close();
  }, [allowed]);
  const isWire = candidates[0]?.kind === 'wire';
  const save = async () => {
    if (saving.current || !allowed) return;
    setError('');
    try {
      const edits = buildPriceEdits(rows);
      if (!edits.length) { setError('没有需要保存的价格修改。'); return; }
      saving.current = true; setBusy(true);
      await usePriceStore.getState().saveEdits(edits);
      onClose();
    } catch (cause) { setError(getUserErrorMessage(cause, '价格保存失败，输入已保留，请重试。')); }
    finally { saving.current = false; setBusy(false); }
  };
  if (!allowed || !candidates.length) return null;
  return <dialog ref={dialogRef} aria-labelledby="material-price-title"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    className="fixed inset-0 m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-xl rounded-xl border-0 bg-white p-5 shadow-xl backdrop:bg-black/40">
    <section className="flex max-h-[75vh] flex-col">
      <h2 id="material-price-title" className="text-lg font-semibold">编辑含税单价</h2>
      <p className="mt-1 text-sm font-medium">{candidates[0].name}</p>
      <p className="mt-1 text-xs text-slate-500">{formatMaterialSpecification(candidates[0], false)}</p>
      <p className="my-3 text-xs text-slate-500">最多 6 位小数，允许 0 元；未定价可留空，已有价格不可清空。保存后用于后续核价。</p>
      {isWire && <p className="mb-3 text-xs text-blue-700">按整条计价，实际线长向上匹配最近档位；超过 5 米仍需人工核价。</p>}
      <form className="flex min-h-0 flex-col" onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className="space-y-3 overflow-auto">
          {rows.map((row, index) => <div key={index} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-3">
            {isWire ? <label className="min-w-0 flex-1 text-xs">长度上限（mm）
              <input aria-label={`第${index + 1}档长度上限`} type="number" min="1" step="1" value={row.length}
                disabled={busy || Boolean(row.original)} className="mt-1 w-full rounded border p-2 disabled:bg-slate-100"
                onChange={e => setRows(rows.map((r, i) => i === index ? { ...r, length: e.target.value } : r))} />
            </label> : <span className="w-16 py-2 text-sm">{row.kind === 'outer-mold' ? '外模' : row.kind === 'inner-mold' ? '内模' : '单价'}</span>}
            <label className="min-w-0 flex-1 text-xs">含税单价（{row.unit}）
              <input aria-label={`${row.kind === 'inner-mold' ? '内模' : row.kind === 'outer-mold' ? '外模' : `第${index + 1}项`}含税单价`}
                type="text" inputMode="decimal" value={row.price} disabled={busy} placeholder="未定价"
                className="mt-1 w-full rounded border p-2" onChange={e => setRows(rows.map((r, i) => i === index ? { ...r, price: e.target.value } : r))} />
            </label>
            <div className="w-full"><PriceUpdateInfo price={row.original} /></div>
          </div>)}
        </div>
        {isWire && <button type="button" disabled={busy} className="mt-3 self-start text-sm text-blue-700"
          onClick={() => setRows([...rows, { ...createPriceDrafts([candidates[0]], [])[0], length: '' }])}>新增长度档位</button>}
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" disabled={busy} className="rounded border px-4 py-2 text-sm" onClick={onClose}>取消</button>
          <button type="submit" disabled={busy} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? '保存中…' : '保存价格'}</button>
        </div>
      </form>
    </section>
  </dialog>;
}

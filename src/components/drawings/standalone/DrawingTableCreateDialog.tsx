import { useCallback, useEffect, useState } from 'react';
import { Table2, X } from 'lucide-react';
import type { DrawingTableCreateInput } from '@/lib/drawingDocument';

interface Props {
  open: boolean;
  onConfirm: (input: DrawingTableCreateInput) => void;
  onClose: () => void;
}

export function DrawingTableCreateDialog({ open, onConfirm, onClose }: Props) {
  const [rowCount, setRowCount] = useState(3);
  const [columnCount, setColumnCount] = useState(3);
  const [showTitleRow, setShowTitleRow] = useState(true);

  const reset = useCallback(() => {
    setRowCount(3);
    setColumnCount(3);
    setShowTitleRow(true);
  }, []);
  const close = useCallback(() => { reset(); onClose(); }, [onClose, reset]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [close, open]);

  if (!open) return null;
  const rowsValid = Number.isInteger(rowCount) && rowCount >= 1 && rowCount <= 100;
  const columnsValid = Number.isInteger(columnCount) && columnCount >= 1 && columnCount <= 20;
  const valid = rowsValid && columnsValid;
  const fieldClass = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-[1px]" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <form role="dialog" aria-modal="true" aria-labelledby="table-create-title" onSubmit={(event) => { event.preventDefault(); if (valid) { onConfirm({ rowCount, columnCount, showTitleRow }); reset(); } }} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Table2 className="h-5 w-5"/></div>
        <div className="min-w-0 flex-1">
          <h2 id="table-create-title" className="text-base font-semibold text-slate-900">创建表格</h2>
          <p className="mt-1 text-xs text-slate-500">数据行数不包含列标题行和可选的表名行。</p>
        </div>
        <button type="button" aria-label="关闭表格创建窗口" onClick={close} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4"/></button>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <label className="text-sm font-medium text-slate-700">数据行数
          <input type="number" min="1" max="100" step="1" value={rowCount} onChange={(event) => setRowCount(Number(event.target.value))} className={fieldClass}/>
          {!rowsValid && <span role="alert" className="mt-1 block text-xs text-red-600">请输入 1 到 100 之间的整数。</span>}
        </label>
        <label className="text-sm font-medium text-slate-700">列数
          <input type="number" min="1" max="20" step="1" value={columnCount} onChange={(event) => setColumnCount(Number(event.target.value))} className={fieldClass}/>
          {!columnsValid && <span role="alert" className="mt-1 block text-xs text-red-600">请输入 1 到 20 之间的整数。</span>}
        </label>
      </div>
      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={showTitleRow} onChange={(event) => setShowTitleRow(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600"/>
        显示表名行
      </label>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={close} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">取消</button>
        <button type="submit" disabled={!valid} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">确定</button>
      </div>
    </form>
  </div>;
}

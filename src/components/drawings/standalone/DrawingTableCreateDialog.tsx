import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { DrawingTableCreateInput } from '@/lib/drawingDocument';

interface Props {
  open: boolean;
  onConfirm: (input: DrawingTableCreateInput) => void;
  onClose: () => void;
}

const GRID_ROWS = 8;
const GRID_COLS = 10;

export function DrawingTableCreateDialog({ open, onConfirm, onClose }: Props) {
  const [rowCount, setRowCount] = useState(3);
  const [columnCount, setColumnCount] = useState(3);
  const [showTitleRow, setShowTitleRow] = useState(true);
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null);

  const reset = useCallback(() => {
    setRowCount(3);
    setColumnCount(3);
    setShowTitleRow(true);
    setHoverCell(null);
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
  const displayRows = hoverCell?.row ?? rowCount;
  const displayCols = hoverCell?.col ?? columnCount;
  const fieldClass = 'mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500';

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/25 p-4 backdrop-blur-[1px]"
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="table-create-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) {
            onConfirm({ rowCount, columnCount, showTitleRow });
            reset();
          }
        }}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="table-create-title" className="text-base font-medium text-slate-900">自定义接线表</h2>
          <button
            type="button"
            aria-label="关闭表格创建窗口"
            onClick={close}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Interactive Grid Selector (Image 13) */}
        <div className="mt-4 flex flex-col items-center">
          <div className="mb-2.5 text-xs font-medium text-slate-600">
            {displayRows} 行 × {displayCols} 列
          </div>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))` }}
            onMouseLeave={() => setHoverCell(null)}
          >
            {Array.from({ length: GRID_ROWS }, (_, rowIdx) => (
              Array.from({ length: GRID_COLS }, (_, colIdx) => {
                const r = rowIdx + 1;
                const c = colIdx + 1;
                const active = r <= displayRows && c <= displayCols;
                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    aria-label={`选择 ${r} 行 ${c} 列`}
                    onMouseEnter={() => setHoverCell({ row: r, col: c })}
                    onClick={() => {
                      onConfirm({ rowCount: r, columnCount: c, showTitleRow });
                      reset();
                    }}
                    className={`h-4 w-4 rounded-[3px] border transition ${
                      active
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-slate-300 bg-white hover:border-blue-400'
                    }`}
                  />
                );
              })
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">
            点击网格后进入表格编辑器，可继续编辑文字、合并单元格、调整行列；确认后插入画板。
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
          <label className="text-xs font-medium text-slate-600">
            数据行数
            <input
              type="number"
              min="1"
              max="100"
              step="1"
              value={rowCount}
              onChange={(event) => setRowCount(Number(event.target.value))}
              className={fieldClass}
            />
            {!rowsValid && <span role="alert" className="mt-1 block text-[11px] text-red-600">请输入 1 到 100 之间的整数。</span>}
          </label>
          <label className="text-xs font-medium text-slate-600">
            列数
            <input
              type="number"
              min="1"
              max="20"
              step="1"
              value={columnCount}
              onChange={(event) => setColumnCount(Number(event.target.value))}
              className={fieldClass}
            />
            {!columnsValid && <span role="alert" className="mt-1 block text-[11px] text-red-600">请输入 1 到 20 之间的整数。</span>}
          </label>
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={showTitleRow}
            onChange={(event) => setShowTitleRow(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
          />
          显示表名行
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-md border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            取消
          </button>
          <button type="submit" disabled={!valid} className="rounded-md bg-blue-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:bg-slate-300">
            确定
          </button>
        </div>
      </form>
    </div>
  );
}

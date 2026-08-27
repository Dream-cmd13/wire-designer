import { useState } from 'react';
import { Box, Check, X } from 'lucide-react';

export type CanvasModelOption = 'outer-box';

interface CanvasModelDialogProps {
  onClose: () => void;
  onConfirm: (option: CanvasModelOption) => void;
}

export function CanvasModelDialog({ onClose, onConfirm }: CanvasModelDialogProps) {
  const [selected, setSelected] = useState<CanvasModelOption>('outer-box');

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-50 p-2 text-amber-600">
              <Box className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">添加外模</h2>
              <p className="text-xs text-slate-500">用于包覆连接器和线材之间的中间连接段</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          <button
            type="button"
            onClick={() => setSelected('outer-box')}
            className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ${
              selected === 'outer-box'
                ? 'border-amber-300 bg-amber-50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-300 bg-gradient-to-br from-slate-100 to-slate-200 shadow-inner">
              <div className="h-10 w-10 rounded-lg border border-slate-400 bg-white/75" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-800">方块外模</div>
              <p className="mt-1 text-xs text-slate-500">
                以方块形式显示在连接器和线材中间，包覆后会遮住该区域的连接线显示。
              </p>
            </div>
            {selected === 'outer-box' && (
              <div className="rounded-full bg-amber-500 p-1 text-white">
                <Check className="h-4 w-4" />
              </div>
            )}
          </button>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-200">
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            添加到画布
          </button>
        </div>
      </div>
    </div>
  );
}

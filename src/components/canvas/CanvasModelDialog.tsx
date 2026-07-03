import { Box, X } from 'lucide-react';

export function CanvasModelDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-50 p-2 text-violet-600">
              <Box className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">添加模型</h2>
              <p className="text-xs text-slate-500">选择需要放置在画布中的模型</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">模型类型</span>
            <select disabled className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              <option>模具外模</option>
            </select>
          </label>
          <div className="mt-4 rounded-xl border border-dashed border-violet-200 bg-violet-50/50 px-4 py-10 text-center">
            <Box className="mx-auto mb-2 h-8 w-8 text-violet-300" />
            <p className="text-sm font-medium text-violet-700">暂无可选模具外模</p>
            <p className="mt-1 text-xs text-violet-400">模型目录接入后将在这里显示缩略图和规格。</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-200">
            关闭
          </button>
          <button type="button" disabled className="rounded-lg bg-slate-300 px-4 py-2 text-sm font-medium text-white">
            添加到画布
          </button>
        </div>
      </div>
    </div>
  );
}

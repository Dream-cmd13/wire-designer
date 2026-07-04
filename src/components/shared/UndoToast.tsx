import { RotateCcw, X } from 'lucide-react';

interface UndoToastProps {
  message: string;
  canUndo: boolean;
  onUndo: () => void;
  onClose: () => void;
}

export function UndoToast({ message, canUndo, onUndo, onClose }: UndoToastProps) {
  return (
    <div
      role="status"
      className="absolute bottom-5 left-1/2 z-[75] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white shadow-xl"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className="flex cursor-pointer items-center gap-1 rounded px-2 py-1 font-medium text-blue-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-500"
        title={canUndo ? '恢复刚刚删除的对象' : '设计已继续修改，请使用全局撤销'}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        撤销
      </button>
      <button type="button" onClick={onClose} className="text-slate-400 hover:text-white" aria-label="关闭提示">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

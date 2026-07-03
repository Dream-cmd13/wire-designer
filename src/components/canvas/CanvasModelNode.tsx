import { memo } from 'react';
import { Box } from 'lucide-react';
import { getCanvasModelDisplayName } from '@/lib/canvasMaterials';
import type { CanvasModel } from '@/types/harness';

interface CanvasModelNodeProps {
  data: CanvasModel;
  selected?: boolean;
}

function CanvasModelNodeImpl({ data, selected }: CanvasModelNodeProps) {
  return (
    <div
      className={`flex h-full w-full cursor-grab flex-col items-center justify-center rounded-2xl border bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 text-slate-700 shadow-sm active:cursor-grabbing ${
        selected ? 'border-blue-400 ring-2 ring-blue-200' : 'border-slate-300'
      }`}
    >
      <div className="rounded-xl bg-white/80 p-2 text-slate-500 shadow-sm">
        <Box className="h-5 w-5" />
      </div>
      <div className="mt-2 text-center">
        <div className="text-xs font-semibold text-slate-700">{getCanvasModelDisplayName(data)}</div>
        <div className="text-[10px] text-slate-400">已包覆中间连接段</div>
      </div>
    </div>
  );
}

export const CanvasModelNode = memo(CanvasModelNodeImpl);

import { FileText, PenTool } from 'lucide-react';

export type DrawingMode = 'design' | 'production';

interface DrawingModeSwitchProps {
  mode: DrawingMode;
  onChange: (mode: DrawingMode) => void;
}

export function DrawingModeSwitch({ mode, onChange }: DrawingModeSwitchProps) {
  return (
    <div
      className="flex items-center rounded-lg border border-slate-600 bg-slate-800 p-0.5"
      aria-label="图纸视图切换"
    >
      <button
        type="button"
        onClick={() => onChange('design')}
        className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
          mode === 'design'
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-300 hover:bg-slate-700 hover:text-white'
        }`}
        aria-pressed={mode === 'design'}
      >
        <PenTool className="h-3.5 w-3.5" />
        设计图
      </button>
      <button
        type="button"
        onClick={() => onChange('production')}
        className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
          mode === 'production'
            ? 'bg-blue-500 text-white shadow-sm'
            : 'text-slate-300 hover:bg-slate-700 hover:text-white'
        }`}
        aria-pressed={mode === 'production'}
      >
        <FileText className="h-3.5 w-3.5" />
        成品图
      </button>
    </div>
  );
}

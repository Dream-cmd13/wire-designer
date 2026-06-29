import { Cable, Download, RotateCcw } from 'lucide-react';
import { useHarnessStore } from '@/stores/harnessStore';

export function Header() {
  const { config, resetConfig } = useHarnessStore();

  const handleExport = () => {
    const dataStr = JSON.stringify(config, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="h-14 bg-slate-900 text-white flex items-center justify-between px-4 border-b border-slate-700 shrink-0">
      <div className="flex items-center gap-2">
        <Cable className="w-6 h-6 text-blue-400" />
        <h1 className="text-lg font-bold">线束设计器</h1>
        <span className="text-xs text-slate-400 ml-2">v1.0</span>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={handleExport} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded transition-colors cursor-pointer">
          <Download className="w-4 h-4" />导出JSON
        </button>
        <button onClick={resetConfig} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded transition-colors cursor-pointer">
          <RotateCcw className="w-4 h-4" />重置
        </button>
      </div>
    </header>
  );
}

import { Eye, EyeOff, X } from 'lucide-react';
import type { DwgLayerInfo } from '@/lib/dwg/dwgTypes';

interface DwgLayerPanelProps {
  layers: DwgLayerInfo[];
  hiddenLayers: ReadonlySet<string>;
  onShowAll: () => void;
  onToggleLayer: (name: string) => void;
  onClose: () => void;
}

export function DwgLayerPanel({
  layers,
  hiddenLayers,
  onShowAll,
  onToggleLayer,
  onClose,
}: DwgLayerPanelProps) {
  return (
    <div
      data-dwg-overlay
      className="absolute right-3 top-3 z-10 w-60 overflow-hidden rounded-lg border border-slate-200 bg-white/95 shadow-lg"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <span className="text-xs font-semibold text-slate-700">图层</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="cursor-pointer rounded px-1.5 py-0.5 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={onShowAll}
            disabled={hiddenLayers.size === 0}
          >
            全部显示
          </button>
          <button
            type="button"
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            title="关闭"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <ul className="max-h-72 overflow-y-auto py-1">
        {layers.map((layer) => {
          const hidden = hiddenLayers.has(layer.name);
          return (
            <li key={layer.name}>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-slate-50"
                onClick={() => onToggleLayer(layer.name)}
                title={hidden ? '点击显示该图层' : '点击隐藏该图层'}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-sm border border-slate-300"
                  style={{ backgroundColor: layer.color }}
                />
                <span className={`flex-1 truncate ${hidden ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                  {layer.name}
                </span>
                {hidden
                  ? <EyeOff className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  : <Eye className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

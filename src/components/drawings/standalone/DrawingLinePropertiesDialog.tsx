import { useEffect, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { getDrawingPathLength, type DrawingLineAlignment, type DrawingLinePropertiesInput } from '@/lib/drawingLineProperties';
import type { DrawingLineObject } from '@/types/drawing';

interface Props {
  object: DrawingLineObject;
  defaultName: string;
  onConfirm: (values: DrawingLinePropertiesInput) => void;
  onClose: () => void;
}

export function DrawingLinePropertiesDialog({ object, defaultName, onConfirm, onClose }: Props) {
  const measuredLength = getDrawingPathLength(object.points);
  const [name, setName] = useState(object.name || defaultName);
  const [alignment, setAlignment] = useState<DrawingLineAlignment>('current');
  const [color, setColor] = useState(object.style.stroke);
  const [strokeWidth, setStrokeWidth] = useState(String(object.style.strokeWidth));
  const [length, setLength] = useState(measuredLength.toFixed(2));
  const isDot = object.points.length < 2 || measuredLength === 0;
  const valid = Boolean(name.trim()) && Number(strokeWidth) > 0 && (isDot || Number(length) > 0);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-[1px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form role="dialog" aria-modal="true" aria-labelledby="line-properties-title" onSubmit={(event) => {
      event.preventDefault();
      if (valid) onConfirm({ name: name.trim(), alignment, color, strokeWidth: Number(strokeWidth), length: isDot ? 0 : Number(length) });
    }} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><SlidersHorizontal className="h-5 w-5"/></div>
        <div className="min-w-0 flex-1">
          <h2 id="line-properties-title" className="text-base font-semibold text-slate-900">调整线属性</h2>
          <p className="mt-1 text-xs text-slate-500">修改名称与线条样式；长度和对齐以首点为基准。</p>
        </div>
        <button type="button" aria-label="关闭线属性窗口" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4"/></button>
      </div>

      <div className="mt-5 grid grid-cols-[5rem_1fr] items-center gap-x-3 gap-y-4 text-sm">
        <label htmlFor="line-name" className="font-medium text-slate-700">名称</label>
        <input id="line-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/>

        <label htmlFor="line-alignment" className="font-medium text-slate-700">对齐</label>
        <select id="line-alignment" value={alignment} onChange={(event) => setAlignment(event.target.value as DrawingLineAlignment)} disabled={isDot} className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100">
          <option value="current">保持当前角度</option><option value="horizontal">水平</option><option value="vertical">垂直</option>
        </select>

        <label htmlFor="line-color" className="font-medium text-slate-700">颜色</label>
        <div className="flex items-center gap-2"><input id="line-color" type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-white p-1"/><span className="font-mono text-xs text-slate-500">{color}</span></div>

        <label htmlFor="line-width" className="font-medium text-slate-700">粗细</label>
        <input id="line-width" type="number" min="1" step="1" value={strokeWidth} onChange={(event) => setStrokeWidth(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/>

        <label htmlFor="line-length" className="font-medium text-slate-700">长度</label>
        <input id="line-length" type="number" min="0.1" step="0.1" value={length} disabled={isDot} onChange={(event) => setLength(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"/>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">取消</button>
        <button type="submit" disabled={!valid} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">确定</button>
      </div>
    </form>
  </div>;
}

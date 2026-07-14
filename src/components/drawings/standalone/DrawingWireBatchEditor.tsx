import { useState } from 'react';
import type { DrawingWireBatch } from '@/lib/drawingGenerator';

export function DrawingWireBatchEditor({ onApply }: { onApply: (batch: DrawingWireBatch) => void }) {
  const [color, setColor] = useState('#111827');
  const [lengthMm, setLengthMm] = useState(300);
  const [prefix, setPrefix] = useState('WIRE-');
  const input = 'rounded border border-slate-300 px-2 py-1 text-xs';
  return <div className="flex flex-wrap items-end gap-2 rounded bg-slate-50 p-3">
    <label className="text-xs text-slate-600">统一颜色<input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="ml-2 h-8 w-10" /></label>
    <label className="text-xs text-slate-600">统一长度<input type="number" value={lengthMm} onChange={(event) => setLengthMm(Number(event.target.value))} className={`${input} ml-2 w-20`} /></label>
    <label className="text-xs text-slate-600">线号前缀<input value={prefix} onChange={(event) => setPrefix(event.target.value)} className={`${input} ml-2 w-24`} /></label>
    <button type="button" onClick={() => onApply({ color, lengthMm })} className="rounded border bg-white px-3 py-1.5 text-xs">批量属性</button>
    <button type="button" onClick={() => onApply({ wireNoPrefix: prefix, startNumber: 1 })} className="rounded border bg-white px-3 py-1.5 text-xs">递增线号</button>
    <button type="button" onClick={() => onApply({ connection: 'straight' })} className="rounded border bg-white px-3 py-1.5 text-xs">顺序接线</button>
    <button type="button" onClick={() => onApply({ connection: 'reverse' })} className="rounded border bg-white px-3 py-1.5 text-xs">反序接线</button>
  </div>;
}

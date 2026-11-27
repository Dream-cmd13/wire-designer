import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { WIRE_COLORS } from '@/data/catalogOptions';
import { createDrawingId, defaultDrawingObjectStyle } from '@/lib/drawingDocument';
import { getDrawingWireColorHex } from '@/lib/drawingGenerator';
import type { DrawingGroupObject, DrawingObject } from '@/types/drawing';

interface CrossWireRow {
  id: number;
  color: string;
  targetIndex: number;
}

interface DrawingCrossWireDialogProps {
  onClose: () => void;
  onConfirm: (object: DrawingGroupObject) => void;
}

function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="grid grid-cols-[52px_168px] items-center gap-3">
      <span className="text-right text-xs font-medium text-slate-700">{label}</span>
      <div className="inline-flex h-8 items-center overflow-hidden rounded-md border border-slate-200 bg-white">
        <button
          type="button"
          aria-label={`减少${label}`}
          onClick={() => onChange(Math.max(min, value - step))}
          className="flex h-full w-9 items-center justify-center border-r border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
        >
          -
        </button>
        <input
          aria-label={label}
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (Number.isFinite(parsed)) onChange(Math.min(max, Math.max(min, parsed)));
          }}
          className="h-full min-w-0 flex-1 text-center text-xs text-slate-800 outline-none"
        />
        <button
          type="button"
          aria-label={`增加${label}`}
          onClick={() => onChange(Math.min(max, value + step))}
          className="flex h-full w-9 items-center justify-center border-l border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function DrawingCrossWireDialog({ onClose, onConfirm }: DrawingCrossWireDialogProps) {
  const [length, setLength] = useState(600);
  const [strokeWidth, setStrokeWidth] = useState(10);
  const [spacing, setSpacing] = useState(10);
  const [nextRowId, setNextRowId] = useState(2);
  const [rows, setRows] = useState<CrossWireRow[]>([
    { id: 1, color: '黑色', targetIndex: 1 },
  ]);

  const colorOptions = WIRE_COLORS.map((item) => item.name);

  const addRow = () => {
    setRows((current) => [
      ...current,
      { id: nextRowId, color: colorOptions[current.length % colorOptions.length] ?? '黑色', targetIndex: current.length + 1 },
    ]);
    setNextRowId((id) => id + 1);
  };

  const removeRow = (id: number) => {
    setRows((current) => (current.length <= 1 ? current : current.filter((row) => row.id !== id)));
  };

  const handleConfirm = () => {
    const startX = 240;
    const startY = 220;
    const stepY = Math.max(4, strokeWidth + spacing);
    const totalHeight = Math.max(24, (rows.length - 1) * stepY + strokeWidth + 8);
    const children: DrawingObject[] = rows.map((row, index) => {
      const y1 = index * stepY + strokeWidth / 2;
      const targetSlot = Math.max(1, Math.min(rows.length, row.targetIndex)) - 1;
      const y2 = targetSlot * stepY + strokeWidth / 2;
      const stroke = getDrawingWireColorHex(row.color) ?? '#111827';
      const points = targetSlot === index
        ? [{ x: 0, y: y1 }, { x: length, y: y1 }]
        : [
            { x: 0, y: y1 },
            { x: length * 0.38, y: y1 },
            { x: length * 0.62, y: y2 },
            { x: length, y: y2 },
          ];
      return {
        id: createDrawingId('cross-wire-line'),
        kind: 'polyline',
        x: 0,
        y: Math.min(y1, y2),
        width: length,
        height: Math.max(1, Math.abs(y2 - y1)),
        rotation: 0,
        zIndex: index + 1,
        locked: false,
        visible: true,
        orthogonal: false,
        points,
        style: {
          ...defaultDrawingObjectStyle,
          stroke,
          strokeWidth: Math.max(1, strokeWidth),
        },
      };
    });

    onConfirm({
      id: createDrawingId('wire-bundle'),
      kind: 'group',
      groupKind: 'wire-bundle',
      x: startX,
      y: startY,
      width: length,
      height: totalHeight,
      rotation: 0,
      zIndex: 10,
      locked: false,
      visible: true,
      style: { ...defaultDrawingObjectStyle },
      children,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="生成交叉线"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h3 className="text-base font-medium text-slate-900">生成交叉线</h3>
          <button type="button" onClick={onClose} aria-label="关闭生成交叉线" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-2.5">
            <Stepper label="长度" value={length} min={40} max={1000} step={20} onChange={setLength} />
            <Stepper label="粗细" value={strokeWidth} min={1} max={30} onChange={setStrokeWidth} />
            <Stepper label="间距" value={spacing} min={0} max={80} onChange={setSpacing} />
          </div>

          <div className="max-h-60 space-y-2 overflow-y-auto pt-1">
            <div className="grid grid-cols-[44px_1fr_1fr_28px] items-center gap-2 text-center text-xs font-medium text-slate-600">
              <span />
              <span>颜色</span>
              <span>接线</span>
              <span />
            </div>

            {rows.map((row, index) => (
              <div key={row.id} className="grid grid-cols-[44px_1fr_1fr_28px] items-center gap-2">
                <span className="text-right text-xs text-slate-600">线{index + 1}</span>
                <select
                  aria-label={`线${index + 1}颜色`}
                  value={row.color}
                  onChange={(event) => setRows((current) => current.map((item) => (item.id === row.id ? { ...item, color: event.target.value } : item)))}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-blue-500"
                >
                  {colorOptions.map((color) => (
                    <option key={color} value={color}>{color}</option>
                  ))}
                </select>
                <select
                  aria-label={`线${index + 1}接线`}
                  value={row.targetIndex}
                  onChange={(event) => setRows((current) => current.map((item) => (item.id === row.id ? { ...item, targetIndex: Number(event.target.value) } : item)))}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-blue-500"
                >
                  {Array.from({ length: Math.max(rows.length, 4) }, (_, idx) => idx + 1).map((pin) => (
                    <option key={pin} value={pin}>{pin}</option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={`删除线${index + 1}`}
                  disabled={rows.length <= 1}
                  onClick={() => removeRow(row.id)}
                  className="flex h-7 w-7 items-center justify-center rounded text-blue-500 hover:bg-blue-50 disabled:opacity-35"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            <div className="flex justify-center pt-1">
              <button
                type="button"
                aria-label="添加一行交叉线"
                onClick={addRow}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-500 transition hover:bg-blue-100"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-md bg-blue-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
          >
            确定
          </button>
        </footer>
      </div>
    </div>
  );
}

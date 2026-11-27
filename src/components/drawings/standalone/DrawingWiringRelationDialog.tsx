import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { WIRE_COLORS } from '@/data/catalogOptions';
import { createDrawingId, defaultDrawingObjectStyle } from '@/lib/drawingDocument';
import { getDrawingWireColorHex } from '@/lib/drawingGenerator';
import type { DrawingGroupObject, DrawingObject } from '@/types/drawing';

interface RelationWire {
  pin: number;
  color: string;
  targetPin: number;
}

interface DrawingWiringRelationDialogProps {
  onClose: () => void;
  onConfirm: (object: DrawingGroupObject) => void;
}

function buildInitialWires(count: number): RelationWire[] {
  return Array.from({ length: count }, (_, idx) => ({
    pin: idx + 1,
    color: '黑色',
    targetPin: idx + 1,
  }));
}

export function DrawingWiringRelationDialog({ onClose, onConfirm }: DrawingWiringRelationDialogProps) {
  const [lineCount, setLineCount] = useState(4);
  const [wires, setWires] = useState<RelationWire[]>(() => buildInitialWires(4));
  // Stores start index (0-based) of each twisted pair (i, i+1)
  const [twistedStarts, setTwistedStarts] = useState<number[]>([]);

  const colorOptions = useMemo(() => WIRE_COLORS.map((item) => item.name), []);

  const changeLineCount = (nextCount: number) => {
    setLineCount(nextCount);
    setWires((current) => Array.from({ length: nextCount }, (_, idx) => (
      current[idx]
        ? { ...current[idx], pin: idx + 1, targetPin: Math.min(nextCount, current[idx].targetPin) }
        : { pin: idx + 1, color: '黑色', targetPin: idx + 1 }
    )));
    setTwistedStarts((current) => current.filter((start) => start + 1 < nextCount));
  };

  const toggleTwist = (rowIndex: number) => {
    if (rowIndex >= wires.length - 1) return;
    setTwistedStarts((current) => {
      if (current.includes(rowIndex)) {
        return current.filter((start) => start !== rowIndex);
      }
      // Cannot overlap with adjacent pairs (rowIndex - 1 or rowIndex + 1)
      if (current.includes(rowIndex - 1) || current.includes(rowIndex + 1)) {
        return current;
      }
      return [...current, rowIndex].sort((a, b) => a - b);
    });
  };

  const getPairLabel = (rowIndex: number) => {
    if (twistedStarts.includes(rowIndex)) return `${rowIndex + 1}-${rowIndex + 2} (已对绞)`;
    if (twistedStarts.includes(rowIndex - 1)) return `${rowIndex}-${rowIndex + 1} (已对绞)`;
    return '—';
  };

  const isRowTwisted = (rowIndex: number) => twistedStarts.includes(rowIndex) || twistedStarts.includes(rowIndex - 1);
  const canTwistWithNext = (rowIndex: number) => {
    if (rowIndex >= wires.length - 1) return false;
    if (twistedStarts.includes(rowIndex)) return true;
    return !twistedStarts.includes(rowIndex - 1) && !twistedStarts.includes(rowIndex + 1);
  };

  const handleInsert = () => {
    const startX = 160;
    const startY = 340;
    const rowStep = 24;
    const lineLeft = 56;
    const lineRight = 250;
    const totalWidth = 306;
    const totalHeight = 36 + wires.length * rowStep;

    const children: DrawingObject[] = [
      {
        id: createDrawingId('label'),
        kind: 'label',
        x: totalWidth / 2 - 24,
        y: 4,
        width: 64,
        height: 20,
        rotation: 0,
        zIndex: 1,
        locked: false,
        visible: true,
        text: '接线图',
        style: { ...defaultDrawingObjectStyle, fontSize: 13 },
      },
    ];

    wires.forEach((wire, index) => {
      const y1 = 34 + index * rowStep;
      const y2 = 34 + (wire.targetPin - 1) * rowStep;
      const stroke = getDrawingWireColorHex(wire.color) ?? '#111827';
      const shortColor = wire.color.replace(/色$/, '');

      children.push({
        id: createDrawingId('label'),
        kind: 'label',
        x: 4,
        y: y1 - 8,
        width: 48,
        height: 16,
        rotation: 0,
        zIndex: index * 3 + 2,
        locked: false,
        visible: true,
        text: `${shortColor} ${wire.pin}`,
        style: { ...defaultDrawingObjectStyle, fontSize: 11 },
      });

      children.push({
        id: createDrawingId('line'),
        kind: 'line',
        x: lineLeft,
        y: Math.min(y1, y2),
        width: Math.max(1, lineRight - lineLeft),
        height: Math.max(1, Math.abs(y2 - y1)),
        rotation: 0,
        zIndex: index * 3 + 3,
        locked: false,
        visible: true,
        orthogonal: false,
        points: [{ x: lineLeft, y: y1 }, { x: lineRight, y: y2 }],
        style: { ...defaultDrawingObjectStyle, stroke, strokeWidth: 2 },
      });

      children.push({
        id: createDrawingId('label'),
        kind: 'label',
        x: lineRight + 8,
        y: y2 - 8,
        width: 32,
        height: 16,
        rotation: 0,
        zIndex: index * 3 + 4,
        locked: false,
        visible: true,
        text: String(wire.targetPin),
        style: { ...defaultDrawingObjectStyle, fontSize: 11 },
      });
    });

    onConfirm({
      id: createDrawingId('wire-bundle'),
      kind: 'group',
      groupKind: 'wire-bundle',
      x: startX,
      y: startY,
      width: totalWidth,
      height: totalHeight,
      rotation: 0,
      zIndex: 10,
      locked: false,
      visible: true,
      style: { ...defaultDrawingObjectStyle },
      children,
    });
  };

  const svgHeight = Math.max(150, 44 + wires.length * 24);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="自定义接线关系"
    >
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h3 className="text-base font-medium text-slate-900">自定义接线关系</h3>
          <button type="button" onClick={onClose} aria-label="关闭自定义接线关系" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <label className="flex items-center gap-2">
              <span className="font-medium">线数</span>
              <select
                aria-label="线数"
                value={lineCount}
                onChange={(event) => changeLineCount(Number(event.target.value))}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs outline-none focus:border-blue-500"
              >
                {Array.from({ length: 15 }, (_, idx) => idx + 2).map((count) => (
                  <option key={count} value={count}>{count} 线</option>
                ))}
              </select>
            </label>
            <span className="text-slate-400">
              共 {wires.length} 条 · 对绞 {twistedStarts.length} 对 (相邻两条为一对)
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,1fr)]">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="w-10 px-2 py-2 text-center font-medium">#</th>
                    <th className="w-32 px-2 py-2 text-center font-medium">颜色</th>
                    <th className="w-24 px-2 py-2 text-center font-medium">操作</th>
                    <th className="w-24 px-2 py-2 text-center font-medium">右侧编号</th>
                    <th className="px-2 py-2 text-center font-medium">与谁对绞</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {wires.map((wire, index) => {
                    const hex = getDrawingWireColorHex(wire.color) ?? '#111827';
                    const twistedHere = isRowTwisted(index);
                    const buttonActive = twistedStarts.includes(index);
                    return (
                      <tr key={wire.pin} className="hover:bg-slate-50/60">
                        <td className="px-2 py-2 text-center">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 text-[11px] font-medium text-blue-600">
                            {wire.pin}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-xs border border-slate-300" style={{ backgroundColor: hex }} />
                            <select
                              aria-label={`第 ${wire.pin} 线颜色`}
                              value={wire.color}
                              onChange={(event) => setWires((current) => current.map((item, idx) => (idx === index ? { ...item, color: event.target.value } : item)))}
                              className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                            >
                              {colorOptions.map((color) => (
                                <option key={color} value={color}>{color}</option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-center">
                          {index < wires.length - 1 ? (
                            <button
                              type="button"
                              disabled={!canTwistWithNext(index)}
                              onClick={() => toggleTwist(index)}
                              className={`rounded border px-3 py-1 text-xs transition ${
                                buttonActive
                                  ? 'border-blue-500 bg-blue-50 text-blue-600'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 disabled:opacity-40'
                              }`}
                            >
                              {buttonActive ? '已对绞' : '对绞'}
                            </button>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <select
                            aria-label={`第 ${wire.pin} 线右侧编号`}
                            value={wire.targetPin}
                            onChange={(event) => setWires((current) => current.map((item, idx) => (idx === index ? { ...item, targetPin: Number(event.target.value) } : item)))}
                            className="w-16 rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-500"
                          >
                            {Array.from({ length: wires.length }, (_, idx) => idx + 1).map((pin) => (
                              <option key={pin} value={pin}>{pin}</option>
                            ))}
                          </select>
                        </td>
                        <td className={`px-2 py-2 text-center ${twistedHere ? 'font-medium text-blue-600' : 'text-slate-400'}`}>
                          {getPairLabel(index)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div className="mb-2 text-xs font-medium text-slate-600">实时预览</div>
              <div className="rounded-lg border border-slate-100 bg-white p-2">
                <svg viewBox={`0 0 320 ${svgHeight}`} className="w-full" aria-label="接线关系实时预览">
                  <text x="160" y="20" textAnchor="middle" fontSize="13" fontWeight="600" fill="#1e293b">接线图</text>
                  {wires.map((wire, index) => {
                    const y1 = 42 + index * 24;
                    const y2 = 42 + (wire.targetPin - 1) * 24;
                    const hex = getDrawingWireColorHex(wire.color) ?? '#111827';
                    const shortColor = wire.color.replace(/色$/, '');
                    return (
                      <g key={wire.pin}>
                        <text x="20" y={y1 + 4} fontSize="11" fill="#334155">{shortColor} {wire.pin}</text>
                        <line
                          x1="62"
                          y1={y1}
                          x2="262"
                          y2={y2}
                          stroke={hex === '#ffffff' ? '#64748b' : hex}
                          strokeWidth="2"
                        />
                        <text x="272" y={y2 + 4} fontSize="11" fill="#334155">{wire.targetPin}</text>
                      </g>
                    );
                  })}
                  {twistedStarts.map((startIdx) => {
                    const yMid = 42 + startIdx * 24 + 12;
                    return (
                      <path
                        key={`twist-${startIdx}`}
                        d={`M 135 ${yMid - 12} Q 148 ${yMid + 16} 162 ${yMid - 12} T 189 ${yMid - 12}`}
                        fill="none"
                        stroke="#2563eb"
                        strokeDasharray="3 2"
                        strokeWidth="1.2"
                      />
                    );
                  })}
                </svg>
              </div>
            </div>
          </div>

          <p className="mt-3 text-[11px] text-slate-400">
            点「对绞」即让这一条和下一条绞在一起(两条线都显示&quot;已对绞&quot;)，再点一次取消；相邻两对不能重叠。
          </p>
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
            onClick={handleInsert}
            className="rounded-md bg-blue-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
          >
            插入到画板
          </button>
        </footer>
      </div>
    </div>
  );
}

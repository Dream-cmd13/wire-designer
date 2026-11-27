import { useEffect, useRef, useState } from 'react';
import { ArrowUpFromLine, ChevronDown, Info, Magnet } from 'lucide-react';
import type { DrawingLineDash, DrawingToolMode } from '@/types/drawing';

export type DrawToolSettings = {
  stroke: string;
  strokeWidth: number;
  dash: DrawingLineDash;
  lineCount: number;
  snapEnabled: boolean;
};

interface DrawingDrawToolFloatingBarProps {
  toolMode: DrawingToolMode;
  orthogonal: boolean;
  settings: DrawToolSettings;
  onChangeSettings: (patch: Partial<DrawToolSettings>) => void;
  onToggleOrthogonal: () => void;
  onExit: () => void;
}

const PRESET_COLORS = [
  { name: '黑', hex: '#111827' },
  { name: '白', hex: '#d1d5db' },
  { name: '灰', hex: '#6b7280' },
  { name: '红', hex: '#ef4444' },
  { name: '黄', hex: '#facc15' },
  { name: '蓝', hex: '#2563eb' },
  { name: '橙', hex: '#f97316' },
  { name: '绿', hex: '#16a34a' },
  { name: '紫', hex: '#9333ea' },
] as const;

const DASH_OPTIONS: ReadonlyArray<{ value: DrawingLineDash; label: string; dashArray?: string }> = [
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线', dashArray: '6 4' },
  { value: 'dotted', label: '点线', dashArray: '2 3' },
  { value: 'dash-dot', label: '点划线', dashArray: '8 3 2 3' },
];

const MODE_LABELS: Record<Exclude<DrawingToolMode, 'select'>, string> = {
  line: '直线',
  polyline: '折线',
  curve: '曲线',
  freehand: '自由画笔',
};

export function DrawingDrawToolFloatingBar({
  toolMode,
  orthogonal,
  settings,
  onChangeSettings,
  onToggleOrthogonal,
  onExit,
}: DrawingDrawToolFloatingBarProps) {
  const [openMenu, setOpenMenu] = useState<'color' | 'width' | 'dash' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const handleOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('pointerdown', handleOutside);
    return () => window.removeEventListener('pointerdown', handleOutside);
  }, [openMenu]);

  if (toolMode === 'select') return null;

  const activeColorLabel = PRESET_COLORS.find((item) => item.hex.toLowerCase() === settings.stroke.toLowerCase())?.name ?? settings.stroke;
  const activeDashLabel = DASH_OPTIONS.find((item) => item.value === settings.dash)?.label ?? '实线';

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="绘制属性浮动栏"
      className="absolute left-1/2 top-2.5 z-30 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-lg"
    >
      <span className="text-xs font-semibold text-slate-800">{MODE_LABELS[toolMode]}</span>
      <span className="h-4 w-px bg-slate-200" />

      {/* 颜色 */}
      <div className="relative flex items-center gap-1.5 text-xs text-slate-600">
        <span>颜色</span>
        <button
          type="button"
          onClick={() => setOpenMenu((m) => (m === 'color' ? null : 'color'))}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 hover:border-blue-400"
        >
          <span className="h-3 w-3 rounded-xs border border-slate-300" style={{ backgroundColor: settings.stroke }} />
          <span>{activeColorLabel}</span>
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </button>
        {openMenu === 'color' && (
          <div className="absolute left-0 top-full z-40 mt-1.5 w-40 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {PRESET_COLORS.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => {
                    onChangeSettings({ stroke: item.hex });
                    setOpenMenu(null);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-xs hover:bg-blue-50 ${
                    settings.stroke.toLowerCase() === item.hex.toLowerCase() ? 'bg-blue-50 font-medium text-blue-600' : 'text-slate-700'
                  }`}
                >
                  <span className="h-3.5 w-12 rounded-xs border border-slate-200" style={{ backgroundColor: item.hex }} />
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
            <label className="mt-1.5 flex cursor-pointer items-center justify-between border-t border-slate-100 px-2 pt-1.5 text-xs text-slate-600">
              <span>其他颜色</span>
              <input
                type="color"
                aria-label="自定义绘制颜色"
                value={settings.stroke}
                onChange={(event) => onChangeSettings({ stroke: event.target.value })}
                className="h-5 w-6 cursor-pointer rounded border border-slate-200"
              />
            </label>
          </div>
        )}
      </div>

      {/* 线宽 */}
      <div className="relative flex items-center gap-1.5 text-xs text-slate-600">
        <span>线宽</span>
        <button
          type="button"
          onClick={() => setOpenMenu((m) => (m === 'width' ? null : 'width'))}
          className="inline-flex h-7 w-14 items-center justify-between rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 hover:border-blue-400"
        >
          <span>{settings.strokeWidth}</span>
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </button>
        {openMenu === 'width' && (
          <div className="absolute left-0 top-full z-40 mt-1.5 w-32 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => {
                  onChangeSettings({ strokeWidth: w });
                  setOpenMenu(null);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-xs hover:bg-blue-50 ${
                  settings.strokeWidth === w ? 'bg-blue-50 font-medium text-blue-600' : 'text-slate-700'
                }`}
              >
                <span className="h-0 flex-1 border-t border-slate-800" style={{ borderTopWidth: w }} />
                <span className="w-4 text-right">{w}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 线型 */}
      <div className="relative flex items-center gap-1.5 text-xs text-slate-600">
        <span>线型</span>
        <button
          type="button"
          onClick={() => setOpenMenu((m) => (m === 'dash' ? null : 'dash'))}
          className="inline-flex h-7 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:border-blue-400"
        >
          <span>{activeDashLabel}</span>
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </button>
        {openMenu === 'dash' && (
          <div className="absolute left-0 top-full z-40 mt-1.5 w-36 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
            {DASH_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChangeSettings({ dash: option.value });
                  setOpenMenu(null);
                }}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-blue-50 ${
                  settings.dash === option.value ? 'bg-blue-50 font-medium text-blue-600' : 'text-slate-700'
                }`}
              >
                <svg viewBox="0 0 36 8" className="h-2 w-9 shrink-0" aria-hidden="true">
                  <line x1="0" y1="4" x2="36" y2="4" stroke="currentColor" strokeWidth="1.6" strokeDasharray={option.dashArray} />
                </svg>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {toolMode === 'line' && (
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <span>线数量</span>
          <input
            aria-label="线数量"
            type="number"
            min={1}
            max={12}
            value={settings.lineCount}
            onChange={(event) => onChangeSettings({ lineCount: Math.max(1, Math.min(12, Number(event.target.value) || 1)) })}
            className="h-7 w-14 rounded-md border border-slate-200 px-2 text-center text-xs text-slate-700 outline-none focus:border-blue-500"
          />
        </label>
      )}

      {toolMode === 'curve' && (
        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] text-blue-600">
          <Info className="h-3 w-3" />绘制时按住 Shift 可画直线段
        </span>
      )}

      <span className="h-4 w-px bg-slate-200" />

      <button
        type="button"
        title="网格吸附"
        aria-label="网格吸附"
        aria-pressed={settings.snapEnabled}
        onClick={() => onChangeSettings({ snapEnabled: !settings.snapEnabled })}
        className={`flex h-7 w-7 items-center justify-center rounded-md border transition ${
          settings.snapEnabled
            ? 'border-blue-500 bg-blue-500 text-white'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        <Magnet className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        title="正交(Shift+Q)"
        aria-label="正交"
        aria-pressed={orthogonal}
        onClick={onToggleOrthogonal}
        className={`flex h-7 w-7 items-center justify-center rounded-md border transition ${
          orthogonal
            ? 'border-blue-500 bg-blue-50 text-blue-600'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        <ArrowUpFromLine className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={onExit}
        className="h-7 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50"
      >
        退出绘制
      </button>
    </div>
  );
}

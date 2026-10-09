import { useMemo, useState } from 'react';
import { Cable, Check, Search, X } from 'lucide-react';
import type { CatalogWire } from '@/types/catalog';

interface WirePickerModalProps {
  isOpen: boolean;
  wires: CatalogWire[];
  selectedResourceId: string;
  onSelect: (wire: CatalogWire) => void;
  onClose: () => void;
}

export function WirePickerModal({
  isOpen,
  wires,
  selectedResourceId,
  onSelect,
  onClose,
}: WirePickerModalProps) {
  const [keyword, setKeyword] = useState('');

  const filteredWires = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return wires;
    return wires.filter((w) => (
      w.name.toLowerCase().includes(q)
      || (w.model?.toLowerCase().includes(q) ?? false)
      || (w.spec.kind === 'jacketed' && (
        w.spec.jacketMaterial.toLowerCase().includes(q)
        || `${w.spec.coreCount}`.includes(q)
        || (w.spec.awg ? `${w.spec.awg}`.includes(q) : false)
      ))
    ));
  }, [keyword, wires]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="选择线材规格"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50/80">
          <div>
            <h2 className="text-base font-bold text-slate-900">选择线材规格</h2>
            <p className="text-xs text-slate-500 font-normal">从标准物料库中选择适合加工的工业线材</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 搜索栏 */}
        <div className="border-b border-slate-100 p-3 bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索线材名称、型号、芯数、AWG或外被材质..."
              className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[50vh]">
          {filteredWires.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              <Cable className="mx-auto h-8 w-8 text-slate-300 mb-2" />
              未找到符合条件的线材物料
            </div>
          ) : (
            filteredWires.map((wire) => {
              const selected = wire.resourceItemId === selectedResourceId;
              const s = wire.spec;
              const specSummary = s.kind === 'jacketed'
                ? `${s.ulNumber ?? ''} ${s.jacketMaterial} ${s.coreCount}芯 ${s.awg ? `${s.awg}AWG` : `${s.conductorAreaMm2 ?? ''}mm²`} ${s.shielded ? '屏蔽' : '非屏蔽'} ${s.jacketColor === 'black' ? '黑色' : '绿色'} OD${s.outerDiameterMm ?? '-'}mm`
                : `UL1007 电子线 ${s.awg}AWG ${s.color}`;

              return (
                <div
                  key={wire.resourceItemId}
                  onClick={() => {
                    onSelect(wire);
                    onClose();
                  }}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition ${
                    selected
                      ? 'border-blue-500 bg-blue-50/70 shadow-xs'
                      : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {wire.image ? (
                      <img
                        src={wire.image}
                        alt={wire.name}
                        className="h-12 w-12 shrink-0 rounded-md border border-slate-200 bg-white object-contain p-1"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                        <Cable className="h-6 w-6" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800 truncate">
                          {wire.name}
                        </span>
                        {s.kind === 'jacketed' && s.shielded && (
                          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                            屏蔽
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 truncate">
                        {specSummary}
                      </p>
                      {wire.model && (
                        <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                          型号: {wire.model}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 pl-3">
                    {selected ? (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
                        <Check className="h-4 w-4" />
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-blue-600 font-medium hover:underline"
                      >
                        选择
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 底部 */}
        <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

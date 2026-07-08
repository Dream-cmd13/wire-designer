import { useState, useEffect, useRef } from 'react';
import { OVERMOLDS } from '@/lib/data';
import type { OvermoldSpec } from '@/types/harness';
import { Search, X, Filter, Check } from 'lucide-react';

interface OvermoldPickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (overmold: OvermoldSpec) => void;
  currentOvermoldId?: string;
}

type FilterKey = 'outerMaterial' | 'outerHardness' | 'innerMaterial';

export function OvermoldPickerDialog({ isOpen, onClose, onSelect, currentOvermoldId }: OvermoldPickerDialogProps) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<FilterKey, Set<string>>>({
    outerMaterial: new Set(),
    outerHardness: new Set(),
    innerMaterial: new Set(),
  });
  const [selectedId, setSelectedId] = useState<string | null>(currentOvermoldId || null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const prevOpen = useRef(isOpen);
  useEffect(() => {
    const justOpened = isOpen && !prevOpen.current;
    prevOpen.current = isOpen;
    if (justOpened) {
      setTimeout(() => searchRef.current?.focus(), 50);
      setSelectedId(currentOvermoldId || null);
      setSearch('');
    }
  }, [isOpen, currentOvermoldId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const outerMaterials = [...new Set(OVERMOLDS.map((o) => o.outerMaterial))].sort();
  const outerHardnesses = [...new Set(OVERMOLDS.filter((o) => o.outerHardness).map((o) => o.outerHardness!))].sort();
  const innerMaterials = [...new Set(OVERMOLDS.map((o) => o.innerMaterial))].sort();

  let results = OVERMOLDS;
  if (search.trim()) {
    const q = search.toLowerCase();
    results = results.filter((o) => o.name.toLowerCase().includes(q) || o.outerMaterial.toLowerCase().includes(q) || o.innerMaterial.toLowerCase().includes(q));
  }
  if (filters.outerMaterial.size > 0) results = results.filter((o) => filters.outerMaterial.has(o.outerMaterial));
  if (filters.outerHardness.size > 0) results = results.filter((o) => o.outerHardness && filters.outerHardness.has(o.outerHardness));
  if (filters.innerMaterial.size > 0) results = results.filter((o) => filters.innerMaterial.has(o.innerMaterial));

  const toggleFilter = (key: FilterKey, value: string) => {
    setFilters((prev) => {
      const next = new Set(prev[key]);
      if (next.has(value)) next.delete(value); else next.add(value);
      return { ...prev, [key]: next };
    });
  };

  const clearFilters = () => {
    setFilters({ outerMaterial: new Set(), outerHardness: new Set(), innerMaterial: new Set() });
    setSearch('');
  };

  const hasActiveFilters = search.trim() !== '' || filters.outerMaterial.size > 0 || filters.outerHardness.size > 0 || filters.innerMaterial.size > 0;
  const selectedOvermold = OVERMOLDS.find((o) => o.id === selectedId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div ref={dialogRef} className="bg-white rounded-xl shadow-2xl border border-slate-200 w-[680px] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">选择外模规格</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded cursor-pointer" aria-label="关闭">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input ref={searchRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索外模名称或材质..." className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-44 border-r border-slate-100 p-3 space-y-3 overflow-y-auto shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                <Filter className="w-3 h-3" /> 筛选
              </span>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-[10px] text-amber-500 hover:text-amber-700 cursor-pointer">清除</button>
              )}
            </div>
            <FilterGroup label="外模材质" options={outerMaterials} selected={filters.outerMaterial} onToggle={(v) => toggleFilter('outerMaterial', v)} />
            <FilterGroup label="外模硬度" options={outerHardnesses} selected={filters.outerHardness} onToggle={(v) => toggleFilter('outerHardness', v)} />
            <FilterGroup label="内模材质" options={innerMaterials} selected={filters.innerMaterial} onToggle={(v) => toggleFilter('innerMaterial', v)} />
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {results.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">
                <p>没有匹配的外模</p>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="text-amber-500 hover:text-amber-700 mt-1 cursor-pointer text-xs">清除筛选条件</button>
                )}
              </div>
            ) : (
              results.map((o) => (
                <button key={o.id} onClick={() => setSelectedId(o.id)} onDoubleClick={() => { onSelect(o); onClose(); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left cursor-pointer transition-colors ${
                    selectedId === o.id ? 'bg-amber-50 border border-amber-200' : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">{o.name}</span>
                      {selectedId === o.id && <Check className="w-4 h-4 text-amber-500 shrink-0" />}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      外模：{o.outerMaterial}{o.outerHardness ? ` 硬度${o.outerHardness}` : ''} · 内模：{o.innerMaterial}{o.innerMaterialOptional ? '（可选）' : ''}
                    </div>
                  </div>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded shrink-0">{o.id}</span>
                </button>
              ))
            )}
          </div>

          {selectedOvermold && (
            <div className="w-52 border-l border-slate-100 p-3 overflow-y-auto shrink-0">
              <h3 className="text-xs font-semibold text-slate-700 mb-2">详情</h3>
              <div className="space-y-1.5 text-xs">
                <div><span className="text-slate-400">名称：</span><span className="text-slate-700">{selectedOvermold.name}</span></div>
                <div><span className="text-slate-400">外模材质：</span><span className="text-slate-700">{selectedOvermold.outerMaterial}</span></div>
                {selectedOvermold.outerHardness && <div><span className="text-slate-400">外模硬度：</span><span className="text-slate-700">{selectedOvermold.outerHardness}</span></div>}
                <div><span className="text-slate-400">内模材质：</span><span className="text-slate-700">{selectedOvermold.innerMaterial}</span></div>
                {selectedOvermold.innerMaterialOptional && <div className="text-slate-400 italic">内模可选（无需内模亦可）</div>}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-400">共 {OVERMOLDS.length} 个规格{hasActiveFilters && ` · ${results.length} 个匹配`}</div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded cursor-pointer">取消</button>
            <button onClick={() => { if (selectedOvermold) { onSelect(selectedOvermold); onClose(); } }}
              disabled={!selectedOvermold}
              className="px-4 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              选择
            </button>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  );
}

function FilterGroup({ label, options, selected, onToggle }: {
  label: string; options: string[]; selected: Set<string>; onToggle: (value: string) => void;
}) {
  if (options.length <= 1) return null;
  return (
    <div>
      <div className="text-[10px] font-medium text-slate-400 mb-1">{label}</div>
      <div className="space-y-0.5 max-h-24 overflow-y-auto">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer hover:text-slate-800">
            <input type="checkbox" checked={selected.has(opt)} onChange={() => onToggle(opt)} className="rounded w-3 h-3" />
            {opt}
          </label>
        ))}
      </div>
    </div>
  );
}

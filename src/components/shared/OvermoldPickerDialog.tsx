import { useState, useEffect, useRef } from 'react';
import { useCatalogStore } from '@/stores/catalogStore';
import { getCatalogOvermolds } from '@/lib/catalogRuntime';
import type { OvermoldSelection } from '@/types/harness';
import {
  formatOvermoldForm,
  formatOvermoldFullSpec,
  formatOvermoldOuterLabel,
  getAvailableInnerMold,
} from '@/lib/overmoldSpec';
import { Search, X, Filter, Check } from 'lucide-react';

interface OvermoldPickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selection: OvermoldSelection) => void;
  currentOvermoldId?: string;
  currentIncludeInnerMold?: boolean;
}

type FilterKey = 'outerMaterial' | 'outerForm';

const FIXED_OUTER_MATERIALS = ['黑色PVC 45P', '黑色TPE'];
const FIXED_OUTER_FORMS = ['直头', '弯头'];

export function OvermoldPickerDialog({
  isOpen,
  onClose,
  onSelect,
  currentOvermoldId,
  currentIncludeInnerMold = false,
}: OvermoldPickerDialogProps) {
  const overmolds = useCatalogStore((state) => getCatalogOvermolds(state.snapshot));
  const catalogStatus = useCatalogStore((state) => state.status);
  const initializeCatalog = useCatalogStore((state) => state.initialize);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<FilterKey, Set<string>>>({
    outerMaterial: new Set(),
    outerForm: new Set(),
  });
  const [selectedId, setSelectedId] = useState<string | null>(currentOvermoldId || null);
  const [includeInnerMold, setIncludeInnerMold] = useState<boolean>(currentIncludeInnerMold);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const prevOpen = useRef(isOpen);
  useEffect(() => {
    if (isOpen && catalogStatus === 'idle') {
      void initializeCatalog().catch(() => undefined);
    }
  }, [isOpen, catalogStatus, initializeCatalog]);

  useEffect(() => {
    const justOpened = isOpen && !prevOpen.current;
    prevOpen.current = isOpen;
    if (justOpened) {
      setTimeout(() => searchRef.current?.focus(), 50);
      setSelectedId(currentOvermoldId || null);
      setIncludeInnerMold(currentIncludeInnerMold);
      setSearch('');
    }
  }, [isOpen, currentOvermoldId, currentIncludeInnerMold]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  let results = overmolds;
  if (search.trim()) {
    const q = search.toLowerCase();
    results = results.filter((o) => {
      const outerLabel = formatOvermoldOuterLabel(o).toLowerCase();
      const formLabel = formatOvermoldForm(o.outerForm).toLowerCase();
      return (
        o.name.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        outerLabel.includes(q) ||
        formLabel.includes(q)
      );
    });
  }

  if (filters.outerMaterial.size > 0) {
    results = results.filter((o) => {
      const label = formatOvermoldOuterLabel(o);
      return filters.outerMaterial.has(label);
    });
  }

  if (filters.outerForm.size > 0) {
    results = results.filter((o) => {
      const formLabel = formatOvermoldForm(o.outerForm);
      return filters.outerForm.has(formLabel);
    });
  }

  const toggleFilter = (key: FilterKey, value: string) => {
    setFilters((prev) => {
      const next = new Set(prev[key]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [key]: next };
    });
  };

  const clearFilters = () => {
    setFilters({ outerMaterial: new Set(), outerForm: new Set() });
    setSearch('');
  };

  const hasActiveFilters = search.trim() !== '' || filters.outerMaterial.size > 0 || filters.outerForm.size > 0;
  const selectedOvermold = results.find((o) => o.id === selectedId);
  const availableInnerMold = getAvailableInnerMold(selectedOvermold);

  const handleConfirm = () => {
    if (!selectedOvermold) return;
    onSelect({
      overmold: selectedOvermold,
      includeInnerMold: Boolean(availableInnerMold && includeInnerMold),
    });
    onClose();
  };

  const handleSelectId = (id: string) => {
    if (selectedId !== id) {
      setSelectedId(id);
      setIncludeInnerMold(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        ref={dialogRef}
        className="bg-white rounded-xl shadow-2xl border border-slate-200 w-[680px] max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">选择外模规格</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded cursor-pointer" aria-label="关闭">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索外模名称或材质、外型..."
              className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-44 border-r border-slate-100 p-3 space-y-3 overflow-y-auto shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                <Filter className="w-3 h-3" /> 筛选
              </span>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-[10px] text-amber-500 hover:text-amber-700 cursor-pointer"
                >
                  清除
                </button>
              )}
            </div>
            <FilterGroup
              label="外模材质"
              options={FIXED_OUTER_MATERIALS}
              selected={filters.outerMaterial}
              onToggle={(v) => toggleFilter('outerMaterial', v)}
            />
            <FilterGroup
              label="外型"
              options={FIXED_OUTER_FORMS}
              selected={filters.outerForm}
              onToggle={(v) => toggleFilter('outerForm', v)}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {results.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">
                <p>
                  {catalogStatus === 'loading' && overmolds.length === 0
                    ? '正在加载外模...'
                    : '没有匹配的外模'}
                </p>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="text-amber-500 hover:text-amber-700 mt-1 cursor-pointer text-xs"
                  >
                    清除筛选条件
                  </button>
                )}
              </div>
            ) : (
              results.map((o) => (
                <button
                  key={o.id}
                  onClick={() => handleSelectId(o.id)}
                  onDoubleClick={() => {
                    const nextIncludeInnerMold = selectedId === o.id ? includeInnerMold : false;
                    handleSelectId(o.id);
                    onSelect({
                      overmold: o,
                      includeInnerMold: Boolean(getAvailableInnerMold(o) && nextIncludeInnerMold),
                    });
                    onClose();
                  }}
                  className={`w-full px-3 py-2.5 rounded-lg text-left cursor-pointer transition-colors ${
                    selectedId === o.id
                      ? 'bg-amber-50 border border-amber-200'
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 text-sm font-medium text-slate-800">{o.name}</span>
                      {selectedId === o.id && <Check className="w-4 h-4 text-amber-500 shrink-0" />}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="min-w-0 text-xs text-slate-500">
                        外模：{formatOvermoldFullSpec(o)}
                      </span>
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                        {o.id}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {selectedOvermold ? (
            <div className="w-56 border-l border-slate-100 p-3 overflow-y-auto shrink-0 flex flex-col justify-between">
              <div className="space-y-3 text-xs">
                <div>
                  <h3 className="font-semibold text-slate-700 mb-1.5">外模规格</h3>
                  <div className="space-y-1 text-slate-600">
                    <div>
                      <span className="text-slate-400">名称：</span>
                      <span>{selectedOvermold.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">材质：</span>
                      <span>{formatOvermoldOuterLabel(selectedOvermold)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">外型：</span>
                      <span>{formatOvermoldForm(selectedOvermold.outerForm)}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-2">
                  <h3 className="font-semibold text-slate-700 mb-1.5">内模规格</h3>
                  {availableInnerMold ? (
                    <div className="space-y-1 text-slate-600">
                      <div>
                        <span className="text-slate-400">材质：</span>
                        <span>{availableInnerMold.material}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">外型：</span>
                        <span>{availableInnerMold.formLabel}（与外模一致）</span>
                      </div>
                      <label className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 text-xs font-medium text-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={includeInnerMold}
                          onChange={(e) => setIncludeInnerMold(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                        包含内模
                      </label>
                    </div>
                  ) : (
                    <div className="text-slate-400 italic">该规格无可用内模</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="w-56 border-l border-slate-100 p-3 overflow-y-auto shrink-0 flex items-center justify-center text-xs text-slate-400 text-center">
              请先在列表中选择一个外模规格
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            共 {overmolds.length} 个规格{hasActiveFilters && ` · ${results.length} 个匹配`}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
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

function FilterGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-medium text-slate-400 mb-1">{label}</div>
      <div className="space-y-0.5 max-h-24 overflow-y-auto">
        {options.map((opt) => (
          <label
            key={opt}
            className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer hover:text-slate-800"
          >
            <input
              type="checkbox"
              checked={selected.has(opt)}
              onChange={() => onToggle(opt)}
              className="rounded w-3 h-3"
            />
            {opt}
          </label>
        ))}
      </div>
    </div>
  );
}

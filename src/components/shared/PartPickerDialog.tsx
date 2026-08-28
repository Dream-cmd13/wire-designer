import { useState, useEffect, useRef } from 'react';
import { useCatalogStore } from '@/stores/catalogStore';
import { getCatalogConnectors } from '@/lib/catalogRuntime';
import type { Connector } from '@/types/harness';
import { Search, X, Filter, Check } from 'lucide-react';

interface PartPickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (connector: Connector) => void;
  currentConnectorId?: string;
}

type FilterKey = 'manufacturer' | 'series' | 'shielded' | 'pinCount' | 'pitch' | 'type' | 'housingMaterial' | 'contactMaterial' | 'nutMaterial';

export function PartPickerDialog({ isOpen, onClose, onSelect, currentConnectorId }: PartPickerDialogProps) {
  const connectors = useCatalogStore((state) => getCatalogConnectors(state.snapshot));
  const catalogStatus = useCatalogStore((state) => state.status);
  const initializeCatalog = useCatalogStore((state) => state.initialize);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<FilterKey, Set<string>>>({
    manufacturer: new Set(),
    series: new Set(),
    shielded: new Set(),
    pinCount: new Set(),
    pitch: new Set(),
    type: new Set(),
    housingMaterial: new Set(),
    contactMaterial: new Set(),
    nutMaterial: new Set(),
  });
  const [selectedId, setSelectedId] = useState<string | null>(currentConnectorId || null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Track previous isOpen to detect transitions
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
      if (searchRef.current) {
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      setSelectedId(currentConnectorId || null);
      setSearch('');
    }
  }, [isOpen, currentConnectorId]);

  // Esc to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Trap focus
  useEffect(() => {
    if (!isOpen) return;
    const handleTab = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'input, button, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleTab);
    return () => window.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  if (!isOpen) return null;

  // Extract filter options
  const manufacturers = [...new Set(connectors.map((c) => c.manufacturer))].filter(Boolean).sort();
  const seriesOptions = [...new Set(connectors.map((c) => c.series).filter(Boolean))].sort() as string[];
  const shieldOptions = ['已屏蔽', '未屏蔽'];
  const pinCounts = [...new Set(connectors.map((c) => c.pinCount))].sort((a, b) => a - b);
  const pitches = [...new Set(connectors.filter((c) => c.pitch).map((c) => c.pitch!))].sort((a, b) => a - b);
  const types = [...new Set(connectors.map((c) => c.type))] as string[];
  const housingMaterials = [...new Set(connectors.filter((c) => c.housingMaterial).map((c) => c.housingMaterial!))].sort();
  const contactMaterials = [...new Set(connectors.filter((c) => c.contactMaterial).map((c) => c.contactMaterial!))].sort();
  const nutMaterials = [...new Set(connectors.filter((c) => c.nutMaterial).map((c) => c.nutMaterial!))].sort();

  // Apply filters
  let results = connectors;
  if (search.trim()) {
    const q = search.toLowerCase();
    results = results.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.model?.toLowerCase().includes(q) ||
        c.series?.toLowerCase().includes(q) ||
        c.manufacturer.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
    );
  }
  if (filters.manufacturer.size > 0) {
    results = results.filter((c) => filters.manufacturer.has(c.manufacturer));
  }
  if (filters.series.size > 0) {
    results = results.filter((c) => c.series && filters.series.has(c.series));
  }
  if (filters.shielded.size > 0) {
    results = results.filter((c) => {
      const shieldLabel = c.shielded === true
        ? '已屏蔽'
        : c.shielded === false
          ? '未屏蔽'
          : null;
      return shieldLabel !== null && filters.shielded.has(shieldLabel);
    });
  }
  if (filters.pinCount.size > 0) {
    results = results.filter((c) => filters.pinCount.has(String(c.pinCount)));
  }
  if (filters.pitch.size > 0) {
    results = results.filter((c) => filters.pitch.has(String(c.pitch || 0)));
  }
  if (filters.type.size > 0) {
    results = results.filter((c) => filters.type.has(c.type));
  }
  if (filters.housingMaterial.size > 0) {
    results = results.filter((c) => c.housingMaterial && filters.housingMaterial.has(c.housingMaterial));
  }
  if (filters.contactMaterial.size > 0) {
    results = results.filter((c) => c.contactMaterial && filters.contactMaterial.has(c.contactMaterial));
  }
  if (filters.nutMaterial.size > 0) {
    results = results.filter((c) => c.nutMaterial && filters.nutMaterial.has(c.nutMaterial));
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
    setFilters({
      manufacturer: new Set(), series: new Set(), shielded: new Set(), pinCount: new Set(), pitch: new Set(), type: new Set(),
      housingMaterial: new Set(), contactMaterial: new Set(), nutMaterial: new Set(),
    });
    setSearch('');
  };

  const hasActiveFilters = search.trim() !== '' ||
    filters.manufacturer.size > 0 || filters.series.size > 0 || filters.shielded.size > 0 ||
    filters.pinCount.size > 0 || filters.pitch.size > 0 || filters.type.size > 0 ||
    filters.housingMaterial.size > 0 || filters.contactMaterial.size > 0 || filters.nutMaterial.size > 0;

  const selectedConnector = connectors.find((c) => c.id === selectedId);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
      <div
        ref={dialogRef}
        className="bg-white rounded-xl shadow-2xl border border-slate-200 w-[780px] max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">选择连接器型号</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded cursor-pointer"
            aria-label="关闭"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索名称、型号、系列、制造商或 ID..."
              className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Filters sidebar */}
          <div className="w-44 border-r border-slate-100 p-3 space-y-3 overflow-y-auto shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                <Filter className="w-3 h-3" /> 筛选
              </span>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-[10px] text-blue-500 hover:text-blue-700 cursor-pointer"
                >
                  清除
                </button>
              )}
            </div>

            <FilterGroup label="系列" options={seriesOptions} selected={filters.series} onToggle={(v) => toggleFilter('series', v)} />
            <FilterGroup label="屏蔽状态" options={shieldOptions} selected={filters.shielded} onToggle={(v) => toggleFilter('shielded', v)} />
            <FilterGroup label="制造商" options={manufacturers} selected={filters.manufacturer} onToggle={(v) => toggleFilter('manufacturer', v)} />
            <FilterGroup label="Pin 数" options={pinCounts.map(String)} selected={filters.pinCount} onToggle={(v) => toggleFilter('pinCount', v)} />
            <FilterGroup label="间距 (mm)" options={pitches.map(String)} selected={filters.pitch} onToggle={(v) => toggleFilter('pitch', v)} />
            <FilterGroup label="类型" options={types} selected={filters.type} onToggle={(v) => toggleFilter('type', v)} />
            <FilterGroup label="外壳材质" options={housingMaterials} selected={filters.housingMaterial} onToggle={(v) => toggleFilter('housingMaterial', v)} />
            <FilterGroup label="接触件材质" options={contactMaterials} selected={filters.contactMaterial} onToggle={(v) => toggleFilter('contactMaterial', v)} />
            <FilterGroup label="螺母材质" options={nutMaterials} selected={filters.nutMaterial} onToggle={(v) => toggleFilter('nutMaterial', v)} />
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {results.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">
                <p>{catalogStatus === 'loading' && connectors.length === 0 ? '正在加载连接器...' : '没有匹配的连接器'}</p>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="text-blue-500 hover:text-blue-700 mt-1 cursor-pointer text-xs">
                    清除筛选条件
                  </button>
                )}
              </div>
            ) : (
              results.map((conn) => (
                <button
                  key={conn.id}
                  onClick={() => setSelectedId(conn.id)}
                  onDoubleClick={() => { onSelect(conn); onClose(); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left cursor-pointer transition-colors ${
                    selectedId === conn.id
                      ? 'bg-blue-50 border border-blue-200'
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">{conn.name}</span>
                      {selectedId === conn.id && <Check className="w-4 h-4 text-blue-500 shrink-0" />}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {conn.manufacturer} · {conn.model || conn.id} · {conn.pinCount}P
                      {conn.pitch && ` · ${conn.pitch}mm`} · {conn.type === 'male' ? '公头' : conn.type === 'female' ? '母头' : conn.type}
                      {conn.shielded !== undefined && (conn.shielded ? ' · 已屏蔽' : ' · 未屏蔽')}
                      {conn.series && ` · ${conn.series}`}
                    </div>
                  </div>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded shrink-0">
                    {conn.model || conn.id}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Detail preview */}
          {selectedConnector && (
            <div className="w-56 border-l border-slate-100 p-3 overflow-y-auto shrink-0">
              <h3 className="text-xs font-semibold text-slate-700 mb-1.5">基本信息</h3>
              <div className="space-y-1 text-xs">
                <div><span className="text-slate-400">名称：</span><span className="text-slate-700">{selectedConnector.name}</span></div>
                <div><span className="text-slate-400">型号：</span><span className="text-slate-700 font-medium">{selectedConnector.model || selectedConnector.id}</span></div>
                <div><span className="text-slate-400">制造商：</span><span className="text-slate-700">{selectedConnector.manufacturer}</span></div>
                {selectedConnector.series && <div><span className="text-slate-400">系列：</span><span className="text-slate-700">{selectedConnector.series}</span></div>}
                <div><span className="text-slate-400">PIN 数：</span><span className="text-slate-700">{selectedConnector.pinCount}P</span></div>
                {selectedConnector.rowCount && <div><span className="text-slate-400">排数：</span><span className="text-slate-700">{selectedConnector.rowCount}排</span></div>}
                <div><span className="text-slate-400">间距：</span><span className="text-slate-700">{selectedConnector.pitch ? `${selectedConnector.pitch}mm` : '-'}</span></div>
                <div><span className="text-slate-400">类型：</span><span className="text-slate-700">{selectedConnector.type === 'male' ? '公头' : selectedConnector.type === 'female' ? '母头' : selectedConnector.type}</span></div>
              </div>

              <h3 className="text-xs font-semibold text-slate-700 mt-3 mb-1.5">工程与电气规格</h3>
              <div className="space-y-1 text-xs">
                {selectedConnector.shielded !== undefined && (
                  <div><span className="text-slate-400">屏蔽：</span><span className="text-slate-700">{selectedConnector.shielded ? '已屏蔽' : '未屏蔽'}</span></div>
                )}
                {selectedConnector.ratedVoltageV !== undefined && (
                  <div><span className="text-slate-400">额定电压：</span><span className="text-slate-700">{selectedConnector.ratedVoltageV}V</span></div>
                )}
                {selectedConnector.ratedCurrentA !== undefined && (
                  <div><span className="text-slate-400">额定电流：</span><span className="text-slate-700">{selectedConnector.ratedCurrentA}A</span></div>
                )}
                {selectedConnector.temperatureRangeC && (
                  <div>
                    <span className="text-slate-400">温度范围：</span>
                    <span className="text-slate-700">
                      {selectedConnector.temperatureRangeC.min !== undefined && selectedConnector.temperatureRangeC.max !== undefined
                        ? `${selectedConnector.temperatureRangeC.min} ~ ${selectedConnector.temperatureRangeC.max} ℃`
                        : selectedConnector.temperatureRangeC.max !== undefined
                          ? `≤ ${selectedConnector.temperatureRangeC.max} ℃`
                          : `≥ ${selectedConnector.temperatureRangeC.min} ℃`}
                    </span>
                  </div>
                )}
                {selectedConnector.ingressProtection && (
                  <div><span className="text-slate-400">防水等级：</span><span className="text-slate-700">{selectedConnector.ingressProtection}</span></div>
                )}
                {selectedConnector.flammabilityRating && (
                  <div><span className="text-slate-400">阻燃等级：</span><span className="text-slate-700">{selectedConnector.flammabilityRating}</span></div>
                )}
                {selectedConnector.matingCyclesMin !== undefined && (
                  <div><span className="text-slate-400">插拔次数：</span><span className="text-slate-700">≥ {selectedConnector.matingCyclesMin} 次</span></div>
                )}
                {selectedConnector.housingMaterial && <div><span className="text-slate-400">外壳材质：</span><span className="text-slate-700">{selectedConnector.housingMaterial}</span></div>}
                {selectedConnector.contactMaterial && <div><span className="text-slate-400">接触件材质：</span><span className="text-slate-700">{selectedConnector.contactMaterial}</span></div>}
                {selectedConnector.nutMaterial && <div><span className="text-slate-400">螺母材质：</span><span className="text-slate-700">{selectedConnector.nutMaterial}</span></div>}
              </div>

              {selectedConnector.pinLabels && selectedConnector.pinLabels.length > 0 && (
                <>
                  <h4 className="text-xs font-semibold text-slate-600 mt-3 mb-1">PIN 定义</h4>
                  <div className="space-y-0.5 max-h-28 overflow-y-auto">
                    {selectedConnector.pinLabels.map((label, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[10px]">
                        <span className="text-slate-400 w-8 shrink-0">Pin{i + 1}</span>
                        <span className="text-slate-600">{label || '-'}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            共 {connectors.length} 个型号{hasActiveFilters && ` · ${results.length} 个匹配`}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={() => {
                if (selectedConnector) {
                  onSelect(selectedConnector);
                  onClose();
                }
              }}
              disabled={!selectedConnector}
              className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              选择
            </button>
          </div>
        </div>
      </div>

      {/* Backdrop click to close */}
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  );
}

function FilterGroup({ label, options, selected, onToggle }: {
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

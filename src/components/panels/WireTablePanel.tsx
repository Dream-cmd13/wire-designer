import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useHarnessStore } from '@/stores/harnessStore';
import { WIRE_COLORS, WIRE_GAUGES, WIRE_TYPES } from '@/lib/data';
import type { Wire } from '@/types/harness';
import {
  ArrowUpDown, Search, Filter, X, Edit3, Trash2, Check,
  Cable, Download, ChevronDown,
} from 'lucide-react';

type SortKey =
  | 'name'
  | 'fromConnector'
  | 'fromPin'
  | 'signalName'
  | 'wireGauge'
  | 'wireColor'
  | 'wireType'
  | 'lengthMm'
  | 'toPin'
  | 'toConnector';

type SortDir = 'asc' | 'desc';

interface SortState {
  key: SortKey;
  dir: SortDir;
}

/**
 * WireTablePanel - comprehensive wiring table view.
 * Engineers can see all wires in an Excel-like table:
 * A端PIN -> B端PIN -> color -> gauge -> signal name
 */
export function WireTablePanel() {
  const { config, setSelectedWire, setSelectedNode, updateWire, removeWire } = useHarnessStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' });
  const [colorFilter, setColorFilter] = useState<string>('');
  const [gaugeFilter, setGaugeFilter] = useState<number | ''>('');
  const [signalFilter, setSignalFilter] = useState('');
  const [editingWireId, setEditingWireId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    if (exportOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportOpen]);

  const getNodeLabel = useCallback((nodeId: string) => {
    const node = config.nodes.find((n) => n.id === nodeId);
    return node?.label || nodeId;
  }, [config.nodes]);

  const getNodeConnector = (nodeId: string) => {
    const node = config.nodes.find((n) => n.id === nodeId);
    return node?.connector;
  };

  const getWireColorHex = (colorId: string) => {
    const color = WIRE_COLORS.find((c) => c.id === colorId);
    return color?.hex || '#6B7280';
  };

  const getWireColorName = (colorId: string) => {
    const color = WIRE_COLORS.find((c) => c.id === colorId);
    return color?.name || colorId;
  };

  const getWireTypeName = (typeId: string) => {
    const type = WIRE_TYPES.find((t) => t.id === typeId);
    return type?.name || typeId;
  };

  const getPinLabel = (nodeId: string, pin: number) => {
    const conn = getNodeConnector(nodeId);
    if (conn && pin >= 1 && pin <= conn.pinLabels.length) {
      return conn.pinLabels[pin - 1];
    }
    return String(pin);
  };

  const handleSort = (key: SortKey) => {
    setSort((prev) => ({
      key,
      dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  };

  const filteredWires = useMemo(() => {
    let result = config.wires;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          w.signalName?.toLowerCase().includes(q) ||
          getNodeLabel(w.fromConnectorId).toLowerCase().includes(q) ||
          getNodeLabel(w.toConnectorId).toLowerCase().includes(q)
      );
    }

    if (colorFilter) {
      result = result.filter((w) => w.wireColor === colorFilter);
    }

    if (gaugeFilter !== '') {
      result = result.filter((w) => w.wireGauge === gaugeFilter);
    }

    if (signalFilter.trim()) {
      const q = signalFilter.toLowerCase();
      result = result.filter((w) => w.signalName?.toLowerCase().includes(q));
    }

    return result;
  }, [config.wires, searchQuery, colorFilter, gaugeFilter, signalFilter, getNodeLabel]);

  const sortedWires = useMemo(() => {
    const sorted = [...filteredWires];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'fromConnector':
          cmp = getNodeLabel(a.fromConnectorId).localeCompare(getNodeLabel(b.fromConnectorId));
          break;
        case 'fromPin':
          cmp = a.fromPin - b.fromPin;
          break;
        case 'signalName':
          cmp = (a.signalName || '').localeCompare(b.signalName || '');
          break;
        case 'wireGauge':
          cmp = a.wireGauge - b.wireGauge;
          break;
        case 'wireColor':
          cmp = getWireColorName(a.wireColor).localeCompare(getWireColorName(b.wireColor));
          break;
        case 'wireType':
          cmp = getWireTypeName(a.wireType).localeCompare(getWireTypeName(b.wireType));
          break;
        case 'lengthMm':
          cmp = a.lengthMm - b.lengthMm;
          break;
        case 'toPin':
          cmp = a.toPin - b.toPin;
          break;
        case 'toConnector':
          cmp = getNodeLabel(a.toConnectorId).localeCompare(getNodeLabel(b.toConnectorId));
          break;
      }
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredWires, sort, getNodeLabel]);

  const handleRowClick = (wire: Wire) => {
    // Find the connection this wire belongs to
    const connection = config.connections.find((c) => c.wireIds.includes(wire.id));
    if (connection) {
      setSelectedWire(connection.id);
      setSelectedNode(null);
    }
  };

  const hasFilters = colorFilter || gaugeFilter !== '' || signalFilter;

  // ============================================================
  // Export functions
  // ============================================================

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const headers = [
      '导线名称', 'A端连接器', 'A端PIN', 'A端标签', '信号名',
      '线规', '颜色', '线材类型', '长度mm',
      'B端PIN', 'B端标签', 'B端连接器',
    ];
    const rows = sortedWires.map((w) => [
      w.name,
      getNodeLabel(w.fromConnectorId),
      String(w.fromPin),
      getPinLabel(w.fromConnectorId, w.fromPin),
      w.signalName || '',
      String(w.wireGauge),
      getWireColorName(w.wireColor),
      getWireTypeName(w.wireType),
      String(w.lengthMm),
      String(w.toPin),
      getPinLabel(w.toConnectorId, w.toPin),
      getNodeLabel(w.toConnectorId),
    ]);
    const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');
    downloadFile('\uFEFF' + csvContent, `${config.name}_接线表.csv`, 'text/csv;charset=utf-8;');
    setExportOpen(false);
  };

  const handleExportJSON = () => {
    const jsonData = sortedWires.map((w) => ({
      导线名称: w.name,
      A端连接器: getNodeLabel(w.fromConnectorId),
      A端PIN: w.fromPin,
      A端标签: getPinLabel(w.fromConnectorId, w.fromPin),
      信号名: w.signalName || '',
      线规: w.wireGauge,
      颜色: getWireColorName(w.wireColor),
      线材类型: getWireTypeName(w.wireType),
      长度mm: w.lengthMm,
      B端PIN: w.toPin,
      B端标签: getPinLabel(w.toConnectorId, w.toPin),
      B端连接器: getNodeLabel(w.toConnectorId),
    }));
    const jsonContent = JSON.stringify(jsonData, null, 2);
    downloadFile(jsonContent, `${config.name}_接线表.json`, 'application/json;charset=utf-8;');
    setExportOpen(false);
  };

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索导线、信号名或连接器..."
          className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Filter className="w-3 h-3 text-slate-400" />
        {/* Color filter */}
        <select
          value={colorFilter}
          onChange={(e) => setColorFilter(e.target.value)}
          className="px-1.5 py-0.5 border border-slate-300 rounded text-[10px] text-slate-600"
        >
          <option value="">全部颜色</option>
          {WIRE_COLORS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {/* Gauge filter */}
        <select
          value={gaugeFilter}
          onChange={(e) => setGaugeFilter(e.target.value === '' ? '' : Number(e.target.value))}
          className="px-1.5 py-0.5 border border-slate-300 rounded text-[10px] text-slate-600"
        >
          <option value="">全部线规</option>
          {WIRE_GAUGES.map((g) => (
            <option key={g.awg} value={g.awg}>
              {g.awg} AWG
            </option>
          ))}
        </select>
        {/* Signal filter */}
        <input
          type="text"
          value={signalFilter}
          onChange={(e) => setSignalFilter(e.target.value)}
          placeholder="信号名..."
          className="px-1.5 py-0.5 border border-slate-300 rounded text-[10px] text-slate-600 w-20"
        />
        {hasFilters && (
          <button
            onClick={() => {
              setColorFilter('');
              setGaugeFilter('');
              setSignalFilter('');
            }}
            className="text-[10px] text-slate-400 hover:text-red-500 flex items-center gap-0.5 cursor-pointer"
          >
            <X className="w-3 h-3" />清除
          </button>
        )}

        {/* Export dropdown button */}
        <div className="relative ml-auto" ref={exportRef}>
          <button
            onClick={() => setExportOpen(!exportOpen)}
            className="flex items-center gap-1 px-2 py-0.5 border border-slate-300 rounded text-[10px] text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Download className="w-3 h-3" />
            导出
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
          {exportOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 min-w-[100px]">
              <button
                onClick={handleExportCSV}
                className="w-full text-left px-3 py-1.5 text-[11px] text-slate-700 hover:bg-blue-50 hover:text-blue-600 rounded-t-lg transition-colors cursor-pointer"
              >
                导出CSV
              </button>
              <button
                onClick={handleExportJSON}
                className="w-full text-left px-3 py-1.5 text-[11px] text-slate-700 hover:bg-blue-50 hover:text-blue-600 rounded-b-lg transition-colors cursor-pointer"
              >
                导出JSON
              </button>
            </div>
          )}
        </div>

        <span className="text-[10px] text-slate-400">
          共 {sortedWires.length} 根
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <SortableHeader label="导线" sortKey="name" sort={sort} onSort={handleSort} />
              <SortableHeader label="A端连接器" sortKey="fromConnector" sort={sort} onSort={handleSort} />
              <SortableHeader label="A端PIN" sortKey="fromPin" sort={sort} onSort={handleSort} />
              <th className="px-1.5 py-1 text-left font-medium border-b border-slate-200">A端标签</th>
              <SortableHeader label="信号名" sortKey="signalName" sort={sort} onSort={handleSort} />
              <SortableHeader label="线规" sortKey="wireGauge" sort={sort} onSort={handleSort} />
              <SortableHeader label="颜色" sortKey="wireColor" sort={sort} onSort={handleSort} />
              <SortableHeader label="线材" sortKey="wireType" sort={sort} onSort={handleSort} />
              <SortableHeader label="长度" sortKey="lengthMm" sort={sort} onSort={handleSort} />
              <SortableHeader label="B端PIN" sortKey="toPin" sort={sort} onSort={handleSort} />
              <th className="px-1.5 py-1 text-left font-medium border-b border-slate-200">B端标签</th>
              <SortableHeader label="B端连接器" sortKey="toConnector" sort={sort} onSort={handleSort} />
              <th className="px-1.5 py-1 text-center font-medium border-b border-slate-200 w-14">操作</th>
            </tr>
          </thead>
          <tbody>
            {sortedWires.length === 0 ? (
              <tr>
                <td colSpan={13} className="text-center py-6 text-slate-400">
                  <Cable className="w-6 h-6 mx-auto mb-1 text-slate-300" />
                  <div className="text-xs">
                    {config.wires.length === 0 ? '暂无导线' : '没有匹配的导线'}
                  </div>
                </td>
              </tr>
            ) : (
              sortedWires.map((wire) => {
                const fromLabel = getPinLabel(wire.fromConnectorId, wire.fromPin);
                const toLabel = getPinLabel(wire.toConnectorId, wire.toPin);
                const colorHex = getWireColorHex(wire.wireColor);
                const isEditing = editingWireId === wire.id;

                if (isEditing) {
                  return (
                    <tr key={wire.id}>
                      <td colSpan={13} className="p-0">
                        <WireInlineEdit
                          wire={wire}
                          onSave={(updates) => {
                            updateWire(wire.id, updates);
                            setEditingWireId(null);
                          }}
                          onCancel={() => setEditingWireId(null)}
                        />
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={wire.id}
                    className="hover:bg-slate-50 transition-colors border-b border-slate-100 cursor-pointer"
                    onClick={() => handleRowClick(wire)}
                  >
                    <td className="px-1.5 py-1.5 font-medium text-slate-700 whitespace-nowrap">
                      {wire.name}
                    </td>
                    <td className="px-1.5 py-1.5 text-blue-700 font-medium whitespace-nowrap">
                      {getNodeLabel(wire.fromConnectorId)}
                    </td>
                    <td className="px-1.5 py-1.5 text-slate-700 font-semibold whitespace-nowrap">
                      Pin {wire.fromPin}
                    </td>
                    <td className="px-1.5 py-1.5 text-slate-500 whitespace-nowrap">{fromLabel}</td>
                    <td className="px-1.5 py-1.5 text-slate-700 font-medium whitespace-nowrap">
                      {wire.signalName || '-'}
                    </td>
                    <td className="px-1.5 py-1.5 text-slate-500 whitespace-nowrap">
                      {wire.wireGauge}AWG
                    </td>
                    <td className="px-1.5 py-1.5 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <div
                          className="w-2.5 h-2.5 rounded-full border border-slate-300 flex-shrink-0"
                          style={{ backgroundColor: colorHex }}
                        />
                        <span className="text-slate-500">{getWireColorName(wire.wireColor)}</span>
                      </div>
                    </td>
                    <td className="px-1.5 py-1.5 text-slate-500 whitespace-nowrap">
                      {getWireTypeName(wire.wireType)}
                    </td>
                    <td className="px-1.5 py-1.5 text-slate-500 whitespace-nowrap">
                      {wire.lengthMm}mm
                    </td>
                    <td className="px-1.5 py-1.5 text-emerald-700 font-semibold whitespace-nowrap">
                      Pin {wire.toPin}
                    </td>
                    <td className="px-1.5 py-1.5 text-slate-500 whitespace-nowrap">{toLabel}</td>
                    <td className="px-1.5 py-1.5 text-emerald-700 font-medium whitespace-nowrap">
                      {getNodeLabel(wire.toConnectorId)}
                    </td>
                    <td className="px-1.5 py-1.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingWireId(wire.id);
                          }}
                          className="p-0.5 text-slate-400 hover:text-blue-500 cursor-pointer"
                          title="编辑"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeWire(wire.id);
                          }}
                          className="p-0.5 text-slate-400 hover:text-red-500 cursor-pointer"
                          title="删除"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// SortableHeader
// ============================================================

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const isActive = sort.key === sortKey;
  return (
    <th
      className="px-1.5 py-1 text-left font-medium border-b border-slate-200 cursor-pointer select-none whitespace-nowrap hover:bg-slate-100 transition-colors"
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-0.5">
        {label}
        <ArrowUpDown
          className={`w-3 h-3 transition-colors ${isActive ? 'text-blue-500' : 'text-slate-300'}`}
        />
      </div>
    </th>
  );
}

// ============================================================
// WireInlineEdit
// ============================================================

function WireInlineEdit({
  wire,
  onSave,
  onCancel,
}: {
  wire: Wire;
  onSave: (updates: Partial<Record<string, unknown>>) => void;
  onCancel: () => void;
}) {
  const [editSignalName, setEditSignalName] = useState(wire.signalName || '');
  const [editWireGauge, setEditWireGauge] = useState(wire.wireGauge);
  const [editWireColor, setEditWireColor] = useState(wire.wireColor);
  const [editWireType, setEditWireType] = useState(wire.wireType);
  const [editLength, setEditLength] = useState(wire.lengthMm);

  return (
    <div className="bg-yellow-50 p-2 rounded-lg border border-yellow-200 space-y-2 my-1 mx-1">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-[10px] text-slate-500 mb-0.5">线规</label>
          <select
            value={editWireGauge}
            onChange={(e) => setEditWireGauge(Number(e.target.value))}
            className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
          >
            {WIRE_GAUGES.map((g) => (
              <option key={g.awg} value={g.awg}>
                {g.awg} AWG
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 mb-0.5">线材</label>
          <select
            value={editWireType}
            onChange={(e) => setEditWireType(e.target.value)}
            className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
          >
            {WIRE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 mb-0.5">长度 (mm)</label>
          <input
            type="number"
            value={editLength}
            onChange={(e) => setEditLength(Number(e.target.value))}
            className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
          />
        </div>
      </div>
      <div>
        <label className="block text-[10px] text-slate-500 mb-0.5">线色</label>
        <div className="flex flex-wrap gap-1">
          {WIRE_COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => setEditWireColor(c.id)}
              className={`w-5 h-5 rounded-full border-2 transition-transform ${
                editWireColor === c.id ? 'border-slate-800 scale-110' : 'border-slate-300'
              }`}
              style={{ backgroundColor: c.hex }}
              title={c.name}
            />
          ))}
        </div>
      </div>
      <div>
        <label className="block text-[10px] text-slate-500 mb-0.5">信号名</label>
        <input
          type="text"
          value={editSignalName}
          onChange={(e) => setEditSignalName(e.target.value)}
          className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
        />
      </div>
      <div className="flex gap-1">
        <button
          onClick={() =>
            onSave({
              wireGauge: editWireGauge,
              wireType: editWireType,
              wireColor: editWireColor,
              lengthMm: editLength,
              signalName: editSignalName || undefined,
            })
          }
          className="flex-1 py-1 bg-green-500 hover:bg-green-600 text-white text-xs rounded flex items-center justify-center gap-1 cursor-pointer"
        >
          <Check className="w-3 h-3" />保存
        </button>
        <button
          onClick={onCancel}
          className="flex-1 py-1 bg-slate-300 hover:bg-slate-400 text-white text-xs rounded flex items-center justify-center gap-1 cursor-pointer"
        >
          <X className="w-3 h-3" />取消
        </button>
      </div>
    </div>
  );
}

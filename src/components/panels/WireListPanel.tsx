import { useState, useMemo } from 'react';
import { useHarnessStore } from '@/stores/harnessStore';
import { WIRE_COLORS, WIRE_GAUGES } from '@/lib/data';
import { List, Search, ArrowRight, Edit3, Check, X } from 'lucide-react';

/**
 * WireListPanel - overview of all wires in the design.
 * Supports search/filter, click to navigate, and batch edit.
 */
export function WireListPanel() {
  const { config, setSelectedWire, setSelectedNode, updateWire } = useHarnessStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [batchEditMode, setBatchEditMode] = useState(false);
  const [batchGauge, setBatchGauge] = useState<number | null>(null);

  const filteredWires = useMemo(() => {
    if (!searchQuery.trim()) return config.wires;
    const q = searchQuery.toLowerCase();
    return config.wires.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.signalName?.toLowerCase().includes(q) ||
        w.wireColor.toLowerCase().includes(q) ||
        w.wireType.toLowerCase().includes(q) ||
        String(w.wireGauge).includes(q)
    );
  }, [config.wires, searchQuery]);

  const getNodeLabel = (nodeId: string) => {
    const node = config.nodes.find((n) => n.id === nodeId);
    return node?.label || nodeId;
  };

  const getWireColorHex = (colorId: string) => {
    const color = WIRE_COLORS.find((c) => c.id === colorId);
    return color?.hex || '#6B7280';
  };

  const getWireColorName = (colorId: string) => {
    const color = WIRE_COLORS.find((c) => c.id === colorId);
    return color?.name || colorId;
  };

  const handleWireClick = (wireId: string) => {
    const wire = config.wires.find((w) => w.id === wireId);
    if (!wire) return;

    // Find the connection this wire belongs to
    const connection = config.connections.find((c) => c.wireIds.includes(wireId));
    if (connection) {
      setSelectedWire(connection.id);
      setSelectedNode(null);
    }
  };

  const handleBatchApply = () => {
    if (batchGauge === null) return;
    for (const wire of filteredWires) {
      updateWire(wire.id, { wireGauge: batchGauge });
    }
    setBatchEditMode(false);
    setBatchGauge(null);
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-800 font-semibold">
          <List className="w-5 h-5" />
          <h2>导线列表</h2>
        </div>
        <span className="text-xs text-slate-400">
          {filteredWires.length}/{config.wires.length}
        </span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索导线..."
          className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Batch edit bar */}
      {config.wires.length > 1 && (
        <div className="flex items-center gap-2">
          {batchEditMode ? (
            <>
              <select
                value={batchGauge || ''}
                onChange={(e) => setBatchGauge(Number(e.target.value))}
                className="flex-1 px-2 py-1 border border-slate-300 rounded text-xs"
              >
                <option value="">选择线规</option>
                {WIRE_GAUGES.map((g) => (
                  <option key={g.awg} value={g.awg}>
                    {g.awg} AWG
                  </option>
                ))}
              </select>
              <button
                onClick={handleBatchApply}
                disabled={batchGauge === null}
                className="p-1 text-green-500 hover:text-green-700 cursor-pointer disabled:opacity-30"
                title="应用"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setBatchEditMode(false);
                  setBatchGauge(null);
                }}
                className="p-1 text-slate-400 hover:text-red-500 cursor-pointer"
                title="取消"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setBatchEditMode(true)}
              className="text-[10px] text-slate-400 hover:text-blue-500 flex items-center gap-0.5 cursor-pointer"
            >
              <Edit3 className="w-3 h-3" />
              批量编辑线规
            </button>
          )}
        </div>
      )}

      {/* Wire list */}
      <div className="space-y-1">
        {filteredWires.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-4">
            {searchQuery ? '没有匹配的导线' : '暂无导线'}
          </div>
        ) : (
          filteredWires.map((wire) => (
            <div
              key={wire.id}
              onClick={() => handleWireClick(wire.id)}
              className="flex items-center gap-1.5 px-2 py-1.5 bg-white rounded-lg border border-slate-200 hover:border-blue-300 cursor-pointer transition-colors group"
            >
              {/* Color dot */}
              <div
                className="w-3 h-3 rounded-full flex-shrink-0 border border-slate-300"
                style={{ backgroundColor: getWireColorHex(wire.wireColor) }}
                title={getWireColorName(wire.wireColor)}
              />

              {/* Wire info */}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-700 truncate">
                  {wire.name}
                  {wire.signalName && (
                    <span className="text-slate-400 font-normal ml-1">
                      {wire.signalName}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400">
                  {wire.wireGauge}AWG {getWireColorName(wire.wireColor)} {wire.lengthMm}mm
                </div>
              </div>

              {/* Route */}
              <div className="flex items-center gap-0.5 text-[10px] text-slate-500 flex-shrink-0">
                <span className="text-blue-600">{getNodeLabel(wire.fromConnectorId)}</span>
                <span className="text-slate-400">P{wire.fromPin}</span>
                <ArrowRight className="w-2.5 h-2.5 text-slate-400" />
                <span className="text-emerald-600">{getNodeLabel(wire.toConnectorId)}</span>
                <span className="text-slate-400">P{wire.toPin}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

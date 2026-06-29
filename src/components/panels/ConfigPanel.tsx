import { useState } from 'react';
import { useHarnessStore } from '@/stores/harnessStore';
import { CONNECTORS, WIRE_TYPES, WIRE_COLORS, WIRE_GAUGES } from '@/lib/data';
import { Settings2, List, Cable, Table as TableIcon } from 'lucide-react';
import { PinMatrixPanel } from './PinMatrixPanel';
import { ConnectorPinView } from './ConnectorPinView';
import { WireListPanel } from './WireListPanel';
import { WireTablePanel } from './WireTablePanel';

type PanelTab = 'wireList' | 'pinMatrix' | 'wireTable';

export function ConfigPanel() {
  const { config, selectedNodeId, selectedWireId, updateNode, updateWire } = useHarnessStore();
  const [activeTab, setActiveTab] = useState<PanelTab>('wireList');
  const selectedNode = config.nodes.find((n) => n.id === selectedNodeId);

  // selectedWireId is used as selectedConnectionId when clicking an edge
  const selectedConnection = config.connections.find((c) => c.id === selectedWireId);
  const selectedWire = selectedConnection
    ? config.wires.find((w) => selectedConnection.wireIds.includes(w.id))
    : null;

  // Auto-switch tab when selection changes
  // If a connection is selected, prefer pinMatrix; otherwise wireList
  const effectiveTab = selectedConnection
    ? activeTab === 'wireList' || activeTab === 'wireTable'
      ? 'pinMatrix'
      : activeTab
    : activeTab;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 text-slate-800 font-semibold">
        <Settings2 className="w-5 h-5" />
        <h2>配置参数</h2>
      </div>

      {/* Design name */}
      <div>
        <label className="block text-sm font-medium text-slate-600 mb-1">设计名称</label>
        <input
          type="text"
          value={config.name}
          onChange={(e) => useHarnessStore.getState().setConfig({ name: e.target.value })}
          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
        <TabButton
          active={effectiveTab === 'wireList'}
          onClick={() => setActiveTab('wireList')}
          icon={<List className="w-3 h-3" />}
          label="导线列表"
        />
        <TabButton
          active={effectiveTab === 'pinMatrix'}
          onClick={() => setActiveTab('pinMatrix')}
          icon={<Cable className="w-3 h-3" />}
          label="连接矩阵"
          disabled={!selectedConnection}
        />
        <TabButton
          active={effectiveTab === 'wireTable'}
          onClick={() => setActiveTab('wireTable')}
          icon={<TableIcon className="w-3 h-3" />}
          label="接线表"
        />
      </div>

      {/* Context-sensitive panel: selected node -> ConnectorPinView */}
      {selectedNode && !selectedConnection && effectiveTab !== 'wireTable' && (
        <div className="space-y-3">
          {/* Connector model selector */}
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <h3 className="text-sm font-semibold text-blue-800 mb-2">
              连接器配置 ({selectedNode.label})
            </h3>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-slate-600 mb-1">连接器型号</label>
                <select
                  value={selectedNode.connector?.id || ''}
                  onChange={(e) => {
                    const connector = CONNECTORS.find((c) => c.id === e.target.value);
                    updateNode(selectedNode.id, { connector });
                  }}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                >
                  {CONNECTORS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.pinCount}P)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">标签</label>
                <input
                  type="text"
                  value={selectedNode.label}
                  onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                />
              </div>
            </div>
          </div>

          {/* Pin view */}
          <ConnectorPinView />
        </div>
      )}

      {/* Context-sensitive panel: selected connection -> PinMatrixPanel */}
      {selectedConnection && effectiveTab === 'pinMatrix' && (
        <PinMatrixPanel />
      )}

      {/* Wire table view */}
      {effectiveTab === 'wireTable' && (
        <WireTablePanel />
      )}

      {/* Context-sensitive panel: selected wire (not through connection) -> legacy wire editor */}
      {selectedWire && !selectedConnection && effectiveTab !== 'wireTable' && (
        <div className="bg-green-50 p-3 rounded-lg border border-green-200">
          <h3 className="text-sm font-semibold text-green-800 mb-2">
            导线配置 ({selectedWire.name})
          </h3>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-slate-600 mb-1">导线名称</label>
              <input
                type="text"
                value={selectedWire.name}
                onChange={(e) => updateWire(selectedWire.id, { name: e.target.value })}
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">信号名</label>
              <input
                type="text"
                value={selectedWire.signalName || ''}
                onChange={(e) =>
                  updateWire(selectedWire.id, { signalName: e.target.value || undefined })
                }
                placeholder="如 VCC, GND, SDA..."
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">线规 (AWG)</label>
              <select
                value={selectedWire.wireGauge}
                onChange={(e) =>
                  updateWire(selectedWire.id, { wireGauge: Number(e.target.value) })
                }
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
              >
                {WIRE_GAUGES.map((g) => (
                  <option key={g.awg} value={g.awg}>
                    {g.awg} AWG (最大{g.maxCurrent}A)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">线材类型</label>
              <select
                value={selectedWire.wireType}
                onChange={(e) => updateWire(selectedWire.id, { wireType: e.target.value })}
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
              >
                {WIRE_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} - {t.description}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">线色</label>
              <div className="flex flex-wrap gap-1">
                {WIRE_COLORS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => updateWire(selectedWire.id, { wireColor: c.id })}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${
                      selectedWire.wireColor === c.id
                        ? 'border-slate-800 scale-110'
                        : 'border-slate-300'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">长度 (mm)</label>
              <input
                type="number"
                min={10}
                max={10000}
                value={selectedWire.lengthMm}
                onChange={(e) =>
                  updateWire(selectedWire.id, { lengthMm: Number(e.target.value) })
                }
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-600 mb-1">起端PIN</label>
                <input
                  type="number"
                  min={1}
                  value={selectedWire.fromPin}
                  onChange={(e) =>
                    updateWire(selectedWire.id, { fromPin: Number(e.target.value) })
                  }
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">终端PIN</label>
                <input
                  type="number"
                  min={1}
                  value={selectedWire.toPin}
                  onChange={(e) =>
                    updateWire(selectedWire.id, { toPin: Number(e.target.value) })
                  }
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="shielded"
                checked={selectedWire.shielded || false}
                onChange={(e) => updateWire(selectedWire.id, { shielded: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="shielded" className="text-xs text-slate-600">
                屏蔽线
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Default: show wire list overview */}
      {!selectedNode && !selectedConnection && !selectedWire && effectiveTab === 'wireList' && (
        <WireListPanel />
      )}
    </div>
  );
}

// ============================================================
// TabButton
// ============================================================

function TabButton({
  active,
  onClick,
  icon,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs transition-colors cursor-pointer ${
        disabled
          ? 'text-slate-300 cursor-not-allowed'
          : active
          ? 'bg-white text-blue-700 shadow-sm font-medium'
          : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

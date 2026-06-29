import { useState } from 'react';
import { useHarnessStore } from '@/stores/harnessStore';
import { Plug, CheckCircle, Circle, Plus, ChevronRight, X, ChevronDown, ChevronUp } from 'lucide-react';


const generateId = (): string =>
  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

interface PinTarget {
  wireId: string;
  targetNodeId: string;
  targetNodeLabel: string;
  targetPin: number;
  targetPinLabel: string;
  signalName?: string;
}

interface PinStatus {
  pin: number;
  label: string;
  targets: PinTarget[];
}

/**
 * ConnectorPinView - displays all pins of a selected connector node.
 * Shows connection status and allows quick wire creation.
 * Supports multi-connection display: each pin can show all its connection targets.
 */
export function ConnectorPinView() {
  const { config, selectedNodeId, addWire, setSelectedWire } = useHarnessStore();
  const [quickConnectPin, setQuickConnectPin] = useState<number | null>(null);
  const [expandedPins, setExpandedPins] = useState<Set<number>>(new Set());

  const selectedNode = config.nodes.find((n) => n.id === selectedNodeId);

  if (!selectedNode || !selectedNode.connector) {
    return (
      <div className="text-sm text-slate-400 text-center py-8">
        <Plug className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p>请选择一个连接器节点</p>
      </div>
    );
  }

  const connector = selectedNode.connector;

  // Find all wires connected to this connector (by nodeId)
  const connectedWires = config.wires.filter(
    (w) => w.fromConnectorId === selectedNode.id || w.toConnectorId === selectedNode.id
  );

  // Build pin status map with ALL connections per pin
  const pinStatuses: PinStatus[] = [];
  for (let i = 1; i <= connector.pinCount; i++) {
    const label = i <= connector.pinLabels.length ? connector.pinLabels[i - 1] : String(i);

    // Find ALL wires for this pin
    const pinWires = connectedWires.filter(
      (w) =>
        (w.fromConnectorId === selectedNode.id && w.fromPin === i) ||
        (w.toConnectorId === selectedNode.id && w.toPin === i)
    );

    const targets: PinTarget[] = pinWires.map((wire) => {
      const isFromSide = wire.fromConnectorId === selectedNode.id;
      const targetNodeId = isFromSide ? wire.toConnectorId : wire.fromConnectorId;
      const targetPin = isFromSide ? wire.toPin : wire.fromPin;
      const targetNode = config.nodes.find((n) => n.id === targetNodeId);
      const targetConnector = targetNode?.connector;
      const targetPinLabel = targetConnector
        ? targetPin >= 1 && targetPin <= targetConnector.pinLabels.length
          ? targetConnector.pinLabels[targetPin - 1]
          : String(targetPin)
        : String(targetPin);

      return {
        wireId: wire.id,
        targetNodeId,
        targetNodeLabel: targetNode?.label || '未知',
        targetPin,
        targetPinLabel,
        signalName: wire.signalName,
      };
    });

    pinStatuses.push({
      pin: i,
      label,
      targets,
    });
  }

  const connectedPinCount = pinStatuses.filter((p) => p.targets.length > 0).length;

  // Get available target nodes (other connector nodes)
  const otherNodes = config.nodes.filter(
    (n) => n.id !== selectedNode.id && n.type === 'connector' && n.connector
  );

  const togglePinExpand = (pin: number) => {
    setExpandedPins((prev) => {
      const next = new Set(prev);
      if (next.has(pin)) {
        next.delete(pin);
      } else {
        next.add(pin);
      }
      return next;
    });
  };

  const handleQuickConnect = (
    fromPin: number,
    toNodeId: string,
    toPin: number
  ) => {
    const wireCount = config.wires.length;
    const newWire = {
      id: generateId(),
      name: `W${wireCount + 1}`,
      wireGauge: 26,
      wireType: 'silicone',
      wireColor: 'red',
      lengthMm: 300,
      fromConnectorId: selectedNode.id,
      fromPin,
      toConnectorId: toNodeId,
      toPin,
    };

    addWire(newWire);

    // Check if a connection exists between these two nodes
    const existingConnection = config.connections.find(
      (c) =>
        (c.fromNodeId === selectedNode.id && c.toNodeId === toNodeId) ||
        (c.fromNodeId === toNodeId && c.toNodeId === selectedNode.id)
    );

    const store = useHarnessStore.getState();
    if (existingConnection) {
      store.updateConnection(existingConnection.id, {
        wireIds: [...existingConnection.wireIds, newWire.id],
      });
    } else {
      // Create a new connection
      const connId = generateId();
      store.addConnection({
        id: connId,
        name: `${selectedNode.label} - ${config.nodes.find((n) => n.id === toNodeId)?.label || ''}`,
        fromNodeId: selectedNode.id,
        toNodeId: toNodeId,
        wireIds: [newWire.id],
      });
    }

    setQuickConnectPin(null);
  };

  return (
    <div className="space-y-3">
      {/* Connector header */}
      <div className="bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-blue-800">
              {connector.name}
            </div>
            <div className="text-[10px] text-blue-600">
              {connector.manufacturer} | {connector.pinCount}P
              {connector.pitch ? ` | ${connector.pitch}mm` : ''}
            </div>
          </div>
          <div className="text-xs text-blue-600">
            {connectedPinCount}/{connector.pinCount} 已连接
          </div>
        </div>
      </div>

      {/* Pin list */}
      <div className="space-y-1">
        {pinStatuses.map((ps) => {
          const isConnected = ps.targets.length > 0;
          const hasMultipleTargets = ps.targets.length > 1;
          const isExpanded = expandedPins.has(ps.pin);

          return (
            <div key={ps.pin}>
              {isConnected ? (
                /* Connected pin */
                <div
                  className="flex items-center gap-2 px-2 py-1.5 bg-white rounded-lg border border-slate-200 hover:border-blue-300 transition-colors cursor-pointer"
                  onClick={() => {
                    if (ps.targets.length > 0) {
                      setSelectedWire(ps.targets[0].wireId);
                    }
                  }}
                >
                  <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-700">
                      Pin {ps.pin}
                      <span className="text-slate-400 font-normal ml-1">[{ps.label}]</span>
                    </div>
                  </div>

                  {/* Connection targets display */}
                  {hasMultipleTargets ? (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-[10px] text-slate-500">
                        {ps.targets.length} 个连接
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePinExpand(ps.pin);
                        }}
                        className="p-0.5 text-slate-400 hover:text-blue-500 cursor-pointer"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <>
                      <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                      <div className="text-[10px] text-slate-500 flex-shrink-0">
                        {ps.targets[0].targetNodeLabel} Pin {ps.targets[0].targetPin} [{ps.targets[0].targetPinLabel}]
                      </div>
                    </>
                  )}
                </div>
              ) : (
                /* Unconnected pin */
                <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                  <Circle className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500">
                      Pin {ps.pin}
                      <span className="text-slate-400 ml-1">[{ps.label}]</span>
                    </div>
                  </div>
                  {otherNodes.length > 0 && (
                    <>
                      {quickConnectPin === ps.pin ? (
                        <div className="flex items-center gap-1">
                          <select
                            className="px-1 py-0.5 border border-slate-300 rounded text-[10px]"
                            defaultValue={otherNodes[0]?.id}
                            id={`qc-target-${ps.pin}`}
                          >
                            {otherNodes.map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.label}
                              </option>
                            ))}
                          </select>
                          <select
                            className="px-1 py-0.5 border border-slate-300 rounded text-[10px]"
                            defaultValue={1}
                            id={`qc-pin-${ps.pin}`}
                          >
                            {Array.from(
                              { length: otherNodes[0]?.connector?.pinCount || 1 },
                              (_, i) => i + 1
                            ).map((p) => (
                              <option key={p} value={p}>
                                Pin {p}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => {
                              const targetSelect = document.getElementById(
                                `qc-target-${ps.pin}`
                              ) as HTMLSelectElement | null;
                              const pinSelect = document.getElementById(
                                `qc-pin-${ps.pin}`
                              ) as HTMLSelectElement | null;
                              if (targetSelect && pinSelect) {
                                handleQuickConnect(
                                  ps.pin,
                                  targetSelect.value,
                                  Number(pinSelect.value)
                                );
                              }
                            }}
                            className="p-0.5 text-green-500 hover:text-green-700 cursor-pointer"
                            title="确认"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setQuickConnectPin(null)}
                            className="p-0.5 text-slate-400 hover:text-red-500 cursor-pointer"
                            title="取消"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setQuickConnectPin(ps.pin)}
                          className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />接线
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Expanded multi-target view */}
              {isExpanded && hasMultipleTargets && (
                <div className="ml-6 mt-0.5 space-y-0.5">
                  {ps.targets.map((target, idx) => (
                    <div
                      key={`${target.wireId}-${idx}`}
                      className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 rounded border border-blue-100 text-[10px] cursor-pointer hover:bg-blue-100 transition-colors"
                      onClick={() => setSelectedWire(target.wireId)}
                    >
                      <ChevronRight className="w-2.5 h-2.5 text-blue-400 flex-shrink-0" />
                      <span className="text-blue-700 font-medium">
                        Pin {ps.pin} [{ps.label}]
                      </span>
                      {target.signalName && (
                        <span className="text-slate-500">({target.signalName})</span>
                      )}
                      <span className="text-slate-400">&rarr;</span>
                      <span className="text-emerald-700 font-medium">
                        {target.targetNodeLabel} Pin {target.targetPin} [{target.targetPinLabel}]
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick connect hint */}
      {otherNodes.length === 0 && (
        <div className="text-xs text-slate-400 text-center py-2">
          没有其他连接器可连接
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useHarnessStore } from '@/stores/harnessStore';
import { WIRE_COLORS, WIRE_GAUGES, WIRE_TYPES } from '@/lib/data';
import type { Connector } from '@/types/harness';
import {
  Plus, Trash2, ChevronRight, Cable, Edit3, Check, X,
  LayoutGrid, Table as TableIcon,
} from 'lucide-react';

const generateId = (): string =>
  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

type ViewMode = 'graphic' | 'table';

/**
 * PinMatrixPanel - PIN mapping matrix (core component).
 * When a connection is selected (via edge click), shows that connection's pin mapping.
 * When a node is selected (via node click), shows ALL connections for that node,
 * with each connection displayed in its own block.
 */
export function PinMatrixPanel() {
  const { config, selectedWireId, selectedNodeId, addWire, updateWire, removeWire } = useHarnessStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingWireId, setEditingWireId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('graphic');

  // selectedWireId is used as selectedConnectionId when clicking an edge
  const selectedConnection = config.connections.find((c) => c.id === selectedWireId);

  // If a node is selected (not a connection), show all connections for that node
  if (selectedNodeId && !selectedConnection) {
    return <NodeConnectionsView
      nodeId={selectedNodeId}
      viewMode={viewMode}
      setViewMode={setViewMode}
      editingWireId={editingWireId}
      setEditingWireId={setEditingWireId}
      updateWire={updateWire}
      removeWire={removeWire}
    />;
  }

  if (!selectedConnection) {
    return (
      <div className="text-sm text-slate-400 text-center py-8">
        <Cable className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p>请在画布上选择一条连接或一个节点</p>
        <p className="text-xs mt-1">点击连线查看PIN映射，或点击节点查看所有连接</p>
      </div>
    );
  }

  const fromNode = config.nodes.find((n) => n.id === selectedConnection.fromNodeId);
  const toNode = config.nodes.find((n) => n.id === selectedConnection.toNodeId);
  const fromConnector = fromNode?.connector;
  const toConnector = toNode?.connector;

  if (!fromConnector || !toConnector) {
    return (
      <div className="text-sm text-slate-400 text-center py-8">
        <p>连接的节点缺少连接器定义</p>
      </div>
    );
  }

  // Get wires belonging to this connection
  const connectionWires = config.wires.filter((w) =>
    selectedConnection.wireIds.includes(w.id)
  );

  // Build pin usage maps
  const fromPinUsed = new Set<number>();
  const toPinUsed = new Set<number>();
  for (const wire of connectionWires) {
    fromPinUsed.add(wire.fromPin);
    toPinUsed.add(wire.toPin);
  }

  // Available pins for adding new wires
  const availableFromPins = Array.from({ length: fromConnector.pinCount }, (_, i) => i + 1)
    .filter((p) => !fromPinUsed.has(p));
  const availableToPins = Array.from({ length: toConnector.pinCount }, (_, i) => i + 1)
    .filter((p) => !toPinUsed.has(p));

  const canAddWire = availableFromPins.length > 0 && availableToPins.length > 0;

  const getWireColorHex = (colorId: string) => {
    const color = WIRE_COLORS.find((c) => c.id === colorId);
    return color?.hex || '#6B7280';
  };

  const getWireColorName = (colorId: string) => {
    const color = WIRE_COLORS.find((c) => c.id === colorId);
    return color?.name || colorId;
  };

  const getPinLabel = (connector: Connector, pin: number) => {
    if (pin >= 1 && pin <= connector.pinLabels.length) {
      return connector.pinLabels[pin - 1];
    }
    return String(pin);
  };

  return (
    <div className="space-y-3">
      {/* Header: A-side <-> B-side */}
      <div className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
        <div className="text-xs font-semibold text-blue-700 truncate max-w-[120px]">
          {fromNode?.label || 'A端'}: {fromConnector.name}
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <ChevronRight className="w-3 h-3" />
          <ChevronRight className="w-3 h-3" />
        </div>
        <div className="text-xs font-semibold text-emerald-700 truncate max-w-[120px]">
          {toNode?.label || 'B端'}: {toConnector.name}
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
        <button
          onClick={() => setViewMode('graphic')}
          className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-xs transition-colors cursor-pointer ${
            viewMode === 'graphic'
              ? 'bg-white text-blue-700 shadow-sm font-medium'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <LayoutGrid className="w-3 h-3" />
          图形视图
        </button>
        <button
          onClick={() => setViewMode('table')}
          className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-xs transition-colors cursor-pointer ${
            viewMode === 'table'
              ? 'bg-white text-blue-700 shadow-sm font-medium'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <TableIcon className="w-3 h-3" />
          接线表
        </button>
      </div>

      {viewMode === 'graphic' ? (
        <GraphicView
          connectionWires={connectionWires}
          fromConnector={fromConnector}
          toConnector={toConnector}
          fromNode={fromNode}
          toNode={toNode}
          editingWireId={editingWireId}
          setEditingWireId={setEditingWireId}
          updateWire={updateWire}
          removeWire={removeWire}
          getWireColorHex={getWireColorHex}
          getWireColorName={getWireColorName}
          getPinLabel={getPinLabel}
        />
      ) : (
        <TableView
          connectionWires={connectionWires}
          fromConnector={fromConnector}
          toConnector={toConnector}
          fromNode={fromNode}
          toNode={toNode}
          editingWireId={editingWireId}
          setEditingWireId={setEditingWireId}
          updateWire={updateWire}
          removeWire={removeWire}
          getWireColorHex={getWireColorHex}
          getWireColorName={getWireColorName}
          getPinLabel={getPinLabel}
        />
      )}

      {/* Unconnected pins summary */}
      {(availableFromPins.length > 0 || availableToPins.length > 0) && (
        <div className="text-xs text-slate-400 px-1">
          未连接PIN: A端[{availableFromPins.join(', ')}] B端[{availableToPins.join(', ')}]
        </div>
      )}

      {/* Add wire button / form */}
      {canAddWire ? (
        showAddForm ? (
          <AddWireForm
            connectionId={selectedConnection.id}
            fromNodeId={selectedConnection.fromNodeId}
            toNodeId={selectedConnection.toNodeId}
            fromConnector={fromConnector}
            toConnector={toConnector}
            availableFromPins={availableFromPins}
            availableToPins={availableToPins}
            onAdd={(wire) => {
              addWire(wire);
              const store = useHarnessStore.getState();
              const conn = store.config.connections.find((c) => c.id === selectedConnection.id);
              if (conn) {
                store.updateConnection(conn.id, { wireIds: [...conn.wireIds, wire.id] });
              }
              setShowAddForm(false);
            }}
            onCancel={() => setShowAddForm(false)}
          />
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:bg-slate-50 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-1 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            添加导线
          </button>
        )
      ) : (
        <div className="text-xs text-center text-slate-400 py-2">
          所有PIN位已连接
        </div>
      )}
    </div>
  );
}

// ============================================================
// NodeConnectionsView - shows all connections for a selected node
// ============================================================

interface NodeConnectionsViewProps {
  nodeId: string;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  editingWireId: string | null;
  setEditingWireId: (id: string | null) => void;
  updateWire: (id: string, updates: Partial<Record<string, unknown>>) => void;
  removeWire: (id: string) => void;
}

function NodeConnectionsView({
  nodeId,
  viewMode,
  setViewMode,
  editingWireId,
  setEditingWireId,
  updateWire,
  removeWire,
}: NodeConnectionsViewProps) {
  const { config, setSelectedWire, setSelectedNode } = useHarnessStore();

  const selectedNode = config.nodes.find((n) => n.id === nodeId);
  if (!selectedNode) return null;

  // Find all connections involving this node
  const nodeConnections = config.connections.filter(
    (c) => c.fromNodeId === nodeId || c.toNodeId === nodeId
  );

  if (nodeConnections.length === 0) {
    return (
      <div className="text-sm text-slate-400 text-center py-8">
        <Cable className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p>该节点没有连接</p>
      </div>
    );
  }

  const getWireColorHex = (colorId: string) => {
    const color = WIRE_COLORS.find((c) => c.id === colorId);
    return color?.hex || '#6B7280';
  };

  const getWireColorName = (colorId: string) => {
    const color = WIRE_COLORS.find((c) => c.id === colorId);
    return color?.name || colorId;
  };

  const getPinLabel = (connector: Connector, pin: number) => {
    if (pin >= 1 && pin <= connector.pinLabels.length) {
      return connector.pinLabels[pin - 1];
    }
    return String(pin);
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
        <div className="text-xs font-semibold text-blue-800">
          {selectedNode.label}: {selectedNode.connector?.name || '未知'}
        </div>
        <div className="text-[10px] text-blue-600">
          共 {nodeConnections.length} 条连接
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
        <button
          onClick={() => setViewMode('graphic')}
          className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-xs transition-colors cursor-pointer ${
            viewMode === 'graphic'
              ? 'bg-white text-blue-700 shadow-sm font-medium'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <LayoutGrid className="w-3 h-3" />
          图形视图
        </button>
        <button
          onClick={() => setViewMode('table')}
          className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-xs transition-colors cursor-pointer ${
            viewMode === 'table'
              ? 'bg-white text-blue-700 shadow-sm font-medium'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <TableIcon className="w-3 h-3" />
          接线表
        </button>
      </div>

      {/* Each connection as a block */}
      {nodeConnections.map((conn) => {
        const isFromSide = conn.fromNodeId === nodeId;
        const targetNodeId = isFromSide ? conn.toNodeId : conn.fromNodeId;
        const targetNode = config.nodes.find((n) => n.id === targetNodeId);
        const targetConnector = targetNode?.connector;

        if (!selectedNode.connector || !targetConnector) return null;

        const connectionWires = config.wires.filter((w) => conn.wireIds.includes(w.id));

        return (
          <div key={conn.id} className="border border-slate-200 rounded-lg overflow-hidden">
            {/* Block header */}
            <div
              className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
              onClick={() => {
                setSelectedWire(conn.id);
                setSelectedNode(null);
              }}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <ChevronRight className="w-3 h-3 text-slate-400" />
                <span className="text-blue-600">{selectedNode.label}</span>
                <span className="text-slate-400">&rarr;</span>
                <span className="text-emerald-600">{targetNode?.label || '未知'}</span>
                <span className="text-slate-400 font-normal">({targetConnector.name})</span>
              </div>
              <span className="text-[10px] text-slate-400">{connectionWires.length} 根导线</span>
            </div>

            {/* Block content */}
            <div className="p-2">
              {viewMode === 'graphic' ? (
                <GraphicView
                  connectionWires={connectionWires}
                  fromConnector={isFromSide ? selectedNode.connector : targetConnector}
                  toConnector={isFromSide ? targetConnector : selectedNode.connector}
                  fromNode={isFromSide ? selectedNode : targetNode}
                  toNode={isFromSide ? targetNode : selectedNode}
                  editingWireId={editingWireId}
                  setEditingWireId={setEditingWireId}
                  updateWire={updateWire}
                  removeWire={removeWire}
                  getWireColorHex={getWireColorHex}
                  getWireColorName={getWireColorName}
                  getPinLabel={getPinLabel}
                  compact
                />
              ) : (
                <TableView
                  connectionWires={connectionWires}
                  fromConnector={isFromSide ? selectedNode.connector : targetConnector}
                  toConnector={isFromSide ? targetConnector : selectedNode.connector}
                  fromNode={isFromSide ? selectedNode : targetNode}
                  toNode={isFromSide ? targetNode : selectedNode}
                  editingWireId={editingWireId}
                  setEditingWireId={setEditingWireId}
                  updateWire={updateWire}
                  removeWire={removeWire}
                  getWireColorHex={getWireColorHex}
                  getWireColorName={getWireColorName}
                  getPinLabel={getPinLabel}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// GraphicView - visual pin-to-pin wiring diagram
// ============================================================

interface GraphicViewProps {
  connectionWires: Array<{
    id: string;
    name: string;
    wireGauge: number;
    wireType: string;
    wireColor: string;
    fromPin: number;
    toPin: number;
    signalName?: string;
    lengthMm: number;
    shielded?: boolean;
  }>;
  fromConnector: Connector;
  toConnector: Connector;
  fromNode?: { label: string };
  toNode?: { label: string };
  editingWireId: string | null;
  setEditingWireId: (id: string | null) => void;
  updateWire: (id: string, updates: Partial<Record<string, unknown>>) => void;
  removeWire: (id: string) => void;
  getWireColorHex: (colorId: string) => string;
  getWireColorName: (colorId: string) => string;
  getPinLabel: (connector: Connector, pin: number) => string;
  compact?: boolean;
}

function GraphicView({
  connectionWires,
  fromConnector,
  toConnector,
  fromNode,
  toNode,
  editingWireId,
  setEditingWireId,
  updateWire,
  removeWire,
  getWireColorHex,
  getWireColorName,
  getPinLabel,
}: GraphicViewProps) {
  // Build a map of connected pins for quick lookup
  const wireByFromPin = new Map<number, typeof connectionWires[0]>();
  const wireByToPin = new Map<number, typeof connectionWires[0]>();
  for (const wire of connectionWires) {
    wireByFromPin.set(wire.fromPin, wire);
    wireByToPin.set(wire.toPin, wire);
  }

  // Determine max pin count to align rows
  const maxPinCount = Math.max(fromConnector.pinCount, toConnector.pinCount);

  return (
    <div className="space-y-1">
      {/* Column headers */}
      <div className="flex items-center gap-2 px-1">
        <div className="w-[90px] text-[10px] font-semibold text-blue-600 text-center">
          {fromNode?.label || 'A端'}
        </div>
        <div className="flex-1" />
        <div className="w-[90px] text-[10px] font-semibold text-emerald-600 text-center">
          {toNode?.label || 'B端'}
        </div>
      </div>

      {/* Pin rows */}
      {Array.from({ length: maxPinCount }, (_, i) => i + 1).map((pinNum) => {
        const wire = wireByFromPin.get(pinNum);
        const isConnected = !!wire;
        const colorHex = wire ? getWireColorHex(wire.wireColor) : '#9CA3AF';
        const fromLabel = getPinLabel(fromConnector, pinNum);
        const toLabel = wire ? getPinLabel(toConnector, wire.toPin) : getPinLabel(toConnector, pinNum);

        return (
          <div
            key={pinNum}
            className="flex items-center gap-1 h-9"
          >
            {/* A-side PIN */}
            <div
              className={`w-[90px] h-7 flex flex-col items-center justify-center rounded-md text-[10px] leading-tight ${
                isConnected
                  ? 'bg-blue-50 border border-blue-200 text-blue-800'
                  : 'bg-slate-50 border border-dashed border-slate-300 text-slate-400'
              }`}
            >
              <span className="font-semibold">Pin {pinNum}</span>
              {fromLabel !== String(pinNum) && (
                <span className="text-[9px] opacity-70">{fromLabel}</span>
              )}
            </div>

            {/* Connection line */}
            <div className="flex-1 flex items-center justify-center relative h-7">
              {isConnected ? (
                <>
                  {/* Colored line */}
                  <div
                    className="absolute left-0 right-0 h-[3px] rounded-full"
                    style={{ backgroundColor: colorHex, top: '50%', transform: 'translateY(-50%)' }}
                  />
                  {/* Signal name badge */}
                  {wire.signalName && (
                    <div className="relative z-10 bg-white px-1.5 py-0.5 rounded text-[10px] font-medium border shadow-sm truncate max-w-full"
                      style={{ borderColor: colorHex, color: colorHex }}
                    >
                      {wire.signalName}
                    </div>
                  )}
                  {/* Color dot */}
                  <div
                    className="absolute right-1 w-2.5 h-2.5 rounded-full border border-white shadow-sm"
                    style={{ backgroundColor: colorHex, top: '50%', transform: 'translateY(-50%)' }}
                    title={getWireColorName(wire.wireColor)}
                  />
                  <div
                    className="absolute left-1 w-2.5 h-2.5 rounded-full border border-white shadow-sm"
                    style={{ backgroundColor: colorHex, top: '50%', transform: 'translateY(-50%)' }}
                    title={getWireColorName(wire.wireColor)}
                  />
                </>
              ) : (
                <div className="w-full border-t border-dashed border-slate-200" />
              )}
            </div>

            {/* B-side PIN */}
            <div
              className={`w-[90px] h-7 flex flex-col items-center justify-center rounded-md text-[10px] leading-tight ${
                isConnected
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-slate-50 border border-dashed border-slate-300 text-slate-400'
              }`}
            >
              <span className="font-semibold">
                {wire ? `Pin ${wire.toPin}` : `Pin ${pinNum}`}
              </span>
              {wire && toLabel !== String(wire.toPin) && (
                <span className="text-[9px] opacity-70">{toLabel}</span>
              )}
              {!wire && toLabel !== String(pinNum) && (
                <span className="text-[9px] opacity-70">{toLabel}</span>
              )}
            </div>

            {/* Actions for connected wire */}
            {wire && (
              <div className="flex-shrink-0 flex gap-0.5 opacity-0 hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setEditingWireId(wire.id)}
                  className="p-0.5 text-slate-400 hover:text-blue-500 cursor-pointer"
                  title="编辑"
                >
                  <Edit3 className="w-3 h-3" />
                </button>
                <button
                  onClick={() => removeWire(wire.id)}
                  className="p-0.5 text-slate-400 hover:text-red-500 cursor-pointer"
                  title="删除"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Editing form inline */}
      {editingWireId && connectionWires.find((w) => w.id === editingWireId) && (
        <WireEditForm
          wire={connectionWires.find((w) => w.id === editingWireId)!}
          onSave={(updates) => {
            updateWire(editingWireId, updates);
            setEditingWireId(null);
          }}
          onCancel={() => setEditingWireId(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// TableView - Excel-like wiring table
// ============================================================

interface TableViewProps {
  connectionWires: Array<{
    id: string;
    name: string;
    wireGauge: number;
    wireType: string;
    wireColor: string;
    fromPin: number;
    toPin: number;
    signalName?: string;
    lengthMm: number;
    shielded?: boolean;
  }>;
  fromConnector: Connector;
  toConnector: Connector;
  fromNode?: { label: string };
  toNode?: { label: string };
  editingWireId: string | null;
  setEditingWireId: (id: string | null) => void;
  updateWire: (id: string, updates: Partial<Record<string, unknown>>) => void;
  removeWire: (id: string) => void;
  getWireColorHex: (colorId: string) => string;
  getWireColorName: (colorId: string) => string;
  getPinLabel: (connector: Connector, pin: number) => string;
}

function TableView({
  connectionWires,
  fromConnector,
  toConnector,
  editingWireId,
  setEditingWireId,
  updateWire,
  removeWire,
  getWireColorHex,
  getWireColorName,
  getPinLabel,
}: TableViewProps) {
  return (
    <div className="space-y-1">
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className="px-1.5 py-1 text-left font-medium border-b border-slate-200">序号</th>
              <th className="px-1.5 py-1 text-left font-medium border-b border-slate-200 text-blue-700">A端PIN</th>
              <th className="px-1.5 py-1 text-left font-medium border-b border-slate-200">A端标签</th>
              <th className="px-1.5 py-1 text-left font-medium border-b border-slate-200">信号名</th>
              <th className="px-1.5 py-1 text-left font-medium border-b border-slate-200">线规</th>
              <th className="px-1.5 py-1 text-left font-medium border-b border-slate-200">颜色</th>
              <th className="px-1.5 py-1 text-left font-medium border-b border-slate-200 text-emerald-700">B端PIN</th>
              <th className="px-1.5 py-1 text-left font-medium border-b border-slate-200">B端标签</th>
              <th className="px-1.5 py-1 text-center font-medium border-b border-slate-200 w-10">操作</th>
            </tr>
          </thead>
          <tbody>
            {connectionWires.map((wire) => {
              const fromLabel = getPinLabel(fromConnector, wire.fromPin);
              const toLabel = getPinLabel(toConnector, wire.toPin);
              const colorHex = getWireColorHex(wire.wireColor);
              const isEditing = editingWireId === wire.id;

              if (isEditing) {
                return (
                  <tr key={wire.id}>
                    <td colSpan={9} className="p-0">
                      <WireEditForm
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
                  className="hover:bg-slate-50 transition-colors border-b border-slate-100"
                >
                  <td className="px-1.5 py-1.5 font-medium text-slate-700">{wire.name}</td>
                  <td className="px-1.5 py-1.5 text-blue-700 font-semibold">Pin {wire.fromPin}</td>
                  <td className="px-1.5 py-1.5 text-slate-500">{fromLabel}</td>
                  <td className="px-1.5 py-1.5 text-slate-700 font-medium">{wire.signalName || '-'}</td>
                  <td className="px-1.5 py-1.5 text-slate-500">{wire.wireGauge}AWG</td>
                  <td className="px-1.5 py-1.5">
                    <div className="flex items-center gap-1">
                      <div
                        className="w-2.5 h-2.5 rounded-full border border-slate-300 flex-shrink-0"
                        style={{ backgroundColor: colorHex }}
                      />
                      <span className="text-slate-500">{getWireColorName(wire.wireColor)}</span>
                    </div>
                  </td>
                  <td className="px-1.5 py-1.5 text-emerald-700 font-semibold">Pin {wire.toPin}</td>
                  <td className="px-1.5 py-1.5 text-slate-500">{toLabel}</td>
                  <td className="px-1.5 py-1.5 text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      <button
                        onClick={() => setEditingWireId(wire.id)}
                        className="p-0.5 text-slate-400 hover:text-blue-500 cursor-pointer"
                        title="编辑"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => removeWire(wire.id)}
                        className="p-0.5 text-slate-400 hover:text-red-500 cursor-pointer"
                        title="删除"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// WireEditForm - inline editing form
// ============================================================

interface WireEditFormProps {
  wire: {
    wireGauge: number;
    wireType: string;
    wireColor: string;
    signalName?: string;
  };
  onSave: (updates: Record<string, unknown>) => void;
  onCancel: () => void;
}

function WireEditForm({ wire, onSave, onCancel }: WireEditFormProps) {
  const [editSignalName, setEditSignalName] = useState(wire.signalName || '');
  const [editWireGauge, setEditWireGauge] = useState(wire.wireGauge);
  const [editWireColor, setEditWireColor] = useState(wire.wireColor);
  const [editWireType, setEditWireType] = useState(wire.wireType);

  return (
    <div className="bg-yellow-50 p-2 rounded-lg border border-yellow-200 space-y-2 my-1">
      <div className="grid grid-cols-2 gap-2">
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

// ============================================================
// AddWireForm - inline form for adding a new wire
// ============================================================

interface AddWireFormProps {
  connectionId: string;
  fromNodeId: string;
  toNodeId: string;
  fromConnector: { pinLabels: string[]; pinCount: number };
  toConnector: { pinLabels: string[]; pinCount: number };
  availableFromPins: number[];
  availableToPins: number[];
  onAdd: (wire: {
    id: string;
    name: string;
    wireGauge: number;
    wireType: string;
    wireColor: string;
    lengthMm: number;
    fromConnectorId: string;
    fromPin: number;
    toConnectorId: string;
    toPin: number;
    signalName?: string;
  }) => void;
  onCancel: () => void;
}

function AddWireForm({
  fromNodeId,
  toNodeId,
  fromConnector,
  toConnector,
  availableFromPins,
  availableToPins,
  onAdd,
  onCancel,
}: AddWireFormProps) {
  const { config } = useHarnessStore();

  const [fromPin, setFromPin] = useState(availableFromPins[0] || 1);
  const [toPin, setToPin] = useState(availableToPins[0] || 1);
  const [wireGauge, setWireGauge] = useState(26);
  const [wireColor, setWireColor] = useState('red');
  const [wireType, setWireType] = useState('silicone');
  const [signalName, setSignalName] = useState('');

  const getPinLabel = (connector: { pinLabels: string[] }, pin: number) => {
    if (pin >= 1 && pin <= connector.pinLabels.length) {
      return connector.pinLabels[pin - 1];
    }
    return String(pin);
  };

  const handleAdd = () => {
    const wireCount = config.wires.length;
    onAdd({
      id: generateId(),
      name: `W${wireCount + 1}`,
      wireGauge,
      wireType,
      wireColor,
      lengthMm: 300,
      fromConnectorId: fromNodeId,
      fromPin,
      toConnectorId: toNodeId,
      toPin,
      signalName: signalName || undefined,
    });
  };

  return (
    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 space-y-2">
      <div className="text-xs font-semibold text-blue-700">添加新导线</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-slate-500 mb-0.5">A端PIN</label>
          <select
            value={fromPin}
            onChange={(e) => setFromPin(Number(e.target.value))}
            className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
          >
            {availableFromPins.map((p) => (
              <option key={p} value={p}>
                Pin {p} [{getPinLabel(fromConnector, p)}]
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 mb-0.5">B端PIN</label>
          <select
            value={toPin}
            onChange={(e) => setToPin(Number(e.target.value))}
            className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
          >
            {availableToPins.map((p) => (
              <option key={p} value={p}>
                Pin {p} [{getPinLabel(toConnector, p)}]
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-slate-500 mb-0.5">线规</label>
          <select
            value={wireGauge}
            onChange={(e) => setWireGauge(Number(e.target.value))}
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
            value={wireType}
            onChange={(e) => setWireType(e.target.value)}
            className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
          >
            {WIRE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-[10px] text-slate-500 mb-0.5">线色</label>
        <div className="flex flex-wrap gap-1">
          {WIRE_COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => setWireColor(c.id)}
              className={`w-5 h-5 rounded-full border-2 transition-transform ${
                wireColor === c.id ? 'border-slate-800 scale-110' : 'border-slate-300'
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
          value={signalName}
          onChange={(e) => setSignalName(e.target.value)}
          placeholder="如 VCC, GND, SDA..."
          className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
        />
      </div>
      <div className="flex gap-1">
        <button
          onClick={handleAdd}
          className="flex-1 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded flex items-center justify-center gap-1 cursor-pointer"
        >
          <Plus className="w-3 h-3" />确认添加
        </button>
        <button
          onClick={onCancel}
          className="flex-1 py-1.5 bg-slate-300 hover:bg-slate-400 text-white text-xs rounded flex items-center justify-center gap-1 cursor-pointer"
        >
          <X className="w-3 h-3" />取消
        </button>
      </div>
    </div>
  );
}

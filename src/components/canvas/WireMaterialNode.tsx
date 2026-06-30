import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Handle, Position } from '@xyflow/react';
import {
  CANVAS_MATERIAL_HEIGHT,
  CANVAS_MATERIAL_SLEEVE_CENTER_Y,
} from '@/lib/canvasMaterials';
import { WIRE_COLORS } from '@/lib/data';
import { useHarnessStore } from '@/stores/harnessStore';
import type {
  CanvasWireMaterial,
  HarnessNode,
  MaterialAttachment,
  Wire,
} from '@/types/harness';

interface WireMaterialNodeProps {
  data: CanvasWireMaterial;
  selected?: boolean;
}

interface MaterialWireEntry {
  endConnector?: HarnessNode;
  endPin: number;
  forward: boolean;
  startConnector?: HarnessNode;
  startPin: number;
  wire: Wire;
}

type PinSide = 'start' | 'end';

function getWireColorHex(colorId: string): string {
  return WIRE_COLORS.find((color) => color.id === colorId)?.hex ?? '#6B7280';
}

function AddWirePrompt({
  materialId,
  attachments,
  nodes,
}: {
  materialId: string;
  attachments: MaterialAttachment[];
  nodes: HarnessNode[];
}) {
  const { addWire, addConnection, updateCanvasMaterial } = useHarnessStore();
  const [pin, setPin] = useState('Pin1');
  const [color, setColor] = useState('red');
  const [signal, setSignal] = useState('');
  const [pinError, setPinError] = useState(false);

  const connectedAttachment = attachments[0];
  const connectedConnector = connectedAttachment
    ? nodes.find((n) => n.id === connectedAttachment.connectorNodeId)
    : undefined;

  if (!connectedAttachment || !connectedConnector) return null;

  const handleAdd = () => {
    const match = pin.trim().match(/^pin(\d+)$/i);
    const pinNum = match ? parseInt(match[1], 10) : NaN;
    const maxPin = connectedConnector.connector?.pinCount ?? 0;
    if (!Number.isFinite(pinNum) || pinNum < 1 || (maxPin > 0 && pinNum > maxPin)) {
      setPinError(true);
      return;
    }

    const state = useHarnessStore.getState();
    const material = (state.config.canvasMaterials ?? []).find((m) => m.id === materialId);

    let connectionId = material?.connectionId;
    if (!connectionId) {
      const connId = crypto.randomUUID();
      addConnection({
        id: connId,
        name: material?.name ?? '新线缆束',
        fromNodeId: connectedAttachment.connectorNodeId,
        toNodeId: connectedAttachment.connectorNodeId,
        wireIds: [],
      });
      updateCanvasMaterial(materialId, { connectionId: connId });
      connectionId = connId;
    }

    const wireId = crypto.randomUUID();
    addWire({
      id: wireId,
      name: `W${(state.config.wires.length + 1)}`,
      wireGauge: 26,
      wireType: 'silicone',
      wireColor: color,
      lengthMm: material?.spec.kind === 'electronic'
        ? material.spec.lengthMm
        : material?.spec.kind === 'jacketed'
          ? material.spec.lengthMm
          : 300,
      fromConnectorId: connectedAttachment.connectorNodeId,
      fromPin: pinNum,
      toConnectorId: connectedAttachment.connectorNodeId,
      toPin: pinNum,
      signalName: signal || undefined,
    });

    const freshState = useHarnessStore.getState();
    const conn = freshState.config.connections.find((c) => c.id === connectionId);
    if (conn) {
      useHarnessStore.getState().updateConnection(connectionId, {
        wireIds: [...conn.wireIds, wireId],
      });
    }

    setPin('Pin1');
    setSignal('');
    setPinError(false);
  };

  return (
    <div className="space-y-1">
      <div className="text-[10px] text-slate-400 mb-1">
        已连接：{connectedConnector.label}（{connectedAttachment.endpoint === 'start' ? '左端' : '右端'}）
      </div>
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={pin}
          onChange={(e) => { setPin(e.target.value); setPinError(false); }}
          className={`nodrag nopan min-w-[42px] rounded border px-1 py-0 text-[10px] text-blue-600 font-semibold outline-none ${
            pinError ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50 focus:border-blue-200 focus:bg-blue-50'
          }`}
        />
        <label className="nodrag nopan relative flex h-2.5 w-2.5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-200">
          <span className="h-full w-full rounded-full" style={{ backgroundColor: getWireColorHex(color) }} />
          <select
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {WIRE_COLORS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <input
          type="text"
          value={signal}
          onChange={(e) => setSignal(e.target.value)}
          placeholder="SIG"
          className="nodrag nopan max-w-[56px] flex-1 rounded border border-transparent bg-transparent px-1 py-0 text-[10px] text-slate-700 font-medium outline-none focus:border-slate-200 focus:bg-slate-50"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="nodrag nopan flex h-4 w-4 items-center justify-center rounded bg-blue-500 text-white hover:bg-blue-600"
          title="添加导线"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function getMaterialWireEntries(
  attachments: MaterialAttachment[],
  nodes: HarnessNode[],
  wires: Wire[],
  connectionWireIds?: Set<string>,
): MaterialWireEntry[] {
  const startAttachment = attachments.find((attachment) => attachment.endpoint === 'start');
  const endAttachment = attachments.find((attachment) => attachment.endpoint === 'end');

  if (!startAttachment && !endAttachment) return [];

  const startConnector = startAttachment
    ? nodes.find((node) => node.id === startAttachment.connectorNodeId)
    : undefined;
  const endConnector = endAttachment
    ? nodes.find((node) => node.id === endAttachment.connectorNodeId)
    : undefined;

  // Collect connector IDs present on each side
  const startNodeId = startAttachment?.connectorNodeId;
  const endNodeId = endAttachment?.connectorNodeId;

  return wires.reduce<MaterialWireEntry[]>((entries, wire) => {
    if (connectionWireIds && !connectionWireIds.has(wire.id)) return entries;

    const fromIsStart = startNodeId ? wire.fromConnectorId === startNodeId : false;
    const fromIsEnd = endNodeId ? wire.fromConnectorId === endNodeId : false;
    const toIsStart = startNodeId ? wire.toConnectorId === startNodeId : false;
    const toIsEnd = endNodeId ? wire.toConnectorId === endNodeId : false;

    // Both sides connected: match wire endpoints to material endpoints
    if (startNodeId && endNodeId) {
      if (fromIsStart && toIsEnd) {
        entries.push({ wire, forward: true, startPin: wire.fromPin, endPin: wire.toPin, startConnector, endConnector });
        return entries;
      }
      if (fromIsEnd && toIsStart) {
        entries.push({ wire, forward: false, startPin: wire.toPin, endPin: wire.fromPin, startConnector, endConnector });
        return entries;
      }
      return entries;
    }

    // Only start connected: show wires touching the start connector
    if (startNodeId && !endNodeId) {
      if (fromIsStart) {
        entries.push({ wire, forward: true, startPin: wire.fromPin, endPin: wire.toPin, startConnector, endConnector: undefined });
      } else if (toIsStart) {
        entries.push({ wire, forward: false, startPin: wire.toPin, endPin: wire.fromPin, startConnector, endConnector: undefined });
      }
      return entries;
    }

    // Only end connected: show wires touching the end connector
    if (endNodeId && !startNodeId) {
      if (fromIsEnd) {
        entries.push({ wire, forward: true, startPin: wire.fromPin, endPin: wire.toPin, startConnector: undefined, endConnector });
      } else if (toIsEnd) {
        entries.push({ wire, forward: false, startPin: wire.toPin, endPin: wire.fromPin, startConnector: undefined, endConnector });
      }
    }

    return entries;
  }, []).sort((a, b) => {
    if (a.startPin !== b.startPin) return a.startPin - b.startPin;
    return a.endPin - b.endPin;
  });
}

function pinDraftKey(wireId: string, side: PinSide): string {
  return `${wireId}:${side}`;
}

function normalizePinLabel(pin: number): string {
  return `Pin${pin}`;
}

function parsePinInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^pin(\d+)$/i);
  if (!match) return Number.NaN;
  const pin = Number.parseInt(match[1], 10);
  return Number.isFinite(pin) && pin > 0 ? pin : Number.NaN;
}

export function WireMaterialNode({ data, selected }: WireMaterialNodeProps) {
  const [detailsOpen, setDetailsOpen] = useState(data.expandedByDefault ?? false);
  const [pinDrafts, setPinDrafts] = useState<Record<string, string>>({});
  const [pinErrors, setPinErrors] = useState<Record<string, boolean>>({});
  const previousAttachmentCountRef = useRef(0);
  const {
    config,
    updateCanvasMaterial,
    updateWire,
  } = useHarnessStore();

  const spec = data.spec;
  const isElectronic = spec.kind === 'electronic';
  const electronicColor = spec.kind === 'electronic'
    ? WIRE_COLORS.find((color) => color.id === spec.color)?.hex ?? '#64748b'
    : null;
  const bodyColor = spec.kind === 'electronic'
    ? electronicColor
    : spec.jacketColor === 'green'
      ? '#15803d'
      : '#1e293b';
  const description = spec.kind === 'electronic'
    ? `电子线 · UL${spec.ulNumber} · ${spec.awg}AWG · ${spec.lengthMm}mm`
    : `护套线 · ${spec.jacketMaterial} · ${spec.coreCount}芯 · ${spec.lengthMm}mm · OD ${spec.odMm.toFixed(2)}mm`;

  const attachments = useMemo(
    () => (config.materialAttachments ?? []).filter((attachment) => attachment.materialId === data.id),
    [config.materialAttachments, data.id],
  );
  const hasStartAttachment = attachments.some((attachment) => attachment.endpoint === 'start');
  const hasEndAttachment = attachments.some((attachment) => attachment.endpoint === 'end');

  useEffect(() => {
    if (attachments.length > previousAttachmentCountRef.current) {
      setDetailsOpen(true);
    }
    previousAttachmentCountRef.current = attachments.length;
  }, [attachments.length]);

  const relatedWireEntries = useMemo(
    () => {
      const connection = data.connectionId
        ? config.connections.find((item) => item.id === data.connectionId)
        : undefined;
      const connectionWireIds = connection
        ? new Set(connection.wireIds)
        : undefined;
      return getMaterialWireEntries(
        attachments,
        config.nodes,
        config.wires,
        connectionWireIds,
      );
    },
    [attachments, config.connections, config.nodes, config.wires, data.connectionId],
  );

  const syncMaterialColor = (nextColor: string) => {
    if (data.spec.kind !== 'electronic') return;
    if (data.spec.color === nextColor) return;
    updateCanvasMaterial(data.id, {
      spec: {
        ...data.spec,
        color: nextColor,
      },
    });
  };

  const commitPinDraft = (entry: MaterialWireEntry, side: PinSide) => {
    const key = pinDraftKey(entry.wire.id, side);
    const draft = pinDrafts[key] ?? normalizePinLabel(side === 'start' ? entry.startPin : entry.endPin);
    const parsed = parsePinInput(draft);

    if (parsed === null) {
      setPinDrafts((current) => ({ ...current, [key]: '' }));
      setPinErrors((current) => ({ ...current, [key]: false }));
      return;
    }

    if (!Number.isFinite(parsed)) {
      setPinErrors((current) => ({ ...current, [key]: true }));
      return;
    }

    const maxPin = side === 'start'
      ? entry.startConnector?.connector?.pinCount
      : entry.endConnector?.connector?.pinCount;
    if (maxPin && parsed > maxPin) {
      setPinErrors((current) => ({ ...current, [key]: true }));
      return;
    }

    if (side === 'start') {
      updateWire(entry.wire.id, entry.forward ? { fromPin: parsed } : { toPin: parsed });
    } else {
      updateWire(entry.wire.id, entry.forward ? { toPin: parsed } : { fromPin: parsed });
    }

    setPinDrafts((current) => ({ ...current, [key]: normalizePinLabel(parsed) }));
    setPinErrors((current) => ({ ...current, [key]: false }));
  };

  const resetPinDraft = (entry: MaterialWireEntry, side: PinSide) => {
    const key = pinDraftKey(entry.wire.id, side);
    const nextLabel = normalizePinLabel(side === 'start' ? entry.startPin : entry.endPin);
    setPinDrafts((current) => ({ ...current, [key]: nextLabel }));
    setPinErrors((current) => ({ ...current, [key]: false }));
  };

  return (
    <div
      className="relative wire-material-drag cursor-grab active:cursor-grabbing"
      style={{ width: data.width, minHeight: CANVAS_MATERIAL_HEIGHT }}
    >
      <Handle
        id="start"
        type="source"
        position={Position.Left}
        className="!h-4 !w-4 !border-2 !border-white !bg-amber-500 shadow"
        style={{ top: CANVAS_MATERIAL_SLEEVE_CENTER_Y }}
      />
      <Handle
        id="end"
        type="source"
        position={Position.Right}
        className="!h-4 !w-4 !border-2 !border-white !bg-amber-500 shadow"
        style={{ top: CANVAS_MATERIAL_SLEEVE_CENTER_Y }}
      />

      <div className="rounded-full px-2 py-1.5">
        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          aria-expanded={detailsOpen}
          className={`block w-full rounded-full text-left outline-none transition hover:scale-[1.01] focus:ring-2 focus:ring-blue-200 ${
            selected ? 'ring-2 ring-blue-300 ring-offset-2' : ''
          }`}
        >
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full w-full"
              style={{
                backgroundColor: bodyColor ?? '#64748b',
                backgroundImage: isElectronic
                  ? 'linear-gradient(180deg, rgba(255,255,255,.45), transparent 45%, rgba(0,0,0,.18))'
                  : spec.kind === 'jacketed' && spec.shielded
                    ? 'repeating-linear-gradient(135deg, rgba(255,255,255,.22) 0 3px, transparent 3px 7px)'
                    : 'linear-gradient(180deg, rgba(255,255,255,.28), transparent 50%, rgba(0,0,0,.25))',
              }}
            />
          </div>
        </button>
      </div>

      {detailsOpen && (
        <div className="mt-2 min-w-[140px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 shadow-md">
          <div className="mb-1 border-b border-slate-100 pb-1 text-center font-semibold text-slate-700">
            {relatedWireEntries.length} 根导线 - {data.name}
          </div>
          <div className="mb-1.5 truncate text-[10px] leading-3 text-slate-500">
            {description}
          </div>

          <div className="space-y-0.5">
            {relatedWireEntries.length > 0 ? (
              relatedWireEntries.map((entry) => {
                const startKey = pinDraftKey(entry.wire.id, 'start');
                const endKey = pinDraftKey(entry.wire.id, 'end');
                const startValue = pinDrafts[startKey] ?? normalizePinLabel(entry.startPin);
                const endValue = pinDrafts[endKey] ?? normalizePinLabel(entry.endPin);

                return (
                  <div key={entry.wire.id} className="flex items-center gap-1.5 text-[10px]">
                    {entry.startConnector ? (
                      <input
                        type="text"
                        value={startValue}
                        onChange={(event) => {
                          const value = event.target.value;
                          setPinDrafts((current) => ({ ...current, [startKey]: value }));
                          setPinErrors((current) => ({ ...current, [startKey]: false }));
                        }}
                        onBlur={() => commitPinDraft(entry, 'start')}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                          if (event.key === 'Escape') { resetPinDraft(entry, 'start'); event.currentTarget.blur(); }
                        }}
                        className={`nodrag nopan min-w-[42px] rounded border px-1 py-0 text-blue-600 font-semibold outline-none ${
                          pinErrors[startKey] ? 'border-red-200 bg-red-50' : 'border-transparent bg-transparent focus:border-blue-200 focus:bg-blue-50'
                        }`}
                      />
                    ) : (
                      <span className="min-w-[42px] px-1 text-slate-300">—</span>
                    )}
                    <span className="text-slate-400">→</span>
                    {entry.endConnector ? (
                      <input
                        type="text"
                        value={endValue}
                        onChange={(event) => {
                          const value = event.target.value;
                          setPinDrafts((current) => ({ ...current, [endKey]: value }));
                          setPinErrors((current) => ({ ...current, [endKey]: false }));
                        }}
                        onBlur={() => commitPinDraft(entry, 'end')}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                          if (event.key === 'Escape') { resetPinDraft(entry, 'end'); event.currentTarget.blur(); }
                        }}
                        className={`nodrag nopan min-w-[42px] rounded border px-1 py-0 text-emerald-600 font-semibold outline-none ${
                          pinErrors[endKey] ? 'border-red-200 bg-red-50' : 'border-transparent bg-transparent focus:border-emerald-200 focus:bg-emerald-50'
                        }`}
                      />
                    ) : (
                      <span className="min-w-[42px] px-1 text-slate-300">—</span>
                    )}
                    <label className="nodrag nopan relative flex h-2.5 w-2.5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-200">
                      <span
                        className="h-full w-full rounded-full"
                        title={WIRE_COLORS.find((color) => color.id === entry.wire.wireColor)?.name ?? entry.wire.wireColor}
                        style={{ backgroundColor: getWireColorHex(entry.wire.wireColor) }}
                      />
                      <select
                        value={entry.wire.wireColor}
                        onChange={(event) => {
                          const nextColor = event.target.value;
                          updateWire(entry.wire.id, { wireColor: nextColor });
                          if (relatedWireEntries.length === 1) {
                            syncMaterialColor(nextColor);
                          }
                        }}
                        className="absolute inset-0 cursor-pointer opacity-0"
                      >
                        {WIRE_COLORS.map((color) => (
                          <option key={color.id} value={color.id}>{color.name}</option>
                        ))}
                      </select>
                    </label>
                    <input
                      type="text"
                      value={entry.wire.signalName ?? ''}
                      onChange={(event) => updateWire(entry.wire.id, {
                        signalName: event.target.value || undefined,
                      })}
                      placeholder="SIG"
                      className="nodrag nopan max-w-[72px] flex-1 rounded border border-transparent bg-transparent px-1 py-0 text-slate-700 font-medium outline-none focus:border-slate-200 focus:bg-slate-50"
                    />
                  </div>
                );
              })
            ) : (hasStartAttachment || hasEndAttachment) ? (
              <AddWirePrompt
                materialId={data.id}
                attachments={attachments}
                nodes={config.nodes}
              />
            ) : (
              <div className="text-[10px] text-slate-500">
                把线材两端连接到连接器后，在这里编辑 Pin、颜色和信号名。
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

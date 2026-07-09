import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Tag, X } from 'lucide-react';
import { Handle, Position } from '@xyflow/react';
import {
  getMaterialNodeHeight,
  getMaterialCenterY,
  getMaterialStripHeight,
  resolveColor,
} from '@/lib/canvasMaterials';
import { WIRE_COLORS } from '@/lib/data';
import { useHarnessStore } from '@/stores/harnessStore';
import {
  detachMaterialEndpoint,
  reassignMaterialEndpoint,
  removeMaterialCircuit,
  updateMaterialCircuit,
  getJumperNetwork,
  getActiveConnectorSide,
} from '@/lib/commands';
import type {
  CanvasWireMaterial,
  ConnectorInstance,
  MaterialCircuit,
  MaterialEndpoint,
  ConnectorSide,
  HarnessConfig,
} from '@/types/harness';
import {
  openMaterialAccessoryContextMenu,
} from './materialAccessoryEvents';
import { selectMaterialConnectionPoint } from './materialConnectionClick';

export interface WireMaterialNodeData extends CanvasWireMaterial {
  detailMaterialIds?: string[];
  showMergedDetails?: boolean;
  onRequestRemoveCircuit?: (materialId: string, circuitId: string) => void;
}

interface WireMaterialNodeProps {
  data: WireMaterialNodeData;
  selected?: boolean;
}

interface DetailRow {
  id: string;
  material: CanvasWireMaterial;
  circuit?: MaterialCircuit;
}

function materialDescription(material: CanvasWireMaterial): string {
  const spec = material.spec;
  return spec.kind === 'electronic'
    ? `UL${spec.ulNumber} · ${spec.awg}AWG · ${spec.lengthMm}mm`
    : `${spec.jacketMaterial} · ${spec.coreCount}芯 · ${spec.lengthMm}mm · OD ${spec.odMm.toFixed(2)}mm${spec.ulNumber ? ` · ${spec.ulNumber}` : ''}`;
}

function estimateColumnWidth(values: string[], minWidth: number, maxWidth: number, charWidth = 6.4) {
  const longest = values.reduce((max, value) => Math.max(max, value.length), 0);
  return Math.min(maxWidth, Math.max(minWidth, Math.round(longest * charWidth)));
}

function connectorRefs(circuit: MaterialCircuit | undefined, connectorId: string) {
  if (!circuit) return [];
  return (['start', 'end'] as MaterialEndpoint[])
    .map((endpoint) => ({ endpoint, ref: circuit[endpoint] }))
    .filter(({ ref }) => ref?.connectorId === connectorId);
}

function getTargetEndpointAndSide(
  circuit: MaterialCircuit,
  material: CanvasWireMaterial,
  connector: ConnectorInstance,
  config: HarnessConfig
): { endpoint: MaterialEndpoint; side: ConnectorSide } {
  let endpoint: MaterialEndpoint = 'start';
  if (circuit.start) {
    endpoint = 'end';
  }
  let side = getActiveConnectorSide(config, connector.id);
  if (!side) {
    side = connector.position.x < material.position.x ? 'right' : 'left';
  }
  return { endpoint, side };
}

function WireMaterialNodeImpl({ data, selected }: WireMaterialNodeProps) {
  const [detailsOpen, setDetailsOpen] = useState(data.expandedByDefault ?? false);
  const previousCircuitCountRef = useRef(0);
  const { config } = useHarnessStore();

  const spec = data.spec;
  const isElectronic = spec.kind === 'electronic';
  const electronicColor = isElectronic
    ? resolveColor(spec.color).hex
    : null;
  const bodyColor = isElectronic
    ? electronicColor
    : spec.jacketColor === 'green'
      ? '#15803d'
      : '#1e293b';

  const detailMaterials = useMemo(() => {
    const ids = data.detailMaterialIds?.length ? data.detailMaterialIds : [data.id];
    return ids
      .map((id) => config.materials.find((material) => material.id === id))
      .filter((material): material is CanvasWireMaterial => Boolean(material));
  }, [config.materials, data.detailMaterialIds, data.id]);

  const rows = useMemo<DetailRow[]>(() => {
    if (detailMaterials.length > 1 && detailMaterials.every((material) => material.spec.kind === 'electronic')) {
      return detailMaterials.map((material) => ({
        id: material.id,
        material,
        circuit: material.circuits[0],
      }));
    }

    return detailMaterials.flatMap((material) =>
      material.circuits.length > 0
        ? material.circuits.map((circuit) => ({
            id: `${material.id}:${circuit.id}`,
            material,
            circuit,
          }))
        : [{ id: `${material.id}:empty`, material }],
    );
  }, [detailMaterials]);

  const connectorColumns = useMemo(() => {
    const connectedIds = new Set<string>();
    for (const material of detailMaterials) {
      for (const circuit of material.circuits) {
        if (circuit.start) connectedIds.add(circuit.start.connectorId);
        if (circuit.end) connectedIds.add(circuit.end.connectorId);
      }
    }
    return config.connectors.filter((connector) => connectedIds.has(connector.id));
  }, [config.connectors, detailMaterials]);

  const connectedCircuitCount = detailMaterials.reduce(
    (sum, material) => sum + material.circuits.filter((c) => c.start || c.end).length,
    0,
  );
  const electronicMaterialCount = detailMaterials.filter((material) => material.spec.kind === 'electronic').length;
  const jacketedMaterialCount = detailMaterials.filter((material) => material.spec.kind === 'jacketed').length;
  const showMergedDetails = data.showMergedDetails ?? true;

  const labelOffset = useMemo(() => {
    const attachedSleeves = config.protectiveSleeves.filter((sleeve) =>
      sleeve.attachedMaterialIds.includes(data.id),
    );
    const overlapAboveWire = attachedSleeves.reduce((max, sleeve) => (
      Math.max(max, Math.max(0, data.position.y - sleeve.position.y))
    ), 0);
    return overlapAboveWire > 0 ? overlapAboveWire + 6 : 2;
  }, [config.protectiveSleeves, data.id, data.position.y]);

  useEffect(() => {
    if (connectedCircuitCount > previousCircuitCountRef.current) {
      setDetailsOpen(true);
    }
    previousCircuitCountRef.current = connectedCircuitCount;
  }, [connectedCircuitCount]);

  const handleUpdateCircuit = (
    materialId: string,
    circuitId: string,
    patch: Partial<Pick<MaterialCircuit, 'color' | 'signalName'>>,
  ) => {
    const state = useHarnessStore.getState();
    state.replaceDocument(updateMaterialCircuit(state.config, materialId, circuitId, patch));
  };

  const handleRemoveCircuit = (materialId: string, circuitId: string) => {
    if (data.onRequestRemoveCircuit) {
      data.onRequestRemoveCircuit(materialId, circuitId);
      return;
    }
    const state = useHarnessStore.getState();
    state.replaceDocument(removeMaterialCircuit(state.config, materialId, circuitId));
  };

  const materialColumnWidth = estimateColumnWidth(
    ['线材', ...detailMaterials.map((material) => materialDescription(material))],
    110,
    280,
  );
  const signalDefinitionColumnWidth = estimateColumnWidth(
    ['接线定义', ...rows.map((row) => row.circuit?.signalName?.trim() || '')],
    56,
    180,
    7.2,
  );
  const panelWidth = Math.max(
    300,
    materialColumnWidth + connectorColumns.length * 80 + signalDefinitionColumnWidth + 60,
  );
  const gridColumns = `${materialColumnWidth}px ${connectorColumns.map(() => '76px').join(' ')} 36px ${signalDefinitionColumnWidth}px`;
  const detailTitle = electronicMaterialCount > 0
    ? `${electronicMaterialCount} 条电子线`
    : `${Math.max(jacketedMaterialCount, detailMaterials.length || 1)} 条护套线`;

  return (
    <div
      className="relative wire-material-drag cursor-grab active:cursor-grabbing"
      style={{ width: data.width, minHeight: getMaterialNodeHeight(spec.kind) }}
    >
      <Handle
        id="start"
        type="source"
        position={Position.Left}
        onClick={(event) => {
          event.stopPropagation();
          selectMaterialConnectionPoint({ kind: 'material', materialId: data.id, endpoint: 'start' });
        }}
        className={`!border-2 !border-white !bg-amber-500 shadow ${
          isElectronic ? '!h-4 !w-4' : '!h-6 !w-6'
        }`}
        style={{ top: getMaterialCenterY(spec.kind) }}
      />
      <Handle
        id="end"
        type="source"
        position={Position.Right}
        onClick={(event) => {
          event.stopPropagation();
          selectMaterialConnectionPoint({ kind: 'material', materialId: data.id, endpoint: 'end' });
        }}
        className={`!border-2 !border-white !bg-amber-500 shadow ${
          isElectronic ? '!h-4 !w-4' : '!h-6 !w-6'
        }`}
        style={{ top: getMaterialCenterY(spec.kind) }}
      />

      {data.labels?.length ? (
        <div
          className="pointer-events-none absolute bottom-full left-1/2 z-10 flex -translate-x-1/2 gap-1 whitespace-nowrap"
          style={{ marginBottom: labelOffset }}
        >
          {data.labels.map((label) => (
            <button
              key={label.id}
              type="button"
              title={`${label.material} · ${label.lengthMm}mm`}
              onMouseDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openMaterialAccessoryContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  materialId: data.id,
                  kind: 'label',
                  accessoryId: label.id,
                });
              }}
              className="pointer-events-auto rounded bg-amber-100 px-1 text-[8px] text-amber-800 hover:bg-amber-200"
            >
              <Tag className="mr-0.5 inline h-2 w-2" />{label.content}
            </button>
          ))}
        </div>
      ) : null}

      <div className="rounded-full px-2 py-1.5">
        <button
          type="button"
          onClick={() => {
            if (showMergedDetails) setDetailsOpen((open) => !open);
          }}
          aria-expanded={showMergedDetails ? detailsOpen : undefined}
          title={showMergedDetails ? '展开或收起线材信息' : '该组信息显示在最下方线材'}
          className={`block w-full rounded-full text-left outline-none transition hover:scale-[1.01] focus:ring-2 focus:ring-blue-200 ${
            selected ? 'ring-2 ring-blue-300 ring-offset-2' : ''
          }`}
        >
          <div style={{ height: getMaterialStripHeight(spec.kind) }} className="overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full w-full"
              style={{
                backgroundColor: bodyColor ?? '#64748b',
                backgroundImage: isElectronic
                  ? 'linear-gradient(180deg, rgba(255,255,255,.45), transparent 45%, rgba(0,0,0,.18))'
                  : spec.shielded
                    ? 'repeating-linear-gradient(135deg, rgba(255,255,255,.22) 0 3px, transparent 3px 7px)'
                    : 'linear-gradient(180deg, rgba(255,255,255,.28), transparent 50%, rgba(0,0,0,.25))',
              }}
            />
          </div>
        </button>
      </div>

      {showMergedDetails && detailsOpen && (
        <div
          className="relative left-1/2 mt-[44px] -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 shadow-md"
          style={{ width: panelWidth }}
        >
          <div className="mb-1 border-b border-slate-100 pb-1 text-center font-semibold text-slate-700">
            {detailTitle}
          </div>

          <div
            className="mb-0.5 grid items-end gap-1 border-b border-slate-100 pb-1 text-[9px] font-semibold text-slate-400"
            style={{ gridTemplateColumns: gridColumns }}
          >
            <span className="text-left">线材</span>
            {connectorColumns.map((connector) => (
              <span key={connector.id} className="min-w-0 text-center" title={`${connector.label} · ${connector.connector.name}`}>
                <span className="block truncate text-slate-600">{connector.label}</span>
                <span className="block truncate font-normal">{connector.connector.name}</span>
              </span>
            ))}
            <span className="text-center">颜色</span>
            <span className="text-center">接线定义</span>
          </div>

          <div className="space-y-0.5">
            {rows.map((row) => {
              const circuit = row.circuit;
              return (
                <div
                  key={row.id}
                  className="grid items-center gap-1 text-[10px]"
                  style={{ gridTemplateColumns: gridColumns }}
                >
                  <span className="min-w-0" title={materialDescription(row.material)}>
                    <span className="block whitespace-normal break-words text-[8px] font-normal leading-[1.2] text-slate-500">
                      {materialDescription(row.material)}
                    </span>
                  </span>

                  {connectorColumns.map((connector) => {
                    const matches = connectorRefs(circuit, connector.id);
                    const match = matches[0];
                    if (match?.ref && circuit) {
                      return (
                        <PinInput
                          key={`${connector.id}:${match.endpoint}:${match.ref.pin}`}
                          connector={connector}
                          materialId={row.material.id}
                          circuitId={circuit.id}
                          endpoint={match.endpoint}
                          pin={match.ref.pin}
                          side={match.ref.connectorSide}
                        />
                      );
                    } else {
                      const target = getTargetEndpointAndSide(circuit, row.material, connector, config);
                      return (
                        <PinInput
                          key={`${connector.id}:empty-${circuit.id}`}
                          connector={connector}
                          materialId={row.material.id}
                          circuitId={circuit.id}
                          endpoint={target.endpoint}
                          pin={undefined}
                          side={target.side}
                        />
                      );
                    }
                  })}

                  <div className="flex justify-center">
                    {circuit ? (() => {
                      const colorEntry = resolveColor(circuit.color);
                      return (
                        <div
                          className="h-3 w-3 rounded-full border border-slate-200"
                          title={colorEntry.name}
                          style={{ backgroundColor: colorEntry.hex }}
                        />
                      );
                    })() : null}
                  </div>

                  <input
                    type="text"
                    value={circuit?.signalName ?? ''}
                    disabled={!circuit}
                    onChange={(event) => {
                      if (circuit) {
                        handleUpdateCircuit(row.material.id, circuit.id, { signalName: event.target.value });
                      }
                    }}
                    placeholder="SIG"
                    className="nodrag nopan min-w-0 rounded border border-transparent bg-transparent px-1 py-0 font-medium text-slate-700 outline-none focus:border-slate-200 focus:bg-slate-50 disabled:text-slate-300"
                  />
                </div>
              );
            })}

            {connectedCircuitCount === 0 && (
              <div className="py-1 text-center text-[10px] text-slate-400">
                点击线材端点和连接器 PIN 点即可建立连接。
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getFormattedPinValue(connector: ConnectorInstance, side: ConnectorSide, pin: number | undefined): string {
  if (pin === undefined) return '';
  const network = getJumperNetwork(connector.jumpers, side, pin);
  const sorted = Array.from(network).sort((a, b) => a - b);
  return sorted.map(p => `Pin${p}`).join(', ');
}

function PinInput({
  connector,
  materialId,
  circuitId,
  endpoint,
  pin,
  side,
}: {
  connector: ConnectorInstance;
  materialId: string;
  circuitId: string;
  endpoint: MaterialEndpoint;
  pin: number | undefined;
  side: ConnectorSide;
}) {
  const currentNetworkValue = useMemo(() => {
    return getFormattedPinValue(connector, side, pin);
  }, [connector, side, pin]);

  const [value, setValue] = useState(currentNetworkValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(currentNetworkValue);
  }, [currentNetworkValue]);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed === '') {
      if (pin !== undefined) {
        const state = useHarnessStore.getState();
        state.replaceDocument(detachMaterialEndpoint(state.config, materialId, circuitId, endpoint));
      }
      setError(null);
      return;
    }

    const tokens = trimmed.split(/[,\s;，；]+/);
    const pins: number[] = [];
    for (const token of tokens) {
      const t = token.trim();
      if (!t) continue;
      const match = /^(?:pin)?(\d+)$/i.exec(t);
      if (!match) {
        setError('格式错误，例如 "Pin1, Pin2"');
        return;
      }
      pins.push(Number(match[1]));
    }

    if (pins.length === 0) {
      setError('请输入 Pin 编号');
      return;
    }

    const maxPin = connector.connector.pinCount;
    if (pins.some(p => p < 1 || p > maxPin)) {
      setError(`范围：Pin1-Pin${maxPin}`);
      return;
    }

    const uniquePins: number[] = [];
    for (const p of pins) {
      if (!uniquePins.includes(p)) {
        uniquePins.push(p);
      }
    }

    const uniquePinsSorted = [...uniquePins].sort((a, b) => a - b);
    const newPinsFormatted = uniquePinsSorted.map(p => `Pin${p}`).join(', ');

    if (newPinsFormatted === currentNetworkValue) {
      setError(null);
      setValue(currentNetworkValue);
      return;
    }

    const state = useHarnessStore.getState();
    const next = reassignMaterialEndpoint(state.config, {
      materialId,
      circuitId,
      endpoint,
      connectorId: connector.id,
      connectorSide: side,
      pin: uniquePins[0],
      pins: uniquePins,
    });

    if (next === state.config) {
      setError('该连接与当前连接规则冲突');
      setValue(currentNetworkValue);
      return;
    }

    state.replaceDocument(next);
    setError(null);
  };

  return (
    <input
      type="text"
      value={value}
      placeholder="—"
      aria-label={`${connector.label} PIN`}
      title={error ?? `${connector.label} · ${connector.connector.name}`}
      onChange={(event) => {
        setValue(event.target.value);
        setError(null);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
      className={`nodrag nopan min-w-0 rounded border px-1 py-0.5 text-center font-semibold outline-none ${
        error
          ? 'border-red-300 bg-red-50 text-red-600'
          : 'border-blue-100 bg-blue-50/60 text-blue-700 focus:border-blue-300'
      }`}
    />
  );
}

export const WireMaterialNode = memo(WireMaterialNodeImpl);

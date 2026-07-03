import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Tag, X } from 'lucide-react';
import { Handle, Position } from '@xyflow/react';
import {
  CANVAS_MATERIAL_HEIGHT,
  CANVAS_MATERIAL_SLEEVE_CENTER_Y,
} from '@/lib/canvasMaterials';
import { WIRE_COLORS } from '@/lib/data';
import { useHarnessStore } from '@/stores/harnessStore';
import {
  detachMaterialEndpoint,
  reassignMaterialEndpoint,
  removeMaterialCircuit,
  updateMaterialCircuit,
} from '@/lib/commands';
import type {
  CanvasWireMaterial,
  ConnectorInstance,
  MaterialCircuit,
  MaterialEndpoint,
} from '@/types/harness';
import {
  openMaterialAccessoryContextMenu,
} from './materialAccessoryEvents';
import { selectMaterialConnectionPoint } from './materialConnectionClick';

export interface WireMaterialNodeData extends CanvasWireMaterial {
  detailMaterialIds?: string[];
  showMergedDetails?: boolean;
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

function getColorHex(colorId: string): string {
  return WIRE_COLORS.find((color) => color.id === colorId)?.hex ?? '#6B7280';
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

function WireMaterialNodeImpl({ data, selected }: WireMaterialNodeProps) {
  const [detailsOpen, setDetailsOpen] = useState(data.expandedByDefault ?? false);
  const previousCircuitCountRef = useRef(0);
  const { config } = useHarnessStore();

  const spec = data.spec;
  const isElectronic = spec.kind === 'electronic';
  const electronicColor = isElectronic
    ? WIRE_COLORS.find((color) => color.id === spec.color)?.hex ?? '#64748b'
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

  const circuitCount = detailMaterials.reduce((sum, material) => sum + material.circuits.length, 0);
  const electronicMaterialCount = detailMaterials.filter((material) => material.spec.kind === 'electronic').length;
  const jacketedMaterialCount = detailMaterials.filter((material) => material.spec.kind === 'jacketed').length;
  const showMergedDetails = data.showMergedDetails ?? true;

  useEffect(() => {
    if (circuitCount > previousCircuitCountRef.current) {
      setDetailsOpen(true);
    }
    previousCircuitCountRef.current = circuitCount;
  }, [circuitCount]);

  const handleUpdateCircuit = (
    materialId: string,
    circuitId: string,
    patch: Partial<Pick<MaterialCircuit, 'color' | 'signalName'>>,
  ) => {
    const state = useHarnessStore.getState();
    state.replaceDocument(updateMaterialCircuit(state.config, materialId, circuitId, patch));
  };

  const handleRemoveCircuit = (materialId: string, circuitId: string) => {
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
    materialColumnWidth + connectorColumns.length * 82 + 42 + signalDefinitionColumnWidth + 22,
  );
  const gridColumns = `${materialColumnWidth}px ${connectorColumns.map(() => '76px').join(' ')} 36px ${signalDefinitionColumnWidth}px 18px`;
  const detailTitle = electronicMaterialCount > 0
    ? `${electronicMaterialCount} 条电子线`
    : `${Math.max(jacketedMaterialCount, detailMaterials.length || 1)} 条护套线`;

  return (
    <div
      className="relative wire-material-drag cursor-grab active:cursor-grabbing"
      style={{ width: data.width, minHeight: CANVAS_MATERIAL_HEIGHT }}
    >
      <Handle
        id="start"
        type="source"
        position={Position.Left}
        onClick={(event) => {
          event.stopPropagation();
          selectMaterialConnectionPoint({ kind: 'material', materialId: data.id, endpoint: 'start' });
        }}
        className="!h-4 !w-4 !border-2 !border-white !bg-amber-500 shadow"
        style={{ top: CANVAS_MATERIAL_SLEEVE_CENTER_Y }}
      />
      <Handle
        id="end"
        type="source"
        position={Position.Right}
        onClick={(event) => {
          event.stopPropagation();
          selectMaterialConnectionPoint({ kind: 'material', materialId: data.id, endpoint: 'end' });
        }}
        className="!h-4 !w-4 !border-2 !border-white !bg-amber-500 shadow"
        style={{ top: CANVAS_MATERIAL_SLEEVE_CENTER_Y }}
      />

      {data.labels?.length ? (
        <div className="pointer-events-none absolute bottom-full left-1/2 mb-0.5 flex -translate-x-1/2 gap-1 whitespace-nowrap">
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
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
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
          className="relative left-1/2 mt-2 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 shadow-md"
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
            <span />
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
                    return match?.ref && circuit ? (
                      <PinInput
                        key={`${connector.id}:${match.endpoint}:${match.ref.pin}`}
                        connector={connector}
                        materialId={row.material.id}
                        circuitId={circuit.id}
                        endpoint={match.endpoint}
                        pin={match.ref.pin}
                      />
                    ) : (
                      <span key={connector.id} className="text-center text-slate-300">—</span>
                    );
                  })}

                  <div className="flex justify-center">
                    {circuit ? (
                      <label className="nodrag nopan relative flex h-3 w-3 cursor-pointer items-center justify-center rounded-full border border-slate-200">
                        <span
                          className="h-full w-full rounded-full"
                          title={WIRE_COLORS.find((color) => color.id === circuit.color)?.name ?? circuit.color}
                          style={{ backgroundColor: getColorHex(circuit.color) }}
                        />
                        <select
                          value={circuit.color}
                          onChange={(event) => {
                            const nextColor = event.target.value;
                            handleUpdateCircuit(row.material.id, circuit.id, { color: nextColor });
                          }}
                          className="absolute inset-0 cursor-pointer opacity-0"
                        >
                          {WIRE_COLORS.map((color) => (
                            <option key={color.id} value={color.id}>{color.name}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
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

                  {circuit ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveCircuit(row.material.id, circuit.id)}
                      className="nodrag nopan flex h-3.5 w-3.5 items-center justify-center rounded text-slate-300 hover:bg-red-50 hover:text-red-400"
                      title="删除此接线"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  ) : <span />}
                </div>
              );
            })}

            {circuitCount === 0 && (
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

function PinInput({
  connector,
  materialId,
  circuitId,
  endpoint,
  pin,
}: {
  connector: ConnectorInstance;
  materialId: string;
  circuitId: string;
  endpoint: MaterialEndpoint;
  pin: number;
}) {
  const [value, setValue] = useState(`Pin${pin}`);
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed === '') {
      const state = useHarnessStore.getState();
      state.replaceDocument(detachMaterialEndpoint(state.config, materialId, circuitId, endpoint));
      setError(null);
      return;
    }

    const match = /^pin(\d+)$/i.exec(trimmed);
    if (!match) {
      setError('只能填写 Pin+数字，或留空');
      return;
    }

    const nextPin = Number(match[1]);
    if (nextPin < 1 || nextPin > connector.connector.pinCount) {
      setError(`范围：Pin1-Pin${connector.connector.pinCount}`);
      return;
    }

    const state = useHarnessStore.getState();
    const next = reassignMaterialEndpoint(state.config, {
      materialId,
      circuitId,
      endpoint,
      connectorId: connector.id,
      connectorSide: connectorRefs(
        state.config.materials
          .find((material) => material.id === materialId)
          ?.circuits.find((circuit) => circuit.id === circuitId),
        connector.id,
      )[0]?.ref?.connectorSide ?? 'left',
      pin: nextPin,
    });

    if (next === state.config && nextPin !== pin) {
      setError('该 PIN 与当前连接规则冲突');
      return;
    }

    state.replaceDocument(next);
    setValue(`Pin${nextPin}`);
    setError(null);
  };

  return (
    <input
      type="text"
      value={value}
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

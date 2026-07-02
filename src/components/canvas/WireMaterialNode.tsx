import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Handle, Position } from '@xyflow/react';
import {
  CANVAS_MATERIAL_HEIGHT,
  CANVAS_MATERIAL_SLEEVE_CENTER_Y,
} from '@/lib/canvasMaterials';
import { WIRE_COLORS } from '@/lib/data';
import { useHarnessStore } from '@/stores/harnessStore';
import { updateMaterialCircuit, removeMaterialCircuit } from '@/lib/commands';
import type { CanvasWireMaterial, MaterialCircuit } from '@/types/harness';

interface WireMaterialNodeProps {
  data: CanvasWireMaterial;
  selected?: boolean;
}

function getColorHex(colorId: string): string {
  return WIRE_COLORS.find((color) => color.id === colorId)?.hex ?? '#6B7280';
}

function formatPinLabel(circuit: MaterialCircuit, side: 'start' | 'end'): string {
  const ref = circuit[side];
  if (!ref) return '';
  return `Pin${ref.pin}`;
}

export function WireMaterialNode({ data, selected }: WireMaterialNodeProps) {
  const [detailsOpen, setDetailsOpen] = useState(data.expandedByDefault ?? false);
  const previousCircuitCountRef = useRef(0);
  const { config, updateMaterial } = useHarnessStore();

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
    : `护套线 · ${spec.jacketMaterial} · ${spec.coreCount}芯 · ${spec.lengthMm}mm · OD ${spec.odMm.toFixed(2)}mm${spec.ulNumber ? ` · ${spec.ulNumber}` : ''}`;

  const circuits = useMemo(
    () => data.circuits ?? [],
    [data.circuits],
  );

  // Auto-expand when a new circuit is added
  useEffect(() => {
    if (circuits.length > previousCircuitCountRef.current) {
      setDetailsOpen(true);
    }
    previousCircuitCountRef.current = circuits.length;
  }, [circuits.length]);

  const handleUpdateCircuit = (circuitId: string, patch: Partial<Pick<MaterialCircuit, 'color' | 'signalName'>>) => {
    const nextConfig = updateMaterialCircuit(config, data.id, circuitId, patch);
    useHarnessStore.getState().replaceDocument(nextConfig);
  };

  const handleRemoveCircuit = (circuitId: string) => {
    const nextConfig = removeMaterialCircuit(config, data.id, circuitId);
    useHarnessStore.getState().replaceDocument(nextConfig);
  };

  const syncMaterialColor = (nextColor: string) => {
    if (data.spec.kind !== 'electronic') return;
    if (data.spec.color === nextColor) return;
    updateMaterial(data.id, {
      spec: { ...data.spec, color: nextColor },
    });
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
        <div className="mt-2 min-w-[200px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 shadow-md">
          <div className="mb-1 border-b border-slate-100 pb-1 text-center font-semibold text-slate-700">
            {circuits.length} 条接线 · {data.name}
          </div>
          <div className="mb-1.5 truncate text-[10px] leading-3 text-slate-500">
            {description}
          </div>

          {/* Header row */}
          <div className="flex items-center gap-1.5 text-[9px] text-slate-400 font-semibold border-b border-slate-100 pb-0.5 mb-0.5">
            <span className="min-w-[42px] text-center">左侧PIN</span>
            <span className="w-4 text-center">颜色</span>
            <span className="flex-1 text-center">接线定义</span>
            <span className="min-w-[42px] text-center">右侧PIN</span>
            <span className="w-4" />
          </div>

          <div className="space-y-0.5">
            {circuits.length > 0 ? (
              circuits.map((circuit) => (
                <div key={circuit.id} className="flex items-center gap-1.5 text-[10px]">
                  {/* Left PIN */}
                  <span className="min-w-[42px] px-1 text-blue-600 font-semibold text-center">
                    {formatPinLabel(circuit, 'start') || '\u00A0'}
                  </span>

                  {/* Color picker */}
                  <label className="nodrag nopan relative flex h-2.5 w-2.5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-200">
                    <span
                      className="h-full w-full rounded-full"
                      title={WIRE_COLORS.find((color) => color.id === circuit.color)?.name ?? circuit.color}
                      style={{ backgroundColor: getColorHex(circuit.color) }}
                    />
                    <select
                      value={circuit.color}
                      onChange={(event) => {
                        const nextColor = event.target.value;
                        handleUpdateCircuit(circuit.id, { color: nextColor });
                        if (circuits.length === 1) {
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

                  {/* Signal name */}
                  <input
                    type="text"
                    value={circuit.signalName ?? ''}
                    onChange={(event) => {
                      handleUpdateCircuit(circuit.id, {
                        signalName: event.target.value,
                      });
                    }}
                    placeholder="接线定义"
                    className="nodrag nopan max-w-[72px] flex-1 rounded border border-transparent bg-transparent px-1 py-0 text-slate-700 font-medium outline-none focus:border-slate-200 focus:bg-slate-50"
                  />

                  {/* Right PIN */}
                  <span className="min-w-[42px] px-1 text-emerald-600 font-semibold text-center">
                    {formatPinLabel(circuit, 'end') || '\u00A0'}
                  </span>

                  {/* Delete circuit */}
                  <button
                    type="button"
                    onClick={() => handleRemoveCircuit(circuit.id)}
                    className="nodrag nopan ml-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-slate-300 hover:bg-red-50 hover:text-red-400"
                    title="删除此接线"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))
            ) : (
              <div className="text-[10px] text-slate-400 py-1 text-center">
                把线材连接到连接器后，接线信息将自动显示。
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

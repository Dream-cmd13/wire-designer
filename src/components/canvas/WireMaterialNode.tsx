import { Handle, Position } from '@xyflow/react';
import { Cable } from 'lucide-react';
import {
  CANVAS_MATERIAL_HEIGHT,
  CANVAS_MATERIAL_STRIP_TOP,
} from '@/lib/canvasMaterials';
import { WIRE_COLORS } from '@/lib/data';
import type { CanvasWireMaterial } from '@/types/harness';

interface WireMaterialNodeProps {
  data: CanvasWireMaterial;
  selected?: boolean;
}

export function WireMaterialNode({ data, selected }: WireMaterialNodeProps) {
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
    : `护套线 · ${spec.jacketMaterial} · ${spec.coreCount}芯 · OD ${spec.odMm.toFixed(2)}mm`;

  return (
    <div
      className={`relative rounded-lg border-2 bg-white px-3 py-2.5 shadow-md transition ${
        selected ? 'border-blue-500 ring-4 ring-blue-100' : 'border-slate-300'
      }`}
      style={{ width: data.width, height: CANVAS_MATERIAL_HEIGHT }}
    >
      <Handle
        id="start"
        type="source"
        position={Position.Left}
        className="!h-4 !w-4 !border-2 !border-white !bg-amber-500 shadow"
      />
      <Handle
        id="end"
        type="source"
        position={Position.Right}
        className="!h-4 !w-4 !border-2 !border-white !bg-amber-500 shadow"
      />

      <div className="flex items-start gap-2">
        <Cable className="h-4 w-4 shrink-0 text-slate-500" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold leading-4 text-slate-800">{data.name}</div>
          <div className="truncate text-[10px] leading-3 text-slate-500">
            {description}
          </div>
        </div>
      </div>

      <div
        className="absolute inset-x-3 rounded-full bg-slate-50 px-2 py-1.5"
        style={{ top: CANVAS_MATERIAL_STRIP_TOP }}
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
      </div>

      <span className="absolute -bottom-4 left-0 text-[9px] font-medium text-amber-600">端点 A</span>
      <span className="absolute -bottom-4 right-0 text-[9px] font-medium text-amber-600">端点 B</span>
    </div>
  );
}

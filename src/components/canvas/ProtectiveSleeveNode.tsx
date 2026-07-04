import {
  CORRUGATED_ENDCAP_HEIGHT,
  CORRUGATED_ENDCAP_WIDTH,
  getProtectiveSleeveDisplayName,
} from '@/lib/canvasMaterials';
import type { ProtectiveSleeve, CanvasWireMaterial } from '@/types/harness';
import { useHarnessStore } from '@/stores/harnessStore';

interface ProtectiveSleeveNodeProps {
  data: ProtectiveSleeve;
  selected?: boolean;
}

const sleeveStyles: Record<ProtectiveSleeve['type'], React.CSSProperties> = {
  'acetate-cloth': {
    backgroundColor: '#d6b36a',
    backgroundImage: 'repeating-linear-gradient(45deg, rgba(72,49,20,.25) 0 2px, transparent 2px 7px)',
  },
  fleece: {
    backgroundColor: '#475569',
    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,.3) 1px, transparent 1.5px)',
    backgroundSize: '6px 6px',
  },
  'heat-shrink': {
    background: 'linear-gradient(180deg, #334155, #0f172a 48%, #475569)',
  },
  braided: {
    backgroundColor: '#334155',
    backgroundImage:
      'repeating-linear-gradient(45deg, transparent 0 4px, rgba(255,255,255,.35) 4px 6px), repeating-linear-gradient(-45deg, transparent 0 4px, rgba(0,0,0,.35) 4px 6px)',
  },
  corrugated: {
    background: 'repeating-linear-gradient(90deg, #111827 0 6px, #64748b 6px 9px, #1f2937 9px 14px)',
  },
};

export function ProtectiveSleeveNode({ data, selected }: ProtectiveSleeveNodeProps) {
  const config = useHarnessStore((state) => state.config);
  const fixing = data.corrugatedFixing;
  const startGapPx = (fixing?.startDistanceMm ?? 0) * 0.6;
  const endGapPx = (fixing?.endDistanceMm ?? 0) * 0.6;

  // Retrieve attached materials to boundary-restrict the heat-shrink tube positions
  const attachedMaterials = data.attachedMaterialIds
    .map((id) => config.materials.find((m) => m.id === id))
    .filter((m): m is CanvasWireMaterial => !!m);

  let minWireLeft = -9999;
  let maxWireRight = 9999;

  if (attachedMaterials.length > 0) {
    const minWireX = Math.min(...attachedMaterials.map((m) => m.position.x));
    const maxWireX = Math.max(...attachedMaterials.map((m) => m.position.x + m.width));
    minWireLeft = minWireX - data.position.x;
    maxWireRight = maxWireX - data.position.x;
  }

  // To prevent covering the endpoints (16px handle gap), clamp the heat shrinks.
  const safeLeftEdge = minWireLeft + 16;
  const safeRightEdge = maxWireRight - 16;

  // Left heat shrink positioning
  const normalLeftPos = -(CORRUGATED_ENDCAP_WIDTH + startGapPx);
  const leftPos = Math.min(-CORRUGATED_ENDCAP_WIDTH, Math.max(safeLeftEdge, normalLeftPos));

  // Right heat shrink positioning
  const normalRightPos = data.width + endGapPx;
  const rightPos = Math.max(
    data.width,
    Math.min(safeRightEdge - CORRUGATED_ENDCAP_WIDTH, normalRightPos)
  );

  const showLeftDimension = selected && data.type === 'corrugated' && fixing?.startHeatShrink;
  const showRightDimension = selected && data.type === 'corrugated' && fixing?.endHeatShrink;

  return (
    <div
      className={`relative flex items-center justify-center overflow-visible rounded-md border-2 px-2 shadow-md ${
        selected ? 'border-cyan-500 ring-4 ring-cyan-100' : 'border-white/80'
      }`}
      style={{
        width: data.width,
        height: data.height,
        minHeight: data.height,
        ...sleeveStyles[data.type],
      }}
      title={data.remark || getProtectiveSleeveDisplayName(data)}
    >
      {data.type === 'corrugated' && fixing?.startHeatShrink && (
        <div
          className="absolute top-1/2 rounded-sm border border-slate-200/70 bg-slate-800 shadow"
          style={{
            left: leftPos,
            width: CORRUGATED_ENDCAP_WIDTH,
            height: CORRUGATED_ENDCAP_HEIGHT,
            transform: 'translateY(-50%)',
          }}
        />
      )}
      {data.type === 'corrugated' && fixing?.endHeatShrink && (
        <div
          className="absolute top-1/2 rounded-sm border border-slate-200/70 bg-slate-800 shadow"
          style={{
            left: rightPos,
            width: CORRUGATED_ENDCAP_WIDTH,
            height: CORRUGATED_ENDCAP_HEIGHT,
            transform: 'translateY(-50%)',
          }}
        />
      )}

      {/* SVG Dimension lines */}
      {(showLeftDimension || showRightDimension) && (
        <svg
          className="pointer-events-none absolute overflow-visible"
          style={{
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
          }}
        >
          {showLeftDimension && (() => {
            const x1 = leftPos + CORRUGATED_ENDCAP_WIDTH;
            const x2 = 0;
            const centerY = data.height / 2;
            const dimensionY = -12;
            return (
              <>
                <line
                  x1={x1}
                  y1={centerY}
                  x2={x1}
                  y2={dimensionY - 4}
                  stroke="#0f766e"
                  strokeWidth="1"
                />
                <line
                  x1={x2}
                  y1={centerY}
                  x2={x2}
                  y2={dimensionY - 4}
                  stroke="#0f766e"
                  strokeWidth="1"
                />
                <line
                  x1={x1}
                  y1={dimensionY}
                  x2={x2}
                  y2={dimensionY}
                  stroke="#0f766e"
                  strokeWidth="1"
                />
                <text
                  x={(x1 + x2) / 2}
                  y={dimensionY - 4}
                  textAnchor="middle"
                  fontSize="8"
                  fontWeight="600"
                  fill="#0f766e"
                >
                  {fixing.startDistanceMm}mm
                </text>
              </>
            );
          })()}

          {showRightDimension && (() => {
            const x1 = data.width;
            const x2 = rightPos;
            const centerY = data.height / 2;
            const dimensionY = -12;
            return (
              <>
                <line
                  x1={x1}
                  y1={centerY}
                  x2={x1}
                  y2={dimensionY - 4}
                  stroke="#0f766e"
                  strokeWidth="1"
                />
                <line
                  x1={x2}
                  y1={centerY}
                  x2={x2}
                  y2={dimensionY - 4}
                  stroke="#0f766e"
                  strokeWidth="1"
                />
                <line
                  x1={x1}
                  y1={dimensionY}
                  x2={x2}
                  y2={dimensionY}
                  stroke="#0f766e"
                  strokeWidth="1"
                />
                <text
                  x={(x1 + x2) / 2}
                  y={dimensionY - 4}
                  textAnchor="middle"
                  fontSize="8"
                  fontWeight="600"
                  fill="#0f766e"
                >
                  {fixing.endDistanceMm}mm
                </text>
              </>
            );
          })()}
        </svg>
      )}

      <div className="relative z-10 flex w-full flex-col items-center gap-0.5">
        <span className="text-[10px] font-semibold leading-none text-white drop-shadow">
          {getProtectiveSleeveDisplayName(data)}
        </span>
        <span className="text-[10px] font-semibold leading-none text-white drop-shadow">
          {data.lengthMm}mm
        </span>
        {data.attachedMaterialIds.length > 1 && (
          <span className="text-[9px] leading-none text-cyan-50 drop-shadow">
            覆盖 {data.attachedMaterialIds.length} 条线材
          </span>
        )}
        {data.remark && (
          <span className="max-w-full truncate text-[9px] leading-none text-white/90 drop-shadow">
            {data.remark}
          </span>
        )}
      </div>

      {selected && data.type === 'corrugated' && fixing && !fixing.startHeatShrink && !fixing.endHeatShrink && (
        <div className="pointer-events-none absolute -bottom-7 left-1/2 flex -translate-x-1/2 gap-2 rounded-full border border-cyan-200 bg-white/95 px-3 py-1 text-[10px] font-medium text-cyan-700 shadow">
          <span>左距 {fixing.startDistanceMm}mm</span>
          <span>右距 {fixing.endDistanceMm}mm</span>
        </div>
      )}
    </div>
  );
}

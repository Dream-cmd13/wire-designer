import { getProtectiveSleeveDisplayName } from '@/lib/canvasMaterials';
import type { ProtectiveSleeve } from '@/types/harness';

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
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-md border-2 px-2 shadow-md ${
        selected ? 'border-cyan-500 ring-4 ring-cyan-100' : 'border-white/80'
      }`}
      style={{
        width: data.width,
        height: data.height,
        minHeight: data.height,
        ...sleeveStyles[data.type],
      }}
    >
      <div className="relative z-10 flex w-full flex-col items-center gap-0.5">
        <span className="text-[10px] font-semibold leading-none text-white drop-shadow">
          {getProtectiveSleeveDisplayName(data)}
        </span>
        <span className="text-[10px] font-semibold leading-none text-white drop-shadow">
          {data.lengthMm ?? 100}mm
        </span>
        {data.attachedMaterialIds.length > 1 && (
          <span className="text-[9px] leading-none text-cyan-50 drop-shadow">
            覆盖 {data.attachedMaterialIds.length} 条线材
          </span>
        )}
      </div>
    </div>
  );
}

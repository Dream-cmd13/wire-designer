import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import type { Connection } from '@/types/harness';
import { useHarnessStore } from '@/stores/harnessStore';
import { WIRE_COLORS } from '@/lib/data';

interface WireEdgeProps {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: unknown;
  targetPosition: unknown;
  data?: Connection;
  selected?: boolean;
}

export function WireEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: WireEdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition: sourcePosition as any,
    targetX,
    targetY,
    targetPosition: targetPosition as any,
  });
  const { config } = useHarnessStore();

  const wireCount = data?.wireIds?.length || 0;

  // Get full wire details for display
  const wires = data?.wireIds
    ? config.wires.filter((w) => data.wireIds.includes(w.id))
    : [];

  const getWireColorHex = (colorId: string) => {
    const color = WIRE_COLORS.find((c) => c.id === colorId);
    return color?.hex || '#6B7280';
  };

  const getWireColorName = (colorId: string) => {
    const color = WIRE_COLORS.find((c) => c.id === colorId);
    return color?.name || colorId;
  };

  // Edge color: first wire's color, or default gray
  const edgeColor = wires.length > 0 ? getWireColorHex(wires[0].wireColor) : '#6B7280';

  // Edge stroke width based on wire count: 1=2px, 2=3px, 3+=4px
  const strokeWidth = wireCount === 1 ? 2 : wireCount === 2 ? 3 : 4;

  return (
    <>
      <BaseEdge
        path={edgePath}
        style={{
          stroke: edgeColor,
          strokeWidth,
          strokeDasharray: selected ? '5,5' : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <div
            className="px-2 py-1.5 rounded-lg text-xs font-medium shadow-md cursor-pointer min-w-[140px] bg-white border border-slate-200 text-slate-600"
            style={{
              boxShadow: selected
                ? '0 2px 8px rgba(59,130,246,0.2)'
                : '0 2px 8px rgba(0,0,0,0.1)',
            }}
          >
            {/* Title row: wire count */}
            <div className="font-semibold text-center border-b border-slate-100 pb-1 mb-1 text-slate-700">
              {wireCount} 根导线 {data?.name ? ` - ${data.name}` : ''}
            </div>

            {/* Pin mapping rows */}
            {wires.length > 0 && (
              <div className="space-y-0.5">
                {wires.slice(0, 6).map((wire) => (
                  <div key={wire.id} className="flex items-center gap-1.5 text-[10px]">
                    {/* Pin mapping: Pin{from} -> Pin{to} */}
                    <span className="text-blue-600 font-semibold min-w-[28px]">
                      Pin{wire.fromPin}
                    </span>
                    <span className="text-slate-400">&rarr;</span>
                    <span className="text-emerald-600 font-semibold min-w-[28px]">
                      Pin{wire.toPin}
                    </span>
                    {/* Color dot */}
                    <div
                      className="w-2.5 h-2.5 rounded-full border border-slate-200 flex-shrink-0"
                      style={{ backgroundColor: getWireColorHex(wire.wireColor) }}
                      title={getWireColorName(wire.wireColor)}
                    />
                    {/* Signal name */}
                    {wire.signalName && (
                      <span className="text-slate-700 font-medium truncate max-w-[50px]">
                        {wire.signalName}
                      </span>
                    )}
                  </div>
                ))}
                {wires.length > 6 && (
                  <div className="text-[10px] text-slate-400 text-center pt-0.5">
                    +{wires.length - 6} 根更多
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

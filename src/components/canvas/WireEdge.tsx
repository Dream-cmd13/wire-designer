import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import type { Connection } from '@/types/harness';
import { useHarnessStore } from '@/stores/harnessStore';
import { WIRE_COLORS } from '@/lib/data';

interface WireEdgeProps extends Omit<EdgeProps, 'data'> {
  data?: Connection;
}

export function WireEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: WireEdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
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

  // Edge color: first wire's color, or default gray
  const edgeColor = wires.length > 0 ? getWireColorHex(wires[0].wireColor) : '#6B7280';

  // Edge stroke width based on wire count: 1=2px, 2=3px, 3+=4px
  const strokeWidth = wireCount === 1 ? 2 : wireCount === 2 ? 3 : 4;

  return (
    <BaseEdge
      path={edgePath}
      style={{
        stroke: edgeColor,
        strokeWidth,
        strokeDasharray: selected ? '5,5' : undefined,
      }}
    />
  );
}

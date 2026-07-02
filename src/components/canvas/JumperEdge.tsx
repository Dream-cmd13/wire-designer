import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

/**
 * Edge type for connector-internal pin jumpers (短接).
 *
 * Jumpers connect two pins on the same side of the same connector
 * (self-loop edge). The bezier path bulges outward from the connector
 * body. No extra endpoint dots are drawn — the existing blue PIN
 * handles already mark the connection points. The jumper wire itself
 * is blue to match the PIN handle color.
 */
export function JumperEdge(props: EdgeProps) {
  const [path] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
    curvature: 0.35,
  });

  const isSelected = props.selected;

  return (
    <g>
      {/* Wider invisible hit area for easier selection */}
      <BaseEdge
        path={path}
        style={{
          stroke: 'transparent',
          strokeWidth: 12,
          fill: 'none',
        }}
        interactionWidth={12}
      />
      {/* Visible line — blue, bulges outward */}
      <BaseEdge
        path={path}
        style={{
          stroke: isSelected ? '#1d4ed8' : '#3b82f6',
          strokeWidth: isSelected ? 3 : 2,
          strokeLinecap: 'round',
          fill: 'none',
        }}
      />
    </g>
  );
}

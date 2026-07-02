import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

/** Edge type for connector-internal pin jumpers (短接). */
export function JumperEdge(props: EdgeProps) {
  const [path] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
    borderRadius: 8,
  });

  return (
    <BaseEdge
      path={path}
      style={{
        stroke: props.selected ? '#ea580c' : '#f97316',
        strokeWidth: props.selected ? 3 : 2.5,
      }}
    />
  );
}

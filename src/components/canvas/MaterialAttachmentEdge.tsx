import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

export function MaterialAttachmentEdge(props: EdgeProps) {
  const [path] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
  });

  const solid = Boolean((props.data as { solid?: boolean } | undefined)?.solid);

  return (
    <BaseEdge
      path={path}
      style={{
        stroke: props.selected ? '#2563eb' : '#f59e0b',
        strokeWidth: props.selected ? 3 : 2,
        strokeDasharray: solid ? undefined : '7 4',
      }}
    />
  );
}

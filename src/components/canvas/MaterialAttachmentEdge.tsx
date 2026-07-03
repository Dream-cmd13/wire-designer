import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

export function MaterialAttachmentEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
  });

  const solid = Boolean((props.data as { solid?: boolean } | undefined)?.solid);
  const numberTubes = (props.data as { numberTubes?: Array<{ id: string; content: string; lengthMm: number }> } | undefined)?.numberTubes ?? [];

  return (
    <>
      <BaseEdge
        path={path}
        style={{
          stroke: props.selected ? '#2563eb' : '#f59e0b',
          strokeWidth: props.selected ? 3 : 2,
          strokeDasharray: solid ? undefined : '7 4',
        }}
      />
      {numberTubes.length > 0 && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-[calc(100%+8px)] gap-1 whitespace-nowrap"
            style={{
              transform: `translate(-50%, calc(-100% - 8px)) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {numberTubes.map((tube) => (
              <span
                key={tube.id}
                title={`号码管 · ${tube.lengthMm}mm`}
                className="rounded bg-sky-100 px-1.5 py-0.5 text-[8px] font-medium text-sky-800 shadow-sm"
              >
                #{tube.content}
              </span>
            ))}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

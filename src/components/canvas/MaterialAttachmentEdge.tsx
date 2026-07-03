import { useCallback, useMemo, useRef } from 'react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps, useReactFlow } from '@xyflow/react';
import { updateMaterialCircuit } from '@/lib/commands';
import { useHarnessStore } from '@/stores/harnessStore';
import type {
  MaterialEndpoint,
  MaterialEndpointRouteOffset,
} from '@/types/harness';
import {
  openMaterialAccessoryContextMenu,
} from './materialAccessoryEvents';

function getMidpoint(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
) {
  return {
    x: (sourceX + targetX) / 2,
    y: (sourceY + targetY) / 2,
  };
}

function getControlPoint(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  routeOffset?: MaterialEndpointRouteOffset,
) {
  const midpoint = getMidpoint(sourceX, sourceY, targetX, targetY);
  return {
    x: midpoint.x + (routeOffset?.offsetX ?? 0),
    y: midpoint.y + (routeOffset?.offsetY ?? 0),
  };
}

function getQuadraticPoint(
  sourceX: number,
  sourceY: number,
  controlX: number,
  controlY: number,
  targetX: number,
  targetY: number,
  t: number,
) {
  const inv = 1 - t;
  return {
    x: inv * inv * sourceX + 2 * inv * t * controlX + t * t * targetX,
    y: inv * inv * sourceY + 2 * inv * t * controlY + t * t * targetY,
  };
}

function getTubeT(index: number, total: number) {
  if (total <= 1) return 0.5;
  const min = 0.36;
  const max = 0.64;
  return min + ((max - min) * index) / (total - 1);
}

export function MaterialAttachmentEdge(props: EdgeProps) {
  const { screenToFlowPosition } = useReactFlow();
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const edgeData = useMemo(
    () =>
      ((props.data as {
        materialId?: string;
        circuitId?: string;
        side?: MaterialEndpoint;
        routeOffset?: MaterialEndpointRouteOffset;
        numberTubes?: Array<{ id: string; content: string; lengthMm: number }>;
        solid?: boolean;
      } | undefined) ?? {}),
    [props.data],
  );

  const solid = Boolean(edgeData.solid);
  const numberTubes = useMemo(() => edgeData.numberTubes ?? [], [edgeData.numberTubes]);

  const controlPoint = useMemo(
    () =>
      getControlPoint(
        props.sourceX,
        props.sourceY,
        props.targetX,
        props.targetY,
        edgeData.routeOffset,
      ),
    [
      edgeData.routeOffset,
      props.sourceX,
      props.sourceY,
      props.targetX,
      props.targetY,
    ],
  );

  const midpoint = useMemo(
    () => getMidpoint(props.sourceX, props.sourceY, props.targetX, props.targetY),
    [props.sourceX, props.sourceY, props.targetX, props.targetY],
  );

  const path = useMemo(
    () =>
      `M ${props.sourceX},${props.sourceY} Q ${controlPoint.x},${controlPoint.y} ${props.targetX},${props.targetY}`,
    [controlPoint.x, controlPoint.y, props.sourceX, props.sourceY, props.targetX, props.targetY],
  );

  const persistRouteOffset = useCallback((routeOffset: MaterialEndpointRouteOffset) => {
    if (!edgeData.materialId || !edgeData.circuitId || !edgeData.side) return;
    const { materialId, circuitId, side } = edgeData;

    useHarnessStore.setState((state) => {
      const material = state.config.materials.find((item) => item.id === materialId);
      const circuit = material?.circuits.find((item) => item.id === circuitId);
      if (!material || !circuit) return {};

      const nextConfig = updateMaterialCircuit(
        state.config,
        materialId,
        circuitId,
        {
          route: {
            ...(circuit.route ?? {}),
            [side]: routeOffset,
          },
        },
      );

      return {
        config: nextConfig,
        saveState: { status: 'dirty' as const },
      };
    });
  }, [edgeData]);

  const startRouteDrag = useCallback((clientX: number, clientY: number) => {
    const updateRouteFromPointer = (nextClientX: number, nextClientY: number) => {
      const point = screenToFlowPosition({ x: nextClientX, y: nextClientY });
      persistRouteOffset({
        offsetX: point.x - midpoint.x,
        offsetY: point.y - midpoint.y,
      });
    };

    updateRouteFromPointer(clientX, clientY);

    const handleMouseMove = (event: MouseEvent) => {
      event.preventDefault();
      updateRouteFromPointer(event.clientX, event.clientY);
    };

    const handleMouseUp = () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp, { once: true });
    dragCleanupRef.current = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [midpoint.x, midpoint.y, persistRouteOffset, screenToFlowPosition]);

  const numberTubePoints = useMemo(
    () =>
      numberTubes.map((tube, index) => ({
        tube,
        point: getQuadraticPoint(
          props.sourceX,
          props.sourceY,
          controlPoint.x,
          controlPoint.y,
          props.targetX,
          props.targetY,
          getTubeT(index, numberTubes.length),
        ),
      })),
    [
      controlPoint.x,
      controlPoint.y,
      numberTubes,
      props.sourceX,
      props.sourceY,
      props.targetX,
      props.targetY,
    ],
  );

  return (
    <>
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        className="nopan cursor-grab active:cursor-grabbing"
        onMouseDown={(event) => {
          event.preventDefault();
          startRouteDrag(event.clientX, event.clientY);
        }}
      />

      <BaseEdge
        path={path}
        style={{
          stroke: props.selected ? '#2563eb' : '#f59e0b',
          strokeWidth: props.selected ? 3 : 2,
          strokeDasharray: solid ? undefined : '7 4',
        }}
      />

      {props.selected && (
        <EdgeLabelRenderer>
          <button
            type="button"
            aria-label="拖动芯线形状"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              startRouteDrag(event.clientX, event.clientY);
            }}
            className="pointer-events-auto nopan absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-500 bg-white shadow"
            style={{
              transform: `translate(-50%, -50%) translate(${controlPoint.x}px, ${controlPoint.y}px)`,
            }}
          />
        </EdgeLabelRenderer>
      )}

      {numberTubePoints.length > 0 && (
        <EdgeLabelRenderer>
          <>
            {numberTubePoints.map(({ tube, point }) => (
              <button
                key={tube.id}
                type="button"
                title={`号码管 · ${tube.lengthMm}mm`}
                onMouseDown={(event) => event.stopPropagation()}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!edgeData.materialId) return;
                  openMaterialAccessoryContextMenu({
                    x: event.clientX,
                    y: event.clientY,
                    materialId: edgeData.materialId,
                    kind: 'number-tube',
                    accessoryId: tube.id,
                    circuitId: edgeData.circuitId,
                    endpoint: edgeData.side,
                  });
                }}
                className="pointer-events-auto absolute rounded border border-sky-200 bg-white/95 px-1.5 py-0.5 text-[8px] font-medium text-sky-700 shadow-sm hover:bg-sky-50"
                style={{
                  transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)`,
                }}
              >
                #{tube.content}
              </button>
            ))}
          </>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

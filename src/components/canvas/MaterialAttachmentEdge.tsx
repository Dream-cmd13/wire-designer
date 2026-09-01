import { useCallback, useMemo, useRef, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps, useReactFlow, useStore } from '@xyflow/react';
import { updateMaterialCircuit } from '@/lib/commands';
import { useHarnessStore } from '@/stores/harnessStore';
import type {
  CanvasModel,
  MaterialEndpoint,
  MaterialEndpointRouteOffset,
  WireNumberTube,
} from '@/types/harness';
import { openMaterialAccessoryContextMenu } from './materialAccessoryEvents';

interface QuadraticSample {
  t: number;
  x: number;
  y: number;
  length: number;
  angle: number;
}

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

function getQuadraticDerivative(
  sourceX: number,
  sourceY: number,
  controlX: number,
  controlY: number,
  targetX: number,
  targetY: number,
  t: number,
) {
  return {
    x: 2 * (1 - t) * (controlX - sourceX) + 2 * t * (targetX - controlX),
    y: 2 * (1 - t) * (controlY - sourceY) + 2 * t * (targetY - controlY),
  };
}

function buildQuadraticSamples(
  sourceX: number,
  sourceY: number,
  controlX: number,
  controlY: number,
  targetX: number,
  targetY: number,
  steps = 80,
): QuadraticSample[] {
  const samples: QuadraticSample[] = [];
  let totalLength = 0;
  let previousPoint = getQuadraticPoint(sourceX, sourceY, controlX, controlY, targetX, targetY, 0);

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const point = getQuadraticPoint(sourceX, sourceY, controlX, controlY, targetX, targetY, t);
    if (index > 0) {
      totalLength += Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y);
    }
    previousPoint = point;
    const derivative = getQuadraticDerivative(sourceX, sourceY, controlX, controlY, targetX, targetY, t);
    samples.push({
      t,
      x: point.x,
      y: point.y,
      length: totalLength,
      angle: Math.atan2(derivative.y, derivative.x),
    });
  }

  return samples;
}

function resolveSampleByLength(samples: QuadraticSample[], targetLength: number) {
  const totalLength = samples[samples.length - 1]?.length ?? 0;
  const clampedLength = Math.max(0, Math.min(totalLength, targetLength));

  for (let index = 1; index < samples.length; index += 1) {
    const current = samples[index];
    if (current.length >= clampedLength) {
      const previous = samples[index - 1];
      const segmentLength = current.length - previous.length || 1;
      const ratio = (clampedLength - previous.length) / segmentLength;
      const angle = ratio < 0.5 ? previous.angle : current.angle;
      return {
        x: previous.x + (current.x - previous.x) * ratio,
        y: previous.y + (current.y - previous.y) * ratio,
        angle,
        length: clampedLength,
      };
    }
  }

  const fallback = samples[samples.length - 1];
  return fallback
    ? { x: fallback.x, y: fallback.y, angle: fallback.angle, length: fallback.length }
    : { x: 0, y: 0, angle: 0, length: 0 };
}

function resolveClosestSample(samples: QuadraticSample[], x: number, y: number) {
  return samples.reduce((best, sample) => {
    const distance = Math.hypot(sample.x - x, sample.y - y);
    if (!best || distance < best.distance) {
      return { sample, distance };
    }
    return best;
  }, undefined as { sample: QuadraticSample; distance: number } | undefined)?.sample;
}

function normalizeReadableAngle(angleDeg: number) {
  if (angleDeg > 90) return angleDeg - 180;
  if (angleDeg < -90) return angleDeg + 180;
  return angleDeg;
}

function isEdgeIntersectingAnyModel(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  models: CanvasModel[],
): boolean {
  const getModelRect = (model: CanvasModel) => ({
    x: model.position.x,
    y: model.position.y,
    width: model.width,
    height: model.height,
  });

  const pointInRect = (point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }) => (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );

  const ccw = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => (
    (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x)
  );

  const segmentsIntersect = (
    a1: { x: number; y: number },
    a2: { x: number; y: number },
    b1: { x: number; y: number },
    b2: { x: number; y: number }
  ) => (
    ccw(a1, b1, b2) !== ccw(a2, b1, b2) && ccw(a1, a2, b1) !== ccw(a1, a2, b2)
  );

  const segmentIntersectsRect = (
    start: { x: number; y: number },
    end: { x: number; y: number },
    rect: { x: number; y: number; width: number; height: number }
  ) => {
    if (pointInRect(start, rect) || pointInRect(end, rect)) return true;

    const topLeft = { x: rect.x, y: rect.y };
    const topRight = { x: rect.x + rect.width, y: rect.y };
    const bottomLeft = { x: rect.x, y: rect.y + rect.height };
    const bottomRight = { x: rect.x + rect.width, y: rect.y + rect.height };

    return (
      segmentsIntersect(start, end, topLeft, topRight) ||
      segmentsIntersect(start, end, topRight, bottomRight) ||
      segmentsIntersect(start, end, bottomRight, bottomLeft) ||
      segmentsIntersect(start, end, bottomLeft, topLeft)
    );
  };

  const start = { x: sourceX, y: sourceY };
  const end = { x: targetX, y: targetY };

  for (const model of models) {
    const rect = getModelRect(model);
    if (segmentIntersectsRect(start, end, rect)) {
      return true;
    }
  }

  return false;
}

function estimateTubeWidth(content: string) {
  return Math.max(28, 12 + content.length * 7);
}

export function MaterialAttachmentEdge(props: EdgeProps) {
  const { screenToFlowPosition } = useReactFlow();
  const config = useHarnessStore((state) => state.config);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const [hoveredTubeId, setHoveredTubeId] = useState<string | null>(null);
  const [activeTubeId, setActiveTubeId] = useState<string | null>(null);

  const isHidden = useMemo(() => {
    return isEdgeIntersectingAnyModel(
      props.sourceX,
      props.sourceY,
      props.targetX,
      props.targetY,
      config.models
    );
  }, [props.sourceX, props.sourceY, props.targetX, props.targetY, config.models]);

  const edgeData = useMemo(
    () =>
      ((props.data as {
        materialId?: string;
        circuitId?: string;
        side?: MaterialEndpoint;
        routeOffset?: MaterialEndpointRouteOffset;
        numberTubes?: Array<Pick<WireNumberTube, 'id' | 'content' | 'lengthMm' | 'distanceMm'>>;
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

  const samples = useMemo(
    () => buildQuadraticSamples(
      props.sourceX,
      props.sourceY,
      controlPoint.x,
      controlPoint.y,
      props.targetX,
      props.targetY,
    ),
    [controlPoint.x, controlPoint.y, props.sourceX, props.sourceY, props.targetX, props.targetY],
  );

  const totalLength = samples[samples.length - 1]?.length ?? 0;

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

  const persistTubeDistance = useCallback((tubeId: string, distanceMm: number) => {
    if (!edgeData.materialId) return;

    useHarnessStore.setState((state) => {
      const material = state.config.materials.find((item) => item.id === edgeData.materialId);
      if (!material) return {};

      return {
        config: {
          ...state.config,
          materials: state.config.materials.map((item) =>
            item.id !== edgeData.materialId
              ? item
              : {
                  ...item,
                  numberTubes: (item.numberTubes ?? []).map((tube) =>
                    tube.id === tubeId
                      ? { ...tube, distanceMm: Math.max(0, Math.round(distanceMm * 10) / 10) }
                      : tube,
                  ),
                },
          ),
          updatedAt: Date.now(),
        },
        saveState: { status: 'dirty' as const },
      };
    });
  }, [edgeData.materialId]);

  const nodesDraggable = useStore((s) => s.nodesDraggable);

  const startRouteDrag = useCallback((clientX: number, clientY: number) => {
    if (!nodesDraggable) return;
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
  }, [midpoint.x, midpoint.y, nodesDraggable, persistRouteOffset, screenToFlowPosition]);

  const startTubeDrag = useCallback((tubeId: string, clientX: number, clientY: number) => {
    if (!nodesDraggable) return;
    const updateTubeFromPointer = (nextClientX: number, nextClientY: number) => {
      const point = screenToFlowPosition({ x: nextClientX, y: nextClientY });
      const closest = resolveClosestSample(samples, point.x, point.y);
      if (!closest) return;
      const distancePx = Math.max(0, totalLength - closest.length);
      persistTubeDistance(tubeId, distancePx / 0.6);
    };

    setActiveTubeId(tubeId);
    updateTubeFromPointer(clientX, clientY);

    const handleMouseMove = (event: MouseEvent) => {
      event.preventDefault();
      updateTubeFromPointer(event.clientX, event.clientY);
    };

    const handleMouseUp = () => {
      setActiveTubeId(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp, { once: true });
  }, [nodesDraggable, persistTubeDistance, samples, screenToFlowPosition, totalLength]);

  const numberTubePlacements = useMemo(
    () =>
      numberTubes.map((tube, index) => {
        const distanceMm = tube.distanceMm ?? 0;
        const distancePx = Math.max(0, distanceMm * 0.6);
        const tubeWidth = estimateTubeWidth(tube.content);
        const connectorGapPx = 2;
        const centerLengthFromStart = Math.max(
          0,
          totalLength - distancePx - connectorGapPx - tubeWidth / 2,
        );
        const pathPoint = resolveSampleByLength(samples, centerLengthFromStart);
        const nearConnectorPoint = resolveSampleByLength(
          samples,
          Math.max(0, totalLength - distancePx),
        );
        const normalOffset = (index - (numberTubes.length - 1) / 2) * 14;
        const normalAngle = pathPoint.angle + Math.PI / 2;
        const angleDeg = normalizeReadableAngle(pathPoint.angle * (180 / Math.PI));

        return {
          tube,
          distanceMm,
          tubeWidth,
          x: pathPoint.x + Math.cos(normalAngle) * normalOffset,
          y: pathPoint.y + Math.sin(normalAngle) * normalOffset,
          angleDeg,
          nearConnectorPoint,
        };
      }),
    [numberTubes, samples, totalLength],
  );

  return (
    <>
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        className={`nopan ${nodesDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
        onMouseDown={(event) => {
          if (!nodesDraggable) return;
          event.preventDefault();
          startRouteDrag(event.clientX, event.clientY);
        }}
      />

      <BaseEdge
        path={path}
        style={{
          stroke: isHidden ? 'transparent' : props.selected ? '#2563eb' : '#f59e0b',
          strokeWidth: isHidden ? 0 : props.selected ? 3 : 2,
          strokeDasharray: solid ? undefined : '7 4',
        }}
      />

      {props.selected && !isHidden && (
        <EdgeLabelRenderer>
          <button
            type="button"
            aria-label="拖动芯线形状"
            onMouseDown={(event) => {
              if (!nodesDraggable) return;
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

      {numberTubePlacements.length > 0 && (
        <EdgeLabelRenderer>
          <>
            {numberTubePlacements.map(({ tube, distanceMm, x, y, angleDeg, tubeWidth, nearConnectorPoint }) => (
              <div
                key={tube.id}
                className="pointer-events-auto absolute"
                style={{
                  transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
                }}
              >
                <button
                  type="button"
                  title={`号码管 · ${tube.lengthMm}mm · 距连接器 ${distanceMm}mm`}
                  onMouseEnter={() => setHoveredTubeId(tube.id)}
                  onMouseLeave={() => setHoveredTubeId((current) => (current === tube.id ? null : current))}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    startTubeDrag(tube.id, event.clientX, event.clientY);
                  }}
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
                  className="rounded border border-sky-200 bg-white/95 px-1.5 py-0.5 text-[8px] font-medium text-sky-700 shadow-sm hover:bg-sky-50"
                  style={{ minWidth: tubeWidth, transform: `rotate(${angleDeg}deg)` }}
                >
                  #{tube.content}
                </button>
                {(activeTubeId === tube.id || hoveredTubeId === tube.id) && (
                  <>
                    <svg
                      className="pointer-events-none absolute overflow-visible"
                      style={{
                        left: 0,
                        top: 0,
                        transform: `translate(${-x}px, ${-y}px)`,
                      }}
                      width="1"
                      height="1"
                    >
                      {(() => {
                        const dimensionY = Math.min(props.targetY, nearConnectorPoint.y) - 18;
                        return (
                          <>
                            <line
                              x1={nearConnectorPoint.x}
                              y1={nearConnectorPoint.y - 2}
                              x2={nearConnectorPoint.x}
                              y2={dimensionY}
                              stroke="#0f766e"
                              strokeWidth="1"
                            />
                            <line
                              x1={props.targetX}
                              y1={dimensionY}
                              x2={nearConnectorPoint.x}
                              y2={dimensionY}
                              stroke="#0f766e"
                              strokeWidth="1"
                            />
                            <text
                              x={(props.targetX + nearConnectorPoint.x) / 2}
                              y={dimensionY - 4}
                              textAnchor="middle"
                              fontSize="8"
                              fontWeight="600"
                              fill="#0f766e"
                            >
                              {distanceMm}mm
                            </text>
                          </>
                        );
                      })()}
                    </svg>
                  </>
                )}
              </div>
            ))}
          </>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

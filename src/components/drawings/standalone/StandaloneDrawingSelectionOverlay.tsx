import type { PointerEvent as ReactPointerEvent } from 'react';
import { HANDLE_HIT_SIZE_CSS, HANDLE_SIZE_CSS, ROTATION_HANDLE_SIZE_CSS, getResizeCursor, getTransformFrame, getTransformHandlePoints, type ResizeHandle } from '@/lib/drawingTransform';
import type { DrawingObject } from '@/types/drawing';

type OverlayProps = {
  object: DrawingObject; zoom: number; pageWidth: number; pageHeight: number; controlsVisible: boolean;
  onResizePointerDown: (handle: ResizeHandle, event: ReactPointerEvent<SVGRectElement>) => void;
  onRotatePointerDown: (event: ReactPointerEvent<SVGCircleElement>) => void;
  onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerEnd: (event: ReactPointerEvent<SVGSVGElement>) => void;
};
const resizeHandles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function StandaloneDrawingSelectionOverlay(props: OverlayProps) {
  const frame = getTransformFrame(props.object);
  const points = getTransformHandlePoints(props.object, props.zoom);
  const polygon = frame.corners.map((point) => `${point.x * props.zoom},${point.y * props.zoom}`).join(' ');
  return <svg aria-label="对象变换控制" className="pointer-events-none absolute left-0 top-0 z-40 overflow-visible" width={props.pageWidth * props.zoom} height={props.pageHeight * props.zoom} onPointerMove={props.onPointerMove} onPointerUp={props.onPointerEnd} onPointerCancel={props.onPointerEnd}>
    <polygon points={polygon} fill="none" stroke="#60a5fa" strokeWidth="1.5" pointerEvents="none" />
    {props.controlsVisible && <>
      <line x1={points.n.x * props.zoom} y1={points.n.y * props.zoom} x2={points.rotate.x * props.zoom} y2={points.rotate.y * props.zoom} stroke="#60a5fa" strokeWidth="1.5" pointerEvents="none" />
      {resizeHandles.map((handle) => { const point = points[handle]; return <g key={handle}>
        <rect className="pointer-events-all" x={point.x * props.zoom - HANDLE_HIT_SIZE_CSS / 2} y={point.y * props.zoom - HANDLE_HIT_SIZE_CSS / 2} width={HANDLE_HIT_SIZE_CSS} height={HANDLE_HIT_SIZE_CSS} fill="transparent" style={{ cursor: getResizeCursor(handle, props.object.rotation) }} onPointerDown={(event) => props.onResizePointerDown(handle, event)} />
        <rect x={point.x * props.zoom - HANDLE_SIZE_CSS / 2} y={point.y * props.zoom - HANDLE_SIZE_CSS / 2} width={HANDLE_SIZE_CSS} height={HANDLE_SIZE_CSS} fill="white" stroke="#3b82f6" strokeWidth="1.5" pointerEvents="none" />
      </g>; })}
      <circle className="pointer-events-all" cx={points.rotate.x * props.zoom} cy={points.rotate.y * props.zoom} r={Math.max(HANDLE_HIT_SIZE_CSS, ROTATION_HANDLE_SIZE_CSS) / 2} fill="transparent" style={{ cursor: 'grab' }} onPointerDown={props.onRotatePointerDown} />
      <circle cx={points.rotate.x * props.zoom} cy={points.rotate.y * props.zoom} r={ROTATION_HANDLE_SIZE_CSS / 2} fill="white" stroke="#3b82f6" strokeWidth="1.5" pointerEvents="none" />
    </>}
  </svg>;
}

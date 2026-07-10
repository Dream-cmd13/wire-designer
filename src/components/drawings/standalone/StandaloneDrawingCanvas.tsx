import { useEffect, useRef, useState } from 'react';
import { getDrawingObjectAtPoint, renderDrawingCanvas } from '@/lib/drawingRenderer';
import type { DrawingDocument, DrawingObject } from '@/types/drawing';

interface StandaloneDrawingCanvasProps {
  drawing: DrawingDocument;
  selectedObjectId: string | null;
  zoom: number;
  onSelectObject: (objectId: string | null) => void;
  onStartEdit: () => void;
  onUpdateObject: (objectId: string, patch: Partial<DrawingObject>) => void;
}

type DragState = { objectId: string; offsetX: number; offsetY: number } | null;

export function StandaloneDrawingCanvas({
  drawing,
  selectedObjectId,
  zoom,
  onSelectObject,
  onStartEdit,
  onUpdateObject,
}: StandaloneDrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drag, setDrag] = useState<DragState>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = window.devicePixelRatio || 1;
    canvas.width = drawing.page.width * scale;
    canvas.height = drawing.page.height * scale;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    renderDrawingCanvas(context, drawing, selectedObjectId);
  }, [drawing, selectedObjectId]);

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * drawing.page.width,
      y: ((event.clientY - rect.top) / rect.height) * drawing.page.height,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getPoint(event);
    const object = getDrawingObjectAtPoint(drawing, point);
    onSelectObject(object?.id ?? null);
    if (!object || object.locked) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    onStartEdit();
    setDrag({ objectId: object.id, offsetX: point.x - object.x, offsetY: point.y - object.y });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag) return;
    const object = drawing.objects.find((candidate) => candidate.id === drag.objectId);
    if (!object) return;
    const point = getPoint(event);
    const x = Math.round(Math.min(drawing.page.width - 20 - object.width, Math.max(20, point.x - drag.offsetX)));
    const y = Math.round(Math.min(drawing.page.height - 20 - object.height, Math.max(20, point.y - drag.offsetY)));
    onUpdateObject(object.id, { x, y });
  };

  const endDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (drag && event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDrag(null);
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[linear-gradient(#dbe4ef_1px,transparent_1px),linear-gradient(90deg,#dbe4ef_1px,transparent_1px)] bg-[size:24px_24px] p-5">
      <canvas
        ref={canvasRef}
        className="block bg-white shadow-lg touch-none"
        style={{ width: `${drawing.page.width * zoom}px`, height: `${drawing.page.height * zoom}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    </div>
  );
}

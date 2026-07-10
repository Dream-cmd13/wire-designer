import { useEffect, useRef, useState } from 'react';
import { getDrawingObjectAtPoint, renderDrawingCanvas } from '@/lib/drawingRenderer';
import type { DrawingDocument, DrawingObject, DrawingTableRow } from '@/types/drawing';

interface StandaloneDrawingCanvasProps {
  drawing: DrawingDocument;
  selectedObjectId: string | null;
  zoom: number;
  onSelectObject: (objectId: string | null) => void;
  onStartEdit: () => void;
  onUpdateObject: (objectId: string, patch: Partial<DrawingObject>) => void;
}

type DragState = { objectId: string; offsetX: number; offsetY: number } | null;
type EditTarget =
  | {
      type: 'field';
      objectId: string;
      field: 'text' | 'label' | 'title' | 'drawingNo' | 'revision' | 'requirements';
      value: string;
      x: number;
      y: number;
      width: number;
      height: number;
      multiline?: boolean;
    }
  | {
      type: 'table-cell';
      objectId: string;
      rowIndex: number;
      columnIndex: number;
      value: string;
      x: number;
      y: number;
      width: number;
      height: number;
    };

const TABLE_ROW_HEIGHT = 18;
const TABLE_TITLE_HEIGHT = 22;

function textPatch(object: DrawingObject, field: EditTarget & { type: 'field' }): Partial<DrawingObject> {
  if ((object.kind === 'text' || object.kind === 'label') && field.field === 'text') {
    return { text: field.value } as Partial<DrawingObject>;
  }
  if (
    (object.kind === 'connector'
      || object.kind === 'wire-bundle'
      || object.kind === 'accessory'
      || object.kind === 'dimension')
    && field.field === 'label'
  ) {
    return { label: field.value } as Partial<DrawingObject>;
  }
  if (object.kind === 'title-block') {
    return { [field.field]: field.value } as Partial<DrawingObject>;
  }
  if ((object.kind === 'table' || object.kind === 'bom-table' || object.kind === 'wiring-table') && field.field === 'title') {
    return { title: field.value } as Partial<DrawingObject>;
  }
  if (object.kind === 'tech-requirements' && field.field === 'requirements') {
    return {
      requirements: field.value
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
    } as Partial<DrawingObject>;
  }
  return {};
}

function tableCellPatch(
  object: Extract<DrawingObject, { kind: 'table' | 'bom-table' | 'wiring-table' }>,
  editor: EditTarget & { type: 'table-cell' },
): Partial<DrawingObject> {
  const columns = [...object.columns];
  if (editor.rowIndex === -1) {
    const oldColumn = columns[editor.columnIndex];
    const newColumn = editor.value.trim() || oldColumn;
    columns[editor.columnIndex] = newColumn;
    const rows = object.rows.map((row) => {
      if (newColumn === oldColumn) return { ...row };
      const nextRow = { ...row, [newColumn]: row[oldColumn] ?? '' };
      delete nextRow[oldColumn];
      return nextRow;
    });
    return { columns, rows } as Partial<DrawingObject>;
  }

  const rows = object.rows.map((row) => ({ ...row }));
  while (rows.length <= editor.rowIndex) {
    rows.push(Object.fromEntries(columns.map((column) => [column, ''])) as DrawingTableRow);
  }
  const oldColumn = object.columns[editor.columnIndex];
  const newColumn = columns[editor.columnIndex] ?? oldColumn;
  rows[editor.rowIndex][newColumn] = editor.value;
  if (newColumn !== oldColumn) delete rows[editor.rowIndex][oldColumn];
  return { rows } as Partial<DrawingObject>;
}

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
  const [editor, setEditor] = useState<EditTarget | null>(null);

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

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * drawing.page.width,
      y: ((event.clientY - rect.top) / rect.height) * drawing.page.height,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (editor) return;
    if (event.detail > 1) {
      setDrag(null);
      return;
    }
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

  const createEditor = (object: DrawingObject, point: { x: number; y: number }): EditTarget | null => {
    const localX = point.x - object.x;
    const localY = point.y - object.y;

    if (object.kind === 'table' || object.kind === 'bom-table' || object.kind === 'wiring-table') {
      if (localY < TABLE_TITLE_HEIGHT) {
        return {
          type: 'field',
          objectId: object.id,
          field: 'title',
          value: object.title,
          x: object.x,
          y: object.y,
          width: object.width,
          height: TABLE_TITLE_HEIGHT,
        };
      }
      const columnWidth = object.width / Math.max(1, object.columns.length);
      const columnIndex = Math.max(0, Math.min(object.columns.length - 1, Math.floor(localX / columnWidth)));
      const rowBand = Math.floor((localY - TABLE_TITLE_HEIGHT) / TABLE_ROW_HEIGHT);
      const rowIndex = rowBand - 1;
      if (rowBand < 0) return null;
      return {
        type: 'table-cell',
        objectId: object.id,
        rowIndex,
        columnIndex,
        value: rowIndex === -1
          ? object.columns[columnIndex]
          : object.rows[rowIndex]?.[object.columns[columnIndex]] ?? '',
        x: object.x + columnIndex * columnWidth,
        y: object.y + TABLE_TITLE_HEIGHT + Math.max(0, rowBand) * TABLE_ROW_HEIGHT,
        width: columnWidth,
        height: TABLE_ROW_HEIGHT,
      };
    }

    if (object.kind === 'title-block') {
      if (localX > object.width - 80) {
        return {
          type: 'field',
          objectId: object.id,
          field: 'revision',
          value: object.revision,
          x: object.x + object.width - 80,
          y: object.y,
          width: 80,
          height: object.height,
        };
      }
      if (localY < 28) {
        return { type: 'field', objectId: object.id, field: 'title', value: object.title, x: object.x, y: object.y, width: object.width - 80, height: 28 };
      }
      return { type: 'field', objectId: object.id, field: 'drawingNo', value: object.drawingNo, x: object.x, y: object.y + 28, width: object.width - 80, height: 28 };
    }

    if (object.kind === 'tech-requirements') {
      return {
        type: 'field',
        objectId: object.id,
        field: 'requirements',
        value: object.requirements.join('\n'),
        x: object.x + 8,
        y: object.y + 24,
        width: object.width - 16,
        height: object.height - 30,
        multiline: true,
      };
    }

    if (object.kind === 'text' || object.kind === 'label') {
      return { type: 'field', objectId: object.id, field: 'text', value: object.text, x: object.x, y: object.y, width: object.width, height: Math.max(28, object.height) };
    }

    if (object.kind === 'dimension') {
      return {
        type: 'field',
        objectId: object.id,
        field: 'label',
        value: object.label,
        x: object.x + object.width / 2 - 70,
        y: object.y + object.height / 2 - 16,
        width: 140,
        height: 28,
      };
    }

    if (object.kind === 'connector' || object.kind === 'wire-bundle' || object.kind === 'accessory') {
      return { type: 'field', objectId: object.id, field: 'label', value: object.label, x: object.x, y: object.y, width: object.width, height: 30 };
    }

    return null;
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    setDrag(null);
    const point = getPoint(event);
    const object = getDrawingObjectAtPoint(drawing, point);
    onSelectObject(object?.id ?? null);
    if (!object || object.locked) return;
    const nextEditor = createEditor(object, point);
    if (nextEditor) setEditor(nextEditor);
  };

  const commitEditor = () => {
    if (!editor) return;
    const object = drawing.objects.find((candidate) => candidate.id === editor.objectId);
    if (!object) {
      setEditor(null);
      return;
    }
    onStartEdit();
    if (editor.type === 'table-cell' && (object.kind === 'table' || object.kind === 'bom-table' || object.kind === 'wiring-table')) {
      onUpdateObject(object.id, tableCellPatch(object, editor));
    } else if (editor.type === 'field') {
      onUpdateObject(object.id, textPatch(object, editor));
    }
    setEditor(null);
  };

  const editorControl = editor && (
    editor.type === 'field' && editor.multiline ? (
      <textarea
        autoFocus
        value={editor.value}
        onChange={(event) => setEditor({ ...editor, value: event.target.value })}
        onBlur={commitEditor}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setEditor(null);
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) commitEditor();
        }}
        className="absolute z-20 resize-none rounded border border-blue-500 bg-white p-1 text-xs text-slate-900 shadow-lg outline-none ring-2 ring-blue-100"
        style={{
          left: editor.x * zoom,
          top: editor.y * zoom,
          width: editor.width * zoom,
          height: editor.height * zoom,
        }}
      />
    ) : (
      <input
        autoFocus
        value={editor.value}
        onChange={(event) => setEditor({ ...editor, value: event.target.value })}
        onBlur={commitEditor}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setEditor(null);
          if (event.key === 'Enter') commitEditor();
        }}
        className="absolute z-20 rounded border border-blue-500 bg-white px-1 text-xs text-slate-900 shadow-lg outline-none ring-2 ring-blue-100"
        style={{
          left: editor.x * zoom,
          top: editor.y * zoom,
          width: Math.max(48, editor.width * zoom),
          height: Math.max(24, editor.height * zoom),
        }}
      />
    )
  );

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[linear-gradient(#dbe4ef_1px,transparent_1px),linear-gradient(90deg,#dbe4ef_1px,transparent_1px)] bg-[size:24px_24px] p-5">
      <div className="relative inline-block">
        <canvas
          ref={canvasRef}
          className="block bg-white shadow-lg touch-none"
          style={{ width: `${drawing.page.width * zoom}px`, height: `${drawing.page.height * zoom}px` }}
          onDoubleClick={handleDoubleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        {editorControl}
      </div>
    </div>
  );
}

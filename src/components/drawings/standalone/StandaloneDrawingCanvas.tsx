import { useEffect, useMemo, useRef, useState } from 'react';
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
type DrawingTableObject = Extract<DrawingObject, { kind: 'table' | 'bom-table' | 'wiring-table' }>;
type TableEditTarget =
  | { key: 'title'; type: 'title' }
  | { key: string; type: 'table-cell'; rowIndex: number; columnIndex: number };
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
      fontSize: number;
      textInsetX: number;
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
      fontSize: number;
      textInsetX: number;
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
  object: DrawingTableObject,
  editor: { rowIndex: number; columnIndex: number; value: string },
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

function DrawingTableLayer({
  object,
  zoom,
  selected,
  onSelect,
  onStartEdit,
  onUpdateObject,
}: {
  object: DrawingTableObject;
  zoom: number;
  selected: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onUpdateObject: (objectId: string, patch: Partial<DrawingObject>) => void;
}) {
  const tableRef = useRef<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState<TableEditTarget | null>(null);
  const rowHeight = TABLE_ROW_HEIGHT * zoom;
  const titleHeight = TABLE_TITLE_HEIGHT * zoom;
  const maxBodyRows = Math.max(0, Math.floor((object.height - TABLE_TITLE_HEIGHT) / TABLE_ROW_HEIGHT) - 1);
  const visibleRows = object.rows.slice(0, maxBodyRows);

  useEffect(() => {
    if (!editing) return;
    const element = tableRef.current?.querySelector<HTMLElement>('[data-table-editing="true"]');
    if (!element) return;
    element.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editing]);

  const beginEdit = (event: React.MouseEvent<HTMLElement>, target: TableEditTarget) => {
    event.preventDefault();
    event.stopPropagation();
    if (object.locked) return;
    onSelect();
    onStartEdit();
    setEditing(target);
  };

  const commitEdit = (event: React.FocusEvent<HTMLElement>, target: TableEditTarget) => {
    const value = event.currentTarget.textContent ?? '';
    if (target.type === 'title') onUpdateObject(object.id, { title: value } as Partial<DrawingObject>);
    else onUpdateObject(object.id, tableCellPatch(object, { ...target, value }));
    setEditing(null);
  };

  const renderEditableText = (value: string, target: TableEditTarget, className = '') => {
    const isEditing = editing?.key === target.key;
    return (
      <span
        key={target.key}
        data-table-editing={isEditing || undefined}
        contentEditable={isEditing}
        suppressContentEditableWarning
        role="textbox"
        tabIndex={0}
        onClick={(event) => { event.stopPropagation(); onSelect(); }}
        onDoubleClick={(event) => beginEdit(event, target)}
        onBlur={(event) => { if (isEditing) commitEdit(event, target); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') event.currentTarget.blur();
        }}
        className={`block h-full min-w-0 overflow-hidden whitespace-nowrap px-[0.35em] leading-[inherit] outline-none ${isEditing ? 'bg-blue-50' : ''} ${className}`}
      >
        {value}
      </span>
    );
  };

  return (
    <div
      ref={tableRef}
      className={`absolute z-10 box-border overflow-hidden border border-slate-900 bg-white text-slate-900 ${selected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
      style={{
        left: object.x * zoom,
        top: object.y * zoom,
        width: object.width * zoom,
        height: object.height * zoom,
        fontFamily: 'Arial, sans-serif',
        fontSize: object.style.fontSize * zoom,
        lineHeight: `${rowHeight}px`,
      }}
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
    >
      <div className="box-border border-b border-slate-900 font-semibold" style={{ height: titleHeight, lineHeight: `${titleHeight}px` }}>
        {renderEditableText(object.title, { key: 'title', type: 'title' })}
      </div>
      <div className="grid font-semibold" style={{ gridTemplateColumns: `repeat(${object.columns.length}, minmax(0, 1fr))` }}>
        {object.columns.map((column, columnIndex) => (
          <div key={columnIndex} className="box-border border-b border-r border-slate-900 last:border-r-0" style={{ height: rowHeight }}>
            {renderEditableText(column, { key: `column-${columnIndex}`, type: 'table-cell', rowIndex: -1, columnIndex })}
          </div>
        ))}
        {visibleRows.flatMap((row, rowIndex) => object.columns.map((column, columnIndex) => (
          <div key={`${rowIndex}-${columnIndex}`} className="box-border border-b border-r border-slate-300 last:border-r-0" style={{ height: rowHeight, fontSize: Math.max(8, object.style.fontSize - 1) * zoom, fontWeight: 400 }}>
            {renderEditableText(row[column] ?? '', { key: `row-${rowIndex}-column-${columnIndex}`, type: 'table-cell', rowIndex, columnIndex })}
          </div>
        )))}
      </div>
    </div>
  );
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
  const tableObjects = useMemo(() => drawing.objects.filter((object): object is DrawingTableObject =>
    object.kind === 'table' || object.kind === 'bom-table' || object.kind === 'wiring-table'), [drawing.objects]);
  const tableObjectIds = useMemo(() => new Set(tableObjects.map((object) => object.id)), [tableObjects]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = window.devicePixelRatio || 1;
    canvas.width = drawing.page.width * scale;
    canvas.height = drawing.page.height * scale;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    renderDrawingCanvas(context, drawing, selectedObjectId, { hiddenObjectIds: tableObjectIds });
  }, [drawing, selectedObjectId, tableObjectIds]);

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

    if (object.kind === 'table' || object.kind === 'bom-table' || object.kind === 'wiring-table') return null;

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
          fontSize: object.style.fontSize,
          textInsetX: 10,
        };
      }
      if (localY < 28) {
        return { type: 'field', objectId: object.id, field: 'title', value: object.title, x: object.x, y: object.y, width: object.width - 80, height: 28, fontSize: object.style.fontSize, textInsetX: 10 };
      }
      return { type: 'field', objectId: object.id, field: 'drawingNo', value: object.drawingNo, x: object.x, y: object.y + 28, width: object.width - 80, height: 28, fontSize: object.style.fontSize, textInsetX: 10 };
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
        fontSize: object.style.fontSize,
        textInsetX: 10,
      };
    }

    if (object.kind === 'text' || object.kind === 'label') {
      return { type: 'field', objectId: object.id, field: 'text', value: object.text, x: object.x, y: object.y, width: object.width, height: Math.max(28, object.height), fontSize: object.style.fontSize, textInsetX: 0 };
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
        fontSize: object.style.fontSize,
        textInsetX: 0,
      };
    }

    if (object.kind === 'connector' || object.kind === 'wire-bundle' || object.kind === 'accessory') {
      return { type: 'field', objectId: object.id, field: 'label', value: object.label, x: object.x, y: object.y, width: object.width, height: 30, fontSize: object.style.fontSize, textInsetX: 8 };
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
    if (nextEditor) {
      onStartEdit();
      setEditor(nextEditor);
    }
  };

  const updateEditorValue = (value: string) => {
    if (!editor) return;
    const nextEditor = { ...editor, value };
    setEditor(nextEditor);
    const object = drawing.objects.find((candidate) => candidate.id === editor.objectId);
    if (!object) return;
    if (nextEditor.type === 'field') onUpdateObject(object.id, textPatch(object, nextEditor));
  };

  const commitEditor = () => {
    setEditor(null);
  };

  const editorControl = editor && (
    editor.type === 'field' && editor.multiline ? (
      <textarea
        autoFocus
        value={editor.value}
        onFocus={(event) => event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length)}
        onChange={(event) => updateEditorValue(event.target.value)}
        onBlur={commitEditor}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setEditor(null);
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) commitEditor();
        }}
        className="absolute z-20 resize-none border-0 bg-transparent p-0 text-transparent caret-slate-900 outline-none shadow-none"
        style={{
          left: (editor.x + editor.textInsetX) * zoom,
          top: editor.y * zoom,
          width: Math.max(1, (editor.width - editor.textInsetX) * zoom),
          height: editor.height * zoom,
          fontSize: editor.fontSize * zoom,
          lineHeight: `${editor.fontSize * zoom}px`,
        }}
      />
    ) : (
      <input
        autoFocus
        value={editor.value}
        onFocus={(event) => event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length)}
        onChange={(event) => updateEditorValue(event.target.value)}
        onBlur={commitEditor}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setEditor(null);
          if (event.key === 'Enter') commitEditor();
        }}
        className="absolute z-20 appearance-none border-0 bg-transparent p-0 text-transparent caret-slate-900 outline-none shadow-none"
        style={{
          left: (editor.x + editor.textInsetX) * zoom,
          top: editor.y * zoom,
          width: Math.max(1, (editor.width - editor.textInsetX) * zoom),
          height: Math.max(16, editor.height * zoom),
          fontSize: editor.fontSize * zoom,
          lineHeight: `${Math.max(16, editor.height * zoom)}px`,
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
        {tableObjects.map((object) => (
          <DrawingTableLayer
            key={object.id}
            object={object}
            zoom={zoom}
            selected={selectedObjectId === object.id}
            onSelect={() => onSelectObject(object.id)}
            onStartEdit={onStartEdit}
            onUpdateObject={onUpdateObject}
          />
        ))}
        {editorControl}
      </div>
    </div>
  );
}

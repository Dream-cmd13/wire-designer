import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createDrawingLineObject,
  finalizeDrawingDraft,
  getObjectsInSelectionRect,
  normalizeDrawingRect,
  sampleFreehandPoint,
  snapOrthogonalPoint,
} from '@/lib/drawingCommands';
import { getDrawingObjectAtPoint, renderDrawingCanvas } from '@/lib/drawingRenderer';
import { resolveTableDoubleClickAction, resolveTablePointerAction } from '@/lib/drawingTableInteraction';
import { getDrawingTableTargetObject, getDrawingTableTextFontSize, resizeDrawingTableCell, resizeDrawingTableFromHandle, resizeDrawingTableText, resolveDrawingTableCells, resolveDrawingTableLayout } from '@/lib/drawingTableLayout';
import { getDrawingCaretIndexAtPoint, measureDrawingCaret } from '@/lib/drawingTextLayout';
import { clampDrawingZoom, containsDrawingPoint, getDrawingTransformObject, getWheelScaleFactor, moveDrawingObject, resizeDrawingObject, rotateDrawingObject, type ResizeHandle } from '@/lib/drawingTransform';
import { StandaloneDrawingSelectionOverlay } from './StandaloneDrawingSelectionOverlay';
import type { DrawingDocument, DrawingObject, DrawingPoint, DrawingTableLocalTarget, DrawingTableRow, DrawingToolMode } from '@/types/drawing';

interface StandaloneDrawingCanvasProps {
  drawing: DrawingDocument;
  selectedObjectId: string | null;
  selectedObjectIds?: string[];
  zoom: number;
  onSelectObject: (objectId: string | null) => void;
  onSelectionChange?: (objectIds: string[]) => void;
  onStartEdit: () => void;
  onUpdateObject: (objectId: string, patch: Partial<DrawingObject>) => void;
  onCanvasZoom?: (zoom: number) => void;
  onScaleObject?: (objectId: string, factor: number) => void;
  onScaleTableTarget?: (objectId: string, target: DrawingTableLocalTarget, factor: number) => void;
  onAddObject?: (object: DrawingObject) => void;
  onEditLineRequest?: (objectId: string) => void;
  onOpenMaterialTable?: (objectId: string) => void;
  toolMode?: DrawingToolMode;
  orthogonal?: boolean;
  drawingAction?: { id: number; type: 'finish' | 'cancel' };
  onContextMenuRequest?: (request: {
    objectId: string | null;
    canvasPoint: DrawingPoint;
    clientPoint: { x: number; y: number };
  }) => void;
}

type TransformInteraction =
  | { kind: 'move'; object: DrawingObject; startPointer: DrawingPoint }
  | { kind: 'resize'; object: DrawingObject; startPointer: DrawingPoint; handle: ResizeHandle }
  | { kind: 'rotate'; object: DrawingObject; startPointer: DrawingPoint }
  | { kind: 'table-resize'; object: DrawingObject; table: DrawingTableObject; target: DrawingTableLocalTarget; startPointer: DrawingPoint; handle: ResizeHandle }
  | null;
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

type DrawingTableTextLayout = {
  width: number;
  height: number;
  fontSize: number;
};


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
    if (object.columnKeys) return { columns } as Partial<DrawingObject>;
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
  const oldColumn = object.columnKeys?.[editor.columnIndex] ?? object.columns[editor.columnIndex];
  rows[editor.rowIndex][oldColumn] = editor.value;
  return { rows } as Partial<DrawingObject>;
}

function DrawingTableLayer({
  object,
  zoom,
  selected,
  activeTarget,
  onSelect,
  onSelectTarget,
  onEditingChange,
  onStartEdit,
  onUpdateObject,
  onOpenMaterialTable,
}: {
  object: DrawingTableObject;
  zoom: number;
  selected: boolean;
  activeTarget: DrawingTableLocalTarget | null;
  onSelect: () => void;
  onSelectTarget: (target: DrawingTableLocalTarget | null) => void;
  onEditingChange: (editing: boolean) => void;
  onStartEdit: () => void;
  onUpdateObject: (objectId: string, patch: Partial<DrawingObject>) => void;
  onOpenMaterialTable?: (objectId: string) => void;
}) {
  const tableRef = useRef<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState<TableEditTarget | null>(null);
  const [drag, setDrag] = useState<{ kind: 'table' | 'text'; key?: string; startX: number; startY: number; x: number; y: number } | null>(null);
  const layout = resolveDrawingTableLayout(object);
  const rowHeight = layout.headerRowHeight * zoom;
  const titleHeight = layout.titleRowHeight * zoom;
  const cells = resolveDrawingTableCells(object);

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
    onEditingChange(true);
  };

  const beginDrag = (event: React.PointerEvent<HTMLElement>, kind: 'table' | 'text', key?: string) => {
    if (event.button !== 0) return;
    if (editing || object.locked) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = kind === 'table' ? { x: object.x, y: object.y } : object.textOffsets?.[key ?? ''] ?? { x: 0, y: 0 };
    onSelect();
    if (kind === 'table') onSelectTarget(null);
    onStartEdit();
    setDrag({ kind, key, startX: event.clientX, startY: event.clientY, ...origin });
  };

  const handleTablePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!drag) return;
    const x = Math.round(drag.x + (event.clientX - drag.startX) / zoom);
    const y = Math.round(drag.y + (event.clientY - drag.startY) / zoom);
    if (drag.kind === 'table') onUpdateObject(object.id, { x, y });
    else onUpdateObject(object.id, { textOffsets: { ...object.textOffsets, [drag.key ?? '']: { x, y } } } as Partial<DrawingObject>);
  };

  const endTableDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDrag(null);
  };

  const commitEdit = (event: React.FocusEvent<HTMLElement>, target: TableEditTarget) => {
    const value = event.currentTarget.textContent ?? '';
    if (target.type === 'title') onUpdateObject(object.id, { title: value } as Partial<DrawingObject>);
    else onUpdateObject(object.id, tableCellPatch(object, { ...target, value }));
    setEditing(null);
    onEditingChange(false);
  };

  const handleTextPointerDown = (event: React.PointerEvent<HTMLElement>, target: DrawingTableLocalTarget) => {
    const action = resolveTablePointerAction(selected, activeTarget, 'text');
    if (action === 'move-table') beginDrag(event, 'table');
    else {
      onSelectTarget(target);
      beginDrag(event, 'text', target.key);
    }
  };

  const handleLocalDoubleClick = (
    event: React.MouseEvent<HTMLElement>,
    localTarget: DrawingTableLocalTarget,
    editTarget?: TableEditTarget,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect();
    if (editTarget && resolveTableDoubleClickAction(activeTarget, localTarget) === 'edit-text') {
      beginEdit(event, editTarget);
      return;
    }
    onSelectTarget(localTarget);
  };

  const renderEditableText = (value: string, target: TableEditTarget, className = '', textLayout?: DrawingTableTextLayout) => {
    const isEditing = editing?.key === target.key;
    const localTarget: DrawingTableLocalTarget = {
      kind: 'table-text', objectId: object.id, key: target.key,
      rowIndex: target.type === 'table-cell' ? target.rowIndex : undefined,
      columnIndex: target.type === 'table-cell' ? target.columnIndex : undefined,
    };
    const textSize = object.textSizes?.[target.key];
    const textWidth = textSize?.width ?? textLayout?.width ?? object.width;
    const textHeight = textSize?.height ?? textLayout?.height ?? 18;
    const configuredFontSize = textSize?.fontSize ?? textLayout?.fontSize ?? object.style.fontSize;
    const fittedFontSize = getDrawingTableTextFontSize(value, textWidth, configuredFontSize);
    return (
      <span
        key={target.key}
        data-table-editing={isEditing || undefined}
        contentEditable={isEditing}
        suppressContentEditableWarning
        role="textbox"
        tabIndex={0}
        onClick={(event) => { event.stopPropagation(); onSelect(); }}
        onPointerDown={(event) => handleTextPointerDown(event, localTarget)}
        onPointerMove={handleTablePointerMove}
        onPointerUp={endTableDrag}
        onDoubleClick={(event) => handleLocalDoubleClick(event, localTarget, target)}
        onBlur={(event) => { if (isEditing) commitEdit(event, target); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') event.currentTarget.blur();
        }}
        className={`flex h-full min-w-0 ${textSize ? '' : 'flex-1'} items-center overflow-hidden whitespace-normal break-all px-[0.25em] outline-none ${isEditing ? 'bg-blue-50' : ''} ${className}`}
        style={{
          transform: `translate(${(object.textOffsets?.[target.key]?.x ?? 0) * zoom}px, ${(object.textOffsets?.[target.key]?.y ?? 0) * zoom}px)`,
          width: textSize ? textSize.width * zoom : undefined,
          height: textSize ? textSize.height * zoom : undefined,
          boxSizing: 'border-box',
          fontSize: fittedFontSize * zoom,
          lineHeight: `${Math.max(1, Math.min(textHeight * zoom, fittedFontSize * zoom * 1.15))}px`,
        }}
      >
        {value}
      </span>
    );
  };

  const selectCell = (event: React.PointerEvent<HTMLElement>, rowIndex: number, columnIndex: number, key: string) => {
    if (event.button !== 0 || object.locked) return;
    const localTarget: DrawingTableLocalTarget = { kind: 'table-cell', objectId: object.id, key, rowIndex, columnIndex };
    if (resolveTablePointerAction(selected, activeTarget, 'cell') === 'move-table') {
      beginDrag(event, 'table');
      return;
    }
    event.stopPropagation();
    onSelect();
    onSelectTarget(localTarget);
  };

  const selectCellOnDoubleClick = (event: React.MouseEvent<HTMLElement>, rowIndex: number, columnIndex: number, key: string) => {
    handleLocalDoubleClick(event, { kind: 'table-cell', objectId: object.id, key, rowIndex, columnIndex });
  };

  return (
    <div
      ref={tableRef}
      className="absolute z-10 box-border overflow-hidden border border-slate-900 bg-white text-slate-900"
      style={{
        left: object.x * zoom,
        top: object.y * zoom,
        width: object.width * zoom,
        height: object.height * zoom,
        fontFamily: 'Arial, sans-serif',
        fontSize: object.style.fontSize * zoom,
        lineHeight: `${rowHeight}px`,
        transform: `rotate(${object.rotation}deg)`,
        transformOrigin: 'center center',
      }}
      aria-selected={selected}
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
      onDoubleClickCapture={(event) => {
        if (object.tableRole !== 'bom' || !onOpenMaterialTable) return;
        event.preventDefault();
        event.stopPropagation();
        onOpenMaterialTable(object.id);
      }}
      onPointerDown={(event) => beginDrag(event, 'table')}
      onPointerMove={handleTablePointerMove}
      onPointerUp={endTableDrag}
    >
      {layout.showTitleRow && <div className="box-border min-w-0 overflow-hidden border-b border-slate-900 font-semibold" style={{ height: titleHeight, lineHeight: `${titleHeight}px` }}>
        {renderEditableText(object.title, { key: 'title', type: 'title' }, '', { width: object.width, height: layout.titleRowHeight, fontSize: object.style.fontSize })}
      </div>}
      <div className="grid font-semibold" style={{
        gridTemplateColumns: layout.columnWidths.map((width) => `${width * zoom}px`).join(' '),
        gridTemplateRows: [layout.headerRowHeight, ...layout.rowHeights].map((height) => `${height * zoom}px`).join(' '),
      }}>
        {cells.map((cell) => (
          <div
            key={cell.key}
            data-table-cell={cell.key}
            onPointerDown={(event) => selectCell(event, cell.rowIndex, cell.columnIndex, cell.key)}
            onDoubleClick={(event) => selectCellOnDoubleClick(event, cell.rowIndex, cell.columnIndex, cell.key)}
            className={`box-border border-b border-r ${cell.header ? 'border-slate-900' : 'border-slate-300'}`}
            style={{
              gridColumn: `${cell.columnIndex + 1} / span ${cell.columnSpan}`,
              gridRow: `${cell.rowIndex + 2} / span ${cell.rowSpan}`,
              fontSize: (cell.header ? object.style.fontSize : Math.max(8, object.style.fontSize - 1)) * zoom,
              fontWeight: cell.header ? 600 : 400,
              lineHeight: `${cell.height * zoom}px`,
              minWidth: 0,
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {object.projectionCellKey === cell.key ? (
              <svg viewBox="0 0 100 50" className="h-full w-full" aria-label="投影图标">
                <path d="M16 15 L40 19 L40 31 L16 35 Z" fill="none" stroke="currentColor" strokeWidth="2"/>
                <circle cx="78" cy="25" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
                <line x1="6" y1="25" x2="94" y2="25" stroke="currentColor" strokeWidth="1" strokeDasharray="4 3"/>
              </svg>
            ) : renderEditableText(
              cell.value,
              { key: cell.key, type: 'table-cell', rowIndex: cell.rowIndex, columnIndex: cell.columnIndex },
              '',
              { width: cell.width, height: cell.height, fontSize: cell.header ? object.style.fontSize : Math.max(8, object.style.fontSize - 1) },
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StandaloneDrawingCanvas({
  drawing,
  selectedObjectId,
  selectedObjectIds,
  zoom,
  onSelectObject,
  onSelectionChange,
  onStartEdit,
  onUpdateObject,
  onCanvasZoom,
  onScaleObject,
  onScaleTableTarget,
  onAddObject,
  onEditLineRequest,
  onOpenMaterialTable,
  toolMode = 'select',
  orthogonal = false,
  drawingAction,
  onContextMenuRequest,
}: StandaloneDrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const editorInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [measurementContext] = useState<CanvasRenderingContext2D | null>(() =>
    document.createElement('canvas').getContext('2d'));
  const [interaction, setInteraction] = useState<TransformInteraction>(null);
  const [draftPoints, setDraftPoints] = useState<DrawingPoint[]>([]);
  const [draftKind, setDraftKind] = useState<Extract<DrawingObject['kind'], 'line' | 'polyline' | 'curve' | 'freehand'> | null>(null);
  const [pointerPoint, setPointerPoint] = useState<DrawingPoint | null>(null);
  const [selectionStart, setSelectionStart] = useState<DrawingPoint | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<DrawingPoint | null>(null);
  const [editor, setEditor] = useState<EditTarget | null>(null);
  const [tableTarget, setTableTarget] = useState<DrawingTableLocalTarget | null>(null);
  const [tableEditing, setTableEditing] = useState(false);
  const [caretIndex, setCaretIndex] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  const activeSelection = useMemo(() => selectedObjectIds ?? (selectedObjectId ? [selectedObjectId] : []), [selectedObjectId, selectedObjectIds]);
  const activeSelectionSet = useMemo(() => new Set(activeSelection), [activeSelection]);
  const tableObjects = useMemo(() => drawing.objects.filter((object): object is DrawingTableObject =>
    object.kind === 'table' || object.kind === 'bom-table' || object.kind === 'wiring-table'), [drawing.objects]);
  const tableObjectIds = useMemo(() => new Set(tableObjects.map((object) => object.id)), [tableObjects]);
  const editingObject = useMemo(() => {
    if (!editor) return undefined;
    return drawing.objects.find((candidate) => candidate.id === editor.objectId);
  }, [drawing.objects, editor]);
  const selectedObject = useMemo(() => drawing.objects.find((object) => object.id === selectedObjectId), [drawing.objects, selectedObjectId]);
  const selectedTransformObject = useMemo(() => selectedObject ? getDrawingTransformObject(selectedObject) : undefined, [selectedObject]);
  const activeTableTarget = toolMode === 'select' && tableTarget?.objectId === selectedObjectId ? tableTarget : null;
  const activeTransformObject = useMemo(() => {
    if (!activeTableTarget || !selectedObject || activeTableTarget.objectId !== selectedObject.id
      || (selectedObject.kind !== 'table' && selectedObject.kind !== 'bom-table' && selectedObject.kind !== 'wiring-table')) return selectedTransformObject;
    return getDrawingTableTargetObject(selectedObject, activeTableTarget);
  }, [activeTableTarget, selectedObject, selectedTransformObject]);

  const finalizeActiveDraft = (action: 'finish' | 'cancel') => {
    const object = finalizeDrawingDraft(draftKind, draftPoints, action, orthogonal);
    if (object) onAddObject?.(object);
    setDraftPoints([]);
    setDraftKind(null);
    setPointerPoint(null);
  };

  useEffect(() => {
    if (!drawingAction) return;
    const timer = window.setTimeout(() => {
      finalizeActiveDraft(drawingAction.type);
    }, 0);
    return () => window.clearTimeout(timer);
  // drawingAction.id is the explicit finish/cancel event boundary.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingAction?.id]);

  useEffect(() => {
    let cancelled = false;
    const loadFonts = async () => {
      await document.fonts.ready;
      if (!cancelled) setFontsReady(true);
    };
    void loadFonts();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fontsReady) return;
    const scale = window.devicePixelRatio || 1;
    canvas.width = drawing.page.width * scale;
    canvas.height = drawing.page.height * scale;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    renderDrawingCanvas(context, drawing, selectedObjectId, { hiddenObjectIds: tableObjectIds, selectedObjectIds: activeSelectionSet });
  }, [activeSelectionSet, drawing, fontsReady, selectedObjectId, tableObjectIds]);

  const caretLine = useMemo(() => {
    if (!fontsReady || !measurementContext || !editingObject || editor?.type !== 'field') return null;
    return measureDrawingCaret(measurementContext, editingObject, editor.field, editor.value, caretIndex);
  }, [caretIndex, editingObject, editor, fontsReady, measurementContext]);

  const editorObjectId = editor?.objectId ?? null;

  useEffect(() => {
    editorInputRef.current?.setSelectionRange(caretIndex, caretIndex);
  }, [caretIndex, editorObjectId]);

  const getDrawingPoint = (clientX: number, clientY: number): DrawingPoint | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * drawing.page.width,
      y: ((clientY - rect.top) / rect.height) * drawing.page.height,
    };
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const point = getDrawingPoint(event.clientX, event.clientY);
    if (!point) return;
    finalizeActiveDraft('finish');
    if (toolMode !== 'select') return;
    const object = getDrawingObjectAtPoint(drawing, point);
    setInteraction(null);
    setSelectionStart(null);
    setSelectionEnd(null);
    onContextMenuRequest?.({
      objectId: object?.id ?? null,
      canvasPoint: point,
      clientPoint: { x: event.clientX, y: event.clientY },
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    if (editor) return;
    if (event.detail > 1) {
      setInteraction(null);
      return;
    }
    const point = getDrawingPoint(event.clientX, event.clientY);
    if (!point) return;
    if (toolMode === 'freehand') {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDraftPoints([point]);
      setDraftKind('freehand');
      setPointerPoint(point);
      return;
    }
    if (toolMode === 'line' || toolMode === 'polyline' || toolMode === 'curve') {
      const origin = draftPoints.at(-1);
      const nextPoint = orthogonal && origin ? snapOrthogonalPoint(origin, point) : point;
      if (toolMode === 'line' && draftPoints.length === 1) {
        onAddObject?.(createDrawingLineObject('line', [draftPoints[0], nextPoint], orthogonal));
        setDraftPoints([]);
        setDraftKind(null);
        setPointerPoint(null);
      } else {
        setDraftPoints((items) => [...items, nextPoint]);
        setDraftKind(toolMode);
        setPointerPoint(nextPoint);
      }
      return;
    }
    const object = getDrawingObjectAtPoint(drawing, point);
    if (object) {
      const nextSelection = event.shiftKey
        ? activeSelection.includes(object.id) ? activeSelection.filter((id) => id !== object.id) : [...activeSelection, object.id]
        : [object.id];
      onSelectionChange?.(nextSelection);
      onSelectObject(nextSelection.at(-1) ?? null);
    } else {
      onSelectionChange?.([]);
      onSelectObject(null);
      setSelectionStart(point);
      setSelectionEnd(point);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (!object || object.locked) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    onStartEdit();
    setInteraction({ kind: 'move', object: structuredClone(object), startPointer: point });
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const point = getDrawingPoint(event.clientX, event.clientY);
    if (!point) return;
    const factor = getWheelScaleFactor(event.deltaY);
    if (toolMode === 'select' && selectedObject && activeTransformObject && !selectedObject.locked
      && containsDrawingPoint(activeTransformObject, point)) {
      if (activeTableTarget) {
        onScaleTableTarget?.(selectedObject.id, activeTableTarget, factor);
        return;
      }
      onScaleObject?.(selectedObject.id, factor);
      return;
    }
    onCanvasZoom?.(clampDrawingZoom(zoom * factor));
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getDrawingPoint(event.clientX, event.clientY);
    if (!point) return;
    if (toolMode === 'freehand' && draftPoints.length > 0 && event.buttons === 1) {
      setDraftPoints((items) => sampleFreehandPoint(items, point));
      setPointerPoint(point);
      return;
    }
    if (toolMode !== 'select' && draftPoints.length > 0) {
      const origin = draftPoints.at(-1)!;
      setPointerPoint(orthogonal ? snapOrthogonalPoint(origin, point) : point);
      return;
    }
    if (selectionStart) {
      setSelectionEnd(point);
      return;
    }
    updateTransform(event.clientX, event.clientY, event.shiftKey);
  };

  const updateTransform = (clientX: number, clientY: number, shiftKey: boolean) => {
    if (!interaction) return;
    const point = getDrawingPoint(clientX, clientY);
    const interactionObjectId = interaction.kind === 'table-resize' ? interaction.table.id : interaction.object.id;
    if (!point || !drawing.objects.some((object) => object.id === interactionObjectId)) return;
    if (interaction.kind === 'table-resize') {
      const resized = resizeDrawingObject(interaction.object, interaction.handle, point, false).patch;
      const width = resized.width ?? interaction.object.width;
      const height = resized.height ?? interaction.object.height;
      const patch = interaction.target.kind === 'table-cell'
        ? resizeDrawingTableCell(interaction.table, { rowIndex: interaction.target.rowIndex ?? -1, columnIndex: interaction.target.columnIndex ?? 0 }, { width, height })
        : resizeDrawingTableText(interaction.table, interaction.target.key, {
          width, height, fontSize: interaction.table.textSizes?.[interaction.target.key]?.fontSize ?? interaction.table.style.fontSize,
        });
      onUpdateObject(interaction.table.id, patch as Partial<DrawingObject>);
      return;
    }
    if (
      interaction.kind === 'resize'
      && (
        interaction.object.kind === 'table'
        || interaction.object.kind === 'bom-table'
        || interaction.object.kind === 'wiring-table'
      )
    ) {
      const result = resizeDrawingTableFromHandle(interaction.object, interaction.handle, point);
      onUpdateObject(interaction.object.id, result.patch as Partial<DrawingObject>);
      return;
    }
    const patch = interaction.kind === 'move'
      ? moveDrawingObject(interaction.object, { x: point.x - interaction.startPointer.x, y: point.y - interaction.startPointer.y }, { width: drawing.page.width, height: drawing.page.height, inset: 20 })
      : interaction.kind === 'resize'
        ? resizeDrawingObject(interaction.object, interaction.handle, point, shiftKey).patch
        : rotateDrawingObject(interaction.object, interaction.startPointer, point, shiftKey);
    if (Object.values(patch).every((value) => typeof value !== 'number' || Number.isFinite(value))) onUpdateObject(interaction.object.id, patch);
  };

  const beginResize = (handle: ResizeHandle, event: React.PointerEvent<SVGRectElement>) => {
    if (!selectedObject || !activeTransformObject || selectedObject.locked) return;
    const point = getDrawingPoint(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onStartEdit();
    if (activeTableTarget && (selectedObject.kind === 'table' || selectedObject.kind === 'bom-table' || selectedObject.kind === 'wiring-table')) {
      setInteraction({ kind: 'table-resize', object: structuredClone(activeTransformObject), table: structuredClone(selectedObject), target: activeTableTarget, startPointer: point, handle });
      return;
    }
    if (!selectedTransformObject) return;
    if (selectedTransformObject !== selectedObject && 'points' in selectedTransformObject) {
      onUpdateObject(selectedObject.id, {
        x: selectedTransformObject.x,
        y: selectedTransformObject.y,
        width: selectedTransformObject.width,
        height: selectedTransformObject.height,
        points: selectedTransformObject.points,
      } as Partial<DrawingObject>);
    }
    setInteraction({ kind: 'resize', object: structuredClone(selectedTransformObject), startPointer: point, handle });
  };

  const beginRotate = (event: React.PointerEvent<SVGCircleElement>) => {
    if (!selectedObject || !selectedTransformObject || selectedObject.locked || activeTableTarget) return;
    const point = getDrawingPoint(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onStartEdit();
    if (selectedTransformObject !== selectedObject && 'points' in selectedTransformObject) {
      onUpdateObject(selectedObject.id, {
        x: selectedTransformObject.x,
        y: selectedTransformObject.y,
        width: selectedTransformObject.width,
        height: selectedTransformObject.height,
        points: selectedTransformObject.points,
      } as Partial<DrawingObject>);
    }
    setInteraction({ kind: 'rotate', object: structuredClone(selectedTransformObject), startPointer: point });
  };

  const endTransform = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setInteraction(null);
  };

  const endDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (toolMode === 'freehand' && draftPoints.length > 0) {
      onAddObject?.(createDrawingLineObject('freehand', draftPoints));
      setDraftPoints([]);
      setDraftKind(null);
      setPointerPoint(null);
    }
    if (selectionStart && selectionEnd) {
      const ids = getObjectsInSelectionRect(drawing, normalizeDrawingRect(selectionStart, selectionEnd));
      if (ids.some((id) => tableObjectIds.has(id))) setTableTarget(null);
      onSelectionChange?.(ids);
      onSelectObject(ids.at(-1) ?? null);
      setSelectionStart(null);
      setSelectionEnd(null);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setInteraction(null);
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
    setInteraction(null);
    const point = getDrawingPoint(event.clientX, event.clientY);
    if (!point) return;
    if ((toolMode === 'polyline' || toolMode === 'curve') && draftPoints.length > 0) {
      const origin = draftPoints.at(-1)!;
      const end = orthogonal ? snapOrthogonalPoint(origin, point) : point;
      const points = [...draftPoints, end];
      if (points.length >= 2) {
        onAddObject?.(createDrawingLineObject(toolMode, points, orthogonal));
      }
      setDraftPoints([]);
      setDraftKind(null);
      setPointerPoint(null);
      return;
    }
    if (toolMode !== 'select') return;
    const object = getDrawingObjectAtPoint(drawing, point);
    onSelectObject(object?.id ?? null);
    if (!object || object.locked) return;
    if (object.kind === 'line' || object.kind === 'polyline' || object.kind === 'curve' || object.kind === 'freehand') {
      onEditLineRequest?.(object.id);
      return;
    }
    const nextEditor = createEditor(object, point);
    if (nextEditor) {
      const nextCaretIndex = nextEditor.type === 'field' && measurementContext
        ? getDrawingCaretIndexAtPoint(measurementContext, object, nextEditor.field, nextEditor.value, point)
        : nextEditor.value.length;
      onStartEdit();
      setCaretIndex(nextCaretIndex);
      setEditor(nextEditor);
    }
  };

  const updateEditorValue = (value: string, selectionStart = value.length) => {
    if (!editor) return;
    const nextEditor = { ...editor, value };
    setEditor(nextEditor);
    setCaretIndex(selectionStart);
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
        ref={(element) => { editorInputRef.current = element; }}
        autoFocus
        value={editor.value}
        onFocus={(event) => event.currentTarget.setSelectionRange(caretIndex, caretIndex)}
        onSelect={(event) => setCaretIndex(event.currentTarget.selectionStart)}
        onChange={(event) => updateEditorValue(event.target.value, event.target.selectionStart)}
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
          caretColor: 'transparent',
          pointerEvents: 'none',
        }}
      />
    ) : (
      <input
        ref={(element) => { editorInputRef.current = element; }}
        autoFocus
        value={editor.value}
        onFocus={(event) => event.currentTarget.setSelectionRange(caretIndex, caretIndex)}
        onSelect={(event) => setCaretIndex(event.currentTarget.selectionStart ?? 0)}
        onChange={(event) => updateEditorValue(event.target.value, event.target.selectionStart ?? event.target.value.length)}
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
          caretColor: 'transparent',
          pointerEvents: 'none',
        }}
      />
    )
  );
  const previewPoints = pointerPoint && draftPoints.length > 0 && toolMode !== 'freehand'
      ? [...draftPoints, pointerPoint]
      : draftPoints;
  const selectionRect = selectionStart && selectionEnd ? normalizeDrawingRect(selectionStart, selectionEnd) : null;

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[linear-gradient(#dbe4ef_1px,transparent_1px),linear-gradient(90deg,#dbe4ef_1px,transparent_1px)] bg-[size:24px_24px] p-5">
      <div className="relative inline-block" onContextMenu={handleContextMenu} onWheel={handleWheel}>
        <canvas
          ref={canvasRef}
          className={`block bg-white shadow-lg touch-none ${toolMode !== 'select' ? 'cursor-crosshair' : ''}`}
          style={{ width: `${drawing.page.width * zoom}px`, height: `${drawing.page.height * zoom}px` }}
          onDoubleClick={handleDoubleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onContextMenu={handleContextMenu}
        />
        {tableObjects.map((object) => (
          <DrawingTableLayer
            key={object.id}
            object={object}
            zoom={zoom}
            selected={activeSelectionSet.has(object.id)}
            activeTarget={activeTableTarget?.objectId === object.id ? activeTableTarget : null}
            onSelect={() => onSelectObject(object.id)}
            onSelectTarget={setTableTarget}
            onEditingChange={setTableEditing}
            onStartEdit={onStartEdit}
            onUpdateObject={onUpdateObject}
            onOpenMaterialTable={onOpenMaterialTable}
          />
        ))}
        {(previewPoints.length > 0 || selectionRect) && (
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 z-20 overflow-visible"
            width={drawing.page.width * zoom}
            height={drawing.page.height * zoom}
          >
            {previewPoints.length > 0 && (
              <polyline
                points={previewPoints.map((point) => `${point.x * zoom},${point.y * zoom}`).join(' ')}
                fill="none"
                stroke="#2563eb"
                strokeWidth={2}
                strokeDasharray={toolMode === 'freehand' ? undefined : '6 4'}
              />
            )}
            {selectionRect && (
              <rect
                x={selectionRect.x * zoom}
                y={selectionRect.y * zoom}
                width={selectionRect.width * zoom}
                height={selectionRect.height * zoom}
                fill="rgba(37,99,235,0.08)"
                stroke="#2563eb"
                strokeDasharray="5 4"
              />
            )}
          </svg>
        )}
        {toolMode === 'select' && activeTransformObject && !editor && !tableEditing && (
          <StandaloneDrawingSelectionOverlay
            object={activeTransformObject}
            zoom={zoom}
            pageWidth={drawing.page.width}
            pageHeight={drawing.page.height}
            controlsVisible={!activeTransformObject.locked}
            showRotation={!activeTableTarget}
            compactHitTargets={activeTableTarget?.kind === 'table-text'}
            onResizePointerDown={beginResize}
            onRotatePointerDown={beginRotate}
            onPointerMove={(event) => updateTransform(event.clientX, event.clientY, event.shiftKey)}
            onPointerEnd={endTransform}
          />
        )}
        {editorControl}
        {caretLine && (
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 z-30 overflow-visible"
            width={drawing.page.width * zoom}
            height={drawing.page.height * zoom}
          >
            <line
              x1={caretLine.start.x * zoom}
              y1={caretLine.start.y * zoom}
              x2={caretLine.end.x * zoom}
              y2={caretLine.end.y * zoom}
              stroke="#0f172a"
              strokeWidth="1"
            >
              <animate attributeName="opacity" values="1;1;0;0" dur="1s" repeatCount="indefinite" />
            </line>
          </svg>
        )}
      </div>
    </div>
  );
}

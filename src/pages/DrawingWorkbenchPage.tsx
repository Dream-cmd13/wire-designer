import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Maximize2, Minus, Plus } from 'lucide-react';
import { ActionToast } from '@/components/shared/ActionToast';
import { DrawingCanvasContextMenu } from '@/components/drawings/standalone/DrawingCanvasContextMenu';
import { DrawingComponentLibraryModal } from '@/components/drawings/standalone/DrawingComponentLibraryModal';
import { DrawingCrossWireDialog } from '@/components/drawings/standalone/DrawingCrossWireDialog';
import { DrawingDrawToolFloatingBar, type DrawToolSettings } from '@/components/drawings/standalone/DrawingDrawToolFloatingBar';
import { DrawingLinePropertiesDialog } from '@/components/drawings/standalone/DrawingLinePropertiesDialog';
import { DrawingMaterialTableDialog } from '@/components/drawings/standalone/DrawingMaterialTableDialog';
import { DrawingPdfExportDialog } from '@/components/drawings/standalone/DrawingPdfExportDialog';
import { DrawingIconLibraryDialog } from '@/components/drawings/standalone/DrawingIconLibraryDialog';
import { DrawingProcessNotesModal } from '@/components/drawings/standalone/DrawingProcessNotesModal';
import { DrawingResourcePanel } from '@/components/drawings/standalone/DrawingResourcePanel';
import { DrawingTableCreateDialog } from '@/components/drawings/standalone/DrawingTableCreateDialog';
import { DrawingWiringRelationDialog } from '@/components/drawings/standalone/DrawingWiringRelationDialog';
import { StandaloneDrawingCanvas } from '@/components/drawings/standalone/StandaloneDrawingCanvas';
import { StandaloneDrawingInspector } from '@/components/drawings/standalone/StandaloneDrawingInspector';
import { StandaloneDrawingWizard } from '@/components/drawings/standalone/StandaloneDrawingWizard';
import { DrawingWorkbenchToolbar } from '@/components/drawings/standalone/DrawingWorkbenchToolbar';
import { clearDrawingCanvas, moveDrawingLayers, patchDrawingObjects, placeDrawingCopiesAtPoint, setDrawingLayer, splitDrawingObjects, splitDrawingPathAtPoint, toggleAllDrawingLocks, toggleDrawingLocks } from '@/lib/drawingCommands';
import { downloadTextFile, safeFilename } from '@/lib/designFile';
import { isDrawingDocument } from '@/lib/drawingDocumentSchema';
import { createDrawingId, createDrawingNumberTubeObject, createDrawingResourceObject, createDrawingTableObject, defaultDrawingObjectStyle, type DrawingTableCreateInput } from '@/lib/drawingDocument';
import { downloadDrawingPdf } from '@/lib/drawingExport';
import { applyDrawingLineProperties, type DrawingLinePropertiesInput } from '@/lib/drawingLineProperties';
import { appendDrawingMaterial, moveDrawingMaterial, removeDrawingMaterial, updateDrawingMaterial, type DrawingMaterialInput } from '@/lib/drawingMaterials';
import type { DrawingComponentGraphicCategory } from '@/lib/drawingStaticResources';
import { getDrawingTableTargetObject, resizeDrawingTableCell, resizeDrawingTableText, resolveDrawingTableLayout, scaleDrawingTable } from '@/lib/drawingTableLayout';
import { getDrawingTransformObject, getWheelScaleFactor, MAX_CANVAS_ZOOM, MAX_OBJECT_SCALE, MIN_CANVAS_ZOOM, MIN_OBJECT_SCALE, scaleDrawingObjectFromCenter } from '@/lib/drawingTransform';
import { enterDrawingWorkbench } from '@/lib/drawingWorkbenchSession';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import {
  corruptWorkspaceDraftsToJson,
  listCorruptWorkspaceDrafts,
  removeCorruptWorkspaceDraft,
  type CorruptWorkspaceDraft,
} from '@/lib/workspaceDraftCache';
import { canEditDrawing, hydrateDrawingStore, useDrawingStore } from '@/stores/drawingStore';
import { notify } from '@/stores/noticeStore';
import { useUserStore } from '@/stores/userStore';
import type { DrawingBomTableObject, DrawingCatalogResource, DrawingCommonPhrase, DrawingDimensionVariant, DrawingDocument, DrawingIconResource, DrawingLineObject, DrawingObject, DrawingObjectStyle, DrawingPoint, DrawingResourceKind, DrawingTableLocalTarget, DrawingToolMode } from '@/types/drawing';

type DrawingContextState = {
  objectId: string | null;
  canvasPoint: DrawingPoint;
  clientPoint: { x: number; y: number };
};

type WheelGestureState = {
  objectId: string;
  targetKey?: string;
  startObject: DrawingObject;
  cumulativeScale: number;
  timeoutId: number;
};

const resourceDefaultPoints: Record<DrawingResourceKind, { x: number; y: number }> = {
  connector: { x: 90, y: 210 }, 'wire-bundle': { x: 245, y: 260 }, accessory: { x: 420, y: 238 },
  table: { x: 600, y: 400 }, 'wiring-table': { x: 600, y: 400 }, 'bom-table': { x: 600, y: 505 },
  line: { x: 360, y: 330 }, polyline: { x: 360, y: 330 }, curve: { x: 360, y: 330 }, freehand: { x: 360, y: 330 },
  dimension: { x: 320, y: 170 }, label: { x: 420, y: 120 }, text: { x: 420, y: 120 }, 'tech-requirements': { x: 70, y: 520 },
};
const zoomButtonClass = 'inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border border-transparent px-1.5 font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40';

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function stampDrawingEdit(document: DrawingDocument): DrawingDocument { return { ...document, updatedAt: Date.now() }; }
function overlaps(left: DrawingObject, right: DrawingObject) { return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y; }
function topLayer(drawing: DrawingDocument) { return Math.max(...drawing.objects.map((object) => object.zIndex), 0) + 1; }
function isLineObject(object: DrawingObject): object is DrawingLineObject { return object.kind === 'line' || object.kind === 'polyline' || object.kind === 'curve' || object.kind === 'freehand'; }
function fallbackLineName(drawing: DrawingDocument, objectId: string) { return `线${drawing.objects.filter(isLineObject).findIndex((object) => object.id === objectId) + 1}`; }
function nextLineName(drawing: DrawingDocument) {
  const lines = drawing.objects.filter(isLineObject);
  const highest = lines.reduce((maximum, object) => Math.max(maximum, Number(object.name?.match(/^线(\d+)$/)?.[1] ?? 0)), lines.length);
  return `线${highest + 1}`;
}

function createPlacedResource(drawing: DrawingDocument, kind: DrawingResourceKind): DrawingObject {
  const base = resourceDefaultPoints[kind];
  let point = { ...base };
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const candidate = createDrawingResourceObject(kind, point);
    if (!drawing.objects.some((object) => object.visible && overlaps(candidate, object))) return { ...candidate, zIndex: topLayer(drawing) } as DrawingObject;
    point = { x: base.x + ((attempt + 1) % 6) * 36, y: base.y + Math.floor((attempt + 1) / 6) * 42 };
  }
  return { ...createDrawingResourceObject(kind, point), zIndex: topLayer(drawing) } as DrawingObject;
}

function createPlacedNumberTube(drawing: DrawingDocument): DrawingObject {
  const base = { x: 420, y: 238 };
  let point = { ...base };
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const candidate = createDrawingNumberTubeObject(point);
    if (!drawing.objects.some((object) => object.visible && overlaps(candidate, object))) return { ...candidate, zIndex: topLayer(drawing) };
    point = { x: base.x + ((attempt + 1) % 6) * 36, y: base.y + Math.floor((attempt + 1) / 6) * 42 };
  }
  return { ...createDrawingNumberTubeObject(point), zIndex: topLayer(drawing) };
}

export function DrawingWorkbenchPage() {
  const drawingOwnerId = useUserStore((state) => state.currentUser?.id ?? null);
  return <DrawingWorkbenchSession key={drawingOwnerId === null ? 'anonymous' : `account:${drawingOwnerId}`} drawingOwnerId={drawingOwnerId} />;
}

function DrawingWorkbenchSession({ drawingOwnerId }: { drawingOwnerId: string | null }) {
  const storeOwnerId = useDrawingStore((state) => state.ownerId);
  const documents = useDrawingStore((state) => state.documents);
  const activeDocumentId = useDrawingStore((state) => state.activeDocumentId);
  const saveState = useDrawingStore((state) => state.saveState);
  const draftError = useDrawingStore((state) => state.draftError);
  const hydrationError = useDrawingStore((state) => state.hydrationError);
  const replaceWithNewDocument = useDrawingStore((state) => state.replaceWithNewDocument);
  const updateDocument = useDrawingStore((state) => state.updateDocument);
  const saveActiveDocument = useDrawingStore((state) => state.saveActiveDocument);
  const drawing = storeOwnerId === drawingOwnerId && activeDocumentId && documents[activeDocumentId]?.id === activeDocumentId
    ? documents[activeDocumentId] : undefined;
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [toolMode, setToolMode] = useState<DrawingToolMode>('select');
  const [drawToolSettings, setDrawToolSettings] = useState<DrawToolSettings>({
    stroke: '#111827',
    strokeWidth: 1,
    dash: 'solid',
    lineCount: 1,
    snapEnabled: true,
  });
  const [drawingAction, setDrawingAction] = useState<{ id: number; type: 'finish' | 'cancel' }>({ id: 0, type: 'cancel' });
  const [orthogonal, setOrthogonal] = useState(false);
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [iconLibraryOpen, setIconLibraryOpen] = useState(false);
  const [componentLibraryCategory, setComponentLibraryCategory] = useState<DrawingComponentGraphicCategory | null>(null);
  const [processNotesOpen, setProcessNotesOpen] = useState(false);
  const [crossWireDialogOpen, setCrossWireDialogOpen] = useState(false);
  const [wiringRelationDialogOpen, setWiringRelationDialogOpen] = useState(false);
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [exportFilename, setExportFilename] = useState('');
  const [selectionWarning, setSelectionWarning] = useState(false);
  const [past, setPast] = useState<DrawingDocument[]>([]);
  const [future, setFuture] = useState<DrawingDocument[]>([]);
  const [contextMenu, setContextMenu] = useState<DrawingContextState | null>(null);
  const [clipboard, setClipboard] = useState<DrawingObject[]>([]);
  const [lineEditorObjectId, setLineEditorObjectId] = useState<string | null>(null);
  const [materialTableObjectId, setMaterialTableObjectId] = useState<string | null>(null);
  const [hydrationAttempt, setHydrationAttempt] = useState(0);
  const [corruptDrafts, setCorruptDrafts] = useState<CorruptWorkspaceDraft[]>([]);
  const [entryReady, setEntryReady] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const importGenerationRef = useRef(0);
  const sessionActiveRef = useRef(false);
  const wheelGestureRef = useRef<WheelGestureState | null>(null);
  const primaryId = selectedObjectIds.at(-1) ?? null;
  const selected = drawing?.objects.filter((object) => selectedObjectIds.includes(object.id)) ?? [];
  const editableObjects = drawing?.objects.filter((object) => object.kind !== 'title-block') ?? [];
  const allObjectsLocked = editableObjects.length > 0 && editableObjects.every((object) => object.locked);
  const contextObject = contextMenu?.objectId ? drawing?.objects.find((object) => object.id === contextMenu.objectId) : undefined;
  const lineEditorObject = lineEditorObjectId ? drawing?.objects.find((object): object is DrawingLineObject => object.id === lineEditorObjectId && isLineObject(object)) : undefined;
  const materialTableObject = materialTableObjectId
    ? drawing?.objects.find((object): object is DrawingBomTableObject => object.id === materialTableObjectId && object.kind === 'bom-table')
    : undefined;
  const fitZoom = drawing && viewport
    ? Math.min(MAX_CANVAS_ZOOM, viewport.width / drawing.page.width, viewport.height / drawing.page.height)
    : 0.72;
  const zoom = manualZoom ?? fitZoom;
  const minZoom = Math.min(MIN_CANVAS_ZOOM, zoom);
  const changeZoom = (next: number) => {
    const adjusted = Math.min(MAX_CANVAS_ZOOM, Math.max(minZoom, next));
    if (adjusted !== zoom) setManualZoom(adjusted);
  };

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      await Promise.resolve();
      if (cancelled || (useUserStore.getState().currentUser?.id ?? null) !== drawingOwnerId) return;
      const state = useDrawingStore.getState();
      const alreadyHasDrawing = state.ownerId === drawingOwnerId && state.activeDocumentId
        && state.documents[state.activeDocumentId]?.id === state.activeDocumentId;
      if (!alreadyHasDrawing) {
        const result = await hydrateDrawingStore(drawingOwnerId);
        if (cancelled || (useUserStore.getState().currentUser?.id ?? null) !== drawingOwnerId) return;
        if (result === 'failed') {
          setEntryReady(true);
          return;
        }
      }

      const currentState = useDrawingStore.getState();
      if (currentState.ownerId !== drawingOwnerId) return;
      const hasExisting = Boolean(currentState.activeDocumentId && currentState.documents[currentState.activeDocumentId]);
      const entry = enterDrawingWorkbench(hasExisting);

      if (entry === 'create' || !hasExisting) {
        replaceWithNewDocument('未命名线束图');
      }

      setCorruptDrafts(listCorruptWorkspaceDrafts(drawingOwnerId ?? 'anonymous', 'drawing'));

      sessionActiveRef.current = true;
      setEntryReady(true);
    };

    void initialize();
    return () => { cancelled = true; sessionActiveRef.current = false; importGenerationRef.current += 1; };
  }, [drawingOwnerId, hydrationAttempt, replaceWithNewDocument]);
  useEffect(() => { if (!selectionWarning) return; const timer = window.setTimeout(() => setSelectionWarning(false), 2200); return () => window.clearTimeout(timer); }, [selectionWarning]);
  useEffect(() => () => { if (wheelGestureRef.current) window.clearTimeout(wheelGestureRef.current.timeoutId); }, []);

  const remember = () => { if (!drawing) return; setPast((items) => [...items.slice(-49), clone(drawing)]); setFuture([]); };
  const isCurrentDrawing = () => {
    const state = useDrawingStore.getState();
    return canEditDrawing() && sessionActiveRef.current && (useUserStore.getState().currentUser?.id ?? null) === drawingOwnerId
      && state.ownerId === drawingOwnerId && Boolean(drawing && state.activeDocumentId === drawing.id);
  };
  const apply = (next: DrawingDocument) => {
    if (isCurrentDrawing()) updateDocument(next);
  };
  const updateObject = (objectId: string, patch: Partial<DrawingObject>) => {
    if (isCurrentDrawing()) useDrawingStore.getState().updateObject(objectId, patch);
  };
  const saveDrawing = () => {
    if (!isCurrentDrawing()) return;
    void saveActiveDocument().catch((error) => notify({ tone: 'danger', title: '本地保存失败', message: getUserErrorMessage(error, '请保持页面打开，下载副本后重试。') }));
  };
  const applyCommand = (command: (document: DrawingDocument) => DrawingDocument) => { if (!drawing) return; const next = command(drawing); if (next === drawing) return; remember(); apply(next); };
  const addObject = (object: DrawingObject) => {
    if (!drawing) return;
    remember();
    const styled = toolMode === 'freehand' && object.kind === 'freehand'
      ? {
          ...object,
          style: {
            ...object.style,
            stroke: drawToolSettings.stroke,
            strokeWidth: drawToolSettings.strokeWidth,
            dash: drawToolSettings.dash,
          },
        }
      : object;
    const named = isLineObject(styled) && !styled.name ? { ...styled, name: nextLineName(drawing) } : styled;
    const next = { ...named, zIndex: topLayer(drawing) } as DrawingObject;
    apply(stampDrawingEdit({ ...drawing, objects: [...drawing.objects, next] }));
    setSelectedObjectIds([next.id]);
  };
  const updateSelectedObjects = (objectIds: string[], patch: Partial<DrawingObject>, stylePatch?: Partial<DrawingObjectStyle>) => {
    if (!drawing) return;
    apply(patchDrawingObjects(drawing, objectIds, patch, stylePatch));
  };
  const addResource = (kind: DrawingResourceKind) => { if (!drawing) return; addObject(createPlacedResource(drawing, kind)); setResourcesOpen(false); };
  const addDimension = (variant: DrawingDimensionVariant = 'horizontal') => {
    if (!drawing) return;
    const base = createPlacedResource(drawing, 'dimension');
    if (base.kind !== 'dimension') return;
    const isVertical = variant === 'vertical' || variant === 'vertical-inward';
    const label = variant === 'diameter' ? 'Ø 10mm' : variant === 'radius' ? 'R 5mm' : base.label;
    addObject({
      ...base,
      width: isVertical ? 45 : base.width,
      height: isVertical ? 140 : base.height,
      label,
      variant,
    });
    setResourcesOpen(false);
  };
  const addNumberTube = () => { if (!drawing) return; addObject(createPlacedNumberTube(drawing)); setResourcesOpen(false); };
  const openIconLibrary = () => { setResourcesOpen(false); setIconLibraryOpen(true); };
  const addTable = (input: DrawingTableCreateInput) => {
    if (!drawing) return;
    const base = resourceDefaultPoints.table;
    let table = createDrawingTableObject(base, input);
    for (let attempt = 0; attempt < 18 && drawing.objects.some((object) => object.visible && overlaps(table, object)); attempt += 1) {
      table = createDrawingTableObject({ x: base.x + ((attempt + 1) % 6) * 36, y: base.y + Math.floor((attempt + 1) / 6) * 42 }, input);
    }
    addObject(table);
    setResourcesOpen(false);
    setTableDialogOpen(false);
  };
  const scaleSelectedObject = (objectId: string, factor: number) => {
    if (!drawing) return;
    const currentObject = drawing.objects.find((object) => object.id === objectId);
    if (!currentObject || currentObject.locked) return;
    let gesture = wheelGestureRef.current;
    if (!gesture || gesture.objectId !== objectId || gesture.targetKey) {
      if (gesture) window.clearTimeout(gesture.timeoutId);
      remember();
      gesture = { objectId, startObject: clone(currentObject), cumulativeScale: 1, timeoutId: 0 };
      wheelGestureRef.current = gesture;
    }
    gesture.cumulativeScale = Math.min(MAX_OBJECT_SCALE, Math.max(MIN_OBJECT_SCALE, gesture.cumulativeScale * factor));
    window.clearTimeout(gesture.timeoutId);
    gesture.timeoutId = window.setTimeout(() => { if (wheelGestureRef.current === gesture) wheelGestureRef.current = null; }, 180);
    const startObject = gesture.startObject;
    const patch = startObject.kind === 'table' || startObject.kind === 'bom-table' || startObject.kind === 'wiring-table'
      ? scaleDrawingTable(startObject, gesture.cumulativeScale)
      : scaleDrawingObjectFromCenter(getDrawingTransformObject(startObject), gesture.cumulativeScale);
    updateObject(objectId, patch as Partial<DrawingObject>);
  };
  const scaleTableTarget = (objectId: string, target: DrawingTableLocalTarget, factor: number) => {
    if (!drawing) return;
    const currentObject = drawing.objects.find((object) => object.id === objectId);
    if (!currentObject || currentObject.locked || (currentObject.kind !== 'table' && currentObject.kind !== 'bom-table' && currentObject.kind !== 'wiring-table')) return;
    const targetKey = `${target.kind}:${target.key}`;
    let gesture = wheelGestureRef.current;
    if (!gesture || gesture.objectId !== objectId || gesture.targetKey !== targetKey) {
      if (gesture) window.clearTimeout(gesture.timeoutId);
      remember();
      gesture = { objectId, targetKey, startObject: clone(currentObject), cumulativeScale: 1, timeoutId: 0 };
      wheelGestureRef.current = gesture;
    }
    gesture.cumulativeScale = Math.min(MAX_OBJECT_SCALE, Math.max(MIN_OBJECT_SCALE, gesture.cumulativeScale * factor));
    window.clearTimeout(gesture.timeoutId);
    gesture.timeoutId = window.setTimeout(() => { if (wheelGestureRef.current === gesture) wheelGestureRef.current = null; }, 180);
    const startTable = gesture.startObject as typeof currentObject;
    const patch = target.kind === 'table-cell'
      ? (() => {
        const layout = resolveDrawingTableLayout(startTable);
        const rowHeight = target.rowIndex === undefined || target.rowIndex < 0 ? layout.headerRowHeight : layout.rowHeights[target.rowIndex];
        return resizeDrawingTableCell(startTable, { rowIndex: target.rowIndex ?? -1, columnIndex: target.columnIndex ?? 0 }, {
          width: layout.columnWidths[target.columnIndex ?? 0] * gesture.cumulativeScale,
          height: rowHeight * gesture.cumulativeScale,
        });
      })()
      : (() => {
        const frame = getDrawingTableTargetObject(startTable, target);
        return resizeDrawingTableText(startTable, target.key, {
          width: frame.width * gesture.cumulativeScale,
          height: frame.height * gesture.cumulativeScale,
          fontSize: frame.style.fontSize * gesture.cumulativeScale,
        });
      })();
    updateObject(objectId, patch as Partial<DrawingObject>);
  };
  const removeSelected = () => { if (!drawing) return; const ids = new Set(selected.filter((object) => !object.locked && object.kind !== 'title-block').map((object) => object.id)); if (!ids.size) return; remember(); apply(stampDrawingEdit({ ...drawing, objects: drawing.objects.filter((object) => !ids.has(object.id)) })); setSelectedObjectIds([]); };
  const undo = () => { if (!drawing || !past.length) return; const previous = past.at(-1)!; setPast((items) => items.slice(0, -1)); setFuture((items) => [clone(drawing), ...items].slice(0, 50)); apply(previous); setSelectedObjectIds([]); };
  const redo = () => { if (!drawing || !future.length) return; const next = future[0]; setFuture((items) => items.slice(1)); setPast((items) => [...items, clone(drawing)].slice(-50)); apply(next); setSelectedObjectIds([]); };
  const copySelected = () => setClipboard(clone(selected.filter((object) => object.kind !== 'title-block')));
  const paste = (point?: DrawingPoint) => {
    if (!drawing || !clipboard.length) return;
    const minX = Math.min(...clipboard.map((object) => object.x));
    const minY = Math.min(...clipboard.map((object) => object.y));
    const target = point ?? { x: minX + 20, y: minY + 20 };
    const copies = placeDrawingCopiesAtPoint(clipboard, target, topLayer(drawing));
    if (!copies.length) return;
    remember();
    apply(stampDrawingEdit({ ...drawing, objects: [...drawing.objects, ...copies] }));
    setSelectedObjectIds(copies.map((object) => object.id));
  };
  const clear = () => {
    applyCommand(clearDrawingCanvas);
    setSelectedObjectIds([]);
    setContextMenu(null);
    setLineEditorObjectId(null);
    setMaterialTableObjectId(null);
  };
  const resetTransientState = () => {
    setPast([]);
    setFuture([]);
    setSelectedObjectIds([]);
    setClipboard([]);
    setContextMenu(null);
    setLineEditorObjectId(null);
    setMaterialTableObjectId(null);
    setResourcesOpen(false);
    setIconLibraryOpen(false);
    setTableDialogOpen(false);
    setPdfDialogOpen(false);
    setWizardOpen(false);
    setToolMode('select');
  };
  const downloadLocalDrawingCopy = () => {
    if (!drawing) return;
    downloadTextFile(
      JSON.stringify({
        kind: 'wire-harness-drawing-local-copy',
        savedAt: new Date().toISOString(),
        document: drawing,
      }, null, 2),
      `${safeFilename(drawing.name || 'drawing')}-local-copy.json`,
    );
  };
  const importLocalDrawingCopy = async (file: File) => {
    const generation = ++importGenerationRef.current;
    try {
      const text = await file.text();
      if (generation !== importGenerationRef.current || !isCurrentDrawing()) return;
      const raw: unknown = JSON.parse(text);
      const document = raw && typeof raw === 'object' && 'document' in raw ? raw.document : raw;
      if (!isDrawingDocument(document)) {
        notify({ tone: 'danger', title: '导入失败', message: '文件不是有效的图纸副本，当前图纸已保留。' });
        return;
      }
      // 导入始终生成新 ID，避免覆盖当前图纸或同名的本地记录。
      updateDocument(stampDrawingEdit({ ...document, id: createDrawingId() }));
      resetTransientState();
      await saveActiveDocument();
      notify({ tone: 'success', message: '图纸副本已导入并保存到本地。' });
    } catch (error) {
      if (generation !== importGenerationRef.current || (useUserStore.getState().currentUser?.id ?? null) !== drawingOwnerId) return;
      notify({ tone: 'danger', title: '读取或保存副本失败', message: getUserErrorMessage(error, '副本处理失败，请检查文件并重试；画布内容仍保留。') });
    }
  };
  const requireSelection = (action: () => void) => {
    if (!selected.length) { setSelectionWarning(true); return; }
    action();
  };
  const toggleSelectionLocks = () => requireSelection(() => applyCommand((document) => toggleDrawingLocks(document, selectedObjectIds)));
  const toggleAllLocks = () => applyCommand(toggleAllDrawingLocks);
  const moveLayers = (action: 'front' | 'forward' | 'backward' | 'back') => requireSelection(() => applyCommand((document) => moveDrawingLayers(document, selectedObjectIds, action)));
  const split = () => { if (!drawing) return; const result = splitDrawingObjects(drawing, selectedObjectIds); if (!result.changed) return; remember(); apply(result.document); setSelectedObjectIds(result.replacementIds); };
  const cropContextPath = () => {
    if (!drawing || !contextMenu?.objectId) return;
    const result = splitDrawingPathAtPoint(drawing, contextMenu.objectId, contextMenu.canvasPoint);
    if (!result.changed) return;
    remember();
    apply(result.document);
    setSelectedObjectIds(result.replacementIds);
  };
  const openContextMenu = (request: DrawingContextState) => {
    if (request.objectId && !selectedObjectIds.includes(request.objectId)) setSelectedObjectIds([request.objectId]);
    setContextMenu(request);
  };
  const breakDrawingPath = () => setDrawingAction((current) => ({ id: current.id + 1, type: 'finish' }));
  const requestPdfExport = () => {
    const defaultFilename = drawing?.titleBlock.drawingNo || drawing?.name || 'drawing';
    setExportFilename(defaultFilename);
    setPdfDialogOpen(true);
  };
  const exportPdf = async (requestedFilename = exportFilename) => {
    if (!drawing || exporting) return;
    setExportFilename(requestedFilename);
    setExporting(true);
    try {
      await downloadDrawingPdf(drawing, requestedFilename);
      setPdfDialogOpen(false);
    } catch (reason) {
      console.error('PDF 导出失败:', reason);
      notify({
        tone: 'danger',
        title: '图纸导出失败',
        message: getUserErrorMessage(reason, '图纸 PDF 导出失败，请检查网络后重试。'),
        action: { label: '重试导出', onClick: () => void exportPdf(requestedFilename) },
        dedupeKey: 'drawing-pdf-export-failed',
      });
    } finally {
      setExporting(false);
    }
  };
  const changeTool = (mode: DrawingToolMode) => {
    if (toolMode !== 'select') breakDrawingPath();
    setToolMode(mode === toolMode && mode !== 'select' ? 'select' : mode);
  };
  const updateLineProperties = (values: DrawingLinePropertiesInput) => {
    if (!drawing || !lineEditorObject) return;
    remember();
    const nextObject = applyDrawingLineProperties(lineEditorObject, values);
    updateObject(nextObject.id, nextObject);
    setLineEditorObjectId(null);
  };
  const addCurrentMaterial = (input: DrawingMaterialInput) => {
    if (!materialTableObject) return;
    remember();
    updateObject(materialTableObject.id, appendDrawingMaterial(materialTableObject, input));
  };
  const updateCurrentMaterial = (rowIndex: number, input: DrawingMaterialInput) => {
    if (!materialTableObject) return;
    remember();
    updateObject(materialTableObject.id, updateDrawingMaterial(materialTableObject, rowIndex, input));
  };
  const moveCurrentMaterial = (rowIndex: number, direction: 'up' | 'down') => {
    if (!materialTableObject) return;
    remember();
    updateObject(materialTableObject.id, moveDrawingMaterial(materialTableObject, rowIndex, direction));
  };
  const removeCurrentMaterial = (rowIndex: number) => {
    if (!materialTableObject) return;
    remember();
    updateObject(materialTableObject.id, removeDrawingMaterial(materialTableObject, rowIndex));
  };

  const addCatalog = (resource: DrawingCatalogResource) => {
    if (!drawing) return;
    const kind: DrawingResourceKind = resource.resourceType === 'connector' || resource.resourceType === 'model' ? 'connector' : resource.resourceType === 'wire' ? 'wire-bundle' : 'accessory';
    const object = createPlacedResource(drawing, kind);
    if (object.kind === 'connector') addObject({ ...object, label: resource.name, pinCount: resource.pinCount ?? object.pinCount });
    else if (object.kind === 'wire-bundle' || object.kind === 'accessory') addObject({ ...object, label: resource.name });
    setResourcesOpen(false);
  };
  const addPhrase = (phrase: DrawingCommonPhrase) => { if (!drawing) return; addObject({ ...createPlacedResource(drawing, 'text'), kind: 'text', text: phrase.phrase } as DrawingObject); };
  const addIcon = (icon: DrawingIconResource) => {
    if (!drawing) return;
    const base = { x: 440, y: 180 };
    let point = { ...base };
    const createIcon = (nextPoint: DrawingPoint): DrawingObject => ({
      id: createDrawingId('icon'),
      kind: 'icon',
      name: icon.name,
      svgPath: icon.svgPath,
      x: nextPoint.x,
      y: nextPoint.y,
      width: icon.defaultWidth * 2,
      height: icon.defaultHeight * 2,
      rotation: 0,
      zIndex: topLayer(drawing),
      locked: false,
      visible: true,
      style: { ...defaultDrawingObjectStyle },
    });
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const candidate = createIcon(point);
      if (!drawing.objects.some((object) => object.visible && overlaps(candidate, object))) {
        addObject(candidate);
        setIconLibraryOpen(false);
        return;
      }
      point = { x: base.x + ((attempt + 1) % 6) * 36, y: base.y + Math.floor((attempt + 1) / 6) * 42 };
    }
    addObject(createIcon(point));
    setIconLibraryOpen(false);
  };

  useEffect(() => {
    if (iconLibraryOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!canEditDrawing() || !drawing || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if (event.key === 'Delete') { event.preventDefault(); breakDrawingPath(); removeSelected(); }
      if (event.key === 'Escape') { setDrawingAction((current) => ({ id: current.id + 1, type: 'finish' })); setToolMode('select'); setSelectedObjectIds([]); }
      if (event.ctrlKey || event.metaKey) {
        if (key === 'z') { event.preventDefault(); breakDrawingPath(); undo(); }
        if (key === 'y') { event.preventDefault(); breakDrawingPath(); redo(); }
        if (key === 'c') { event.preventDefault(); breakDrawingPath(); copySelected(); }
        if (key === 'v') { event.preventDefault(); breakDrawingPath(); paste(); }
        if (key === 'u') { event.preventDefault(); breakDrawingPath(); clear(); }
        if (event.key.toLowerCase() === 'x') { event.preventDefault(); breakDrawingPath(); split(); }
      }
      if (event.shiftKey && key === 'q') { event.preventDefault(); setOrthogonal((value) => !value); }
      if (event.shiftKey && key === 'w') { event.preventDefault(); changeTool('line'); }
      if (event.shiftKey && key === 'e') { event.preventDefault(); changeTool('polyline'); }
      if (event.shiftKey && key === 'r') { event.preventDefault(); changeTool('curve'); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!entryReady) return null;
  if (!drawing) {
    if (!hydrationError) return null;
    return <div className="flex h-full items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm">
        <AlertCircle className="mx-auto h-9 w-9 text-red-400" />
        <h2 className="mt-4 text-base font-semibold text-slate-900">图纸列表加载失败</h2>
        <p className="mt-2 text-sm text-slate-500">{hydrationError}</p>
        <p className="mt-1 text-xs text-slate-400">图纸仅保存在当前浏览器，读取成功前不会覆盖本地内容。</p>
        <button
          type="button"
          onClick={() => {
            setEntryReady(false);
            setHydrationAttempt((value) => value + 1);
          }}
          className="mt-4 cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          重新加载
        </button>
      </div>
    </div>;
  }
  return <div className="flex h-full min-h-0 flex-col bg-slate-100">
    <form className="hidden">
      <input ref={importFileRef} type="file" accept=".json,application/json" aria-label="导入图纸副本" onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.form?.reset();
        if (file) void importLocalDrawingCopy(file);
      }}/>
    </form>
    <DrawingWorkbenchToolbar toolMode={toolMode} orthogonal={orthogonal} hasSelection={selected.length > 0} selectionLocked={selected.some((object) => object.locked)} allObjectsLocked={allObjectsLocked} canUndo={past.length > 0} canRedo={future.length > 0} onBeforeAction={breakDrawingPath} onWizard={() => setWizardOpen(true)} onResources={() => setResourcesOpen((value) => !value)} onUndo={undo} onRedo={redo} onClear={clear} onDelete={removeSelected} onSplit={split} onToggleSelectionLock={toggleSelectionLocks} onToggleAllLocks={toggleAllLocks} onLayer={moveLayers} onToolMode={changeTool} onOrthogonal={() => setOrthogonal((value) => !value)} onAddText={() => addResource('text')} onAddLabel={() => addResource('label')} onOpenIconLibrary={openIconLibrary} onAddNumberTube={addNumberTube} onAddDimension={addDimension} onAddTable={() => setTableDialogOpen(true)} saveState={saveState} onSave={saveDrawing} onExportLocal={downloadLocalDrawingCopy} onImportLocal={() => importFileRef.current?.click()} onPdf={requestPdfExport} exporting={exporting}/>
    <div className="relative flex min-h-0 flex-1">
    <DrawingDrawToolFloatingBar
      toolMode={toolMode}
      orthogonal={orthogonal}
      settings={drawToolSettings}
      onChangeSettings={(patch) => setDrawToolSettings((current) => ({ ...current, ...patch }))}
      onToggleOrthogonal={() => setOrthogonal((value) => !value)}
      onExit={() => changeTool('select')}
    />
    <DrawingResourcePanel
      open={resourcesOpen}
      canUseCatalog={Boolean(drawingOwnerId)}
      onClose={() => setResourcesOpen(false)}
      onAddKind={addResource}
      onAddCatalog={addCatalog}
      onAddPhrase={addPhrase}
      onAddIcon={addIcon}
      onOpenCustomTable={() => { setResourcesOpen(false); setTableDialogOpen(true); }}
      onOpenProcessNotes={() => { setResourcesOpen(false); setProcessNotesOpen(true); }}
      onOpenCrossWire={() => { setResourcesOpen(false); setCrossWireDialogOpen(true); }}
      onOpenWiringRelation={() => { setResourcesOpen(false); setWiringRelationDialogOpen(true); }}
      onOpenComponentLibrary={(category) => { setResourcesOpen(false); setComponentLibraryCategory(category); }}
    />
      <DrawingIconLibraryDialog open={iconLibraryOpen} onClose={() => setIconLibraryOpen(false)} onAddIcon={addIcon}/>
      <StandaloneDrawingCanvas drawing={drawing} selectedObjectId={primaryId} selectedObjectIds={selectedObjectIds} zoom={zoom} toolMode={toolMode} orthogonal={orthogonal} drawToolSettings={drawToolSettings} drawingAction={drawingAction} onSelectObject={(id) => { if (!id) setSelectedObjectIds([]); else if (!selectedObjectIds.includes(id)) setSelectedObjectIds([id]); }} onSelectionChange={setSelectedObjectIds} onStartEdit={remember} onUpdateObject={updateObject} onViewportResize={setViewport} onCanvasZoom={changeZoom} onScaleObject={scaleSelectedObject} onScaleTableTarget={scaleTableTarget} onAddObject={addObject} onEditLineRequest={setLineEditorObjectId} onOpenMaterialTable={setMaterialTableObjectId} onContextMenuRequest={openContextMenu}/>
      <StandaloneDrawingInspector key={primaryId} drawing={drawing} selectedObjectId={primaryId} selectedObjectIds={selectedObjectIds} onStartEdit={remember} onUpdateObject={updateObject} onUpdateObjects={updateSelectedObjects} onSetLayer={(ids, target) => apply(setDrawingLayer(drawing, ids, target))} onZoomIn={() => changeZoom(zoom * getWheelScaleFactor(-1))} onZoomOut={() => changeZoom(zoom * getWheelScaleFactor(1))} onZoomReset={() => setManualZoom(null)} canZoomIn={zoom < MAX_CANVAS_ZOOM} canZoomOut={zoom > minZoom}/>
    </div>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 border-t border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-500">
      <span>{drawing.page.size} · 横向</span>
      <div role="group" aria-label="画布缩放" className="ml-auto flex items-center gap-0.5">
        <button type="button" className={zoomButtonClass} aria-label="缩小画布" title="缩小画布" disabled={zoom <= minZoom} onClick={() => changeZoom(zoom * getWheelScaleFactor(1))}>
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-9 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button type="button" className={zoomButtonClass} aria-label="放大画布" title="放大画布" disabled={zoom >= MAX_CANVAS_ZOOM} onClick={() => changeZoom(zoom * getWheelScaleFactor(-1))}>
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={`${zoomButtonClass} aria-pressed:bg-blue-50 aria-pressed:text-blue-700`} aria-pressed={manualZoom === null} onClick={() => setManualZoom(null)}>
          <Maximize2 className="h-3.5 w-3.5" />适应窗口
        </button>
      </div>
    </div>
    {contextMenu && (!contextMenu.objectId || contextObject) && <DrawingCanvasContextMenu
      target={contextMenu.objectId ? 'object' : 'canvas'}
      x={contextMenu.clientPoint.x}
      y={contextMenu.clientPoint.y}
      canPaste={clipboard.length > 0}
      canCopy={selected.some((object) => object.kind !== 'title-block')}
      canDelete={selected.some((object) => !object.locked && object.kind !== 'title-block')}
      canCrop={Boolean(contextObject && !contextObject.locked && (contextObject.kind === 'line' || contextObject.kind === 'polyline' || contextObject.kind === 'curve' || contextObject.kind === 'freehand'))}
      canChangeLayer={selected.some((object) => !object.locked && object.kind !== 'title-block')}
      canToggleLock={selected.some((object) => object.kind !== 'title-block')}
      locked={selected.length > 0 && selected.every((object) => object.locked)}
      onPaste={() => paste(contextMenu.canvasPoint)}
      onCopy={copySelected}
      onDelete={removeSelected}
      onCrop={cropContextPath}
      onBringToFront={() => moveLayers('front')}
      onSendToBack={() => moveLayers('back')}
      onToggleLock={toggleSelectionLocks}
      onClose={() => setContextMenu(null)}
    />}
    {corruptDrafts.length > 0 && <ActionToast
      role="alertdialog"
      tone="danger"
      title="发现损坏的本地图纸草稿"
      message={`有 ${corruptDrafts.length} 份本地图纸草稿无法解析，原始内容仍保留在本地。${corruptDrafts.some((draft) => !draft.isolated) ? '部分内容因本地存储空间不足未能转入隔离区，请先下载备份。' : '建议先下载备份，再决定是否丢弃。'}`}
      secondaryAction={{
        label: '丢弃草稿',
        destructive: true,
        onClick: () => {
          corruptDrafts.forEach((draft) => removeCorruptWorkspaceDraft(draft));
          setCorruptDrafts(listCorruptWorkspaceDrafts(drawingOwnerId ?? 'anonymous', 'drawing'));
        },
      }}
      primaryAction={{
        label: '下载原始草稿',
        onClick: () => downloadTextFile(
          corruptWorkspaceDraftsToJson(corruptDrafts),
          `损坏图纸草稿-${Date.now()}.json`,
        ),
      }}
      onClose={() => setCorruptDrafts([])}
    />}
    {draftError && <div role="alert" className="border-b border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">{draftError}</div>}
    {selectionWarning && <ActionToast message="请先选择一个对象。" onClose={() => setSelectionWarning(false)}/>}
    {pdfDialogOpen && <DrawingPdfExportDialog open defaultFilename={exportFilename} exporting={exporting} onClose={() => { if (!exporting) setPdfDialogOpen(false); }} onConfirm={(filename) => void exportPdf(filename)}/>}
    <DrawingTableCreateDialog open={tableDialogOpen} onClose={() => setTableDialogOpen(false)} onConfirm={addTable}/>
    {componentLibraryCategory && (
      <DrawingComponentLibraryModal
        mode="component"
        initialCategory={componentLibraryCategory}
        onClose={() => setComponentLibraryCategory(null)}
        onConfirm={(graphic) => {
          const base = createPlacedResource(drawing, 'accessory');
          addObject({
            ...base,
            kind: 'accessory',
            width: 240,
            height: 120,
            label: graphic.name,
            accessoryType: graphic.category === '包装方式' ? 'packaging' : 'specification',
            svgGraphic: graphic.svgPreview,
            style: { ...base.style, fill: '#ffffff' },
          });
          setComponentLibraryCategory(null);
        }}
      />
    )}
    {processNotesOpen && (
      <DrawingProcessNotesModal
        initialTab="process"
        selectedNotes={drawing.techRequirements}
        phrases={[]}
        onClose={() => setProcessNotesOpen(false)}
        onConfirm={(notes) => {
          const lines = notes.flatMap((note) => note.split('\n')).map((line) => line.trim()).filter(Boolean);
          if (lines.length > 0) {
            const existing = drawing.objects.find((obj) => obj.kind === 'tech-requirements');
            if (existing && existing.kind === 'tech-requirements') {
              remember();
              updateObject(existing.id, { requirements: lines, height: Math.max(86, 34 + lines.length * 16) });
            } else {
              addObject({
                ...createPlacedResource(drawing, 'tech-requirements'),
                kind: 'tech-requirements',
                requirements: lines,
                height: Math.max(86, 34 + lines.length * 16),
              });
            }
          }
          setProcessNotesOpen(false);
        }}
      />
    )}
    {crossWireDialogOpen && (
      <DrawingCrossWireDialog
        onClose={() => setCrossWireDialogOpen(false)}
        onConfirm={(groupObject) => {
          addObject(groupObject);
          setCrossWireDialogOpen(false);
        }}
      />
    )}
    {wiringRelationDialogOpen && (
      <DrawingWiringRelationDialog
        onClose={() => setWiringRelationDialogOpen(false)}
        onConfirm={(groupObject) => {
          addObject(groupObject);
          setWiringRelationDialogOpen(false);
        }}
      />
    )}
    {materialTableObject && <DrawingMaterialTableDialog drawing={drawing} table={materialTableObject} canUseCatalog={Boolean(drawingOwnerId)} onAddCurrent={addCurrentMaterial} onUpdateCurrent={updateCurrentMaterial} onMoveCurrent={moveCurrentMaterial} onRemoveCurrent={removeCurrentMaterial} onClose={() => setMaterialTableObjectId(null)}/>}
    {lineEditorObject && <DrawingLinePropertiesDialog object={lineEditorObject} defaultName={lineEditorObject.name || fallbackLineName(drawing, lineEditorObject.id)} onClose={() => setLineEditorObjectId(null)} onConfirm={updateLineProperties}/>}
    <StandaloneDrawingWizard open={wizardOpen} canUseCatalog={Boolean(drawingOwnerId)} onClose={() => setWizardOpen(false)} onGenerate={(next) => { remember(); apply(next); setSelectedObjectIds([]); setWizardOpen(false); }} onLoadTemplate={(next) => { remember(); apply(next); setSelectedObjectIds([]); setWizardOpen(false); }}/>
  </div>;
}

import { useEffect, useRef, useState } from 'react';
import { ActionToast } from '@/components/shared/ActionToast';
import { DrawingCanvasContextMenu } from '@/components/drawings/standalone/DrawingCanvasContextMenu';
import { DrawingLinePropertiesDialog } from '@/components/drawings/standalone/DrawingLinePropertiesDialog';
import { DrawingMaterialTableDialog } from '@/components/drawings/standalone/DrawingMaterialTableDialog';
import { DrawingPdfExportDialog } from '@/components/drawings/standalone/DrawingPdfExportDialog';
import { DrawingIconLibraryDialog } from '@/components/drawings/standalone/DrawingIconLibraryDialog';
import { DrawingResourcePanel } from '@/components/drawings/standalone/DrawingResourcePanel';
import { DrawingTableCreateDialog } from '@/components/drawings/standalone/DrawingTableCreateDialog';
import { StandaloneDrawingCanvas } from '@/components/drawings/standalone/StandaloneDrawingCanvas';
import { StandaloneDrawingInspector } from '@/components/drawings/standalone/StandaloneDrawingInspector';
import { StandaloneDrawingWizard } from '@/components/drawings/standalone/StandaloneDrawingWizard';
import { DrawingWorkbenchToolbar } from '@/components/drawings/standalone/DrawingWorkbenchToolbar';
import { clearDrawingCanvas, moveDrawingLayers, patchDrawingObjects, placeDrawingCopiesAtPoint, setDrawingLayer, splitDrawingObjects, splitDrawingPathAtPoint, toggleAllDrawingLocks, toggleDrawingLocks } from '@/lib/drawingCommands';
import { createDrawingId, createDrawingNumberTubeObject, createDrawingResourceObject, createDrawingTableObject, defaultDrawingObjectStyle, type DrawingTableCreateInput } from '@/lib/drawingDocument';
import { downloadDrawingPdf } from '@/lib/drawingExport';
import { applyDrawingLineProperties, type DrawingLinePropertiesInput } from '@/lib/drawingLineProperties';
import { appendDrawingMaterial, type DrawingMaterialInput } from '@/lib/drawingMaterials';
import { getDrawingTableTargetObject, resizeDrawingTableCell, resizeDrawingTableText, resolveDrawingTableLayout, scaleDrawingTable } from '@/lib/drawingTableLayout';
import { getDrawingTransformObject, MAX_OBJECT_SCALE, MIN_OBJECT_SCALE, scaleDrawingObjectFromCenter } from '@/lib/drawingTransform';
import { enterDrawingWorkbench } from '@/lib/drawingWorkbenchSession';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import { hydrateDrawingStore, useDrawingStore } from '@/stores/drawingStore';
import { useUserStore } from '@/stores/userStore';
import type { DrawingBomTableObject, DrawingCatalogResource, DrawingCommonPhrase, DrawingDocument, DrawingIconResource, DrawingLineObject, DrawingObject, DrawingObjectStyle, DrawingPoint, DrawingResourceKind, DrawingTableLocalTarget, DrawingToolMode } from '@/types/drawing';

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

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
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
  const currentUser = useUserStore((state) => state.currentUser);
  const drawingOwnerId = currentUser?.id ?? null;
  const documents = useDrawingStore((state) => state.documents);
  const activeDocumentId = useDrawingStore((state) => state.activeDocumentId);
  const saveState = useDrawingStore((state) => state.saveState);
  const replaceWithNewDocument = useDrawingStore((state) => state.replaceWithNewDocument);
  const updateDocument = useDrawingStore((state) => state.updateDocument);
  const updateObject = useDrawingStore((state) => state.updateObject);
  const saveActiveDocument = useDrawingStore((state) => state.saveActiveDocument);
  const drawing = activeDocumentId ? documents[activeDocumentId] : undefined;
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [toolMode, setToolMode] = useState<DrawingToolMode>('select');
  const [drawingAction, setDrawingAction] = useState<{ id: number; type: 'finish' | 'cancel' }>({ id: 0, type: 'cancel' });
  const [orthogonal, setOrthogonal] = useState(false);
  const [zoom, setZoom] = useState(0.72);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [iconLibraryOpen, setIconLibraryOpen] = useState(false);
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [exportFilename, setExportFilename] = useState('');
  const [selectionWarning, setSelectionWarning] = useState(false);
  const [past, setPast] = useState<DrawingDocument[]>([]);
  const [future, setFuture] = useState<DrawingDocument[]>([]);
  const [contextMenu, setContextMenu] = useState<DrawingContextState | null>(null);
  const [clipboard, setClipboard] = useState<DrawingObject[]>([]);
  const [lineEditorObjectId, setLineEditorObjectId] = useState<string | null>(null);
  const [materialTableObjectId, setMaterialTableObjectId] = useState<string | null>(null);
  const [drawingStoreHydrated, setDrawingStoreHydrated] = useState(false);
  const [refreshDecisionOpen, setRefreshDecisionOpen] = useState(false);
  const [entryReady, setEntryReady] = useState(false);
  const entryHandledRef = useRef(false);
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

  useEffect(() => {
    let cancelled = false;
    entryHandledRef.current = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setDrawingStoreHydrated(false);
      setEntryReady(false);
      setSelectedObjectIds([]);
      setPast([]);
      setFuture([]);
      setContextMenu(null);
      setClipboard([]);
      setLineEditorObjectId(null);
      setMaterialTableObjectId(null);
    });
    void hydrateDrawingStore(drawingOwnerId)
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setDrawingStoreHydrated(true);
      });
    return () => { cancelled = true; };
  }, [drawingOwnerId]);
  useEffect(() => {
    if (!drawingStoreHydrated || entryHandledRef.current) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || entryHandledRef.current) return;
      entryHandledRef.current = true;
      const state = useDrawingStore.getState();
      const hasExisting = Boolean(state.activeDocumentId && state.documents[state.activeDocumentId]);
      const entry = enterDrawingWorkbench(hasExisting);
      if (entry === 'confirm') setRefreshDecisionOpen(true);
      if (entry === 'create') replaceWithNewDocument('未命名线束图');
      setEntryReady(true);
    });
    return () => { cancelled = true; };
  }, [drawingStoreHydrated, replaceWithNewDocument]);
  useEffect(() => {
    if (saveState !== 'dirty') return;
    const timer = window.setTimeout(() => {
      void saveActiveDocument().catch((error) => console.error('图纸保存失败:', error));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [saveActiveDocument, saveState]);
  useEffect(() => { if (!selectionWarning) return; const timer = window.setTimeout(() => setSelectionWarning(false), 2200); return () => window.clearTimeout(timer); }, [selectionWarning]);
  useEffect(() => () => { if (wheelGestureRef.current) window.clearTimeout(wheelGestureRef.current.timeoutId); }, []);

  const remember = () => { if (!drawing) return; setPast((items) => [...items.slice(-49), clone(drawing)]); setFuture([]); };
  const apply = (next: DrawingDocument) => updateDocument(next);
  const applyCommand = (command: (document: DrawingDocument) => DrawingDocument) => { if (!drawing) return; const next = command(drawing); if (next === drawing) return; remember(); apply(next); };
  const addObject = (object: DrawingObject) => { if (!drawing) return; remember(); const named = isLineObject(object) && !object.name ? { ...object, name: nextLineName(drawing) } : object; const next = { ...named, zIndex: topLayer(drawing) } as DrawingObject; apply({ ...drawing, objects: [...drawing.objects, next], updatedAt: Date.now() }); setSelectedObjectIds([next.id]); };
  const updateSelectedObjects = (objectIds: string[], patch: Partial<DrawingObject>, stylePatch?: Partial<DrawingObjectStyle>) => {
    if (!drawing) return;
    apply(patchDrawingObjects(drawing, objectIds, patch, stylePatch));
  };
  const addResource = (kind: DrawingResourceKind) => { if (!drawing) return; addObject(createPlacedResource(drawing, kind)); setResourcesOpen(false); };
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
  const removeSelected = () => { if (!drawing) return; const ids = new Set(selected.filter((object) => !object.locked && object.kind !== 'title-block').map((object) => object.id)); if (!ids.size) return; remember(); apply({ ...drawing, objects: drawing.objects.filter((object) => !ids.has(object.id)), updatedAt: Date.now() }); setSelectedObjectIds([]); };
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
    apply({ ...drawing, objects: [...drawing.objects, ...copies], updatedAt: Date.now() });
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
  const discardAndCreate = () => {
    replaceWithNewDocument('未命名线束图');
    resetTransientState();
    setRefreshDecisionOpen(false);
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
    setExportError('');
    setPdfDialogOpen(true);
  };
  const exportPdf = async (requestedFilename = exportFilename) => {
    if (!drawing || exporting) return;
    setExportFilename(requestedFilename);
    setExporting(true); setExportError('');
    try { await downloadDrawingPdf(drawing, requestedFilename); setPdfDialogOpen(false); }
    catch (reason) { console.error('PDF 导出失败:', reason); setExportError(getUserErrorMessage(reason, 'PDF 导出失败，请重试。')); }
    finally { setExporting(false); }
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
    if (refreshDecisionOpen) return;
    if (iconLibraryOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!drawing || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
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

  if (!drawingStoreHydrated || !entryReady || !drawing) return null;
  return <div className="flex h-full min-h-0 flex-col bg-slate-100">
    <DrawingWorkbenchToolbar toolMode={toolMode} orthogonal={orthogonal} hasSelection={selected.length > 0} selectionLocked={selected.some((object) => object.locked)} allObjectsLocked={allObjectsLocked} canUndo={past.length > 0} canRedo={future.length > 0} onBeforeAction={breakDrawingPath} onWizard={() => setWizardOpen(true)} onResources={() => setResourcesOpen((value) => !value)} onUndo={undo} onRedo={redo} onClear={clear} onDelete={removeSelected} onToggleSelectionLock={toggleSelectionLocks} onToggleAllLocks={toggleAllLocks} onLayer={moveLayers} onToolMode={changeTool} onOrthogonal={() => setOrthogonal((value) => !value)} onAddText={() => addResource('text')} onAddLabel={() => addResource('label')} onOpenIconLibrary={openIconLibrary} onAddNumberTube={addNumberTube} onAddDimension={() => addResource('dimension')} onAddTable={() => setTableDialogOpen(true)} onSave={() => void saveActiveDocument()} onPdf={requestPdfExport} exporting={exporting}/>
    <div className="relative flex min-h-0 flex-1">
      <DrawingResourcePanel open={resourcesOpen} onClose={() => setResourcesOpen(false)} onAddKind={addResource} onAddCatalog={addCatalog} onAddPhrase={addPhrase} onAddIcon={addIcon}/>
      <DrawingIconLibraryDialog open={iconLibraryOpen} onClose={() => setIconLibraryOpen(false)} onAddIcon={addIcon}/>
      <StandaloneDrawingCanvas drawing={drawing} selectedObjectId={primaryId} selectedObjectIds={selectedObjectIds} zoom={zoom} toolMode={toolMode} orthogonal={orthogonal} drawingAction={drawingAction} onSelectObject={(id) => { if (!id) setSelectedObjectIds([]); else if (!selectedObjectIds.includes(id)) setSelectedObjectIds([id]); }} onSelectionChange={setSelectedObjectIds} onStartEdit={remember} onUpdateObject={updateObject} onCanvasZoom={setZoom} onScaleObject={scaleSelectedObject} onScaleTableTarget={scaleTableTarget} onAddObject={addObject} onEditLineRequest={setLineEditorObjectId} onOpenMaterialTable={setMaterialTableObjectId} onContextMenuRequest={openContextMenu}/>
      <StandaloneDrawingInspector drawing={drawing} selectedObjectId={primaryId} selectedObjectIds={selectedObjectIds} onStartEdit={remember} onUpdateObject={updateObject} onUpdateObjects={updateSelectedObjects} onSetLayer={(ids, target) => apply(setDrawingLayer(drawing, ids, target))}/>
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
    {refreshDecisionOpen && <ActionToast
      role="alertdialog"
      position="center"
      title="当前制作图纸"
      message="是否丢弃当前制作的图纸？"
      secondaryAction={{ label: '继续制作', onClick: () => setRefreshDecisionOpen(false) }}
      primaryAction={{ label: '丢弃并新建', destructive: true, onClick: discardAndCreate }}
      onClose={() => setRefreshDecisionOpen(false)}
    />}
    {selectionWarning && <ActionToast message="请先选择一个对象。" onClose={() => setSelectionWarning(false)}/>}
    {pdfDialogOpen && <DrawingPdfExportDialog open defaultFilename={exportFilename} exporting={exporting} onClose={() => { if (!exporting) setPdfDialogOpen(false); }} onConfirm={(filename) => void exportPdf(filename)}/>}
    <DrawingTableCreateDialog open={tableDialogOpen} onClose={() => setTableDialogOpen(false)} onConfirm={addTable}/>
    {materialTableObject && <DrawingMaterialTableDialog drawing={drawing} table={materialTableObject} onAddCurrent={addCurrentMaterial} onClose={() => setMaterialTableObjectId(null)}/>}
    {lineEditorObject && <DrawingLinePropertiesDialog object={lineEditorObject} defaultName={lineEditorObject.name || fallbackLineName(drawing, lineEditorObject.id)} onClose={() => setLineEditorObjectId(null)} onConfirm={updateLineProperties}/>}
    {exportError && <div role="alert" className="absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded border border-red-200 bg-white px-4 py-2 text-sm text-red-700 shadow-lg"><span>{exportError}</span><button type="button" onClick={() => void exportPdf(exportFilename)} className="font-medium underline">重试</button><button type="button" aria-label="关闭导出错误" onClick={() => setExportError('')}>×</button></div>}
    <StandaloneDrawingWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onGenerate={(next) => { remember(); apply(next); setSelectedObjectIds([]); setWizardOpen(false); }} onLoadTemplate={(next) => { remember(); apply(next); setSelectedObjectIds([]); setWizardOpen(false); }}/>
  </div>;
}

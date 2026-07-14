import { useEffect, useRef, useState } from 'react';
import { DrawingResourcePanel } from '@/components/drawings/standalone/DrawingResourcePanel';
import { StandaloneDrawingCanvas } from '@/components/drawings/standalone/StandaloneDrawingCanvas';
import { StandaloneDrawingInspector } from '@/components/drawings/standalone/StandaloneDrawingInspector';
import { StandaloneDrawingWizard } from '@/components/drawings/standalone/StandaloneDrawingWizard';
import { DrawingWorkbenchToolbar } from '@/components/drawings/standalone/DrawingWorkbenchToolbar';
import { clearDrawingCanvas, moveDrawingLayers, patchDrawingObjects, setDrawingLayer, splitDrawingObjects, toggleDrawingLocks } from '@/lib/drawingCommands';
import { createDrawingId, createDrawingResourceObject, defaultDrawingObjectStyle } from '@/lib/drawingDocument';
import { downloadDrawingPdf } from '@/lib/drawingExport';
import { useDrawingStore } from '@/stores/drawingStore';
import type { DrawingCatalogResource, DrawingCommonPhrase, DrawingDocument, DrawingIconResource, DrawingObject, DrawingObjectStyle, DrawingResourceKind, DrawingToolMode } from '@/types/drawing';

const resourceDefaultPoints: Record<DrawingResourceKind, { x: number; y: number }> = {
  connector: { x: 90, y: 210 }, 'wire-bundle': { x: 245, y: 260 }, accessory: { x: 420, y: 238 },
  table: { x: 600, y: 400 }, 'wiring-table': { x: 600, y: 400 }, 'bom-table': { x: 600, y: 505 },
  line: { x: 360, y: 330 }, polyline: { x: 360, y: 330 }, curve: { x: 360, y: 330 }, freehand: { x: 360, y: 330 },
  dimension: { x: 320, y: 170 }, label: { x: 420, y: 120 }, text: { x: 420, y: 120 }, 'tech-requirements': { x: 70, y: 520 },
};

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function overlaps(left: DrawingObject, right: DrawingObject) { return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y; }
function topLayer(drawing: DrawingDocument) { return Math.max(...drawing.objects.map((object) => object.zIndex), 0) + 1; }

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

export function DrawingWorkbenchPage() {
  const documents = useDrawingStore((state) => state.documents);
  const activeDocumentId = useDrawingStore((state) => state.activeDocumentId);
  const saveState = useDrawingStore((state) => state.saveState);
  const createDocument = useDrawingStore((state) => state.createDocument);
  const updateDocument = useDrawingStore((state) => state.updateDocument);
  const updateObject = useDrawingStore((state) => state.updateObject);
  const markSaved = useDrawingStore((state) => state.markSaved);
  const drawing = activeDocumentId ? documents[activeDocumentId] : undefined;
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [toolMode, setToolMode] = useState<DrawingToolMode>('select');
  const [drawingAction, setDrawingAction] = useState<{ id: number; type: 'finish' | 'cancel' }>({ id: 0, type: 'cancel' });
  const [orthogonal, setOrthogonal] = useState(false);
  const [zoom] = useState(0.72);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [past, setPast] = useState<DrawingDocument[]>([]);
  const [future, setFuture] = useState<DrawingDocument[]>([]);
  const clipboard = useRef<DrawingObject[]>([]);
  const primaryId = selectedObjectIds.at(-1) ?? null;
  const selected = drawing?.objects.filter((object) => selectedObjectIds.includes(object.id)) ?? [];

  useEffect(() => { if (!drawing) createDocument('未命名线束图'); }, [createDocument, drawing]);
  useEffect(() => { if (saveState !== 'dirty') return; const timer = window.setTimeout(markSaved, 500); return () => window.clearTimeout(timer); }, [markSaved, saveState]);

  const remember = () => { if (!drawing) return; setPast((items) => [...items.slice(-49), clone(drawing)]); setFuture([]); };
  const apply = (next: DrawingDocument) => updateDocument(next);
  const applyCommand = (command: (document: DrawingDocument) => DrawingDocument) => { if (!drawing) return; const next = command(drawing); if (next === drawing) return; remember(); apply(next); };
  const addObject = (object: DrawingObject) => { if (!drawing) return; remember(); const next = { ...object, zIndex: topLayer(drawing) } as DrawingObject; apply({ ...drawing, objects: [...drawing.objects, next], updatedAt: Date.now() }); setSelectedObjectIds([next.id]); };
  const updateSelectedObjects = (objectIds: string[], patch: Partial<DrawingObject>, stylePatch?: Partial<DrawingObjectStyle>) => {
    if (!drawing) return;
    apply(patchDrawingObjects(drawing, objectIds, patch, stylePatch));
  };
  const addResource = (kind: DrawingResourceKind) => { if (!drawing) return; addObject(createPlacedResource(drawing, kind)); setResourcesOpen(false); };
  const removeSelected = () => { if (!drawing) return; const ids = new Set(selected.filter((object) => !object.locked).map((object) => object.id)); if (!ids.size) return; remember(); apply({ ...drawing, objects: drawing.objects.filter((object) => !ids.has(object.id)), updatedAt: Date.now() }); setSelectedObjectIds([]); };
  const undo = () => { if (!drawing || !past.length) return; const previous = past.at(-1)!; setPast((items) => items.slice(0, -1)); setFuture((items) => [clone(drawing), ...items].slice(0, 50)); apply(previous); setSelectedObjectIds([]); };
  const redo = () => { if (!drawing || !future.length) return; const next = future[0]; setFuture((items) => items.slice(1)); setPast((items) => [...items, clone(drawing)].slice(-50)); apply(next); setSelectedObjectIds([]); };
  const paste = () => { if (!drawing || !clipboard.current.length) return; remember(); const stamp = Date.now(); const copies = clipboard.current.map((object, index) => ({ ...clone(object), id: `${object.id}-copy-${stamp}-${index}`, x: object.x + 20, y: object.y + 20, zIndex: topLayer(drawing) + index })) as DrawingObject[]; apply({ ...drawing, objects: [...drawing.objects, ...copies], updatedAt: Date.now() }); setSelectedObjectIds(copies.map((object) => object.id)); };
  const clear = () => { applyCommand(clearDrawingCanvas); setSelectedObjectIds([]); };
  const toggleLocks = () => applyCommand((document) => toggleDrawingLocks(document, selectedObjectIds));
  const moveLayers = (action: 'front' | 'forward' | 'backward' | 'back') => applyCommand((document) => moveDrawingLayers(document, selectedObjectIds, action));
  const split = () => { if (!drawing) return; const result = splitDrawingObjects(drawing, selectedObjectIds); if (!result.changed) return; remember(); apply(result.document); setSelectedObjectIds(result.replacementIds); };
  const exportPdf = async () => {
    if (!drawing || exporting) return;
    setExporting(true); setExportError('');
    try { await downloadDrawingPdf(drawing); }
    catch (reason) { setExportError(reason instanceof Error ? reason.message : 'PDF 导出失败，请重试。'); }
    finally { setExporting(false); }
  };
  const changeTool = (mode: DrawingToolMode) => {
    if (toolMode !== 'select') setDrawingAction((current) => ({ id: current.id + 1, type: 'finish' }));
    setToolMode(mode === toolMode && mode !== 'select' ? 'select' : mode);
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
  const addIcon = (icon: DrawingIconResource) => addObject({ id: createDrawingId('icon'), kind: 'icon', name: icon.name, svgPath: icon.svgPath, x: 440, y: 180, width: icon.defaultWidth * 2, height: icon.defaultHeight * 2, rotation: 0, zIndex: 1, locked: false, visible: true, style: { ...defaultDrawingObjectStyle } });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!drawing || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if (event.key === 'Delete') { event.preventDefault(); removeSelected(); }
      if (event.key === 'Escape') { setDrawingAction((current) => ({ id: current.id + 1, type: 'finish' })); setToolMode('select'); setSelectedObjectIds([]); }
      if (event.ctrlKey || event.metaKey) {
        if (key === 'z') { event.preventDefault(); undo(); }
        if (key === 'y') { event.preventDefault(); redo(); }
        if (key === 'c') { event.preventDefault(); clipboard.current = clone(selected); }
        if (key === 'v') { event.preventDefault(); paste(); }
        if (key === 'u') { event.preventDefault(); clear(); }
        if (event.key.toLowerCase() === 'x') { event.preventDefault(); split(); }
      }
      if (event.shiftKey && key === 'q') { event.preventDefault(); setOrthogonal((value) => !value); }
      if (event.shiftKey && key === 'w') { event.preventDefault(); changeTool('line'); }
      if (event.shiftKey && key === 'e') { event.preventDefault(); changeTool('polyline'); }
      if (event.shiftKey && key === 'r') { event.preventDefault(); changeTool('curve'); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!drawing) return null;
  return <div className="flex h-full min-h-0 flex-col bg-slate-100">
    <DrawingWorkbenchToolbar toolMode={toolMode} orthogonal={orthogonal} hasSelection={selected.length > 0} selectionLocked={selected.some((object) => object.locked)} canUndo={past.length > 0} canRedo={future.length > 0} onWizard={() => setWizardOpen(true)} onResources={() => setResourcesOpen((value) => !value)} onUndo={undo} onRedo={redo} onClear={clear} onDelete={removeSelected} onToggleLock={toggleLocks} onLayer={moveLayers} onToolMode={changeTool} onOrthogonal={() => setOrthogonal((value) => !value)} onAddText={() => addResource('text')} onAddLabel={() => addResource('label')} onAddDimension={() => addResource('dimension')} onAddTable={() => addResource('table')} onSave={markSaved} onPdf={exportPdf} exporting={exporting}/>
    <div className="relative flex min-h-0 flex-1">
      <DrawingResourcePanel open={resourcesOpen} onClose={() => setResourcesOpen(false)} onAddKind={addResource} onAddCatalog={addCatalog} onAddPhrase={addPhrase} onAddIcon={addIcon}/>
      <StandaloneDrawingCanvas drawing={drawing} selectedObjectId={primaryId} selectedObjectIds={selectedObjectIds} zoom={zoom} toolMode={toolMode} orthogonal={orthogonal} drawingAction={drawingAction} onSelectObject={(id) => { if (!id) setSelectedObjectIds([]); else if (!selectedObjectIds.includes(id)) setSelectedObjectIds([id]); }} onSelectionChange={setSelectedObjectIds} onStartEdit={remember} onUpdateObject={updateObject} onAddObject={addObject}/>
      <StandaloneDrawingInspector drawing={drawing} selectedObjectId={primaryId} selectedObjectIds={selectedObjectIds} onStartEdit={remember} onUpdateObject={updateObject} onUpdateObjects={updateSelectedObjects} onSetLayer={(ids, target) => apply(setDrawingLayer(drawing, ids, target))}/>
    </div>
    {exportError && <div role="alert" className="absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded border border-red-200 bg-white px-4 py-2 text-sm text-red-700 shadow-lg"><span>{exportError}</span><button type="button" onClick={() => void exportPdf()} className="font-medium underline">重试</button><button type="button" aria-label="关闭导出错误" onClick={() => setExportError('')}>×</button></div>}
    <StandaloneDrawingWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onGenerate={(next) => { remember(); apply(next); setSelectedObjectIds([]); setWizardOpen(false); }} onLoadTemplate={(next) => { remember(); apply(next); setSelectedObjectIds([]); setWizardOpen(false); }}/>
  </div>;
}

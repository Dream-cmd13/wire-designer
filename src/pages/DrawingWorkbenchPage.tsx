import { useEffect, useRef, useState } from 'react';
import {
  Download, FileImage, FilePlus2, FileText, Layers3, Lock, Menu, PenLine, Redo2, Save,
  Trash2, Undo2, Unlock, Wand2, ZoomIn, ZoomOut,
} from 'lucide-react';
import { StandaloneDrawingCanvas } from '@/components/drawings/standalone/StandaloneDrawingCanvas';
import { StandaloneDrawingInspector } from '@/components/drawings/standalone/StandaloneDrawingInspector';
import { StandaloneDrawingWizard } from '@/components/drawings/standalone/StandaloneDrawingWizard';
import { createDrawingResourceObject } from '@/lib/drawingDocument';
import { downloadDrawingPdf, downloadDrawingPng, downloadDrawingSvg } from '@/lib/drawingExport';
import { useDrawingStore } from '@/stores/drawingStore';
import type { DrawingDocument, DrawingObject } from '@/types/drawing';

const resourceTools: Array<{ kind: Exclude<DrawingObject['kind'], 'title-block'>; label: string }> = [
  { kind: 'connector', label: '连接器/模型' }, { kind: 'wire-bundle', label: '线材' }, { kind: 'accessory', label: '辅材' },
  { kind: 'table', label: '表格' }, { kind: 'wiring-table', label: '接线表' }, { kind: 'bom-table', label: '物料表' },
  { kind: 'line', label: '直线' }, { kind: 'polyline', label: '分岔线' }, { kind: 'curve', label: '交叉线' },
  { kind: 'dimension', label: '长度标注' }, { kind: 'label', label: '号码/标签' }, { kind: 'text', label: '文字' },
];

const resourceDefaultPoints: Record<Exclude<DrawingObject['kind'], 'title-block'>, { x: number; y: number }> = {
  connector: { x: 90, y: 210 },
  'wire-bundle': { x: 245, y: 260 },
  accessory: { x: 420, y: 238 },
  table: { x: 600, y: 400 },
  'wiring-table': { x: 600, y: 400 },
  'bom-table': { x: 600, y: 505 },
  line: { x: 360, y: 330 },
  polyline: { x: 360, y: 330 },
  curve: { x: 360, y: 330 },
  freehand: { x: 360, y: 330 },
  dimension: { x: 320, y: 170 },
  label: { x: 420, y: 120 },
  text: { x: 420, y: 120 },
  'tech-requirements': { x: 70, y: 520 },
};

function cloneDrawing(drawing: DrawingDocument) {
  return JSON.parse(JSON.stringify(drawing)) as DrawingDocument;
}

function ToolButton({ label, title, onClick, disabled = false, children }: { label?: string; title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} className="flex shrink-0 cursor-pointer items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">{children}{label && <span>{label}</span>}</button>;
}

function overlaps(left: DrawingObject, right: DrawingObject) {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function createPlacedResource(drawing: DrawingDocument, kind: Exclude<DrawingObject['kind'], 'title-block'>) {
  const basePoint = resourceDefaultPoints[kind];
  let point = { ...basePoint };
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const candidate = createDrawingResourceObject(kind, point);
    if (!drawing.objects.some((object) => object.visible && overlaps(candidate, object))) {
      return { ...candidate, zIndex: Math.max(...drawing.objects.map((object) => object.zIndex), 0) + 1 } as DrawingObject;
    }
    point = {
      x: Math.min(drawing.page.width - candidate.width - 30, basePoint.x + ((attempt + 1) % 6) * 36),
      y: Math.min(drawing.page.height - candidate.height - 30, basePoint.y + Math.floor((attempt + 1) / 6) * 42),
    };
  }
  return {
    ...createDrawingResourceObject(kind, point),
    zIndex: Math.max(...drawing.objects.map((object) => object.zIndex), 0) + 1,
  } as DrawingObject;
}

export function DrawingWorkbenchPage() {
  const documents = useDrawingStore((state) => state.documents);
  const activeDocumentId = useDrawingStore((state) => state.activeDocumentId);
  const saveState = useDrawingStore((state) => state.saveState);
  const createDocument = useDrawingStore((state) => state.createDocument);
  const openDocument = useDrawingStore((state) => state.openDocument);
  const updateDocument = useDrawingStore((state) => state.updateDocument);
  const updateObject = useDrawingStore((state) => state.updateObject);
  const removeDocument = useDrawingStore((state) => state.removeDocument);
  const markSaved = useDrawingStore((state) => state.markSaved);
  const drawing = activeDocumentId ? documents[activeDocumentId] : undefined;
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.72);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [past, setPast] = useState<DrawingDocument[]>([]);
  const [future, setFuture] = useState<DrawingDocument[]>([]);
  const clipboard = useRef<DrawingObject | null>(null);

  useEffect(() => { if (!drawing) createDocument('未命名线束图'); }, [createDocument, drawing]);
  useEffect(() => {
    if (saveState !== 'dirty') return;
    const timer = window.setTimeout(markSaved, 500);
    return () => window.clearTimeout(timer);
  }, [markSaved, saveState]);

  const remember = () => {
    if (!drawing) return;
    setPast((items) => [...items.slice(-49), cloneDrawing(drawing)]);
    setFuture([]);
  };
  const update = (document: DrawingDocument) => updateDocument(document);
  const selected = drawing?.objects.find((object) => object.id === selectedObjectId);
  const addResource = (kind: Exclude<DrawingObject['kind'], 'title-block'>) => {
    if (!drawing) return;
    remember();
    const object = createPlacedResource(drawing, kind);
    update({ ...drawing, updatedAt: Date.now(), objects: [...drawing.objects, object] });
    setSelectedObjectId(object.id);
    setResourcesOpen(false);
  };
  const removeSelected = () => {
    if (!drawing || !selected || selected.locked) return;
    remember();
    update({ ...drawing, updatedAt: Date.now(), objects: drawing.objects.filter((object) => object.id !== selected.id) });
    setSelectedObjectId(null);
  };
  const undo = () => {
    if (!drawing || past.length === 0) return;
    const previous = past[past.length - 1];
    setPast((items) => items.slice(0, -1));
    setFuture((items) => [cloneDrawing(drawing), ...items].slice(0, 50));
    update(previous);
    setSelectedObjectId(null);
  };
  const redo = () => {
    if (!drawing || future.length === 0) return;
    const next = future[0];
    setFuture((items) => items.slice(1));
    setPast((items) => [...items, cloneDrawing(drawing)].slice(-50));
    update(next);
    setSelectedObjectId(null);
  };
  const paste = () => {
    if (!drawing || !clipboard.current) return;
    remember();
    const copy = { ...cloneDrawing({ ...drawing, objects: [clipboard.current] }).objects[0], id: `${clipboard.current.id}-copy-${Date.now()}`, x: clipboard.current.x + 20, y: clipboard.current.y + 20, zIndex: Math.max(...drawing.objects.map((item) => item.zIndex), 0) + 1 } as DrawingObject;
    update({ ...drawing, updatedAt: Date.now(), objects: [...drawing.objects, copy] });
    setSelectedObjectId(copy.id);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!drawing || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'Delete') { event.preventDefault(); removeSelected(); }
      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
        if (event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
        if (event.key.toLowerCase() === 'c' && selected) { event.preventDefault(); clipboard.current = cloneDrawing({ ...drawing, objects: [selected] }).objects[0]; }
        if (event.key.toLowerCase() === 'v') { event.preventDefault(); paste(); }
        if (event.key.toLowerCase() === 'u') { event.preventDefault(); remember(); update({ ...drawing, updatedAt: Date.now(), objects: drawing.objects.filter((object) => object.kind === 'title-block') }); setSelectedObjectId(null); }
      }
      if (event.shiftKey && event.key.toLowerCase() === 'w') { event.preventDefault(); addResource('line'); }
      if (event.shiftKey && event.key.toLowerCase() === 'e') { event.preventDefault(); addResource('polyline'); }
      if (event.shiftKey && event.key.toLowerCase() === 'r') { event.preventDefault(); addResource('curve'); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!drawing) return null;
  return <div className="flex h-full min-h-0 flex-col bg-slate-100">
    <div className="flex min-h-14 items-center gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2">
      <ToolButton title="配置向导" label="绘图向导" onClick={() => setWizardOpen(true)}><Wand2 className="h-4 w-4 text-blue-600"/></ToolButton>
      <ToolButton title="绘图资源" label="绘图资源" onClick={() => setResourcesOpen((value) => !value)}><Menu className="h-4 w-4"/></ToolButton>
      <span className="h-6 w-px bg-slate-200"/>
      <ToolButton title="撤销" onClick={undo} disabled={past.length === 0}><Undo2 className="h-4 w-4"/></ToolButton><ToolButton title="重做" onClick={redo} disabled={future.length === 0}><Redo2 className="h-4 w-4"/></ToolButton>
      <ToolButton title="删除对象" onClick={removeSelected} disabled={!selected || selected.locked}><Trash2 className="h-4 w-4"/></ToolButton>
      <ToolButton title={selected?.locked ? '解锁对象' : '锁定对象'} onClick={() => selected && updateObject(selected.id, { locked: !selected.locked })} disabled={!selected}>{selected?.locked ? <Lock className="h-4 w-4"/> : <Unlock className="h-4 w-4"/>}</ToolButton>
      <ToolButton title="置于顶层" onClick={() => selected && updateObject(selected.id, { zIndex: Math.max(...drawing.objects.map((object) => object.zIndex), 0) + 1 })} disabled={!selected}><Layers3 className="h-4 w-4"/></ToolButton>
      <ToolButton title="添加文字" onClick={() => addResource('text')}><PenLine className="h-4 w-4"/></ToolButton><ToolButton title="添加长度标注" onClick={() => addResource('dimension')}><span>↔</span></ToolButton><ToolButton title="添加号码/标签" onClick={() => addResource('label')}><span>①</span></ToolButton>
      <ToolButton title="放大" onClick={() => setZoom((value) => Math.min(1.4, Number((value + 0.1).toFixed(2))))}><ZoomIn className="h-4 w-4"/></ToolButton><ToolButton title="缩小" onClick={() => setZoom((value) => Math.max(0.35, Number((value - 0.1).toFixed(2))))}><ZoomOut className="h-4 w-4"/></ToolButton>
      <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{Math.round(zoom * 100)}%</span>
      <span className="ml-auto text-xs text-slate-500">{saveState === 'dirty' ? '保存中…' : '已保存至本机'}</span>
      <ToolButton title="新建图纸" onClick={() => createDocument(window.prompt('图纸名称', '未命名线束图') || '未命名线束图')}><FilePlus2 className="h-4 w-4"/></ToolButton><ToolButton title="保存图纸" onClick={markSaved}><Save className="h-4 w-4"/></ToolButton>
      <ToolButton title="导出 SVG" onClick={() => downloadDrawingSvg(drawing)}><Download className="h-4 w-4"/><span>SVG</span></ToolButton><ToolButton title="导出 PNG" onClick={() => void downloadDrawingPng(drawing)}><FileImage className="h-4 w-4"/></ToolButton><ToolButton title="导出 PDF" onClick={() => downloadDrawingPdf(drawing)}><FileText className="h-4 w-4"/></ToolButton>
    </div>
    <div className="relative flex min-h-0 flex-1">
      {resourcesOpen && <aside className="absolute left-3 top-3 z-20 w-52 rounded border border-slate-200 bg-white p-3 shadow-xl"><h3 className="mb-2 text-sm font-semibold text-slate-900">绘图资源</h3><div className="grid grid-cols-2 gap-2">{resourceTools.map((tool) => <button type="button" key={tool.kind} onClick={() => addResource(tool.kind)} className="rounded border border-slate-200 px-2 py-2 text-left text-xs text-slate-700 hover:bg-blue-50">{tool.label}</button>)}</div><div className="mt-3 border-t pt-3"><p className="mb-1 text-xs font-semibold text-slate-500">我的图纸</p>{Object.values(documents).map((item) => <button type="button" key={item.id} onClick={() => openDocument(item.id)} className={`block w-full truncate rounded px-2 py-1 text-left text-xs ${item.id === drawing.id ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>{item.name}</button>)}<button type="button" onClick={() => removeDocument(drawing.id)} className="mt-2 text-xs text-red-600">删除当前图纸</button></div></aside>}
      <StandaloneDrawingCanvas drawing={drawing} selectedObjectId={selectedObjectId} zoom={zoom} onSelectObject={setSelectedObjectId} onStartEdit={remember} onUpdateObject={updateObject}/>
      <StandaloneDrawingInspector drawing={drawing} selectedObjectId={selectedObjectId} onStartEdit={remember} onUpdateObject={updateObject}/>
    </div>
    <StandaloneDrawingWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onGenerate={(next) => { update(next); setSelectedObjectId(null); setWizardOpen(false); }}/>
  </div>;
}

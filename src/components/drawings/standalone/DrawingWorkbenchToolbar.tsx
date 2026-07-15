import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, ArrowUpFromLine, Eraser, FileText, Layers2, LockKeyhole,
  Menu, MousePointer2, PenLine, Pencil, Redo2, Save, Trash2, Undo2, Wand2,
} from 'lucide-react';
import type { DrawingToolMode } from '@/types/drawing';

interface Props {
  toolMode: DrawingToolMode;
  orthogonal: boolean;
  hasSelection: boolean;
  selectionLocked: boolean;
  allObjectsLocked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onBeforeAction: () => void;
  onWizard: () => void;
  onResources: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onDelete: () => void;
  onToggleSelectionLock: () => void;
  onToggleAllLocks: () => void;
  onLayer: (action: 'forward' | 'backward') => void;
  onToolMode: (mode: DrawingToolMode) => void;
  onOrthogonal: () => void;
  onAddText: () => void;
  onAddLabel: () => void;
  onAddDimension: () => void;
  onAddTable: () => void;
  onSave: () => void;
  onPdf: () => void;
  exporting?: boolean;
}

function Button({ title, active, disabled, iconOnly, onClick, children }: { title: string; active?: boolean; disabled?: boolean; iconOnly?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={title} aria-label={title} aria-pressed={active} disabled={disabled} onClick={onClick} className={`flex h-9 shrink-0 items-center rounded-md border text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 ${iconOnly ? 'w-9 justify-center px-0' : 'gap-1 px-2'} ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{children}</button>;
}

export function DrawingWorkbenchToolbar(props: Props) {
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [layerMenuPosition, setLayerMenuPosition] = useState({ left: 0, top: 0 });
  const layerButtonRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!layerMenuOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!layerButtonRef.current?.contains(target) && !(target instanceof Element && target.closest('[data-layer-menu]'))) setLayerMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setLayerMenuOpen(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', closeOnEscape); };
  }, [layerMenuOpen]);

  const run = (action: () => void, closeLayerMenu = false) => {
    props.onBeforeAction();
    action();
    if (closeLayerMenu) setLayerMenuOpen(false);
  };
  const toggleLayerMenu = () => {
    const rect = layerButtonRef.current?.getBoundingClientRect();
    if (rect) setLayerMenuPosition({ left: rect.left, top: rect.bottom + 6 });
    setLayerMenuOpen((open) => !open);
  };

  return <div className="relative z-30 flex min-h-14 items-center gap-1.5 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2" role="toolbar" aria-label="绘图工具栏">
    <Button title="配置向导" onClick={() => run(props.onWizard)}><Wand2 className="h-4 w-4 text-blue-600"/>配置向导</Button>
    <Button title="绘图资源" onClick={() => run(props.onResources)}><Menu className="h-4 w-4"/>绘图资源</Button>
    <span className="mx-1 h-6 w-px bg-slate-200"/>
    <Button title="撤销" disabled={!props.canUndo} onClick={() => run(props.onUndo)}><Undo2 className="h-4 w-4"/></Button>
    <Button title="重做" disabled={!props.canRedo} onClick={() => run(props.onRedo)}><Redo2 className="h-4 w-4"/></Button>
    <Button title="清空画板（Ctrl+U）" iconOnly onClick={() => run(props.onClear)}><Eraser className="h-4 w-4"/></Button>
    <Button title="删除" iconOnly disabled={!props.hasSelection} onClick={() => run(props.onDelete)}><Trash2 className="h-4 w-4"/></Button>
    <span ref={layerButtonRef}>
      <Button title="图层操作" iconOnly active={layerMenuOpen} onClick={toggleLayerMenu}><Layers2 className="h-4 w-4"/></Button>
    </span>
    <Button title={props.allObjectsLocked ? '全局解锁' : '全局锁定'} iconOnly active={props.allObjectsLocked} onClick={() => run(props.onToggleAllLocks)}><LockKeyhole className="h-4 w-4"/></Button>
    {layerMenuOpen && <div data-layer-menu role="menu" aria-label="图层操作" className="fixed z-[80] flex gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl" style={layerMenuPosition}>
      <Button title="上移" iconOnly onClick={() => run(() => props.onLayer('forward'), true)}><ArrowUp className="h-4 w-4"/></Button>
      <Button title="下移" iconOnly onClick={() => run(() => props.onLayer('backward'), true)}><ArrowDown className="h-4 w-4"/></Button>
      <Button title="锁定/解锁当前选择" iconOnly active={props.selectionLocked} onClick={() => run(props.onToggleSelectionLock, true)}><LockKeyhole className="h-4 w-4"/></Button>
    </div>}
    <span className="mx-1 h-6 w-px bg-slate-200"/>
    <Button title="选择" iconOnly active={props.toolMode === 'select'} onClick={() => props.onToolMode('select')}><MousePointer2 className="h-4 w-4"/></Button>
    <Button title="正交（Shift+Q）" iconOnly active={props.orthogonal} onClick={() => run(props.onOrthogonal)}><ArrowUpFromLine className="h-4 w-4"/></Button>
    <Button title="直线（Shift+W）" iconOnly active={props.toolMode === 'line'} onClick={() => props.onToolMode('line')}><span className="text-xs leading-none">╱</span></Button>
    <Button title="折线（Shift+E）" iconOnly active={props.toolMode === 'polyline'} onClick={() => props.onToolMode('polyline')}><span className="text-xs leading-none">⌁</span></Button>
    <Button title="曲线（Shift+R）" iconOnly active={props.toolMode === 'curve'} onClick={() => props.onToolMode('curve')}><span className="text-xs leading-none">⌒</span></Button>
    <Button title="自由画笔" iconOnly active={props.toolMode === 'freehand'} onClick={() => props.onToolMode('freehand')}><Pencil className="h-4 w-4"/></Button>
    <Button title="添加文字" iconOnly onClick={() => run(props.onAddText)}><PenLine className="h-4 w-4"/></Button>
    <Button title="号码/标签" iconOnly onClick={() => run(props.onAddLabel)}><span className="text-xs leading-none">①</span></Button>
    <Button title="长度标注" iconOnly onClick={() => run(props.onAddDimension)}><span className="text-xs leading-none">↔</span></Button>
    <Button title="表格" iconOnly onClick={() => run(props.onAddTable)}><span className="text-xs leading-none">▦</span></Button>
    <span className="ml-auto"/>
    <Button title="保存" iconOnly onClick={() => run(props.onSave)}><Save className="h-4 w-4"/></Button>
    <Button title={props.exporting ? '正在导出 PDF' : '导出 PDF'} iconOnly disabled={props.exporting} onClick={() => run(props.onPdf)}><FileText className="h-4 w-4"/></Button>
  </div>;
}

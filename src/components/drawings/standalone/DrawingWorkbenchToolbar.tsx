import {
  ArrowDownToLine, ArrowUpFromLine, BringToFront, ChevronDown, Eraser, FileText,
  Layers2, LockKeyhole, Menu, MousePointer2, PenLine, Pencil, Redo2, Save, Trash2, Undo2, Wand2,
} from 'lucide-react';
import type { DrawingToolMode } from '@/types/drawing';

interface Props {
  toolMode: DrawingToolMode;
  orthogonal: boolean;
  hasSelection: boolean;
  selectionLocked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onWizard: () => void;
  onResources: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onDelete: () => void;
  onToggleLock: () => void;
  onLayer: (action: 'front' | 'forward' | 'backward' | 'back') => void;
  onToolMode: (mode: DrawingToolMode) => void;
  onOrthogonal: () => void;
  onAddText: () => void;
  onAddLabel: () => void;
  onAddDimension: () => void;
  onAddTable: () => void;
  onSave: () => void;
  onPdf: () => void | Promise<void>;
  exporting?: boolean;
}

function Button({ title, active, disabled, onClick, children }: { title: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={title} aria-label={title} aria-pressed={active} disabled={disabled} onClick={onClick} className={`flex h-9 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{children}</button>;
}

export function DrawingWorkbenchToolbar(props: Props) {
  return <div className="flex min-h-14 items-center gap-1.5 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2" role="toolbar" aria-label="绘图工具栏">
    <Button title="配置向导" onClick={props.onWizard}><Wand2 className="h-4 w-4 text-blue-600"/>配置向导</Button>
    <Button title="绘图资源" onClick={props.onResources}><Menu className="h-4 w-4"/>绘图资源</Button>
    <span className="mx-1 h-6 w-px bg-slate-200"/>
    <Button title="撤销" disabled={!props.canUndo} onClick={props.onUndo}><Undo2 className="h-4 w-4"/></Button>
    <Button title="重做" disabled={!props.canRedo} onClick={props.onRedo}><Redo2 className="h-4 w-4"/></Button>
    <Button title="清空画板（Ctrl+U）" onClick={props.onClear}><Eraser className="h-4 w-4"/>清空画板</Button>
    <Button title="删除" disabled={!props.hasSelection} onClick={props.onDelete}><Trash2 className="h-4 w-4"/></Button>
    <Button title="锁定/解锁" disabled={!props.hasSelection} active={props.selectionLocked} onClick={props.onToggleLock}><LockKeyhole className="h-4 w-4"/>锁定/解锁</Button>
    <Button title="图层上移" disabled={!props.hasSelection} onClick={() => props.onLayer('forward')}><Layers2 className="h-4 w-4"/>图层上移</Button>
    <Button title="图层下移" disabled={!props.hasSelection} onClick={() => props.onLayer('backward')}><ChevronDown className="h-4 w-4"/>图层下移</Button>
    <Button title="置于顶层" disabled={!props.hasSelection} onClick={() => props.onLayer('front')}><BringToFront className="h-4 w-4"/>置于顶层</Button>
    <Button title="置于底层" disabled={!props.hasSelection} onClick={() => props.onLayer('back')}><ArrowDownToLine className="h-4 w-4"/>置于底层</Button>
    <span className="mx-1 h-6 w-px bg-slate-200"/>
    <Button title="选择" active={props.toolMode === 'select'} onClick={() => props.onToolMode('select')}><MousePointer2 className="h-4 w-4"/></Button>
    <Button title="正交（Shift+Q）" active={props.orthogonal} onClick={props.onOrthogonal}><ArrowUpFromLine className="h-4 w-4"/>正交</Button>
    <Button title="直线（Shift+W）" active={props.toolMode === 'line'} onClick={() => props.onToolMode('line')}><span>╱</span>直线</Button>
    <Button title="折线（Shift+E）" active={props.toolMode === 'polyline'} onClick={() => props.onToolMode('polyline')}><span>⌁</span>折线</Button>
    <Button title="曲线（Shift+R）" active={props.toolMode === 'curve'} onClick={() => props.onToolMode('curve')}><span>⌒</span>曲线</Button>
    <Button title="自由画笔" active={props.toolMode === 'freehand'} onClick={() => props.onToolMode('freehand')}><Pencil className="h-4 w-4"/>自由画笔</Button>
    <Button title="添加文字" onClick={props.onAddText}><PenLine className="h-4 w-4"/>文字</Button>
    <Button title="号码/标签" onClick={props.onAddLabel}><span>①</span></Button>
    <Button title="长度标注" onClick={props.onAddDimension}><span>↔</span></Button>
    <Button title="表格" onClick={props.onAddTable}><span>▦</span></Button>
    <span className="ml-auto"/>
    <Button title="保存" onClick={props.onSave}><Save className="h-4 w-4"/></Button>
    <Button title={props.exporting ? '正在导出 PDF' : '导出 PDF'} disabled={props.exporting} onClick={() => void props.onPdf()}><FileText className="h-4 w-4"/>{props.exporting ? '导出中…' : 'PDF'}</Button>
  </div>;
}

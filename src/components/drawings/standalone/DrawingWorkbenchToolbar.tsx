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

function Button({ title, active, disabled, iconOnly, onClick, children }: { title: string; active?: boolean; disabled?: boolean; iconOnly?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={title} aria-label={title} aria-pressed={active} disabled={disabled} onClick={onClick} className={`flex h-9 shrink-0 items-center rounded-md border text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 ${iconOnly ? 'w-9 justify-center px-0' : 'gap-1 px-2'} ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{children}</button>;
}

export function DrawingWorkbenchToolbar(props: Props) {
  return <div className="flex min-h-14 items-center gap-1.5 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2" role="toolbar" aria-label="绘图工具栏">
    <Button title="配置向导" onClick={props.onWizard}><Wand2 className="h-4 w-4 text-blue-600"/>配置向导</Button>
    <Button title="绘图资源" onClick={props.onResources}><Menu className="h-4 w-4"/>绘图资源</Button>
    <span className="mx-1 h-6 w-px bg-slate-200"/>
    <Button title="撤销" disabled={!props.canUndo} onClick={props.onUndo}><Undo2 className="h-4 w-4"/></Button>
    <Button title="重做" disabled={!props.canRedo} onClick={props.onRedo}><Redo2 className="h-4 w-4"/></Button>
    <Button title="清空画板（Ctrl+U）" iconOnly onClick={props.onClear}><Eraser className="h-4 w-4"/></Button>
    <Button title="删除" iconOnly disabled={!props.hasSelection} onClick={props.onDelete}><Trash2 className="h-4 w-4"/></Button>
    <Button title="锁定/解锁" iconOnly disabled={!props.hasSelection} active={props.selectionLocked} onClick={props.onToggleLock}><LockKeyhole className="h-4 w-4"/></Button>
    <Button title="图层上移" iconOnly disabled={!props.hasSelection} onClick={() => props.onLayer('forward')}><Layers2 className="h-4 w-4"/></Button>
    <Button title="图层下移" iconOnly disabled={!props.hasSelection} onClick={() => props.onLayer('backward')}><ChevronDown className="h-4 w-4"/></Button>
    <Button title="置于顶层" iconOnly disabled={!props.hasSelection} onClick={() => props.onLayer('front')}><BringToFront className="h-4 w-4"/></Button>
    <Button title="置于底层" iconOnly disabled={!props.hasSelection} onClick={() => props.onLayer('back')}><ArrowDownToLine className="h-4 w-4"/></Button>
    <span className="mx-1 h-6 w-px bg-slate-200"/>
    <Button title="选择" iconOnly active={props.toolMode === 'select'} onClick={() => props.onToolMode('select')}><MousePointer2 className="h-4 w-4"/></Button>
    <Button title="正交（Shift+Q）" iconOnly active={props.orthogonal} onClick={props.onOrthogonal}><ArrowUpFromLine className="h-4 w-4"/></Button>
    <Button title="直线（Shift+W）" iconOnly active={props.toolMode === 'line'} onClick={() => props.onToolMode('line')}><span className="text-xs leading-none">╱</span></Button>
    <Button title="折线（Shift+E）" iconOnly active={props.toolMode === 'polyline'} onClick={() => props.onToolMode('polyline')}><span className="text-xs leading-none">⌁</span></Button>
    <Button title="曲线（Shift+R）" iconOnly active={props.toolMode === 'curve'} onClick={() => props.onToolMode('curve')}><span className="text-xs leading-none">⌒</span></Button>
    <Button title="自由画笔" iconOnly active={props.toolMode === 'freehand'} onClick={() => props.onToolMode('freehand')}><Pencil className="h-4 w-4"/></Button>
    <Button title="添加文字" iconOnly onClick={props.onAddText}><PenLine className="h-4 w-4"/></Button>
    <Button title="号码/标签" iconOnly onClick={props.onAddLabel}><span className="text-xs leading-none">①</span></Button>
    <Button title="长度标注" iconOnly onClick={props.onAddDimension}><span className="text-xs leading-none">↔</span></Button>
    <Button title="表格" iconOnly onClick={props.onAddTable}><span className="text-xs leading-none">▦</span></Button>
    <span className="ml-auto"/>
    <Button title="保存" iconOnly onClick={props.onSave}><Save className="h-4 w-4"/></Button>
    <Button title={props.exporting ? '正在导出 PDF' : '导出 PDF'} iconOnly disabled={props.exporting} onClick={() => void props.onPdf()}><FileText className="h-4 w-4"/></Button>
  </div>;
}

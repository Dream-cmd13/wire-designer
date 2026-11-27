import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpFromLine,
  CircleX,
  Download,
  FileText,
  FileUp,
  Layers2,
  LockKeyhole,
  Menu,
  MousePointer2,
  PenLine,
  Pencil,
  Redo2,
  Save,
  Scissors,
  Shapes,
  SquareDashed,
  Trash2,
  Undo2,
  Wand2,
} from 'lucide-react';
import { PageHeaderActions } from '@/components/layout/PageHeaderActions';
import type { DrawingSaveState } from '@/stores/drawingStore';
import type { DrawingToolMode } from '@/types/drawing';

interface Props {
  toolMode: DrawingToolMode;
  orthogonal: boolean;
  hasSelection: boolean;
  selectionLocked: boolean;
  allObjectsLocked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  saveState: DrawingSaveState;
  onBeforeAction: () => void;
  onWizard: () => void;
  onResources: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onDelete: () => void;
  onSplit?: () => void;
  onToggleSelectionLock: () => void;
  onToggleAllLocks: () => void;
  onLayer: (action: 'forward' | 'backward') => void;
  onToolMode: (mode: DrawingToolMode) => void;
  onOrthogonal: () => void;
  onAddText: () => void;
  onAddLabel: () => void;
  onOpenIconLibrary: () => void;
  onAddNumberTube: () => void;
  onAddDimension: () => void;
  onAddTable: () => void;
  onSave: () => void;
  onExportLocal: () => void;
  onImportLocal: () => void;
  onPdf: () => void;
  exporting?: boolean;
}

function Button({
  title,
  active,
  expanded,
  disabled,
  iconOnly,
  variant = 'default',
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  iconOnly?: boolean;
  variant?: 'default' | 'wizard' | 'resources';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const color = variant === 'wizard'
    ? 'border-rose-500 bg-rose-500 text-white hover:bg-rose-600 shadow-2xs'
    : variant === 'resources'
      ? 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100'
      : active || expanded
        ? 'border-blue-500 bg-blue-50 text-blue-700'
        : 'border-transparent bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50';
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 shrink-0 items-center whitespace-nowrap rounded-md border text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 ${
        iconOnly ? 'w-7 justify-center' : 'gap-1 px-2.5'
      } ${color}`}
    >
      {children}
    </button>
  );
}

const toolGroup = 'flex shrink-0 items-center gap-0.5';
const divider = <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-slate-200" />;

const SAVE_STATE_LABELS: Record<DrawingSaveState, string> = {
  saved: '已保存到本地',
  dirty: '本地未保存',
  saving: '本地保存中',
  error: '本地保存失败',
};

const SAVE_STATE_CLASSES: Record<DrawingSaveState, string> = {
  saved: 'text-emerald-600',
  dirty: 'text-amber-600',
  saving: 'text-slate-500',
  error: 'text-red-600',
};

export function DrawingWorkbenchToolbar(props: Props) {
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const layerGroupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!layerMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !layerGroupRef.current?.contains(event.target)) setLayerMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLayerMenuOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [layerMenuOpen]);

  const run = (action: () => void, closeLayerMenu = false) => {
    props.onBeforeAction();
    action();
    if (closeLayerMenu) setLayerMenuOpen(false);
  };

  return (
    <div
      className="relative z-40 flex shrink-0 flex-wrap items-center gap-y-1.5 border-b border-slate-200 bg-white px-2.5 py-1.5"
      role="toolbar"
      aria-label="绘图工具栏"
    >
      <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="配置和资源">
        <Button title="配置向导" variant="wizard" onClick={() => run(props.onWizard)}>
          <Wand2 className="h-3.5 w-3.5" />配置向导
        </Button>
        <Button title="绘图资源" variant="resources" onClick={() => run(props.onResources)}>
          <Menu className="h-3.5 w-3.5" />绘图资源
        </Button>
      </div>
      {divider}

      <div className={toolGroup} role="group" aria-label="画板编辑">
        <Button title="撤销" iconOnly disabled={!props.canUndo} onClick={() => run(props.onUndo)}>
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button title="重做" iconOnly disabled={!props.canRedo} onClick={() => run(props.onRedo)}>
          <Redo2 className="h-4 w-4" />
        </Button>
        {divider}
        <Button title="清空画板（Ctrl+U）" iconOnly onClick={() => run(props.onClear)}>
          <CircleX className="h-4 w-4" />
        </Button>
        <Button title="删除" iconOnly disabled={!props.hasSelection} onClick={() => run(props.onDelete)}>
          <Trash2 className="h-4 w-4" />
        </Button>
        {props.onSplit && (
          <Button title="拆分/裁剪（Ctrl+X）" iconOnly disabled={!props.hasSelection} onClick={() => run(props.onSplit!)}>
            <Scissors className="h-4 w-4" />
          </Button>
        )}
        {divider}
        <Button
          title={props.allObjectsLocked ? '全局解锁' : '全局锁定'}
          iconOnly
          active={props.allObjectsLocked}
          onClick={() => run(props.onToggleAllLocks)}
        >
          <LockKeyhole className="h-4 w-4" />
        </Button>
        <div ref={layerGroupRef} className="relative">
          <Button title="图层操作" iconOnly expanded={layerMenuOpen} onClick={() => setLayerMenuOpen((open) => !open)}>
            <Layers2 className="h-4 w-4" />
          </Button>
          {layerMenuOpen && (
            <div role="group" aria-label="图层操作" className="absolute right-0 top-full z-10 mt-1 flex gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
              <Button title="上移" iconOnly onClick={() => run(() => props.onLayer('forward'), true)}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button title="下移" iconOnly onClick={() => run(() => props.onLayer('backward'), true)}>
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button title="锁定/解锁当前选择" iconOnly active={props.selectionLocked} onClick={() => run(props.onToggleSelectionLock, true)}>
                <LockKeyhole className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
      {divider}

      <div className={toolGroup} role="group" aria-label="添加图元">
        <Button title="添加文字" iconOnly onClick={() => run(props.onAddText)}>
          <PenLine className="h-4 w-4" />
        </Button>
        <Button title="序号" iconOnly onClick={() => run(props.onAddLabel)}>
          <span className="text-xs font-semibold leading-none">序</span>
        </Button>
        <Button title="图标" iconOnly onClick={() => run(props.onOpenIconLibrary)}>
          <Shapes className="h-4 w-4" />
        </Button>
        <Button title="号码管" iconOnly onClick={() => run(props.onAddNumberTube)}>
          <SquareDashed className="h-4 w-4" />
        </Button>
        <Button title="长度标注" iconOnly onClick={() => run(props.onAddDimension)}>
          <span className="text-xs leading-none">↔</span>
        </Button>
        <Button title="表格" iconOnly onClick={() => run(props.onAddTable)}>
          <span className="text-xs leading-none">▦</span>
        </Button>
      </div>
      {divider}

      <div className={toolGroup} role="group" aria-label="选择和绘线">
        <Button title="选择" iconOnly active={props.toolMode === 'select'} onClick={() => props.onToolMode('select')}>
          <MousePointer2 className="h-4 w-4" />
        </Button>
        <Button title="正交（Shift+Q）" iconOnly active={props.orthogonal} onClick={() => run(props.onOrthogonal)}>
          <ArrowUpFromLine className="h-4 w-4" />
        </Button>
        <Button title="直线（Shift+W）" iconOnly active={props.toolMode === 'line'} onClick={() => props.onToolMode('line')}>
          <span className="text-xs leading-none">╱</span>
        </Button>
        <Button title="折线（Shift+E）" iconOnly active={props.toolMode === 'polyline'} onClick={() => props.onToolMode('polyline')}>
          <span className="text-xs leading-none">⌁</span>
        </Button>
        <Button title="曲线（Shift+R）" iconOnly active={props.toolMode === 'curve'} onClick={() => props.onToolMode('curve')}>
          <span className="text-xs leading-none">⌒</span>
        </Button>
        <Button title="自由画笔" iconOnly active={props.toolMode === 'freehand'} onClick={() => props.onToolMode('freehand')}>
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      <PageHeaderActions>
        <div className="flex min-w-0 flex-wrap items-center gap-1" role="group" aria-label="保存和导出">
          <span
            role="status"
            aria-live="polite"
            title="仅保存在当前浏览器，不同步云端；可下载图纸副本备份或转移。"
            className={`shrink-0 px-1 text-xs font-medium ${SAVE_STATE_CLASSES[props.saveState]}`}
          >
            {SAVE_STATE_LABELS[props.saveState]}
          </span>
          <Button title={props.saveState === 'error' ? '重试保存' : '保存'} iconOnly onClick={() => run(props.onSave)}>
            <Save className="h-4 w-4" />
          </Button>
          <Button title="下载图纸副本" iconOnly onClick={() => run(props.onExportLocal)}>
            <Download className="h-4 w-4" />
          </Button>
          <Button title="导入图纸副本" iconOnly onClick={() => run(props.onImportLocal)}>
            <FileUp className="h-4 w-4" />
          </Button>
          <Button title={props.exporting ? '正在导出 PDF' : '导出 PDF'} disabled={props.exporting} onClick={() => run(props.onPdf)}>
            <FileText className="h-3.5 w-3.5" />PDF
          </Button>
        </div>
      </PageHeaderActions>
    </div>
  );
}

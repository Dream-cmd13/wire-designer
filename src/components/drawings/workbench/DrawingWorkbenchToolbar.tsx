import { Download, FileImage, FileText, RotateCcw, Route, Save, Wand2, ZoomIn, ZoomOut } from 'lucide-react';

interface DrawingWorkbenchToolbarProps {
  dirty: boolean;
  onOpenWizard: () => void;
  onChooseDrawings: () => void;
  onOpenProductImage: () => void;
  saving: boolean;
  onSaveDraft: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  canExport: boolean;
  onExportSvg: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
}

export function DrawingWorkbenchToolbar({
  dirty,
  onOpenWizard,
  onChooseDrawings,
  onOpenProductImage,
  saving,
  onSaveDraft,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  canExport,
  onExportSvg,
  onExportPng,
  onExportPdf,
}: DrawingWorkbenchToolbarProps) {
  const exportButtonClass = canExport
    ? 'cursor-pointer bg-slate-900 text-white hover:bg-slate-800'
    : 'cursor-not-allowed bg-slate-200 text-slate-400';

  return (
    <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto py-2">
        <button
          type="button"
          onClick={onOpenWizard}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
        >
          <Wand2 className="h-3.5 w-3.5" />
          绘图向导
        </button>
        <button
          type="button"
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
          title="选择工具"
        >
          <Route className="h-3.5 w-3.5" />
          选择
        </button>
        <button
          type="button"
          onClick={onZoomIn}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
          title="放大"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onZoomOut}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
          title="缩小"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onResetZoom}
          className="flex h-8 min-w-14 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
          title="还原缩放"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {Math.round(zoom * 100)}%
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${
          dirty ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
        }`}
        >
          {dirty ? '未保存' : '已保存'}
        </span>
        <button
          type="button"
          disabled={saving}
          onClick={onSaveDraft}
          className={`flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium transition-colors ${
            saving
              ? 'cursor-not-allowed text-slate-400'
              : 'cursor-pointer text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? '保存中' : '保存草稿'}
        </button>
        <button
          type="button"
          onClick={onChooseDrawings}
          className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          <FileText className="h-3.5 w-3.5" />
          PDF
        </button>
        <button
          type="button"
          onClick={onOpenProductImage}
          className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          <FileImage className="h-3.5 w-3.5" />
          成品图
        </button>
        <button
          type="button"
          disabled={!canExport}
          onClick={onExportSvg}
          className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${exportButtonClass}`}
        >
          <Download className="h-3.5 w-3.5" />
          SVG
        </button>
        <button
          type="button"
          disabled={!canExport}
          onClick={onExportPng}
          className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${exportButtonClass}`}
        >
          <Download className="h-3.5 w-3.5" />
          PNG
        </button>
        <button
          type="button"
          disabled={!canExport}
          onClick={onExportPdf}
          className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${exportButtonClass}`}
        >
          <Download className="h-3.5 w-3.5" />
          PDF
        </button>
      </div>
    </div>
  );
}

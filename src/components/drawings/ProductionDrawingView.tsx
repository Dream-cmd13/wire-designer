import { useState } from 'react';
import { ExternalLink, FileSearch, FileText, Settings2 } from 'lucide-react';
import { PdfCropViewer } from '@/components/drawings/PdfCropViewer';
import type { PdfDrawing } from '@/lib/pdfDrawings';

interface ProductionDrawingViewProps {
  drawings: PdfDrawing[];
  selectedIds: string[];
  onChooseDrawings: () => void;
}

export function ProductionDrawingView({
  drawings,
  selectedIds,
  onChooseDrawings,
}: ProductionDrawingViewProps) {
  const selectedDrawings = selectedIds
    .map((id) => drawings.find((drawing) => drawing.id === id))
    .filter((drawing): drawing is PdfDrawing => Boolean(drawing));
  const [activeId, setActiveId] = useState(selectedDrawings[0]?.id ?? '');

  const activeDrawing = selectedDrawings.find((drawing) => drawing.id === activeId)
    ?? selectedDrawings[0];

  if (!activeDrawing) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100 p-6">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <FileSearch className="mx-auto h-12 w-12 text-slate-300" />
          <h2 className="mt-4 text-base font-semibold text-slate-800">尚未选择PDF</h2>
          <p className="mt-2 text-sm text-slate-500">从根目录的 PDF 图纸中选择需要预览和裁剪的文件。</p>
          <button
            type="button"
            onClick={onChooseDrawings}
            className="mt-5 cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            选择图纸
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-2">
          {selectedDrawings.map((drawing) => (
            <button
              type="button"
              key={drawing.id}
              onClick={() => setActiveId(drawing.id)}
              className={`flex max-w-56 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                drawing.id === activeDrawing.id
                  ? 'bg-blue-50 font-medium text-blue-700'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
              aria-pressed={drawing.id === activeDrawing.id}
              title={drawing.name}
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">{drawing.name}</span>
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={activeDrawing.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            title="在新窗口打开当前 PDF"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            新窗口
          </a>
          <button
            type="button"
            onClick={onChooseDrawings}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-700"
          >
            <Settings2 className="h-3.5 w-3.5" />
            更换图纸
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-3">
        <PdfCropViewer key={activeDrawing.id} drawing={activeDrawing} />
      </div>
    </div>
  );
}

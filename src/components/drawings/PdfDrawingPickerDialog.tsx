import { useEffect, useState } from 'react';
import { Check, FileText, Files, X } from 'lucide-react';
import type { PdfDrawing } from '@/lib/pdfDrawings';

interface PdfDrawingPickerDialogProps {
  drawings: PdfDrawing[];
  initialSelection: string[];
  onClose: () => void;
  onConfirm: (drawingIds: string[]) => void;
}

export function PdfDrawingPickerDialog({
  drawings,
  initialSelection,
  onClose,
  onConfirm,
}: PdfDrawingPickerDialogProps) {
  const [selectedIds, setSelectedIds] = useState(() => new Set(initialSelection));

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const toggleDrawing = (drawingId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(drawingId)) {
        next.delete(drawingId);
      } else {
        next.add(drawingId);
      }
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-picker-title"
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Files className="h-5 w-5" />
            </div>
            <div>
              <h2 id="pdf-picker-title" className="text-base font-semibold text-slate-900">
                选择 PDF 图纸
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                可选择一份或多份 PDF，多份图纸将在预览区以标签页展示。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭图纸选择"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="max-h-[52vh] overflow-y-auto p-5">
          {drawings.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {drawings.map((drawing) => {
                const selected = selectedIds.has(drawing.id);
                return (
                  <button
                    type="button"
                    key={drawing.id}
                    onClick={() => toggleDrawing(drawing.id)}
                    className={`group flex min-h-24 cursor-pointer items-center gap-4 rounded-xl border p-4 text-left transition ${
                      selected
                        ? 'border-blue-400 bg-blue-50 shadow-sm ring-1 ring-blue-100'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                    aria-pressed={selected}
                  >
                    <span
                      className={`flex h-12 w-10 shrink-0 items-center justify-center rounded-lg border ${
                        selected
                          ? 'border-blue-200 bg-white text-blue-600'
                          : 'border-slate-200 bg-slate-50 text-slate-400 group-hover:text-slate-500'
                      }`}
                    >
                      <FileText className="h-6 w-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800">
                        {drawing.name}
                      </span>
                      <span className="mt-1 block text-xs text-slate-400">PDF · 2D 图纸</span>
                    </span>
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
                        selected
                          ? 'border-blue-500 bg-blue-500 text-white'
                          : 'border-slate-300 bg-white text-transparent'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 py-12 text-center">
              <FileText className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">根目录下暂未发现 PDF 文件</p>
              <p className="mt-1 text-xs text-slate-400">将图纸 PDF 放入项目根目录后重新启动页面即可。</p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <span className="text-sm text-slate-500">
            已选择 <strong className="font-semibold text-blue-600">{selectedIds.size}</strong> 份图纸
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
            >
              取消
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => onConfirm([...selectedIds])}
              className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              查看PDF
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

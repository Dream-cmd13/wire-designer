import { useEffect, useRef, useState } from 'react';
import { FileText, X } from 'lucide-react';

interface Props {
  open: boolean;
  defaultFilename: string;
  exporting: boolean;
  onConfirm: (filename: string) => void;
  onClose: () => void;
}

export function DrawingPdfExportDialog({ open, defaultFilename, exporting, onConfirm, onClose }: Props) {
  const [filename, setFilename] = useState(defaultFilename);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.select(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !exporting) onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [exporting, onClose, open]);

  if (!open) return null;
  const validFilename = filename.trim().replace(/\.pdf$/i, '').trim();

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-[1px]" onMouseDown={(event) => { if (event.target === event.currentTarget && !exporting) onClose(); }}>
    <form role="dialog" aria-modal="true" aria-labelledby="pdf-export-title" onSubmit={(event) => { event.preventDefault(); if (validFilename) onConfirm(validFilename); }} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><FileText className="h-5 w-5"/></div>
        <div className="min-w-0 flex-1">
          <h2 id="pdf-export-title" className="text-base font-semibold text-slate-900">导出 PDF</h2>
          <p className="mt-1 text-xs text-slate-500">请输入导出文件名，系统会自动添加 .pdf 后缀。</p>
        </div>
        <button type="button" aria-label="关闭 PDF 导出窗口" disabled={exporting} onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"><X className="h-4 w-4"/></button>
      </div>
      <label htmlFor="drawing-pdf-filename" className="mt-5 block text-sm font-medium text-slate-700">文件名</label>
      <div className="mt-2 flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
        <input ref={inputRef} id="drawing-pdf-filename" value={filename} disabled={exporting} onChange={(event) => setFilename(event.target.value)} className="min-w-0 flex-1 rounded-lg border-0 px-3 py-2 text-sm text-slate-900 outline-none disabled:bg-slate-50"/>
        <span className="pr-3 text-sm text-slate-400">.pdf</span>
      </div>
      {!validFilename && <p role="alert" className="mt-2 text-xs text-red-600">请输入文件名。</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" disabled={exporting} onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">取消</button>
        <button type="submit" disabled={!validFilename || exporting} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">{exporting ? '正在导出…' : '确认导出'}</button>
      </div>
    </form>
  </div>;
}

import { useState } from 'react';
import { Download, FileDown, FileImage, Image as ImageIcon, Loader2 } from 'lucide-react';
import {
  downloadAutoQuoteDrawingPdf,
  downloadAutoQuoteDrawingPng,
  downloadAutoQuoteDrawingSvg,
  generateAutoQuoteDrawingSvg,
} from '@/lib/autoQuoteDrawing';
import type { AutoQuoteFormState } from '@/lib/autoQuote';
import type { CatalogSnapshot } from '@/types/catalog';

interface AutoQuoteDrawingPreviewProps {
  form: AutoQuoteFormState;
  catalog: CatalogSnapshot | null;
}

export function AutoQuoteDrawingPreview({ form, catalog }: AutoQuoteDrawingPreviewProps) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const svgContent = generateAutoQuoteDrawingSvg(form, catalog);

  const handleDownload = async (format: 'pdf' | 'png' | 'svg') => {
    try {
      setDownloading(format);
      setError(null);
      if (format === 'pdf') {
        await downloadAutoQuoteDrawingPdf(form, catalog);
      } else if (format === 'png') {
        await downloadAutoQuoteDrawingPng(form, catalog);
      } else {
        downloadAutoQuoteDrawingSvg(form, catalog);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
      {/* 工具栏 */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 bg-slate-50">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-blue-600" />
          <span className="text-xs font-bold text-slate-800">报价确认结构图预览</span>
          <span className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] text-slate-600 font-mono">
            {form.lengthMm}mm
          </span>
        </div>

        {/* 导出操作组 */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={Boolean(downloading)}
            onClick={() => void handleDownload('pdf')}
            className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
            title="导出矢量 PDF 确认图"
          >
            {downloading === 'pdf' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5 text-rose-600" />
            )}
            <span>导出 PDF</span>
          </button>

          <button
            type="button"
            disabled={Boolean(downloading)}
            onClick={() => void handleDownload('png')}
            className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
            title="导出高清 PNG 图片"
          >
            {downloading === 'png' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileImage className="h-3.5 w-3.5 text-blue-600" />
            )}
            <span>导出 PNG</span>
          </button>

          <button
            type="button"
            disabled={Boolean(downloading)}
            onClick={() => void handleDownload('svg')}
            className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
            title="导出原始 SVG 图纸"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>SVG</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="border-b border-rose-200 bg-rose-50 px-4 py-1.5 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* SVG 画布容器 */}
      <div className="flex-1 min-h-[360px] overflow-auto p-4 flex items-center justify-center bg-slate-100/50">
        <div
          className="w-full max-w-[960px] rounded-lg shadow-sm border border-slate-200/80 bg-white overflow-hidden"
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      </div>
    </div>
  );
}

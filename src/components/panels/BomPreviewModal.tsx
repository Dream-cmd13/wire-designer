import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, Image, X } from 'lucide-react';

export interface AssociatedFile {
  name: string;
  url: string;
  type: 'image';
}

interface BomPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;
  files: AssociatedFile[];
}

export function BomPreviewModal({ isOpen, onClose, itemName, files }: BomPreviewModalProps) {
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentFile = files.find((file) => file.url === selectedFileUrl) ?? files[0] ?? null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
        className="w-full max-w-5xl h-[85vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 shrink-0 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 id="preview-title" className="text-base font-semibold text-slate-900 truncate max-w-md sm:max-w-xl">
                物料关联文件预览
              </h2>
              <p className="text-xs text-slate-500 truncate max-w-md sm:max-w-xl mt-0.5">
                {itemName} · 共关联 {files.length} 个文件
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭预览"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Content Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar (Only visible if there are multiple files) */}
          {files.length > 1 && (
            <aside className="w-64 border-r border-slate-200 bg-slate-50/50 flex flex-col shrink-0 overflow-y-auto p-3 gap-2">
              <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                文件列表
              </div>
              <div className="space-y-1">
                {files.map((file, idx) => {
                  const isSelected = file.url === currentFile?.url;
                  return (
                    <button
                      key={file.url + idx}
                      onClick={() => setSelectedFileUrl(file.url)}
                      className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium transition cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50 text-blue-600 border-l-2 border-blue-500'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-l-2 border-transparent'
                      }`}
                    >
                      <Image className={`h-4 w-4 shrink-0 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`} />
                      <span className="truncate flex-1" title={file.name}>
                        {file.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
          )}

          {/* Right/Center Preview Area */}
          <main className="flex-1 bg-slate-100 flex flex-col relative overflow-hidden h-full">
            {currentFile ? (
              <>
                {/* Preview Toolbar */}
                <div className="h-10 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0 text-xs text-slate-500">
                  <span className="font-medium truncate max-w-sm sm:max-w-md">
                    正在预览: {currentFile.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <a
                      href={currentFile.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-slate-100 transition"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      新窗口打开
                    </a>
                    <a
                      href={currentFile.url}
                      download={currentFile.name}
                      className="flex items-center gap-1 text-slate-600 hover:text-slate-800 font-medium px-2 py-1 rounded hover:bg-slate-100 transition"
                    >
                      <Download className="h-3.5 w-3.5" />
                      下载
                    </a>
                  </div>
                </div>

                {/* Preview Frame */}
                <div className="flex-1 overflow-hidden p-6 flex items-center justify-center">
                  <div className="max-w-full max-h-full overflow-auto flex items-center justify-center p-2 rounded-lg bg-white shadow border border-slate-200">
                    <img
                      src={currentFile.url}
                      alt={currentFile.name}
                      className="max-w-full max-h-[60vh] object-contain select-none"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <Image className="h-12 w-12 text-slate-300 mb-3" />
                <p className="text-sm font-medium text-slate-600">暂无关联文件</p>
                <p className="text-xs text-slate-400 mt-1">未找到此物料相关的图纸或图片。</p>
              </div>
            )}
          </main>
        </div>
      </section>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Image, X } from 'lucide-react';

export interface AssociatedFile {
  name: string;
  url: string;
  type: 'image';
}

export interface BomPreviewItem {
  id?: string;
  itemName: string;
  files: AssociatedFile[];
}

interface BomPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  items?: BomPreviewItem[];
  initialIndex?: number;
  itemName?: string;
  files?: AssociatedFile[];
}

interface BomPreviewModalContentProps {
  onClose: () => void;
  items?: BomPreviewItem[];
  initialIndex?: number;
  itemName?: string;
  files?: AssociatedFile[];
}

function BomPreviewModalContent({
  onClose,
  items,
  initialIndex = 0,
  itemName = '关联文件',
  files,
}: BomPreviewModalContentProps) {
  // 标准化物料项列表
  const resolvedItems = useMemo<BomPreviewItem[]>(() => {
    if (items && items.length > 0) return items;
    if (files && files.length > 0) {
      return [{ itemName, files }];
    }
    return [];
  }, [items, files, itemName]);

  // 展开所有可预览的图片，建立全局扁平索引
  const allImages = useMemo(() => {
    const list: Array<{
      itemIndex: number;
      itemName: string;
      fileIndex: number;
      totalFilesInItem: number;
      file: AssociatedFile;
    }> = [];

    resolvedItems.forEach((item, itemIdx) => {
      item.files.forEach((file, fileIdx) => {
        list.push({
          itemIndex: itemIdx,
          itemName: item.itemName,
          fileIndex: fileIdx,
          totalFilesInItem: item.files.length,
          file,
        });
      });
    });

    return list;
  }, [resolvedItems]);

  const initialFlatIndex = useMemo(() => {
    if (initialIndex >= 0) {
      const targetFlatIndex = allImages.findIndex((img) => img.itemIndex === initialIndex);
      if (targetFlatIndex >= 0) return targetFlatIndex;
    }
    return 0;
  }, [allImages, initialIndex]);

  const [currentImageIndex, setCurrentImageIndex] = useState(initialFlatIndex);

  const canPrev = currentImageIndex > 0;
  const canNext = currentImageIndex < allImages.length - 1;

  const handlePrev = () => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const handleNext = () => {
    setCurrentImageIndex((prev) => (prev < allImages.length - 1 ? prev + 1 : prev));
  };

  // 键盘快捷键监听：Escape 关闭，左右方向键切换
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setCurrentImageIndex((prev) => (prev < allImages.length - 1 ? prev + 1 : prev));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, allImages.length]);

  const currentEntry = allImages[currentImageIndex] ?? null;
  const currentFile = currentEntry?.file ?? null;

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
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id="preview-title" className="text-base font-semibold text-slate-900 truncate">
                物料关联文件预览
              </h2>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {currentEntry ? currentEntry.itemName : itemName} · 图片 {allImages.length > 0 ? currentImageIndex + 1 : 0}/{allImages.length}
                {allImages.length > 1 && '（可通过左右按钮或键盘 ←/→ 切换）'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 shrink-0"
            aria-label="关闭预览"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Content Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar (Visible if multiple images exist across items or within item) */}
          {allImages.length > 1 && (
            <aside className="w-64 border-r border-slate-200 bg-slate-50/50 flex flex-col shrink-0 overflow-y-auto p-3 gap-3">
              <div className="px-2 py-0.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                物料文件列表 ({allImages.length})
              </div>
              <div className="space-y-3">
                {resolvedItems.map((item, itemIdx) => {
                  const isCurrentItem = currentEntry?.itemIndex === itemIdx;
                  return (
                    <div key={itemIdx} className="space-y-1">
                      <div
                        className={`text-xs font-semibold px-2 py-0.5 truncate ${
                          isCurrentItem ? 'text-blue-700' : 'text-slate-600'
                        }`}
                        title={item.itemName}
                      >
                        {item.itemName}
                      </div>
                      <div className="space-y-0.5">
                        {item.files.map((file, fileIdx) => {
                          const flatIdx = allImages.findIndex(
                            (img) => img.itemIndex === itemIdx && img.fileIndex === fileIdx,
                          );
                          const isSelected = flatIdx === currentImageIndex;
                          return (
                            <button
                              key={file.url + fileIdx}
                              onClick={() => setCurrentImageIndex(flatIdx)}
                              className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition cursor-pointer ${
                                isSelected
                                  ? 'bg-blue-50 text-blue-600 border-l-2 border-blue-500'
                                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-l-2 border-transparent'
                              }`}
                            >
                              <Image className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`} />
                              <span className="truncate flex-1" title={file.name}>
                                {file.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
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
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-medium truncate max-w-xs sm:max-w-md text-slate-700">
                      {currentFile.name}
                    </span>
                    {allImages.length > 1 && (
                      <div className="flex items-center gap-1 bg-slate-100 rounded-md p-0.5 border border-slate-200">
                        <button
                          type="button"
                          onClick={handlePrev}
                          disabled={!canPrev}
                          className="p-1 rounded text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-xs transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          title="上一张 (键盘 ←)"
                          aria-label="上一张"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <span className="px-1.5 text-xs font-semibold tabular-nums text-slate-700 select-none">
                          {currentImageIndex + 1} / {allImages.length}
                        </span>
                        <button
                          type="button"
                          onClick={handleNext}
                          disabled={!canNext}
                          className="p-1 rounded text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-xs transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          title="下一张 (键盘 →)"
                          aria-label="下一张"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
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
                <div className="flex-1 min-h-0 overflow-auto p-4 flex items-center justify-center relative select-none">
                  {/* Floating Left Button */}
                  {allImages.length > 1 && (
                    <button
                      type="button"
                      onClick={handlePrev}
                      disabled={!canPrev}
                      className={`absolute left-3 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/60 text-white shadow-md backdrop-blur-xs transition hover:bg-slate-900/80 active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer ${
                        !canPrev ? 'pointer-events-none' : ''
                      }`}
                      title="上一张 (键盘 ←)"
                      aria-label="上一张图片"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                  )}

                  {/* Image Display: no artificial white borders, true to original */}
                  <img
                    src={currentFile.url}
                    alt={currentFile.name}
                    className="max-w-full max-h-full object-contain select-none"
                  />

                  {/* Floating Right Button */}
                  {allImages.length > 1 && (
                    <button
                      type="button"
                      onClick={handleNext}
                      disabled={!canNext}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/60 text-white shadow-md backdrop-blur-xs transition hover:bg-slate-900/80 active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer ${
                        !canNext ? 'pointer-events-none' : ''
                      }`}
                      title="下一张 (键盘 →)"
                      aria-label="下一张图片"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  )}
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

export function BomPreviewModal({ isOpen, ...props }: BomPreviewModalProps) {
  if (!isOpen) return null;
  return (
    <BomPreviewModalContent
      key={`${props.initialIndex ?? 0}-${props.items?.length ?? 0}-${props.files?.length ?? 0}`}
      {...props}
    />
  );
}

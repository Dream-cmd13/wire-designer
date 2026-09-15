import type { RefObject } from 'react';

interface MaterialPaginationProps {
  currentPage: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

export function MaterialPagination({
  currentPage,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [20, 50, 100],
  scrollContainerRef,
}: MaterialPaginationProps) {
  if (totalCount === 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  const scrollToTop = (event?: React.MouseEvent) => {
    const target = event?.currentTarget as HTMLElement | undefined;
    const container =
      scrollContainerRef?.current ||
      target
        ?.closest('.overflow-hidden')
        ?.querySelector<HTMLElement>('.overflow-auto, .overflow-y-auto') ||
      target?.closest<HTMLElement>('.overflow-auto, .overflow-y-auto') ||
      null;

    if (!container) return;

    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrev = (e: React.MouseEvent) => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
      scrollToTop(e);
    }
  };

  const handleNext = (e: React.MouseEvent) => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
      scrollToTop(e);
    }
  };

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = Number(e.target.value);
    onPageSizeChange(newSize);
    scrollToTop();
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3 text-xs text-slate-600">
      <div className="flex items-center gap-2">
        <span>
          显示 {startItem} - {endItem} 条，共{' '}
          <strong className="font-semibold text-slate-800">{totalCount}</strong> 条
        </span>
        <select
          value={pageSize}
          onChange={handlePageSizeChange}
          className="h-7 rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-700 outline-none"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size} 条/页
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={handlePrev}
          className="cursor-pointer rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          上一页
        </button>
        <span className="px-2 font-mono">
          {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={handleNext}
          className="cursor-pointer rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一页
        </button>
      </div>
    </div>
  );
}

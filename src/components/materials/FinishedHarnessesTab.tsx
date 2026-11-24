import { useMemo, useRef, useState } from 'react';
import { ExternalLink, FileSpreadsheet, Search } from 'lucide-react';
import { useMaterialTabPage } from './useMaterialTabPage';
import { MaterialPagination } from '@/components/materials/MaterialPagination';
import type { FinishedHarnessMaterial } from '@/types/finishedHarnessMaterial';

interface FinishedHarnessesTabState {
  query: string;
  supplierNo: string;
  drawingStatus: 'all' | 'has' | 'none';
  costStatus: 'all' | 'has' | 'none';
  page: number;
  pageSize: number;
}

interface FinishedHarnessesTabProps {
  finishedHarnesses: FinishedHarnessMaterial[];
  finishedLoading: boolean;
  finishedError: string | null;
  isRefreshing: boolean;
  active: boolean;
  initialPage: number;
  finishedReady: boolean;
  onReload: () => void;
  onSelectHarness: (harness: FinishedHarnessMaterial) => void;
  onPreviewExcel: (preview: { fileName: string; fileUrl: string | null; filePath?: string | null }) => void;
}

export function FinishedHarnessesTab({
  finishedHarnesses,
  finishedLoading,
  finishedError,
  isRefreshing,
  active,
  initialPage,
  finishedReady,
  onReload,
  onSelectHarness,
  onPreviewExcel,
}: FinishedHarnessesTabProps) {
  const [state, setState] = useState<FinishedHarnessesTabState>(() => ({
    query: '',
    supplierNo: 'all',
    drawingStatus: 'all',
    costStatus: 'all',
    page: initialPage,
    pageSize: 20,
  }));
  const {
    query: finishedQuery,
    supplierNo: finishedSupplierNo,
    drawingStatus: finishedDrawingStatus,
    costStatus: finishedCostStatus,
    pageSize: finishedPageSize,
  } = state;
  const finishedTableRef = useRef<HTMLDivElement>(null);

  const finishedSupplierNos = useMemo(() => {
    return Array.from(
      new Set(
        finishedHarnesses
          .map((h) => h.supplier?.supplier_no || h.supplierNo)
          .filter(Boolean),
      ),
    ).sort() as string[];
  }, [finishedHarnesses]);

  const filteredFinishedHarnesses = useMemo(() => {
    const q = finishedQuery.trim().toLowerCase();
    return finishedHarnesses.filter((h) => {
      const displayName = h.sonName || '未命名';
      const supplierDisplay = h.supplier?.supplier_no || h.supplierNo || '';
      const matchQ =
        !q ||
        h.platformNo.toLowerCase().includes(q) ||
        displayName.toLowerCase().includes(q) ||
        supplierDisplay.toLowerCase().includes(q);

      const matchS = finishedSupplierNo === 'all' || supplierDisplay === finishedSupplierNo;

      const hasDrawing = Boolean(h.file2d);
      const matchD =
        finishedDrawingStatus === 'all' ||
        (finishedDrawingStatus === 'has' && hasDrawing) ||
        (finishedDrawingStatus === 'none' && !hasDrawing);

      const matchC =
        finishedCostStatus === 'all' ||
        (finishedCostStatus === 'has' && h.hasCostAnalysis) ||
        (finishedCostStatus === 'none' && !h.hasCostAnalysis);

      return matchQ && matchS && matchD && matchC;
    });
  }, [finishedHarnesses, finishedQuery, finishedSupplierNo, finishedDrawingStatus, finishedCostStatus]);

  const { page: safeFinishedPage, rows: paginatedFinishedHarnesses } = useMaterialTabPage(
    filteredFinishedHarnesses, state, setState,
    finishedReady,
  );

  if (!active) return null;
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5 sm:gap-3">
      <section className="shrink-0 rounded-lg border border-slate-200 bg-white p-2.5 sm:p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative block min-w-[200px] flex-[2_1_220px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={finishedQuery}
              onChange={(e) => {
                setState((prev) => ({ ...prev, query: e.target.value, page: 1 }));
              }}
              placeholder="搜索成品料号、物料名称"
              className="h-8.5 w-full rounded-md border border-slate-200 bg-white pr-3 pl-9 text-xs outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <select
            value={finishedSupplierNo}
            onChange={(e) => {
              setState((prev) => ({ ...prev, supplierNo: e.target.value, page: 1 }));
            }}
            className="h-8.5 min-w-[112px] flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400"
          >
            <option value="all">全部供应商</option>
            {finishedSupplierNos.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={finishedDrawingStatus}
            onChange={(e) => {
              setState((prev) => ({
                ...prev,
                drawingStatus: e.target.value as 'all' | 'has' | 'none',
                page: 1,
              }));
            }}
            className="h-8.5 min-w-[112px] flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400"
          >
            <option value="all">全部图纸状态</option>
            <option value="has">包含图纸</option>
            <option value="none">暂无图纸</option>
          </select>

          <select
            value={finishedCostStatus}
            onChange={(e) => {
              setState((prev) => ({
                ...prev,
                costStatus: e.target.value as 'all' | 'has' | 'none',
                page: 1,
              }));
            }}
            className="h-8.5 min-w-[112px] flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400"
          >
            <option value="all">全部成本状态</option>
            <option value="has">已核算成本</option>
            <option value="none">未核算成本</option>
          </select>

          {(finishedQuery || finishedSupplierNo !== 'all' || finishedDrawingStatus !== 'all' || finishedCostStatus !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setState((prev) => ({
                  ...prev,
                  query: '',
                  supplierNo: 'all',
                  drawingStatus: 'all',
                  costStatus: 'all',
                  page: 1,
                }));
              }}
              className="h-8.5 shrink-0 cursor-pointer rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              重置筛选
            </button>
          )}
        </div>
      </section>

      {finishedError && (
        <div className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center justify-between">
          <span>{finishedError}</span>
          <button
            type="button"
            onClick={onReload}
            className="cursor-pointer rounded bg-red-600 px-2.5 py-1 text-white hover:bg-red-700"
          >
            重试
          </button>
        </div>
      )}

      <section className="relative flex-1 min-h-0 flex flex-col rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
        {isRefreshing && (
          <div
            data-testid="finished-syncing-progress"
            className="absolute top-0 left-0 right-0 z-20 h-0.5 bg-blue-100 overflow-hidden"
          >
            <div className="h-full w-full bg-blue-600 animate-pulse" />
          </div>
        )}
        <div ref={finishedTableRef} className="flex-1 min-h-0 overflow-auto">
          <table className="min-w-[900px] w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 uppercase text-slate-500 shadow-2xs">
              <tr>
                <th className="w-[160px] min-w-[140px] px-4 py-3 font-semibold">料号</th>
                <th className="min-w-[240px] px-4 py-3 font-semibold">物料名称</th>
                <th className="w-[130px] min-w-[110px] px-4 py-3 font-semibold">供应商</th>
                <th className="w-[140px] min-w-[120px] px-4 py-3 font-semibold">图纸/附件</th>
                <th className="w-[120px] min-w-[100px] px-4 py-3 font-semibold text-center">成本分析</th>
                <th className="w-[120px] min-w-[100px] px-4 py-3 font-semibold" title="CRM 平台 son_price_low">最低售价</th>
                <th className="w-[150px] min-w-[130px] px-4 py-3 font-semibold">价格/报价</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedFinishedHarnesses.map((h) => {
                const supplierNo = h.supplier?.supplier_no || h.supplierNo;
                return (
                  <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono">
                      <button
                        type="button"
                        onClick={() => onSelectHarness(h)}
                        className="cursor-pointer font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                        title="查看成品线束详情"
                      >
                        {h.platformNo}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {h.sonName ? (
                        <span className="font-medium text-slate-800">{h.sonName}</span>
                      ) : (
                        <span className="text-slate-400 italic">未命名</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">
                      {supplierNo || '暂无编号'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {h.file2d ? (
                          <a
                            href={h.file2d}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[11px] text-blue-600 hover:bg-blue-100 transition"
                            title="在新窗口中打开2D图纸"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>打开图纸</span>
                          </a>
                        ) : null}
                        {h.hasCostAnalysis ? (
                          <button
                            type="button"
                            onClick={() =>
                              onPreviewExcel({
                                fileName: `${h.platformNo} 成本分析.xlsx`,
                                fileUrl: h.sourceExcelUrl || null,
                              })
                            }
                            className="inline-flex cursor-pointer items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
                            title="直接在线预览来源 Excel"
                          >
                            <FileSpreadsheet className="h-3 w-3 text-emerald-600" />
                            <span>预览Excel</span>
                          </button>
                        ) : null}
                        {!h.file2d && !h.hasCostAnalysis && (
                          <span className="text-slate-400">暂无</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {h.hasCostAnalysis && h.totalCost != null ? (
                        <button
                          type="button"
                          onClick={() => onSelectHarness(h)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition"
                          title="查看价格计算公式与明细"
                        >
                          ¥ {h.totalCost.toFixed(2)}
                        </button>
                      ) : (
                        <span className="text-slate-400">未核算</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {h.sonPriceLow != null ? (
                        <span className="font-mono text-slate-700">¥ {h.sonPriceLow.toFixed(2)}</span>
                      ) : (
                        <span className="text-slate-400">暂无</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {h.salesPrice != null || h.samplePrice != null || h.quotePrice != null ? (
                        <div className="flex flex-col gap-0.5">
                          {h.salesPrice != null && (
                            <div className="flex items-center gap-1 font-mono">
                              <span className="text-[10px] text-slate-400">售价:</span>
                              <span className="font-semibold text-slate-900">
                                ¥ {h.salesPrice.toFixed(2)}
                              </span>
                            </div>
                          )}
                          {h.samplePrice != null && (
                            <div className="flex items-center gap-1 font-mono text-[11px] text-amber-700">
                              <span className="text-[10px] text-slate-400">样品:</span>
                              <span>¥ {h.samplePrice.toFixed(2)}</span>
                            </div>
                          )}
                          {h.quotePrice != null && (
                            <div className="flex items-center gap-1 font-mono text-[11px] text-indigo-700">
                              <span className="text-[10px] text-slate-400">报价:</span>
                              <span className="font-medium">¥ {h.quotePrice.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">暂无</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {finishedLoading && (
            <div className="py-14 text-center text-sm text-slate-500">
              正在加载成品线束物料...
            </div>
          )}

          {!finishedLoading && filteredFinishedHarnesses.length === 0 && (
            <div className="py-14 text-center text-sm text-slate-500">
              未找到匹配的成品线束方案。
            </div>
          )}
        </div>

        {!finishedLoading && (
          <MaterialPagination
            currentPage={safeFinishedPage}
            pageSize={finishedPageSize}
            totalCount={filteredFinishedHarnesses.length}
            onPageChange={(page) => setState((prev) => ({ ...prev, page }))}
            onPageSizeChange={(pageSize) => setState((prev) => ({ ...prev, pageSize, page: 1 }))}
            scrollContainerRef={finishedTableRef}
          />
        )}
      </section>
    </div>
  );
}

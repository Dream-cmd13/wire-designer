import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Cable,
  Check,
  Download,
  FileSpreadsheet,
  Layers,
  Package,
  Plug,
  RefreshCw,
  Upload,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ConnectorsTab } from '@/components/materials/ConnectorsTab';
import { ExcelPreviewModal } from '@/components/materials/ExcelPreviewModal';
import { FinishedHarnessMaterialDetailDialog } from '@/components/materials/FinishedHarnessMaterialDetailDialog';
import { FinishedHarnessesTab } from '@/components/materials/FinishedHarnessesTab';
import { MaterialPriceEditDialog } from '@/components/materials/MaterialPriceEditDialog';
import { MoldsTab } from '@/components/materials/MoldsTab';
import { PricingManagement } from '@/components/materials/PricingManagement';
import { WiresTab } from '@/components/materials/WiresTab';
import { buildMaterialPriceIndex } from '@/components/materials/materialPriceLookup';
import { PageHeaderActions } from '@/components/layout/PageHeaderActions';
import {
  getCatalogConnectors,
  getCatalogOvermolds,
  getCatalogSnapshot,
  getCatalogWires,
} from '@/lib/catalogRuntime';
import { canViewPricing } from '@/lib/permissions';
import { createPriceTemplate, parsePriceWorkbook } from '@/lib/priceImport';
import {
  buildCatalogPriceTemplateRows,
  getCatalogPriceCandidates,
  type QuoteMaterial,
} from '@/lib/quoteMaterials';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import type { MaterialPrice } from '@/repositories/priceRepository';
import { useCatalogStore } from '@/stores/catalogStore';
import { useFinishedHarnessStore } from '@/stores/finishedHarnessStore';
import { dismissNotice, notify } from '@/stores/noticeStore';
import { usePriceStore } from '@/stores/priceStore';
import { useUserStore } from '@/stores/userStore';
import type { FinishedHarnessMaterial } from '@/types/finishedHarnessMaterial';

type MaterialTab = 'connectors' | 'wires' | 'accessories' | 'finished-harnesses';

// 离开浏览器一段时间判定阈值（30秒）
const STALE_LEAVE_THRESHOLD_MS = 30 * 1000;

export interface MaterialLibraryPageProps {
  initialTab?: MaterialTab;
  initialConnPage?: number;
  initialWirePage?: number;
  initialAccPage?: number;
  initialFinishedPage?: number;
  initialConnPriceStatus?: 'all' | 'priced' | 'unpriced';
  initialWirePriceStatus?: 'all' | 'priced' | 'unpriced';
}

export function MaterialLibraryPage({
  initialTab = 'connectors',
  initialConnPage = 1,
  initialWirePage = 1,
  initialAccPage = 1,
  initialFinishedPage = 1,
  initialConnPriceStatus = 'all',
  initialWirePriceStatus = 'all',
}: MaterialLibraryPageProps = {}) {
  const canEditPrices = canViewPricing(useUserStore(state => state.currentUser?.role));
  const [priceEditor, setPriceEditor] = useState<{ candidates: QuoteMaterial[]; prices: MaterialPrice[] } | null>(null);
  const storeSnapshot = useCatalogStore((state) => state.snapshot);
  const rawCatalogStatus = useCatalogStore((state) => state.status);
  const rawCatalogRefreshing = useCatalogStore((state) => state.refreshing);
  const initializeCatalog = useCatalogStore((state) => state.initialize);

  const currentCatalogState = useCatalogStore.getState();
  const catalogStatus = rawCatalogStatus !== 'idle' ? rawCatalogStatus : currentCatalogState.status;
  const catalogRefreshing = rawCatalogRefreshing || currentCatalogState.refreshing;
  const snapshot = storeSnapshot ?? currentCatalogState.snapshot ?? getCatalogSnapshot();

  const connectors = useMemo(() => getCatalogConnectors(snapshot), [snapshot]);
  const wires = useMemo(() => getCatalogWires(snapshot), [snapshot]);
  const overmolds = useMemo(() => getCatalogOvermolds(snapshot), [snapshot]);

  const {
    book: storeBook,
    loading: rawLoading,
    refreshing: rawPriceRefreshing,
    error,
    load,
    merge,
  } = usePriceStore();
  const currentPriceState = usePriceStore.getState();
  const book = storeBook ?? currentPriceState.book;
  const loading = rawLoading || currentPriceState.loading;
  const priceRefreshing = rawPriceRefreshing || currentPriceState.refreshing;
  const prices = useMemo(() => book?.prices ?? [], [book]);

  const priceCandidates = useMemo(() => getCatalogPriceCandidates(snapshot), [snapshot]);
  const editPriceButton = (resourceId: string, kind: QuoteMaterial['kind']) => {
    if (!canEditPrices) return null;
    const candidates = priceCandidates.filter(row => row.resourceId === resourceId &&
      row.kind === kind);
    return (
      <button
        type="button"
        disabled={loading || priceRefreshing || Boolean(error) || !candidates.length}
        className="mt-1 block w-full cursor-pointer text-right text-[11px] font-medium text-blue-600 transition hover:text-blue-800 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={`编辑${candidates[0]?.name ?? '物料'}单价`}
        onClick={() => setPriceEditor({ candidates, prices })}
      >
        编辑单价
      </button>
    );
  };

  const storeFinishedItems = useFinishedHarnessStore((state) => state.items);
  const currentFinishedState = useFinishedHarnessStore.getState();
  const finishedHarnesses =
    storeFinishedItems.length > 0 ? storeFinishedItems : currentFinishedState.items;
  const finishedLoading =
    useFinishedHarnessStore((state) => state.loading) || currentFinishedState.loading;
  const finishedRefreshing =
    useFinishedHarnessStore((state) => state.refreshing) || currentFinishedState.refreshing;
  const finishedError = useFinishedHarnessStore((state) => state.error);
  const loadFinishedHarnesses = useFinishedHarnessStore((state) => state.load);

  const [activeTab, setActiveTab] = useState<MaterialTab>(initialTab);
  const [selectedFinishedHarness, setSelectedFinishedHarness] = useState<FinishedHarnessMaterial | null>(null);
  const [directPreviewExcel, setDirectPreviewExcel] = useState<{
    fileName: string;
    fileUrl: string | null;
    filePath?: string | null;
  } | null>(null);

  // 价格导入/导出状态
  const [pendingImport, setPendingImport] = useState<{
    name: string;
    prices: MaterialPrice[];
  } | null>(null);
  const pendingImportRef = useRef<{ name: string; prices: MaterialPrice[] } | null>(null);
  const importFailureNoticeRef = useRef<number | null>(null);
  const importMergeInFlightRef = useRef(false);
  const [readingFile, setReadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 离开浏览器一段时间判定与刷新反馈状态
  const leaveTimeRef = useRef<number | null>(null);
  const syncedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced'>('idle');

  const isRefreshing =
    catalogRefreshing ||
    priceRefreshing ||
    finishedRefreshing ||
    syncStatus === 'syncing';

  const handleRefreshAll = useCallback(async () => {
    if (syncedTimerRef.current) {
      clearTimeout(syncedTimerRef.current);
      syncedTimerRef.current = null;
    }
    setSyncStatus('syncing');
    try {
      await Promise.allSettled([
        useCatalogStore.getState().reload(),
        usePriceStore.getState().load({ forceRefresh: true }),
        useFinishedHarnessStore.getState().load(true),
      ]);
      setSyncStatus('synced');
      syncedTimerRef.current = setTimeout(() => {
        setSyncStatus('idle');
        syncedTimerRef.current = null;
      }, 2500);
    } catch {
      setSyncStatus('idle');
    }
  }, []);

  // 自动初始化元器件目录、价格库与成品线束物料
  useEffect(() => {
    void initializeCatalog();
    void load();
    void loadFinishedHarnesses();
  }, [initializeCatalog, load, loadFinishedHarnesses]);

  // 监听离开浏览器（切Tab或切到其他软件），离开超过30秒切回时自动触发重新拉取
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        leaveTimeRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        const leftAt = leaveTimeRef.current;
        leaveTimeRef.current = null;
        if (leftAt && Date.now() - leftAt >= STALE_LEAVE_THRESHOLD_MS) {
          void handleRefreshAll();
        }
      }
    };

    const handleWindowBlur = () => {
      if (leaveTimeRef.current == null) {
        leaveTimeRef.current = Date.now();
      }
    };

    const handleWindowFocus = () => {
      const leftAt = leaveTimeRef.current;
      leaveTimeRef.current = null;
      if (leftAt && Date.now() - leftAt >= STALE_LEAVE_THRESHOLD_MS) {
        void handleRefreshAll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      if (syncedTimerRef.current) {
        clearTimeout(syncedTimerRef.current);
      }
    };
  }, [handleRefreshAll]);

  const priceIndex = useMemo(() => buildMaterialPriceIndex(prices), [prices]);

  const moldRows = useMemo(() => priceCandidates
    .filter(candidate => candidate.kind === 'outer-mold' || candidate.kind === 'inner-mold')
    .flatMap(candidate => {
      const parent = overmolds.find(mold => (mold.resourceItemId || mold.id) === candidate.resourceId);
      return parent ? [{ candidate, parent }] : [];
    }), [priceCandidates, overmolds]);

  // 导入任务切换（取消、换文件、成功）时同步撤销旧的导入失败通知，避免重试提交已废弃的价格数据
  const clearImportFailureNotice = () => {
    const noticeId = importFailureNoticeRef.current;
    if (noticeId === null) return;
    dismissNotice(noticeId);
    importFailureNoticeRef.current = null;
  };

  const applyPendingImport = (next: { name: string; prices: MaterialPrice[] } | null) => {
    pendingImportRef.current = next;
    setPendingImport(next);
    clearImportFailureNotice();
  };

  // 导出价格模板（包含全量 catalog 物料以支持批量补价，并检查读取错误状态）
  const handleExportPrices = async () => {
    try {
      await load();
      const latest = usePriceStore.getState();
      if (latest.error) {
        notify({
          tone: 'danger',
          title: '价格表导出失败',
          message: '物料价格暂时无法加载，请稍后重试；如持续出现，请联系管理员。',
          action: { label: '重试导出', onClick: () => void handleExportPrices() },
          dedupeKey: 'price-export-failed',
        });
        return;
      }

      const shared = latest.book?.prices ?? [];
      const templateRows = buildCatalogPriceTemplateRows(snapshot, shared);

      if (!templateRows.length) {
        notify({
          tone: 'danger',
          title: '价格表导出失败',
          message: '物料目录尚未加载完成，暂时无法生成价格模板，请稍后重试。',
        });
        return;
      }

      XLSX.writeFile(
        createPriceTemplate(templateRows, shared),
        shared.length ? '物料采购价格表.xlsx' : '物料价格模板.xlsx',
      );
      notify({
        tone: 'success',
        message: `价格表已导出，共 ${templateRows.length} 项物料（含未定价物料）。`,
        dedupeKey: 'price-export-result',
      });
    } catch (cause) {
      console.error('导出价格表失败:', cause);
      notify({
        tone: 'danger',
        title: '价格表导出失败',
        message: getUserErrorMessage(cause, '价格表导出失败，请检查网络后重试。'),
        action: { label: '重试导出', onClick: () => void handleExportPrices() },
        dedupeKey: 'price-export-failed',
      });
    }
  };

  // 触发文件选择（使用 catalog 级 candidates 匹配，不依赖当前画布工程）
  const handleSelectFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    clearImportFailureNotice();
    setReadingFile(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const candidates = getCatalogPriceCandidates(snapshot);
        const parsed = parsePriceWorkbook(buffer, candidates);
        applyPendingImport({ name: file.name, prices: parsed });
      } catch (cause) {
        console.error('解析价格文件失败:', cause);
        importFailureNoticeRef.current = notify({
          tone: 'danger',
          title: '价格文件无法导入',
          message: getUserErrorMessage(cause, '价格文件解析失败，请使用系统导出的价格模板并检查格式。'),
          durationMs: null,
          action: { label: '重新选择文件', onClick: () => fileInputRef.current?.click() },
          dedupeKey: 'price-import-parse-failed',
        });
      } finally {
        setReadingFile(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      console.error('读取价格文件失败:', reader.error);
      setReadingFile(false);
      importFailureNoticeRef.current = notify({
        tone: 'danger',
        title: '价格文件无法读取',
        message: '价格文件读取失败，请重新选择文件；如持续出现，请检查文件是否损坏。',
        durationMs: null,
        action: { label: '重新选择文件', onClick: () => fileInputRef.current?.click() },
        dedupeKey: 'price-import-read-failed',
      });
    };
    reader.readAsArrayBuffer(file);
  };

  // 确认导入价格
  const handleConfirmMerge = async () => {
    const task = pendingImportRef.current;
    if (!task || importMergeInFlightRef.current) return;
    importMergeInFlightRef.current = true;
    try {
      await merge(task.prices, task.name);
      applyPendingImport(null);
      notify({
        tone: 'success',
        message: `已成功导入并更新 ${task.prices.length} 项物料价格。`,
        dedupeKey: 'price-import-result',
      });
    } catch (cause) {
      console.error('保存至共享价格库失败:', cause);
      importFailureNoticeRef.current = notify({
        tone: 'danger',
        title: '价格未能保存',
        message: getUserErrorMessage(cause, '价格保存失败，请保持页面打开并重试。'),
        action: { label: '重试保存', onClick: () => void handleConfirmMerge() },
        dedupeKey: 'price-import-save-failed',
      });
    } finally {
      importMergeInFlightRef.current = false;
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-slate-100 p-3 sm:p-4 gap-2.5 sm:gap-3">
      <PageHeaderActions>
        {isRefreshing && (
          <span
            data-testid="material-syncing-badge"
            className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 animate-pulse"
          >
            <RefreshCw className="h-3 w-3 animate-spin text-blue-600" />
            <span>正在同步最新物料与价格...</span>
          </span>
        )}
        {!isRefreshing && syncStatus === 'synced' && (
          <span
            data-testid="material-synced-badge"
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
          >
            <Check className="h-3 w-3 text-emerald-600" />
            <span>数据已同步</span>
          </span>
        )}
        <button
          type="button"
          data-testid="material-refresh-btn"
          disabled={isRefreshing || loading || readingFile}
          onClick={() => void handleRefreshAll()}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50"
          title="刷新物料、价格与成品线束数据"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 text-slate-500 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`}
          />
          <span>{isRefreshing ? '同步中...' : '刷新'}</span>
        </button>
        <button
          type="button"
          disabled={loading || readingFile}
          onClick={handleExportPrices}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50"
          title="导出包含全量物料及已有价格的 Excel 模板"
        >
          <Download className="h-3.5 w-3.5 text-slate-500" />
          导出价格表
        </button>
        <button type="button" disabled={readingFile || loading} onClick={() => fileInputRef.current?.click()} className="inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 text-xs font-medium text-white shadow-xs transition hover:bg-blue-700 disabled:opacity-50">
          <Upload className="h-3.5 w-3.5" />
          <span>{readingFile ? '正在解析...' : '导入价格表'}</span>
        </button>
      </PageHeaderActions>
      <input ref={fileInputRef} type="file" accept=".xlsx" hidden disabled={readingFile || loading} onChange={handleSelectFile} />
      <PricingManagement />
      <section className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 shadow-xs">
        {/* 价格数据加载失败时保持可见，避免用户误以为价格是最新的 */}
        {error && (
          <div
            role="alert"
            className="mt-2.5 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void load()}
              className="cursor-pointer rounded bg-red-600 px-2.5 py-1 font-medium text-white hover:bg-red-700"
            >
              重试
            </button>
          </div>
        )}

        {/* 价格导入待确认浮层 */}
        {pendingImport && (
          <div className="mt-2.5 rounded-lg border border-blue-200 bg-blue-50/70 p-2.5 text-xs text-blue-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                <span className="font-semibold">
                  准备导入: {pendingImport.name}（共解析出 {pendingImport.prices.length} 项有效价格）
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleConfirmMerge}
                  className="inline-flex cursor-pointer items-center gap-1 rounded bg-blue-600 px-3 py-1 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  确认写入共享价格库
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => applyPendingImport(null)}
                  className="cursor-pointer rounded border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 分类 Tabs */}
        <div className="flex border-b border-slate-200 text-sm overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('connectors')}
            className={`inline-flex cursor-pointer items-center gap-2 border-b-2 px-3.5 py-2 font-medium transition-colors ${
              activeTab === 'connectors'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
            }`}
          >
            <Plug className="h-4 w-4" />
            <span>连接器</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {connectors.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('wires')}
            className={`inline-flex cursor-pointer items-center gap-2 border-b-2 px-3.5 py-2 font-medium transition-colors ${
              activeTab === 'wires'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
            }`}
          >
            <Cable className="h-4 w-4" />
            <span>线材</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {wires.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('accessories')}
            className={`inline-flex cursor-pointer items-center gap-2 border-b-2 px-3.5 py-2 font-medium transition-colors ${
              activeTab === 'accessories'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>模具</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {moldRows.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('finished-harnesses')}
            className={`inline-flex cursor-pointer items-center gap-2 border-b-2 px-3.5 py-2 font-medium transition-colors ${
              activeTab === 'finished-harnesses'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
            }`}
          >
            <Package className="h-4 w-4" />
            <span>现有成品线束方案</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {finishedHarnesses.length}
            </span>
          </button>
        </div>
      </section>

      {activeTab === 'connectors' && (
        <ConnectorsTab
          connectors={connectors}
          priceIndex={priceIndex}
          catalogStatus={catalogStatus}
          isRefreshing={isRefreshing}
          initialPage={initialConnPage}
          initialPriceStatus={initialConnPriceStatus}
          renderEditPriceButton={editPriceButton}
        />
      )}

      {activeTab === 'wires' && (
        <WiresTab
          wires={wires}
          priceIndex={priceIndex}
          catalogStatus={catalogStatus}
          isRefreshing={isRefreshing}
          initialPage={initialWirePage}
          initialPriceStatus={initialWirePriceStatus}
          renderEditPriceButton={editPriceButton}
        />
      )}

      {activeTab === 'accessories' && (
        <MoldsTab
          overmolds={overmolds}
          moldRows={moldRows}
          priceIndex={priceIndex}
          catalogStatus={catalogStatus}
          isRefreshing={isRefreshing}
          initialPage={initialAccPage}
          renderEditPriceButton={editPriceButton}
        />
      )}

      {activeTab === 'finished-harnesses' && (
        <FinishedHarnessesTab
          finishedHarnesses={finishedHarnesses}
          finishedLoading={finishedLoading}
          finishedError={finishedError}
          isRefreshing={isRefreshing}
          initialPage={initialFinishedPage}
          onReload={() => void loadFinishedHarnesses(true)}
          onSelectHarness={setSelectedFinishedHarness}
          onPreviewExcel={setDirectPreviewExcel}
        />
      )}

      {priceEditor && canEditPrices && <MaterialPriceEditDialog
        candidates={priceEditor.candidates} prices={priceEditor.prices} onClose={() => setPriceEditor(null)} />}

      <FinishedHarnessMaterialDetailDialog
        isOpen={Boolean(selectedFinishedHarness)}
        onClose={() => setSelectedFinishedHarness(null)}
        material={selectedFinishedHarness}
      />

      {directPreviewExcel && (
        <ExcelPreviewModal
          isOpen={Boolean(directPreviewExcel)}
          onClose={() => setDirectPreviewExcel(null)}
          fileName={directPreviewExcel.fileName}
          filePath={directPreviewExcel.filePath}
          fileUrl={directPreviewExcel.fileUrl}
        />
      )}
    </div>
  );
}

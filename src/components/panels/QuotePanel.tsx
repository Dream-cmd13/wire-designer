import { useEffect, useState } from 'react';
import { Calculator, Download, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { calculatePrice, formatQuoteMoney, type QuoteLine } from '@/lib/pricing';
import { safeFilename } from '@/lib/designFile';
import { createQuoteWorkbook } from '@/lib/quoteExport';
import { useHarnessStore } from '@/stores/harnessStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePriceStore } from '@/stores/priceStore';

function AmountRow({ name, amount }: { name: string; amount: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
      <span className="min-w-0 max-w-full break-words text-slate-700">{name}</span>
      <span className="break-all tabular-nums font-medium text-slate-900">¥{formatQuoteMoney(amount)}</span>
    </div>
  );
}

function Lines({ lines }: { lines: QuoteLine[] }) {
  return (
    <div className="space-y-2">
      {lines.map((line, index) => (
        <div key={index} className="rounded bg-slate-50/70 p-2">
          <AmountRow name={line.name} amount={line.amount} />
          <div className="text-xs text-slate-500 break-all mt-0.5">
            {line.points} × ¥{line.unitPrice}
          </div>
        </div>
      ))}
    </div>
  );
}

export function QuoteContent() {
  const storeConfig = useHarnessStore((state) => state.config);
  const config = typeof window === 'undefined' ? (useHarnessStore.getState().config ?? storeConfig) : storeConfig;
  const setConfig = useHarnessStore((state) => state.setConfig);
  const catalog = useCatalogStore((state) => state.snapshot);
  const { book, loading, error, load } = usePriceStore();
  const [message, setMessage] = useState('');

  useEffect(() => {
    void load();
  }, [load]);

  // 自动根据图纸中的连接器数量推断加工端数（1个连接器对应单端/1端，2个连接器对应双端/2端）
  const autoEnds: (1 | 2) | null =
    config.connectors.length === 1 ? 1 : config.connectors.length === 2 ? 2 : null;
  const effectiveEnds = autoEnds ?? config.quotation?.processingEnds;

  // 构造有效报价配置，确保加工端数自动选出，避免首次渲染时报“请确认加工端数”阻断
  const effectiveQuotation = autoEnds
    ? {
        processingEnds: autoEnds,
        srPoints: Math.min(config.quotation?.srPoints ?? 0, autoEnds),
      }
    : config.quotation;

  const effectiveConfig =
    effectiveQuotation &&
    (!config.quotation ||
      config.quotation.processingEnds !== effectiveQuotation.processingEnds ||
      config.quotation.srPoints !== effectiveQuotation.srPoints)
      ? { ...config, quotation: effectiveQuotation }
      : config;

  // 自动将识别出的加工端数同步持久化到 store
  useEffect(() => {
    if (autoEnds !== null) {
      if (
        !config.quotation ||
        config.quotation.processingEnds !== autoEnds
      ) {
        setConfig({
          quotation: {
            processingEnds: autoEnds,
            srPoints: Math.min(config.quotation?.srPoints ?? 0, autoEnds),
          },
        });
      }
    }
  }, [autoEnds, config.quotation, setConfig]);

  const prices = book?.prices || [];
  const result = calculatePrice(effectiveConfig, prices, catalog);
  const price = !error && result.status === 'ready' ? result.price : null;
  const settings = effectiveQuotation;
  const busy = loading;

  const exportQuote = async () => {
    if (!price) return;
    await load();
    const latest = usePriceStore.getState();
    if (latest.error) return;
    try {
      const current = useHarnessStore.getState().config;
      const effectiveCurrent = (autoEnds && (!current.quotation || current.quotation.processingEnds !== autoEnds))
        ? { ...current, quotation: { processingEnds: autoEnds, srPoints: Math.min(current.quotation?.srPoints ?? 0, autoEnds) } }
        : current;
      XLSX.writeFile(
        createQuoteWorkbook(effectiveCurrent, latest.book?.prices ?? [], useCatalogStore.getState().snapshot),
        `${safeFilename(current.name)}_成本分析.xlsx`,
      );
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '导出报价失败');
    }
  };

  return (
    <div className="space-y-4 min-w-0">
      {/* 订单数量与加工参数 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">订单数量</span>
          <input
            aria-label="订单数量"
            type="number"
            min={1}
            max={1000000}
            step={1}
            value={config.quantity}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (Number.isSafeInteger(value) && value > 0 && value <= 1000000) {
                setConfig({ quantity: value });
              }
            }}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">加工端数</span>
          <select
            aria-label="加工端数"
            value={effectiveEnds || ''}
            className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
            onChange={(event) => {
              const ends = Number(event.target.value) as 1 | 2;
              setConfig({
                quotation: {
                  processingEnds: ends,
                  srPoints: Math.min(settings?.srPoints || 0, ends),
                },
              });
            }}
          >
            {!effectiveEnds && (
              <option value="" disabled>
                待确认（需1或2个连接器）
              </option>
            )}
            <option value={1}>单头 / 1 端</option>
            <option value={2}>双头 / 2 端</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">SR 点数</span>
          <select
            aria-label="SR 点数"
            disabled={!settings}
            value={settings?.srPoints || 0}
            className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100"
            onChange={(event) => {
              if (settings) {
                setConfig({ quotation: { ...settings, srPoints: Number(event.target.value) } });
              }
            }}
          >
            {Array.from({ length: (settings?.processingEnds || 2) + 1 }, (_, i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* 结构统计 */}
      <div className="flex flex-wrap gap-2 text-xs text-slate-500 bg-slate-50 p-2.5 rounded-md border border-slate-100">
        <span>外模：{config.models.length} 点</span>
        <span>·</span>
        <span>内模：{config.models.filter((model) => model.includeInnerMold).length} 点</span>
        <span>·</span>
        <span>内模/SR材料：¥0.00</span>
      </div>

      {/* 缺价或未准备就绪提示 */}
      {result.status !== 'ready' && (
        <div
          role="status"
          className="space-y-1 rounded-md border-l-4 border-amber-500 bg-amber-50/70 p-3 text-xs text-amber-900"
        >
          {result.issues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </div>
      )}

      {/* 报价明细 */}
      {price && (
        <div className="space-y-3">
          {/* 总价醒目卡片 */}
          <div className="rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50/50 p-3.5 border border-blue-100">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-xs font-medium text-slate-600">含税含运费单价</span>
              <span className="text-xl font-bold text-blue-700 tabular-nums">
                ¥{formatQuoteMoney(price.unitPrice)}
              </span>
            </div>
            <div className="flex items-baseline justify-between pt-1 border-t border-blue-100/60">
              <span className="text-sm font-semibold text-slate-800">
                订单总价（{config.quantity} 件）
              </span>
              <span className="text-lg font-bold text-slate-900 tabular-nums">
                ¥{formatQuoteMoney(price.totalPrice)}
              </span>
            </div>
          </div>

          <details open className="rounded-lg border border-slate-200 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-slate-800 select-none">
              材料成本拆解 · 合计 ¥{formatQuoteMoney(price.materialSubtotal)}
            </summary>
            <div className="mt-2.5">
              <Lines lines={price.materials} />
            </div>
          </details>

          <details className="rounded-lg border border-slate-200 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-slate-800 select-none">
              加工费明细 · 合计 ¥{formatQuoteMoney(price.laborSubtotal)}
            </summary>
            <div className="mt-2.5">
              <Lines lines={price.labor} />
            </div>
          </details>

          <div className="rounded-lg border border-slate-200 p-3 space-y-2 text-xs text-slate-600 bg-slate-50/40">
            <AmountRow name="材料损耗 (3%)" amount={price.materialLoss} />
            <AmountRow name="加工损耗 (5%)" amount={price.processingLoss} />
            <AmountRow name="产品含税成本" amount={price.cost} />
            <AmountRow name="含税售价 (毛利 20%)" amount={price.sellingPrice} />
            <AmountRow name="运费 (3%)" amount={price.freight} />
          </div>
        </div>
      )}

      {/* 导出报价按钮 */}
      <button
        type="button"
        disabled={!price || busy}
        onClick={exportQuote}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Download size={16} />
        <span>导出报价 Excel (成本分析)</span>
      </button>

      {(error || message) && (
        <p
          role="status"
          className={`mt-2 text-xs ${error ? 'text-red-600' : 'text-emerald-700'}`}
        >
          {error || message}
        </p>
      )}
    </div>
  );
}

export function QuoteModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-xl flex-col rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200"
        role="dialog"
        aria-modal="true"
        aria-label="线束报价核算"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50/80">
          <div className="flex items-center gap-2 font-semibold text-slate-800 text-base">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <Calculator className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">线束报价核算</h2>
              <p className="text-[11px] text-slate-500 font-normal">基于物料清单与工艺配置的实时成本分析</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          <QuoteContent />
        </div>
      </div>
    </div>
  );
}

export function QuotePanel() {
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 font-semibold text-slate-800 mb-3">
        <Calculator className="h-5 w-5 text-blue-600" />
        <h2>线束报价</h2>
      </div>
      <QuoteContent />
    </div>
  );
}

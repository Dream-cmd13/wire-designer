import { useEffect, useRef, useState } from 'react';
import { Calculator, Download, Upload, X, Check, Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import * as XLSX from 'xlsx';
import { calculatePrice, formatQuoteMoney, type QuoteLine } from '@/lib/pricing';
import { createPriceTemplate, parsePriceWorkbook } from '@/lib/priceImport';
import { getPriceImportCandidates, materialPriceKey, formatMaterialSpecification } from '@/lib/quoteMaterials';
import { safeFilename } from '@/lib/designFile';
import { createQuoteWorkbook } from '@/lib/quoteExport';
import type { MaterialPrice } from '@/repositories/priceRepository';
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
  const { config, setConfig } = useHarnessStore();
  const catalog = useCatalogStore((state) => state.snapshot);
  const { book, loading, error, load, merge } = usePriceStore();
  const [pending, setPending] = useState<{ name: string; prices: MaterialPrice[] } | null>(null);
  const [message, setMessage] = useState('');
  const [reading, setReading] = useState(false);
  const [showPriceDbSection, setShowPriceDbSection] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const prices = book?.prices || [];
  const result = calculatePrice(config, prices, catalog);
  const price = !error && result.status === 'ready' ? result.price : null;
  const settings = config.quotation;
  const busy = loading || reading;

  const exportPrices = async () => {
    setMessage('');
    await load();
    const latest = usePriceStore.getState();
    if (latest.error) return;
    try {
      const shared = latest.book?.prices ?? [];
      const candidates = getPriceImportCandidates(
        useHarnessStore.getState().config,
        useCatalogStore.getState().snapshot,
      );
      const rows = shared.length
        ? shared.map((row) => ({ ...row, quantity: 1 }))
        : [...new Map(candidates.map((row) => [materialPriceKey(row), row])).values()];
      if (!rows.length) throw new Error('目录尚未加载，暂时无法生成价格模板');
      XLSX.writeFile(
        createPriceTemplate(rows, shared),
        shared.length ? '共享材料价格.xlsx' : '材料价格模板.xlsx',
      );
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '导出共享价格失败');
    }
  };

  const exportQuote = async () => {
    if (!price) return;
    await load();
    const latest = usePriceStore.getState();
    if (latest.error) return;
    try {
      const current = useHarnessStore.getState().config;
      XLSX.writeFile(
        createQuoteWorkbook(current, latest.book?.prices ?? [], useCatalogStore.getState().snapshot),
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
            value={settings?.processingEnds || ''}
            className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
            <option value="" disabled>
              待确认
            </option>
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

      {/* 共享材料价格库维护区域（收纳于底部辅助折叠栏中） */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-medium text-slate-700">
            <Settings2 size={14} className="text-slate-500" />
            <span>共享材料价格库</span>
            <span className="text-slate-400 font-normal">
              ({loading && !book ? '正在读取…' : `${prices.length} 条有效价格`})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="导出价格库 Excel 或下载模板"
              disabled={busy}
              onClick={() => void exportPrices()}
              className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40"
            >
              <Download size={13} />
              <span>下载模板</span>
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              title="导入共享价格 Excel"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40"
            >
              <Upload size={13} />
              <span>导入价格</span>
            </button>
            <button
              type="button"
              onClick={() => setShowPriceDbSection((prev) => !prev)}
              className="text-slate-400 hover:text-slate-600 p-0.5 ml-1"
              aria-label="展开价格库详情"
            >
              {showPriceDbSection ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {/* 来源元数据信息 */}
        {book && (
          <div className="mt-1 text-[11px] text-slate-400 truncate">
            来源：{book.sourceName} · 同步时间：{new Date(book.importedAt).toLocaleString()}
          </div>
        )}

        <input
          ref={input}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setMessage('');
            setPending(null);
            setReading(true);
            try {
              if (file.size > 5 * 1024 * 1024) throw new Error('价格文件不能超过 5 MB');
              const data = await file.arrayBuffer();
              const currentConfig = useHarnessStore.getState().config;
              const currentCatalog = useCatalogStore.getState().snapshot;
              await load();
              const latest = usePriceStore.getState();
              if (latest.error) throw new Error(latest.error);
              const candidates = getPriceImportCandidates(currentConfig, currentCatalog);
              const stored = (latest.book?.prices ?? []).map((row) => ({ ...row, quantity: 1 }));
              setPending({
                name: file.name,
                prices: parsePriceWorkbook(data, [...candidates, ...stored]),
              });
              setShowPriceDbSection(true);
            } catch (cause) {
              setMessage(cause instanceof Error ? cause.message : '读取价格文件失败');
            } finally {
              setReading(false);
            }
          }}
        />

        {reading && <p role="status" className="mt-2 text-xs text-blue-600">正在读取价格文件…</p>}

        {/* 导入预览与合并确认 */}
        {pending && (
          <div className="mt-2.5 space-y-2 border-t border-slate-200 pt-2 text-xs">
            <p className="font-medium text-slate-800">
              {pending.name}：共 {pending.prices.length} 条，其中{' '}
              {
                pending.prices.filter((row) =>
                  prices.some((existing) => materialPriceKey(existing) === materialPriceKey(row)),
                ).length
              }{' '}
              条更新
            </p>
            <div className="max-h-36 overflow-auto space-y-1 rounded bg-white p-2 border border-slate-200">
              {pending.prices.map((row) => (
                <div className="break-all text-[11px]" key={materialPriceKey(row)}>
                  {row.name} {formatMaterialSpecification(row)}：¥{row.taxIncludedPrice} /{row.unit}
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-40"
                onClick={async () => {
                  try {
                    await merge(pending.prices, pending.name);
                    setPending(null);
                    setMessage('价格已成功保存至共享价格库');
                  } catch {
                    /* error in store */
                  }
                }}
              >
                <Check size={13} />
                确认合并价格
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                onClick={() => setPending(null)}
              >
                取消
              </button>
            </div>
          </div>
        )}

        {(error || message) && (
          <p
            role="status"
            className={`mt-2 text-xs ${error ? 'text-red-600' : 'text-emerald-700'}`}
          >
            {error || message}
          </p>
        )}
      </div>
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

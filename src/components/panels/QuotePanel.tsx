import { useEffect } from 'react';
import { Calculator, X } from 'lucide-react';
import { useHarnessStore } from '@/stores/harnessStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useServerQuote } from '@/lib/useServerQuote';
import { AutoQuotePriceCard } from '@/components/autoQuote/AutoQuotePriceCard';
import type { AutoQuoteEvaluation } from '@/lib/autoQuote';

export function QuoteContent() {
  const config = useHarnessStore(s => s.config);
  const setConfig = useHarnessStore(s => s.setConfig);
  const catalog = useCatalogStore(s => s.snapshot);
  const ends = config.connectors.length === 1 ? 1 : config.connectors.length === 2 ? 2 : undefined;
  const effectiveConfig = ends ? { ...config, quotation: { processingEnds: ends as 1 | 2, srPoints: Math.min(config.quotation?.srPoints ?? 0, ends) } } : config;
  const quote = useServerQuote(effectiveConfig);
  const evaluation: AutoQuoteEvaluation = {
    config: effectiveConfig, status: quote.error ? 'error' : quote.loading ? 'loading' : quote.result?.status ?? 'incomplete',
    issues: quote.error ? [quote.error] : quote.result && quote.result.status !== 'ready' ? quote.result.issues : [],
    ...(quote.result?.status === 'ready' ? { price: quote.result.price, calculatedAt: quote.result.calculatedAt, settingsVersion: quote.result.settingsVersion, previousUnitPrice: quote.previousUnitPrice } : {}),
  };
  return <div className="space-y-4">
    <label className="block text-sm">订单数量
      <input aria-label="订单数量" type="number" min={1} max={1000000} value={config.quantity}
        onChange={e => setConfig({ quantity: Number(e.target.value) })} className="ml-2 rounded border p-1" />
    </label>
    <p className="text-sm">加工端数：{ends ?? '请配置单头或双头连接器'}</p>
    {ends && <label className="block text-sm">SR 点数
      <input aria-label="SR 点数" type="number" min={0} max={ends} value={effectiveConfig.quotation?.srPoints ?? 0}
        onChange={e => setConfig({ quotation: { processingEnds: ends, srPoints: Number(e.target.value) } })} className="ml-2 rounded border p-1" />
    </label>}
    <AutoQuotePriceCard evaluation={evaluation} catalog={catalog} loading={quote.loading} onRetry={quote.retry} />
  </div>;
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
        className="relative flex max-h-[92vh] min-h-[460px] sm:min-h-[520px] w-full max-w-xl flex-col rounded-xl bg-white shadow-2xl overflow-hidden border border-slate-200"
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
              <p className="text-[11px] text-slate-500 font-normal">基于物料与工艺配置的服务端报价</p>
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

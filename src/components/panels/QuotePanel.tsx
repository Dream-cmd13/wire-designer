import { useEffect, useRef, useState } from 'react';
import { Calculator, Download, Upload, X, Check } from 'lucide-react';
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
  return <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm"><span className="min-w-0 max-w-full break-words">{name}</span><span className="break-all tabular-nums">¥{formatQuoteMoney(amount)}</span></div>;
}
function Lines({ lines }: { lines: QuoteLine[] }) {
  return <div className="space-y-2">{lines.map((line, index) => <div key={index}>
    <AmountRow name={line.name} amount={line.amount} />
    <div className="text-xs text-slate-500 break-all">{line.points} × ¥{line.unitPrice}</div>
  </div>)}</div>;
}

export function QuotePanel() {
  const { config, setConfig } = useHarnessStore();
  const catalog = useCatalogStore((state) => state.snapshot);
  const { book, loading, error, load, merge } = usePriceStore();
  const [pending, setPending] = useState<{ name: string; prices: MaterialPrice[] } | null>(null);
  const [message, setMessage] = useState('');
  const [reading, setReading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const reload = () => { void load(); };
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [load]);
  const prices = book?.prices || [];
  const result = calculatePrice(config, prices, catalog);
  const price = !loading && !error && result.status === 'ready' ? result.price : null;
  const settings = config.quotation;
  const busy = loading || reading;
  const exportPrices = async () => {
    setMessage('');
    await load();
    const latest = usePriceStore.getState();
    if (latest.error) return;
    try {
      const shared = latest.book?.prices ?? [];
      const candidates = getPriceImportCandidates(useHarnessStore.getState().config, useCatalogStore.getState().snapshot);
      const rows = shared.length ? shared.map((row) => ({ ...row, quantity: 1 }))
        : [...new Map(candidates.map((row) => [materialPriceKey(row), row])).values()];
      if (!rows.length) throw new Error('目录尚未加载，暂时无法生成价格模板');
      XLSX.writeFile(createPriceTemplate(rows, shared), shared.length ? '共享材料价格.xlsx' : '材料价格模板.xlsx');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : '导出共享价格失败'); }
  };
  const exportQuote = async () => {
    if (!price) return;
    await load();
    const latest = usePriceStore.getState();
    if (latest.error) return;
    try {
      const current = useHarnessStore.getState().config;
      XLSX.writeFile(createQuoteWorkbook(current, latest.book?.prices ?? [], useCatalogStore.getState().snapshot), `${safeFilename(current.name)}_成本分析.xlsx`);
    }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '导出报价失败'); }
  };
  return <div className="space-y-4 p-4 min-w-0">
    <div className="flex items-center gap-2 font-semibold text-slate-800"><Calculator className="h-5 w-5" /><h2>M8 / M12 报价</h2></div>
    <section className="space-y-2 border-b border-slate-200 pb-3">
      <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium">共享材料价格</h3>
        <div className="flex gap-1">
          <button title="导出共享价格（空库下载模板）" aria-label="导出共享价格（空库下载模板）" disabled={busy}
            className="p-2 hover:bg-slate-100 disabled:opacity-40" onClick={() => void exportPrices()}><Download size={16} /></button>
          <button title="导入共享价格 Excel" aria-label="导入共享价格 Excel" disabled={busy} className="p-2 hover:bg-slate-100 disabled:opacity-40" onClick={() => input.current?.click()}><Upload size={16} /></button>
        </div>
      </div>
      <div className="text-xs text-slate-500 break-all">{loading ? '正在读取价格…' : book ? `${prices.length} 条价格 · ${book.sourceName} · ${new Date(book.importedAt).toLocaleString()}` : '尚未导入价格'}</div>
      <input ref={input} type="file" accept=".xlsx" className="hidden" onChange={async (event) => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
        setMessage(''); setPending(null); setReading(true);
        try {
          if (file.size > 5 * 1024 * 1024) throw new Error('价格文件不能超过 5 MB');
          const data = await file.arrayBuffer();
          const currentConfig = useHarnessStore.getState().config;
          const currentCatalog = useCatalogStore.getState().snapshot;
          await load();
          const latest = usePriceStore.getState();
          if (latest.error) throw new Error(latest.error);
          const candidates = getPriceImportCandidates(currentConfig, currentCatalog);
          // Include stored specifications so an exported shared price file can be reimported.
          const stored = (latest.book?.prices ?? []).map((row) => ({ ...row, quantity: 1 }));
          setPending({ name: file.name, prices: parsePriceWorkbook(data, [...candidates, ...stored]) });
        } catch (cause) { setMessage(cause instanceof Error ? cause.message : '读取价格文件失败'); }
        finally { setReading(false); }
      }} />
      {reading && <p role="status" className="text-xs">正在读取价格文件…</p>}
      {pending && <div className="space-y-2 border-t pt-2 text-xs">
        <p className="break-all">{pending.name}：{pending.prices.length} 条，其中 {pending.prices.filter((row) => prices.some((existing) => materialPriceKey(existing) === materialPriceKey(row))).length} 条更新</p>
        <div className="max-h-40 overflow-auto space-y-1">{pending.prices.map((row) => <div className="break-all" key={materialPriceKey(row)}>{row.name} {formatMaterialSpecification(row)}：{row.taxIncludedPrice} {row.unit}</div>)}</div>
        <div className="flex gap-2"><button disabled={busy} className="flex items-center gap-1 text-blue-700 disabled:opacity-40" onClick={async () => {
          try { await merge(pending.prices, pending.name); setPending(null); setMessage('价格已保存至数据库，所有登录用户共享'); }
          catch { /* The store exposes the persistence error. */ }
        }}><Check size={14} />确认合并</button><button disabled={busy} title="取消导入" aria-label="取消导入" onClick={() => setPending(null)}><X size={14} /></button></div>
      </div>}
      {(error || message) && <p role="status" className="text-xs text-amber-800 break-words">{error || message}</p>}
    </section>
    <label className="block text-sm">订单数量<input aria-label="订单数量" type="number" min={1} max={1000000} step={1} value={config.quantity}
      onChange={(e) => { const value = Number(e.target.value); if (Number.isSafeInteger(value) && value > 0 && value <= 1000000) setConfig({ quantity: value }); }}
      className="mt-1 w-full rounded border border-slate-300 px-3 py-2" /></label>
    <div className="grid grid-cols-2 gap-3 text-sm">
      <label>加工端数<select aria-label="加工端数" value={settings?.processingEnds || ''} className="mt-1 w-full border rounded p-2" onChange={(event) => {
        const ends = Number(event.target.value) as 1 | 2;
        setConfig({ quotation: { processingEnds: ends, srPoints: Math.min(settings?.srPoints || 0, ends) } });
      }}><option value="" disabled>待确认</option><option value={1}>单头 / 1 端</option><option value={2}>双头 / 2 端</option></select></label>
      <label>SR 点数<select aria-label="SR 点数" disabled={!settings} value={settings?.srPoints || 0} className="mt-1 w-full border rounded p-2" onChange={(event) => {
        if (settings) setConfig({ quotation: { ...settings, srPoints: Number(event.target.value) } });
      }}>{Array.from({ length: (settings?.processingEnds || 2) + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}</select></label>
    </div>
    <div className="text-xs text-slate-500">外模 {config.models.length} 点 · 内模 {config.models.filter((model) => model.includeInnerMold).length} 点 · 内模/SR 材料 ¥0.00</div>
    {result.status !== 'ready' && <div role="status" className="space-y-1 border-l-2 border-amber-500 pl-3 text-sm text-amber-800">{result.issues.map((issue) => <p key={issue}>{issue}</p>)}</div>}
    {price && <>
      <details open className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium mb-2">材料含税成本</summary><Lines lines={price.materials} /><div className="mt-2"><AmountRow name="材料合计" amount={price.materialSubtotal} /></div></details>
      <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium mb-2">加工费 · ¥{formatQuoteMoney(price.laborSubtotal)}</summary><Lines lines={price.labor} /></details>
      <div className="space-y-2 border-t pt-3">
        <AmountRow name="材料损耗 3%" amount={price.materialLoss} /><AmountRow name="加工损耗 5%" amount={price.processingLoss} />
        <AmountRow name="产品含税成本" amount={price.cost} /><AmountRow name="含税售价（毛利 20%）" amount={price.sellingPrice} /><AmountRow name="运费 3%" amount={price.freight} />
      </div>
      <div className="space-y-2 border-t pt-3 font-semibold"><AmountRow name="含税含运费单价" amount={price.unitPrice} /><AmountRow name="订单总价" amount={price.totalPrice} /></div>
    </>}
    <button disabled={!price || busy} onClick={exportQuote} className="flex w-full items-center justify-center gap-2 rounded bg-blue-600 p-3 text-sm text-white disabled:opacity-40"><Download size={16} />导出报价 Excel</button>
  </div>;
}

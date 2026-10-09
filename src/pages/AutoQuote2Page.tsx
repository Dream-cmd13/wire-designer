import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Calculator, RotateCcw, Search } from 'lucide-react';
import { ConnectorPickerModal } from '@/components/autoQuote/ConnectorPickerModal';
import { WirePickerModal } from '@/components/autoQuote/WirePickerModal';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePriceStore } from '@/stores/priceStore';
import {
  DEFAULT_AUTO_QUOTE_FORM, evaluateAutoQuote, isSupportedOvermold,
  type AutoQuoteEvaluation, type AutoQuoteFormState,
} from '@/lib/autoQuote';
import { formatQuoteMoney } from '@/lib/pricing';

const initialForm: AutoQuoteFormState = { ...DEFAULT_AUTO_QUOTE_FORM, lengthMm: 0, quantity: 1 };
const inputClass = 'mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400';

function FormSection({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 border-b border-slate-100 px-5 py-6 sm:px-8">
      <legend className="sr-only">{title}</legend>
      <div className="mb-5 flex items-center gap-3" aria-hidden="true">
        <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{number}</span>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

// The price-only view deliberately receives no detail/export controls.
export function AutoQuote2Result({ evaluation }: { evaluation: AutoQuoteEvaluation | null }) {
  if (!evaluation) {
    return <p className="text-sm text-slate-500">填写信息后获取报价；修改参数后需重新获取。</p>;
  }
  if (evaluation.status !== 'ready' || !evaluation.price) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">{evaluation.status === 'manual' ? '需要人工核价' : '暂未生成报价'}</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          {evaluation.issues.map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
      </div>
    );
  }
  return (
    <dl className="grid gap-5 rounded-lg bg-slate-900 p-6 text-white sm:grid-cols-2">
      <div>
        <dt className="text-sm text-slate-300">含税含运费单价（元/条）</dt>
        <dd className="mt-2 break-all text-3xl font-semibold tabular-nums">¥{formatQuoteMoney(evaluation.price.unitPrice)}</dd>
      </div>
      <div>
        <dt className="text-sm text-slate-300">订单总价（元）</dt>
        <dd className="mt-2 break-all text-3xl font-semibold tabular-nums text-blue-200">¥{formatQuoteMoney(evaluation.price.totalPrice)}</dd>
      </div>
    </dl>
  );
}

export function AutoQuote2Page() {
  const { snapshot: catalog, status, refreshing: catalogRefreshing, error: catalogError, initialize, reload } = useCatalogStore();
  const { book, loading, refreshing: priceRefreshing, error: priceError, load } = usePriceStore();
  const [form, setForm] = useState<AutoQuoteFormState>(initialForm);
  const [submitted, setSubmitted] = useState(false);
  const [picker, setPicker] = useState<'a' | 'b' | 'wire' | null>(null);

  useEffect(() => {
    void initialize().catch(() => undefined);
    void load().catch(() => undefined);
  }, [initialize, load]);

  const busy = status === 'idle' || status === 'loading' || catalogRefreshing || loading || priceRefreshing;
  const error = catalogError || priceError || (status === 'error' ? '物料目录加载失败，请重试。' : null);
  const available = status === 'ready' && catalog !== null && !busy && !error;
  const evaluation = submitted && available ? evaluateAutoQuote(form, book?.prices ?? [], catalog) : null;
  const connA = catalog?.connectors.find((item) => item.id === form.connectorAId);
  const connB = catalog?.connectors.find((item) => item.id === form.connectorBId);
  const wire = catalog?.wires.find((item) => item.resourceItemId === form.wireResourceId);
  const molds = catalog?.overmolds.filter(isSupportedOvermold) ?? [];
  const connectors = catalog?.connectors ?? [];

  function update(patch: Partial<AutoQuoteFormState>) {
    setForm((current) => ({ ...current, ...patch }));
    setSubmitted(false);
  }

  function reset() {
    setForm({ ...initialForm });
    setSubmitted(false);
    setPicker(null);
  }

  function retry() {
    setSubmitted(false);
    void Promise.allSettled([reload(), load({ forceRefresh: true })]);
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-7">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-blue-700"><Calculator size={18} /> 线束快速询价</div>
          <h1 className="text-2xl font-bold text-slate-900">自动报价2</h1>
        </header>

        {busy && <p role="status" className="mb-4 text-sm text-slate-600">正在加载物料和价格…</p>}
        {error && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <span>{error}</span>
            <button type="button" disabled={busy} onClick={retry} className="rounded border border-red-300 px-3 py-1.5 font-medium disabled:opacity-50">重新加载</button>
          </div>
        )}
        {available && (connectors.length === 0 || !catalog.wires.length) && (
          <p role="status" className="mb-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">目录缺少连接器或线材，请先维护物料后重新加载。</p>
        )}

        <form className="overflow-hidden rounded-lg border border-slate-200 bg-white" onSubmit={(event) => {
          event.preventDefault();
          if (available) setSubmitted(true);
        }}>
          <FormSection number="01" title="连接方式">
            <div>
              <label htmlFor="quote2-connector-a" className="text-sm font-medium text-slate-700">A 端连接器</label>
              <button id="quote2-connector-a" type="button" disabled={!available} onClick={() => setPicker('a')} className={`${inputClass} flex items-center justify-between gap-2 text-left`}>
                <span className="min-w-0 break-words">{connA ? `${connA.model || connA.name} · ${connA.pinCount}Pin` : '请选择 A 端料号'}</span><Search size={16} className="shrink-0 text-slate-400" />
              </button>
            </div>
            <label className="text-sm font-medium text-slate-700">B 端形式
              <select className={inputClass} value={form.endpointBType} onChange={(e) => update({ endpointBType: e.target.value as AutoQuoteFormState['endpointBType'], outerMoldEnds: e.target.value === 'connector' ? 2 : 1 })}>
                <option value="connector">连接器</option><option value="cut">切断</option><option value="strip-tin" disabled>剥皮沾锡（待支持）</option>
              </select>
            </label>
            {form.endpointBType === 'connector' && (
              <div className="sm:col-span-2">
                <label htmlFor="quote2-connector-b" className="text-sm font-medium text-slate-700">B 端连接器</label>
                <button id="quote2-connector-b" type="button" disabled={!available} onClick={() => setPicker('b')} className={`${inputClass} flex items-center justify-between gap-2 text-left`}>
                  <span className="min-w-0 break-words">{connB ? `${connB.model || connB.name} · ${connB.pinCount}Pin` : '请选择 B 端料号'}</span><Search size={16} className="shrink-0 text-slate-400" />
                </button>
              </div>
            )}
          </FormSection>

          <FormSection number="02" title="线材与模具">
            <div className="sm:col-span-2">
              <label htmlFor="quote2-wire" className="text-sm font-medium text-slate-700">线材</label>
              <button id="quote2-wire" type="button" disabled={!available} onClick={() => setPicker('wire')} className={`${inputClass} flex items-center justify-between gap-2 text-left`}>
                <span className="min-w-0 break-words">{wire?.name || '请选择线材料号'}</span><Search size={16} className="shrink-0 text-slate-400" />
              </button>
            </div>
            <label className="text-sm font-medium text-slate-700">外模
              <select className={inputClass} value={form.outerMoldType} onChange={(e) => update({ outerMoldType: e.target.value as AutoQuoteFormState['outerMoldType'], outerMoldSpecId: '' })}>
                <option value="pvc-45p">黑色 PVC 45P</option><option value="none">无外模</option><option value="tpe" disabled>TPE（待支持）</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">内模
              <select className={inputClass} value={form.innerMoldType} onChange={(e) => update({ innerMoldType: e.target.value as AutoQuoteFormState['innerMoldType'] })}>
                <option value="none">无内模</option><option value="pe" disabled>PE（待支持）</option>
              </select>
            </label>
            {form.outerMoldType === 'pvc-45p' && <>
              <label className="text-sm font-medium text-slate-700">外模规格
                <select className={inputClass} value={form.outerMoldSpecId} required disabled={!available} onChange={(e) => update({ outerMoldSpecId: e.target.value })}>
                  <option value="">{available && !molds.length ? '暂无适用外模，请先维护' : '请选择外模规格'}</option>
                  {molds.map((mold) => <option key={mold.id} value={mold.id}>{mold.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">外模位置
                <select className={inputClass} value={form.outerMoldEnds} onChange={(e) => update({ outerMoldEnds: Number(e.target.value) as 1 | 2 })}>
                  <option value={1}>A 端</option>{form.endpointBType === 'connector' && <option value={2}>A、B 两端</option>}
                </select>
              </label>
            </>}
          </FormSection>

          <FormSection number="03" title="长度与数量">
            <label className="text-sm font-medium text-slate-700">报价线长（mm）
              <input className={inputClass} type="number" min={1} step={1} required placeholder="请输入长度" value={form.lengthMm || ''} onChange={(e) => update({ lengthMm: Number(e.target.value) })} />
              <span className="mt-2 block text-xs font-normal text-slate-500">超过 5000 mm 需人工核价。</span>
            </label>
            <label className="text-sm font-medium text-slate-700">订单数量（条）
              <input className={inputClass} type="number" min={1} max={1000000} step={1} required value={form.quantity || ''} onChange={(e) => update({ quantity: Number(e.target.value) })} />
            </label>
          </FormSection>

          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 px-5 py-5 sm:px-8">
            <button type="button" onClick={reset} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-200"><RotateCcw size={15} />重新填写</button>
            <button type="submit" disabled={!available} className="flex items-center gap-3 rounded-lg bg-blue-600 px-7 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50">获取报价<ArrowRight size={16} /></button>
          </div>
        </form>

        <section aria-label="报价结果" aria-live="polite" className="mt-6 border-t border-slate-200 py-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">报价结果</h2>
          {busy || error ? <p className="text-sm text-slate-500">物料和价格加载成功后可获取报价。</p> : <AutoQuote2Result evaluation={evaluation} />}
        </section>
      </div>

      {picker === 'a' || picker === 'b' ? <ConnectorPickerModal
        key={picker} isOpen title={picker === 'a' ? '选择 A 端连接器' : '选择 B 端连接器'} connectors={connectors}
        selectedId={picker === 'a' ? form.connectorAId : form.connectorBId}
        onSelect={(connector) => { update(picker === 'a' ? { connectorAId: connector.id } : { connectorBId: connector.id }); setPicker(null); }}
        onClose={() => setPicker(null)}
      /> : null}
      {picker === 'wire' && <WirePickerModal isOpen wires={catalog?.wires ?? []} selectedResourceId={form.wireResourceId}
        onSelect={(selected) => { update({ wireResourceId: selected.resourceItemId }); setPicker(null); }} onClose={() => setPicker(null)} />}
    </div>
  );
}

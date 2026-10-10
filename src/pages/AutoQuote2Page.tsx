import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, Calculator, Check, Copy, RotateCcw, Search } from 'lucide-react';
import { ConnectorPickerModal } from '@/components/autoQuote/ConnectorPickerModal';
import { WirePickerModal } from '@/components/autoQuote/WirePickerModal';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePriceStore } from '@/stores/priceStore';
import {
  DEFAULT_AUTO_QUOTE_FORM, buildQuoteSummaryText, evaluateAutoQuote, isSupportedOvermold,
  type AutoQuoteEvaluation, type AutoQuoteFormState,
} from '@/lib/autoQuote';
import { formatQuoteMoney } from '@/lib/pricing';

const initialForm: AutoQuoteFormState = { ...DEFAULT_AUTO_QUOTE_FORM, lengthMm: 0, quantity: 0 };

const QUICK_LENGTHS = [500, 1000, 1500, 2000, 3000, 5000];
const QUICK_QUANTITIES = [50, 100, 200, 500, 1000, 2000, 5000];

const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400 transition';

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback to document.execCommand below
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const success = Boolean(document.execCommand('copy'));
      document.body.removeChild(textarea);
      return success;
    } catch {
      return false;
    }
  }
  return false;
}

function FormSection({
  number,
  title,
  children,
  gridCols = 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  className = '',
}: {
  number: string;
  title: string;
  children: ReactNode;
  gridCols?: string;
  className?: string;
}) {
  return (
    <fieldset className={`min-w-0 p-4 sm:p-5 ${className}`}>
      <legend className="sr-only">{title}</legend>
      <div className="mb-2.5 flex items-center gap-2" aria-hidden="true">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-50 text-[11px] font-bold text-blue-700">{number}</span>
        <h2 className="text-xs sm:text-sm font-bold text-slate-900 tracking-wide">{title}</h2>
      </div>
      <div className={`grid gap-3.5 ${gridCols} items-end`}>{children}</div>
    </fieldset>
  );
}

// The price-only view deliberately receives no detail/export controls.
export function AutoQuote2Result({
  evaluation,
  isLive = false,
}: {
  evaluation: AutoQuoteEvaluation | null;
  isLive?: boolean;
}) {
  if (!evaluation) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-6 py-4 text-slate-500">
        <div className="flex items-center gap-2.5">
          <Calculator className="h-5 w-5 text-slate-400" />
          <p className="text-sm font-medium">填写信息后获取报价；修改参数后需重新获取。</p>
        </div>
        <span className="text-xs text-slate-400">选齐物料并输入线长后系统自动实时更新报价</span>
      </div>
    );
  }
  if (evaluation.status !== 'ready' || !evaluation.price) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-900 shadow-xs">
        <p className="font-semibold">{evaluation.status === 'manual' ? '需要人工核价' : '暂未生成报价'}</p>
        <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs">
          {evaluation.issues.map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
      </div>
    );
  }
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 rounded-xl border border-slate-200/90 bg-slate-50/90 px-6 py-4 shadow-2xs">
      <div>
        <dt className="text-xs text-slate-500 font-medium flex items-center gap-2">
          <span>含税含运费单价（元/条）</span>
          {isLive && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-medium border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              实时随动
            </span>
          )}
        </dt>
        <dd className="mt-1 break-all text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-slate-900">
          ¥{formatQuoteMoney(evaluation.price.unitPrice)}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500 font-medium">订单总价（元）</dt>
        <dd className="mt-1 break-all text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-blue-600">
          ¥{formatQuoteMoney(evaluation.price.totalPrice)}
        </dd>
      </div>
      <div className="hidden lg:flex flex-col justify-center border-l border-slate-200 pl-4">
        <dt className="text-xs text-slate-500 font-medium">发票及开票税率</dt>
        <dd className="mt-1 text-xs text-slate-700 font-medium">包含 13% 增值税专用发票</dd>
      </div>
      <div className="hidden lg:flex flex-col justify-center border-l border-slate-200 pl-4">
        <dt className="text-xs text-slate-500 font-medium">运输与送达条款</dt>
        <dd className="mt-1 text-xs text-slate-700 font-medium">包含国内指定地点标准运费</dd>
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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void initialize().catch(() => undefined);
    void load().catch(() => undefined);
  }, [initialize, load]);

  const busy = status === 'idle' || status === 'loading' || catalogRefreshing || loading || priceRefreshing;
  const error = catalogError || priceError || (status === 'error' ? '物料目录加载失败，请重试。' : null);
  const available = status === 'ready' && catalog !== null && !busy && !error;

  const molds = useMemo(() => catalog?.overmolds.filter(isSupportedOvermold) ?? [], [catalog]);
  const defaultMoldSpecId = molds[0]?.id ?? '';
  const effectiveOuterMoldSpecId =
    form.outerMoldType === 'pvc-45p' && molds.length > 0
      ? (form.outerMoldSpecId && molds.some((m) => m.id === form.outerMoldSpecId) ? form.outerMoldSpecId : defaultMoldSpecId)
      : form.outerMoldSpecId;

  const effectiveForm = useMemo((): AutoQuoteFormState => {
    return {
      ...form,
      outerMoldSpecId: effectiveOuterMoldSpecId,
    };
  }, [form, effectiveOuterMoldSpecId]);

  // 当必填条件完整时自动触发实时核算，无需强制手动点击获取
  const canAutoQuote = Boolean(
    effectiveForm.connectorAId &&
    effectiveForm.wireResourceId &&
    effectiveForm.lengthMm > 0 &&
    effectiveForm.quantity > 0 &&
    (effectiveForm.endpointBType !== 'connector' || effectiveForm.connectorBId) &&
    (effectiveForm.outerMoldType !== 'pvc-45p' || effectiveForm.outerMoldSpecId)
  );

  const shouldEvaluate = (submitted || canAutoQuote) && available;
  const evaluation = shouldEvaluate ? evaluateAutoQuote(effectiveForm, book?.prices ?? [], catalog) : null;
  const connA = catalog?.connectors.find((item) => item.id === effectiveForm.connectorAId);
  const connB = catalog?.connectors.find((item) => item.id === effectiveForm.connectorBId);
  const wire = catalog?.wires.find((item) => item.resourceItemId === effectiveForm.wireResourceId);
  const effectiveMold = molds.find((item) => item.id === effectiveForm.outerMoldSpecId);
  const connectors = catalog?.connectors ?? [];

  function update(patch: Partial<AutoQuoteFormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function reset() {
    setForm({ ...initialForm });
    setSubmitted(false);
    setPicker(null);
    setCopied(false);
  }

  function retry() {
    setSubmitted(false);
    void Promise.allSettled([reload(), load({ forceRefresh: true })]);
  }

  const handleCopy = async () => {
    if (!evaluation || evaluation.status !== 'ready' || !evaluation.price) return;
    const summaryText = buildQuoteSummaryText(
      effectiveForm,
      evaluation,
      connA,
      connB,
      wire,
      effectiveMold?.name,
    );
    const ok = await copyToClipboard(summaryText);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="h-full flex flex-col justify-center overflow-y-auto lg:overflow-hidden bg-slate-100/70 p-3 sm:p-5 lg:p-6">
      <div className="mx-auto w-full max-w-5xl xl:max-w-6xl flex flex-col gap-3.5 my-auto">
        <h1 className="sr-only">自动报价2</h1>

        {/* 状态通知栏（仅在加载/出错/缺少物料时显示） */}
        {(busy || error || (available && (connectors.length === 0 || !catalog.wires.length))) && (
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600 text-white">
                <Calculator size={14} />
              </span>
              <span className="font-semibold text-slate-800">自动报价2</span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              {busy && <span role="status" className="text-slate-500 font-medium">正在加载物料和价格…</span>}
              {error && (
                <div role="alert" className="flex items-center gap-2 text-red-600 bg-red-50 px-2.5 py-0.5 rounded border border-red-200">
                  <span>{error}</span>
                  <button type="button" disabled={busy} onClick={retry} className="font-semibold underline">重新加载</button>
                </div>
              )}
              {available && (connectors.length === 0 || !catalog.wires.length) && (
                <span role="status" className="text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded border border-amber-200">
                  目录缺少连接器或线材，请先维护物料后重新加载。
                </span>
              )}
            </div>
          </header>
        )}

        {/* 纯纵向表单与结果 */}
        <form
          className="flex flex-col gap-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (available) setSubmitted(true);
          }}
        >
          {/* 一体化工作台输入面板 */}
          <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs divide-y divide-slate-100 overflow-hidden">
            {/* 01 连接方式 */}
            <FormSection number="01" title="连接方式" gridCols="sm:grid-cols-12">
              <div className="sm:col-span-5">
                <label htmlFor="quote2-connector-a" className="text-xs font-semibold text-slate-700">A 端连接器</label>
                <button
                  id="quote2-connector-a"
                  type="button"
                  disabled={!available}
                  onClick={() => setPicker('a')}
                  className={`${inputClass} flex items-center justify-between gap-2 text-left`}
                >
                  <span className="truncate">{connA ? `${connA.model || connA.name} · ${connA.pinCount}Pin` : '请选择 A 端料号'}</span>
                  <Search size={14} className="shrink-0 text-slate-400" />
                </button>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700">
                  B 端形式
                  <select
                    className={inputClass}
                    value={form.endpointBType}
                    onChange={(e) => update({ endpointBType: e.target.value as AutoQuoteFormState['endpointBType'], outerMoldEnds: e.target.value === 'connector' ? 2 : 1 })}
                  >
                    <option value="connector">连接器</option>
                    <option value="cut">切断（平齐）</option>
                    <option value="strip-tin" disabled>剥皮沾锡（待支持）</option>
                  </select>
                </label>
              </div>

              <div className="sm:col-span-5">
                <label htmlFor="quote2-connector-b" className="text-xs font-semibold text-slate-700">B 端连接器</label>
                {form.endpointBType === 'connector' ? (
                  <button
                    id="quote2-connector-b"
                    type="button"
                    disabled={!available}
                    onClick={() => setPicker('b')}
                    className={`${inputClass} flex items-center justify-between gap-2 text-left`}
                  >
                    <span className="truncate">{connB ? `${connB.model || connB.name} · ${connB.pinCount}Pin` : '请选择 B 端料号'}</span>
                    <Search size={14} className="shrink-0 text-slate-400" />
                  </button>
                ) : (
                  <div className={`${inputClass} bg-slate-50 text-slate-400 select-none`}>
                    单端平剪齐头，无 B 端连接器
                  </div>
                )}
              </div>
            </FormSection>

            {/* 02 线材与成型模具 */}
            <FormSection number="02" title="线材与模具" gridCols="sm:grid-cols-12">
              {/* 上行：线材 (8列) 与 外模 (4列) */}
              <div className="sm:col-span-12 lg:col-span-8">
                <label htmlFor="quote2-wire" className="text-xs font-semibold text-slate-700">线材</label>
                <button
                  id="quote2-wire"
                  type="button"
                  disabled={!available}
                  onClick={() => setPicker('wire')}
                  className={`${inputClass} flex items-center justify-between gap-2 text-left`}
                >
                  <span className="truncate font-medium">{wire?.name || '请选择线材料号'}</span>
                  <Search size={14} className="shrink-0 text-slate-400" />
                </button>
              </div>

              <div className="sm:col-span-12 lg:col-span-4">
                <label className="text-xs font-semibold text-slate-700">
                  外模
                  <select
                    className={inputClass}
                    value={form.outerMoldType}
                    onChange={(e) => {
                      const nextType = e.target.value as AutoQuoteFormState['outerMoldType'];
                      update({
                        outerMoldType: nextType,
                        outerMoldSpecId: nextType === 'pvc-45p' ? (molds[0]?.id ?? '') : '',
                      });
                    }}
                  >
                    <option value="pvc-45p">黑色 PVC 45P</option>
                    <option value="none">无外模</option>
                    <option value="tpe" disabled>TPE（待支持）</option>
                  </select>
                </label>
              </div>

              {/* 下行：直/弯头 (4列)、外模位置 (4列)、内模 (4列) */}
              {form.outerMoldType === 'pvc-45p' && (
                <>
                  <div className="sm:col-span-6 lg:col-span-4">
                    <label htmlFor="quote2-outer-mold-spec" className="text-xs font-semibold text-slate-700">
                      直/弯头
                      <select
                        id="quote2-outer-mold-spec"
                        className={inputClass}
                        value={effectiveOuterMoldSpecId}
                        required
                        disabled={!available || molds.length === 0}
                        onChange={(e) => update({ outerMoldSpecId: e.target.value })}
                      >
                        {!molds.length && <option value="">暂无适用外模，请先维护</option>}
                        {molds.map((mold) => (
                          <option key={mold.id} value={mold.id}>
                            {mold.outerForm === 'bent' ? '弯头' : (mold.outerForm === 'straight' ? '直头' : mold.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="sm:col-span-6 lg:col-span-4">
                    <label className="text-xs font-semibold text-slate-700">
                      外模位置
                      <select
                        className={inputClass}
                        value={form.outerMoldEnds}
                        onChange={(e) => update({ outerMoldEnds: Number(e.target.value) as 1 | 2 })}
                      >
                        <option value={1}>A 端单头成型</option>
                        {form.endpointBType === 'connector' && <option value={2}>A、B 两端成型</option>}
                      </select>
                    </label>
                  </div>
                </>
              )}

              <div className="sm:col-span-12 lg:col-span-4">
                <label className="text-xs font-semibold text-slate-700">
                  内模
                  <select
                    className={inputClass}
                    value={form.innerMoldType}
                    onChange={(e) => update({ innerMoldType: e.target.value as AutoQuoteFormState['innerMoldType'] })}
                  >
                    <option value="none">无内模</option>
                    <option value="pe">PE 内模</option>
                  </select>
                </label>
              </div>
            </FormSection>

            {/* 03 长度与数量 */}
            <FormSection number="03" title="长度与数量" gridCols="sm:grid-cols-2" className="bg-slate-50/40">
              {/* 长度 */}
              <div>
                <div className="flex items-baseline gap-2 text-xs font-semibold text-slate-700 mb-1.5">
                  <label htmlFor="quote2-length">线材长度（mm）</label>
                  <span className="text-[11px] text-slate-400 font-normal">（超过 5000 mm 需人工核价）</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                  <div className="flex items-center gap-1.5 w-40 sm:w-44 shrink-0">
                    <input
                      id="quote2-length"
                      className={`${inputClass} mt-0 font-mono font-bold text-slate-800`}
                      type="number"
                      min={1}
                      step={1}
                      required
                      placeholder="请输入长度"
                      value={form.lengthMm || ''}
                      onChange={(e) => update({ lengthMm: Number(e.target.value) })}
                    />
                    <span className="text-xs text-slate-500 shrink-0 font-medium">mm</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[11px] text-slate-400 mr-0.5">快捷:</span>
                    {QUICK_LENGTHS.map((len) => (
                      <button
                        key={len}
                        type="button"
                        onClick={() => update({ lengthMm: len })}
                        className={`rounded px-2 py-0.5 text-[11px] font-mono transition cursor-pointer ${
                          form.lengthMm === len
                            ? 'bg-blue-600 text-white font-bold'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {len}mm
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 数量 */}
              <div>
                <div className="flex items-baseline gap-2 text-xs font-semibold text-slate-700 mb-1.5">
                  <label htmlFor="quote2-quantity">订单数量（条）</label>
                  <span className="text-[11px] text-slate-400 font-normal">（支持 1 至 1,000,000 条）</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                  <div className="flex items-center gap-1.5 w-40 sm:w-44 shrink-0">
                    <input
                      id="quote2-quantity"
                      className={`${inputClass} mt-0 font-mono font-bold text-slate-800`}
                      type="number"
                      min={1}
                      max={1000000}
                      step={1}
                      required
                      placeholder="请输入数量"
                      value={form.quantity || ''}
                      onChange={(e) => update({ quantity: Number(e.target.value) })}
                    />
                    <span className="text-xs text-slate-500 shrink-0 font-medium">条</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[11px] text-slate-400 mr-0.5">快捷:</span>
                    {QUICK_QUANTITIES.map((qty) => (
                      <button
                        key={qty}
                        type="button"
                        onClick={() => update({ quantity: qty })}
                        className={`rounded px-2 py-0.5 text-[11px] font-mono transition cursor-pointer ${
                          form.quantity === qty
                            ? 'bg-blue-600 text-white font-bold'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {qty}条
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </FormSection>
          </div>

          {/* 底部行动栏与大字结果看板 */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {evaluation?.status === 'ready' && evaluation.price ? (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 active:scale-[0.99] transition cursor-pointer"
                    title="复制对外报价核算摘要"
                  >
                    {copied ? <Check size={16} className="text-white" /> : <Copy size={16} className="text-white" />}
                    <span>{copied ? '已复制报价摘要' : '一键复制报价摘要'}</span>
                  </button>
                ) : null}

                <button
                  type="submit"
                  disabled={!available}
                  className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${
                    evaluation?.status === 'ready' && evaluation.price
                      ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      : 'bg-blue-600 text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 px-7 py-2.5 text-sm font-bold'
                  }`}
                >
                  <span>获取报价</span>
                  {canAutoQuote && (
                    <span className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-normal ${
                      evaluation?.status === 'ready' && evaluation.price
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-blue-500 text-blue-100'
                    }`}>
                      实时随动
                    </span>
                  )}
                  {(!evaluation || evaluation.status !== 'ready' || !evaluation.price) && <ArrowRight size={16} />}
                </button>

                <button
                  type="button"
                  onClick={reset}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  <RotateCcw size={14} />
                  <span>重新填写</span>
                </button>
              </div>
            </div>

            <section aria-label="报价结果" aria-live="polite">
              <h2 className="sr-only">报价结果</h2>
              {busy || error ? (
                <p className="text-xs text-slate-500">物料和价格加载成功后可获取报价。</p>
              ) : (
                <AutoQuote2Result evaluation={evaluation} isLive={canAutoQuote} />
              )}
            </section>
          </div>
        </form>
      </div>

      {/* 弹窗选择器 */}
      {picker === 'a' || picker === 'b' ? (
        <ConnectorPickerModal
          key={picker}
          isOpen
          title={picker === 'a' ? '选择 A 端连接器' : '选择 B 端连接器'}
          connectors={connectors}
          selectedId={picker === 'a' ? form.connectorAId : form.connectorBId}
          onSelect={(connector) => {
            update(picker === 'a' ? { connectorAId: connector.id } : { connectorBId: connector.id });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
      {picker === 'wire' && (
        <WirePickerModal
          isOpen
          wires={catalog?.wires ?? []}
          selectedResourceId={form.wireResourceId}
          onSelect={(selected) => {
            update({ wireResourceId: selected.resourceItemId });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

export default AutoQuote2Page;

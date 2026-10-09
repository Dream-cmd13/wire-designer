import { useEffect, useMemo, useState } from 'react';
import {
  Cable,
  Calculator,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  Ruler,
  Scissors,
  Search,
  Zap,
} from 'lucide-react';
import { AutoQuoteDrawingPreview } from '@/components/autoQuote/AutoQuoteDrawingPreview';
import { AutoQuotePriceCard } from '@/components/autoQuote/AutoQuotePriceCard';
import {
  DEFAULT_AUTO_QUOTE_FORM,
  evaluateAutoQuote,
  isSupportedConnector,
  isSupportedOvermold,
  type AutoQuoteEndpointBType,
  type AutoQuoteEvaluation,
  type AutoQuoteFormState,
  type AutoQuoteInnerMoldType,
  type AutoQuoteOuterMoldType,
} from '@/lib/autoQuote';
import { formatQuoteMoney } from '@/lib/pricing';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePriceStore } from '@/stores/priceStore';
import type { CatalogWire } from '@/types/catalog';
import type { Connector } from '@/types/harness';

type StepId = 'connection' | 'wire' | 'mold' | 'size' | 'result';

const STEPS: Array<{ id: StepId; title: string; hint: string }> = [
  { id: 'connection', title: '连接方式', hint: 'A/B 端与端部工艺' },
  { id: 'wire', title: '线材物料', hint: '选择标准线材' },
  { id: 'mold', title: '成型模具', hint: '外模与内模配置' },
  { id: 'size', title: '长度与数量', hint: '线长与订单量' },
  { id: 'result', title: '报价结果', hint: '成本分析与确认图' },
];

const QUICK_LENGTHS = [500, 1000, 2000, 3000, 5000];
const QUICK_QUANTITIES = [100, 500, 1000, 2000, 5000];
const SUMMARY_ISSUE_LIMIT = 3;

const STATUS_META: Record<AutoQuoteEvaluation['status'], { label: string; dot: string; box: string; title: string }> = {
  ready: { label: '可实时报价', dot: 'bg-emerald-500', box: 'border-emerald-200 bg-emerald-50 text-emerald-800', title: '可实时报价' },
  manual: { label: '需人工核价', dot: 'bg-blue-500', box: 'border-blue-200 bg-blue-50 text-blue-800', title: '需转人工核价' },
  blocked: { label: '缺少价格', dot: 'bg-rose-500', box: 'border-rose-200 bg-rose-50 text-rose-800', title: '报价计算受阻' },
  unsupported: { label: '含待支持项', dot: 'bg-amber-500', box: 'border-amber-200 bg-amber-50 text-amber-800', title: '含待支持选项' },
  incomplete: { label: '待完善', dot: 'bg-slate-400', box: 'border-slate-200 bg-slate-50 text-slate-600', title: '请完善选配输入' },
};

function optionCardClass(active: boolean): string {
  return `cursor-pointer rounded-lg border p-2 text-center text-xs transition ${
    active
      ? 'border-blue-600 bg-blue-50/70 font-semibold text-blue-700'
      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
  }`;
}

function wireSpecSummary(wire: CatalogWire): string {
  const spec = wire.spec;
  if (spec.kind === 'jacketed') {
    const size = spec.awg ? `${spec.awg}AWG` : `${spec.conductorAreaMm2 ?? '-'}mm²`;
    return `${spec.coreCount}芯 · ${size} · ${spec.shielded ? '屏蔽' : '非屏蔽'} · OD${spec.outerDiameterMm ?? '-'}mm`;
  }
  return `电子线 ${spec.awg}AWG · ${spec.color}`;
}

function connectorTypeLabel(connector: Connector): string {
  return connector.type === 'male' ? '公头' : connector.type === 'female' ? '母头' : '插座';
}

function ConnectorGrid({
  connectors,
  selectedId,
  onSelect,
}: {
  connectors: Connector[];
  selectedId: string;
  onSelect: (connector: Connector) => void;
}) {
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return connectors;
    return connectors.filter((connector) => (
      connector.name.toLowerCase().includes(q)
      || (connector.model?.toLowerCase().includes(q) ?? false)
      || (connector.series?.toLowerCase().includes(q) ?? false)
      || (connector.supplierNo?.toLowerCase().includes(q) ?? false)
    ));
  }, [connectors, keyword]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索名称、型号或系列..."
          className="w-full rounded-lg border border-slate-300 py-1.5 pl-8 pr-2.5 text-xs outline-none focus:border-blue-500"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
          没有符合条件且支持在线报价的连接器物料
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((connector) => {
            const selected = connector.id === selectedId;
            return (
              <button
                key={connector.id}
                type="button"
                onClick={() => onSelect(connector)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 text-left transition ${
                  selected
                    ? 'border-blue-600 bg-blue-50/70 shadow-xs'
                    : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                }`}
              >
                {connector.image ? (
                  <img
                    src={connector.image}
                    alt={connector.name}
                    className="h-10 w-10 shrink-0 rounded border border-slate-200 bg-white object-contain p-0.5"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-blue-100 text-[10px] font-bold text-blue-700">
                    {connector.series || 'CONN'}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-800">{connector.name}</span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {connector.model || connector.id} · {connector.pinCount}P · {connectorTypeLabel(connector)}
                  </span>
                </span>
                {selected && (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WireGrid({
  wires,
  selectedResourceId,
  onSelect,
}: {
  wires: CatalogWire[];
  selectedResourceId: string;
  onSelect: (wire: CatalogWire) => void;
}) {
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return wires;
    return wires.filter((wire) => (
      wire.name.toLowerCase().includes(q)
      || (wire.model?.toLowerCase().includes(q) ?? false)
      || wireSpecSummary(wire).toLowerCase().includes(q)
    ));
  }, [wires, keyword]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索线材名称、型号、芯数、AWG 或外被..."
          className="w-full rounded-lg border border-slate-300 py-1.5 pl-8 pr-2.5 text-xs outline-none focus:border-blue-500"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
          没有符合条件的线材物料
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((wire) => {
            const selected = wire.resourceItemId === selectedResourceId;
            return (
              <button
                key={wire.resourceItemId}
                type="button"
                onClick={() => onSelect(wire)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 text-left transition ${
                  selected
                    ? 'border-blue-600 bg-blue-50/70 shadow-xs'
                    : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                }`}
              >
                {wire.image ? (
                  <img
                    src={wire.image}
                    alt={wire.name}
                    className="h-10 w-10 shrink-0 rounded border border-slate-200 bg-white object-contain p-0.5"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-blue-50 text-blue-600">
                    <Cable className="h-5 w-5" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-800">{wire.name}</span>
                  <span className="block truncate text-[11px] text-slate-500">{wireSpecSummary(wire)}</span>
                  {wire.model && (
                    <span className="block truncate font-mono text-[10px] text-slate-400">型号: {wire.model}</span>
                  )}
                </span>
                {selected && (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AutoQuote3Page() {
  const { snapshot: catalog, status: catalogStatus, initialize: initializeCatalog } = useCatalogStore();
  const { book, loading: priceLoading, load: loadPrices } = usePriceStore();

  const [form, setForm] = useState<AutoQuoteFormState>(DEFAULT_AUTO_QUOTE_FORM);
  const [step, setStep] = useState<StepId>('connection');

  useEffect(() => {
    if (catalogStatus === 'idle') {
      void initializeCatalog().catch(() => undefined);
    }
    void loadPrices().catch(() => undefined);
  }, [catalogStatus, initializeCatalog, loadPrices]);

  const supportedConnectors = useMemo(
    () => catalog?.connectors.filter(isSupportedConnector) || [],
    [catalog],
  );
  const supportedOvermolds = useMemo(
    () => catalog?.overmolds.filter(isSupportedOvermold) || [],
    [catalog],
  );

  const defaultConnA = supportedConnectors[0];
  const defaultConnB = supportedConnectors[1] || defaultConnA;
  const defaultWire = catalog?.wires[0];
  const defaultMold = supportedOvermolds[0];

  // 通过渲染期派生状态自动填充默认选配物料，严禁在 useEffect 中触发 setState 引起级联重渲染
  const effectiveForm = useMemo(() => ({
    ...form,
    connectorAId: form.connectorAId || defaultConnA?.id || '',
    connectorBId: form.connectorBId || defaultConnB?.id || '',
    wireResourceId: form.wireResourceId || defaultWire?.resourceItemId || '',
    outerMoldSpecId: form.outerMoldSpecId || defaultMold?.id || '',
  }), [form, defaultConnA, defaultConnB, defaultWire, defaultMold]);

  const prices = useMemo(() => book?.prices || [], [book]);
  const evaluation = useMemo(
    () => evaluateAutoQuote(effectiveForm, prices, catalog),
    [effectiveForm, prices, catalog],
  );

  const connA = useMemo(
    () => catalog?.connectors.find((item) => item.id === effectiveForm.connectorAId),
    [catalog, effectiveForm.connectorAId],
  );
  const connB = useMemo(
    () => catalog?.connectors.find((item) => item.id === effectiveForm.connectorBId),
    [catalog, effectiveForm.connectorBId],
  );
  const selectedWire = useMemo(
    () => catalog?.wires.find((item) => item.resourceItemId === effectiveForm.wireResourceId),
    [catalog, effectiveForm.wireResourceId],
  );
  const selectedMold = useMemo(
    () => catalog?.overmolds.find((item) => item.id === effectiveForm.outerMoldSpecId),
    [catalog, effectiveForm.outerMoldSpecId],
  );

  const stepIndex = STEPS.findIndex((item) => item.id === step);
  const currentStep = STEPS[stepIndex];
  const meta = STATUS_META[evaluation.status];

  const stepComplete: Record<StepId, boolean> = {
    connection: Boolean(effectiveForm.connectorAId)
      && (form.endpointBType !== 'connector' || Boolean(effectiveForm.connectorBId)),
    wire: Boolean(effectiveForm.wireResourceId),
    mold: form.outerMoldType !== 'pvc-45p' || Boolean(effectiveForm.outerMoldSpecId),
    size: form.lengthMm > 0 && form.quantity >= 1,
    result: evaluation.status === 'ready',
  };

  const moldEnds = Math.min(effectiveForm.outerMoldEnds, form.endpointBType === 'connector' ? 2 : 1);
  const bSummary = form.endpointBType === 'connector'
    ? `连接器 · ${connB?.model || connB?.name || '未选择'}`
    : form.endpointBType === 'cut'
      ? '切断（平齐无加工）'
      : '剥皮沾锡（待支持）';
  const outerMoldSummary = form.outerMoldType === 'none'
    ? '无外模'
    : form.outerMoldType === 'tpe'
      ? 'TPE（待支持）'
      : `${selectedMold?.name || '未选择规格'} · ${moldEnds}端成型`;

  const summaryRows: Array<{ label: string; value: string; step: StepId }> = [
    { label: 'A 端', value: connA ? connA.model || connA.name : '未选择', step: 'connection' },
    { label: 'B 端', value: bSummary, step: 'connection' },
    { label: '线材', value: selectedWire?.name ?? '未选择', step: 'wire' },
    { label: '外模', value: outerMoldSummary, step: 'mold' },
    { label: '内模', value: form.innerMoldType === 'none' ? '无内模' : 'PE 内模（待支持）', step: 'mold' },
    { label: '线长', value: `${effectiveForm.lengthMm} mm`, step: 'size' },
    { label: '数量', value: `${effectiveForm.quantity} 条`, step: 'size' },
  ];

  const handleUpdate = <K extends keyof AutoQuoteFormState>(field: K, value: AutoQuoteFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEndpointBChange = (type: AutoQuoteEndpointBType) => {
    setForm((prev) => ({ ...prev, endpointBType: type, outerMoldEnds: type === 'connector' ? 2 : 1 }));
  };

  const reset = () => {
    setForm(DEFAULT_AUTO_QUOTE_FORM);
    setStep('connection');
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-100">
      {/* 顶部横幅 */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-2 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
              <Calculator className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-sm font-bold leading-none text-slate-900">自动报价3 · 分步向导</h1>
              <p className="mt-0.5 text-[11px] text-slate-500">
                卡片直选、分步确认，右侧摘要与价格实时联动
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
            <span>实时公式引擎就绪</span>
          </div>
        </div>
      </div>

      {/* 横向步骤条 */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 pb-3 pt-2.5 sm:px-6">
        <ol className="flex items-center gap-1">
          {STEPS.map((item, index) => {
            const active = item.id === step;
            const complete = stepComplete[item.id] && !active;
            return (
              <li key={item.id} className={`flex items-center ${index < STEPS.length - 1 ? 'flex-1' : ''}`}>
                <button
                  type="button"
                  onClick={() => setStep(item.id)}
                  className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-slate-50"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                      active
                        ? 'bg-blue-600 text-white shadow-xs'
                        : complete
                          ? 'bg-blue-100 text-blue-700'
                          : 'border border-slate-300 bg-white text-slate-500'
                    }`}
                  >
                    {complete ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  <span className="hidden text-left md:block">
                    <span className={`block text-xs font-semibold ${active ? 'text-blue-700' : 'text-slate-700'}`}>
                      {item.title}
                    </span>
                    <span className="block text-[10px] text-slate-400">{item.hint}</span>
                  </span>
                </button>
                {index < STEPS.length - 1 && (
                  <span className={`mx-1 h-px flex-1 ${stepComplete[item.id] ? 'bg-blue-300' : 'bg-slate-200'}`} />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/* 主工作区：中列步骤内容 + 右列摘要 */}
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-3 sm:p-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="shrink-0 border-b border-slate-100 px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">{currentStep.title}</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">{currentStep.hint}</p>
              </div>
              <span className="text-[11px] text-slate-400">
                第 {stepIndex + 1} / {STEPS.length} 步
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            {!catalog && catalogStatus !== 'error' && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-700">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                <span>正在加载物料目录与价格库...</span>
              </div>
            )}
            {catalogStatus === 'error' && (
              <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                物料目录加载失败，请刷新页面后重试。
              </div>
            )}

            {step === 'connection' && (
              <div className="space-y-5">
                <section className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                      <span className="flex h-4 w-4 items-center justify-center rounded bg-blue-100 text-[10px] font-bold text-blue-700">A</span>
                      A 端连接器
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      仅 M8 / M12 支持在线报价 · 共 {supportedConnectors.length} 个候选
                    </span>
                  </div>
                  <ConnectorGrid
                    connectors={supportedConnectors}
                    selectedId={effectiveForm.connectorAId}
                    onSelect={(connector) => handleUpdate('connectorAId', connector.id)}
                  />
                </section>

                <section className="space-y-2 border-t border-slate-100 pt-4">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <span className="flex h-4 w-4 items-center justify-center rounded bg-purple-100 text-[10px] font-bold text-purple-700">B</span>
                    B 端形式
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { key: 'connector' as const, label: '连接器', note: '双端连接' },
                      { key: 'cut' as const, label: '切断', note: '平齐无加工' },
                      { key: 'strip-tin' as const, label: '剥皮沾锡', note: '待支持' },
                    ]).map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleEndpointBChange(item.key)}
                        className={`relative ${optionCardClass(form.endpointBType === item.key)}`}
                      >
                        {item.key === 'strip-tin' && (
                          <span className="absolute -right-1 -top-1.5 rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-800">
                            待支持
                          </span>
                        )}
                        <span className="block">{item.label}</span>
                        <span className="block text-[10px] font-normal text-slate-400">{item.note}</span>
                      </button>
                    ))}
                  </div>

                  {form.endpointBType === 'connector' && (
                    <div className="space-y-2 pt-1">
                      <h4 className="text-[11px] font-medium text-slate-600">B 端连接器</h4>
                      <ConnectorGrid
                        connectors={supportedConnectors}
                        selectedId={effectiveForm.connectorBId}
                        onSelect={(connector) => handleUpdate('connectorBId', connector.id)}
                      />
                    </div>
                  )}

                  {form.endpointBType === 'cut' && (
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200/60 bg-slate-50 p-2.5 text-[11px] text-slate-500">
                      <Scissors className="h-4 w-4 shrink-0 text-slate-400" />
                      <span>切断端按单端加工计费，不对切断端产生额外焊接或成型费用。</span>
                    </div>
                  )}

                  {form.endpointBType === 'strip-tin' && (
                    <div className="rounded-lg border border-amber-200/80 bg-amber-50 p-2.5 text-[11px] text-amber-800">
                      剥皮沾锡工艺计费待支持，当前不提供正式报价。
                    </div>
                  )}
                </section>
              </div>
            )}

            {step === 'wire' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <Cable className="h-4 w-4 text-blue-600" />
                    线材物料
                  </h3>
                  <span className="text-[11px] text-slate-400">共 {catalog?.wires.length ?? 0} 个候选</span>
                </div>
                <WireGrid
                  wires={catalog?.wires ?? []}
                  selectedResourceId={effectiveForm.wireResourceId}
                  onSelect={(wire) => handleUpdate('wireResourceId', wire.resourceItemId)}
                />
              </div>
            )}

            {step === 'mold' && (
              <div className="space-y-5">
                <section className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <Layers className="h-4 w-4 text-indigo-600" />
                    外模材质
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { key: 'none' as const, label: '无外模', note: '线缆裸露' },
                      { key: 'pvc-45p' as const, label: '黑色 PVC 45P', note: '标准成型' },
                      { key: 'tpe' as const, label: 'TPE', note: '待支持' },
                    ]).map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleUpdate('outerMoldType', item.key as AutoQuoteOuterMoldType)}
                        className={optionCardClass(form.outerMoldType === item.key)}
                      >
                        <span className="block">{item.label}</span>
                        <span className="block text-[10px] font-normal text-slate-400">{item.note}</span>
                      </button>
                    ))}
                  </div>
                </section>

                {form.outerMoldType === 'pvc-45p' && (
                  <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-medium text-slate-600">外模规格型号</span>
                      {supportedOvermolds.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-slate-200 bg-white py-5 text-center text-xs text-slate-400">
                          暂无黑色 PVC 45P 外模，请先维护物料目录
                        </p>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          {supportedOvermolds.map((mold) => {
                            const active = mold.id === effectiveForm.outerMoldSpecId;
                            return (
                              <button
                                key={mold.id}
                                type="button"
                                onClick={() => handleUpdate('outerMoldSpecId', mold.id)}
                                className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border bg-white p-2.5 text-left text-xs transition ${
                                  active
                                    ? 'border-blue-600 bg-blue-50/70 text-blue-700'
                                    : 'border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-slate-50'
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate font-semibold">{mold.name}</span>
                                  <span className="block text-[10px] font-normal text-slate-400">
                                    {mold.outerForm === 'straight' ? '直头' : '弯头'} · {mold.outerMaterial} {mold.outerHardness ?? ''}
                                  </span>
                                </span>
                                {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {form.endpointBType === 'connector' ? (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-medium text-slate-600">外模成型端数</span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleUpdate('outerMoldEnds', 2)}
                            className={optionCardClass(form.outerMoldEnds === 2)}
                          >
                            双端成型（2 个）
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdate('outerMoldEnds', 1)}
                            className={optionCardClass(form.outerMoldEnds === 1)}
                          >
                            仅 A 端成型（1 个）
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500">B 端为切断工艺，按单端（A 端）成型计价。</p>
                    )}
                  </section>
                )}

                <section className="space-y-2 border-t border-slate-100 pt-4">
                  <h3 className="text-xs font-semibold text-slate-800">内模材质</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { key: 'none' as const, label: '无内模', note: '默认不添加' },
                      { key: 'pe' as const, label: 'PE 内模', note: '待支持' },
                    ]).map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleUpdate('innerMoldType', item.key as AutoQuoteInnerMoldType)}
                        className={optionCardClass(form.innerMoldType === item.key)}
                      >
                        <span className="block">{item.label}</span>
                        <span className="block text-[10px] font-normal text-slate-400">{item.note}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {step === 'size' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <label className="block">
                    <span className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                      <Ruler className="h-3.5 w-3.5 text-blue-600" />
                      报价线长（mm）
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={100000}
                      step={100}
                      value={form.lengthMm}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (Number.isSafeInteger(val) && val > 0) {
                          handleUpdate('lengthMm', val);
                        }
                      }}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm font-semibold outline-none focus:border-blue-500"
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <span>快捷长度:</span>
                    {QUICK_LENGTHS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleUpdate('lengthMm', value)}
                        className={`cursor-pointer rounded border px-2 py-0.5 ${
                          form.lengthMm === value
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  {form.lengthMm > 5000 && (
                    <p className="mt-2 text-[11px] text-blue-600">超过 5000mm 需转人工核价。</p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <label className="block">
                    <span className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                      <Zap className="h-3.5 w-3.5 text-amber-600" />
                      订单数量（条）
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={1000000}
                      step={100}
                      value={form.quantity}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (Number.isSafeInteger(val) && val >= 1 && val <= 1000000) {
                          handleUpdate('quantity', val);
                        }
                      }}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm font-semibold outline-none focus:border-blue-500"
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <span>快捷数量:</span>
                    {QUICK_QUANTITIES.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleUpdate('quantity', value)}
                        className={`cursor-pointer rounded border px-2 py-0.5 ${
                          form.quantity === value
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 'result' && (
              <div className="space-y-5">
                <div className="mx-auto max-w-2xl">
                  <AutoQuotePriceCard
                    evaluation={evaluation}
                    prices={prices}
                    catalog={catalog}
                    loading={priceLoading}
                  />
                </div>
                {evaluation.config && catalog && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-slate-700">报价确认结构图</h3>
                    <div className="h-[560px]">
                      <AutoQuoteDrawingPreview form={effectiveForm} catalog={catalog} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/70 px-4 py-3">
            <button
              type="button"
              disabled={stepIndex === 0}
              onClick={() => setStep(STEPS[stepIndex - 1].id)}
              className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              上一步
            </button>
            {stepIndex < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep(STEPS[stepIndex + 1].id)}
                className="flex cursor-pointer items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
              >
                {STEPS[stepIndex + 1].id === 'result' ? '查看报价结果' : '下一步'}
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={reset}
                className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                重新填写
              </button>
            )}
          </div>
        </div>

        <aside className="hidden w-[300px] shrink-0 flex-col gap-3 overflow-y-auto lg:flex xl:w-[340px]">
          <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <h2 className="text-xs font-bold text-slate-800">配置摘要</h2>
              <span className="text-[10px] text-slate-400">点击行可跳转到对应步骤</span>
            </div>
            <div className="p-1.5">
              {summaryRows.map((row) => (
                <button
                  key={row.label}
                  type="button"
                  onClick={() => setStep(row.step)}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-slate-50"
                >
                  <span className="shrink-0 text-[11px] text-slate-500">{row.label}</span>
                  <span className="min-w-0 truncate text-[11px] font-semibold text-slate-800">{row.value}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-800">实时测算</h2>
              <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                {meta.label}
              </span>
            </div>

            <div className="mt-3">
              {priceLoading ? (
                <p className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  正在加载价格库...
                </p>
              ) : evaluation.status === 'ready' && evaluation.price ? (
                <div className="rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 p-4 text-white">
                  <p className="text-[11px] text-blue-100">含税含运费单价</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">
                    ¥{formatQuoteMoney(evaluation.price.unitPrice)}
                  </p>
                  <div className="mt-2 flex items-baseline justify-between border-t border-blue-400/40 pt-2 text-[11px] text-blue-100">
                    <span>订单总额（{effectiveForm.quantity} 条）</span>
                    <span className="text-sm font-semibold tabular-nums text-white">
                      ¥{formatQuoteMoney(evaluation.price.totalPrice)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className={`rounded-lg border p-3 text-[11px] ${meta.box}`}>
                  <p className="font-semibold">{meta.title}</p>
                  <ul className="mt-1.5 list-inside list-disc space-y-0.5">
                    {evaluation.issues.slice(0, SUMMARY_ISSUE_LIMIT).map((issue, index) => (
                      <li key={index}>{issue}</li>
                    ))}
                  </ul>
                  {evaluation.issues.length > SUMMARY_ISSUE_LIMIT && (
                    <p className="mt-1">
                      另有 {evaluation.issues.length - SUMMARY_ISSUE_LIMIT} 项，请进入报价结果查看。
                    </p>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setStep('result')}
              className="mt-4 w-full cursor-pointer rounded-lg bg-blue-600 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
            >
              查看报价结果
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default AutoQuote3Page;

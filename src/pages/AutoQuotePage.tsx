import { useEffect, useMemo, useState } from 'react';
import {
  Cable,
  Calculator,
  Database,
  FileImage,
  Layers,
  Ruler,
  Scissors,
  Zap,
} from 'lucide-react';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePriceStore } from '@/stores/priceStore';
import {
  DEFAULT_AUTO_QUOTE_FORM,
  evaluateAutoQuote,
  isSupportedConnector,
  isSupportedOvermold,
  type AutoQuoteEndpointBType,
  type AutoQuoteFormState,
  type AutoQuoteInnerMoldType,
  type AutoQuoteOuterMoldType,
} from '@/lib/autoQuote';
import { ConnectorPickerModal } from '@/components/autoQuote/ConnectorPickerModal';
import { WirePickerModal } from '@/components/autoQuote/WirePickerModal';
import { AutoQuotePriceCard } from '@/components/autoQuote/AutoQuotePriceCard';
import { AutoQuoteDrawingPreview } from '@/components/autoQuote/AutoQuoteDrawingPreview';

export function AutoQuotePage() {
  const catalog = useCatalogStore((state) => state.snapshot);
  const catalogStatus = useCatalogStore((state) => state.status);
  const initializeCatalog = useCatalogStore((state) => state.initialize);

  const priceStore = usePriceStore();
  const { book, loading: priceLoading, load: loadPrices } = priceStore;

  const [form, setForm] = useState<AutoQuoteFormState>(DEFAULT_AUTO_QUOTE_FORM);
  const [activeRightTab, setActiveRightTab] = useState<'quote' | 'drawing'>('quote');
  const [pickerModal, setPickerModal] = useState<'connA' | 'connB' | 'wire' | null>(null);

  // 初始化目录与价格
  useEffect(() => {
    if (catalogStatus === 'idle') {
      void initializeCatalog().catch(() => undefined);
    }
    void loadPrices().catch(() => undefined);
  }, [catalogStatus, initializeCatalog, loadPrices]);

  const defaultConnA = useMemo(
    () => catalog?.connectors.find(isSupportedConnector),
    [catalog],
  );
  const defaultConnB = useMemo(
    () => catalog?.connectors.filter(isSupportedConnector)[1] || defaultConnA,
    [catalog, defaultConnA],
  );
  const defaultWire = useMemo(
    () => catalog?.wires[0],
    [catalog],
  );
  const defaultMold = useMemo(
    () => catalog?.overmolds.find(isSupportedOvermold),
    [catalog],
  );

  // 通过渲染期派生状态自动填充默认选配物料，严禁在 useEffect 中触发 setState 引起级联重渲染
  const effectiveForm = useMemo(() => {
    return {
      ...form,
      connectorAId: form.connectorAId || defaultConnA?.id || '',
      connectorBId: form.connectorBId || defaultConnB?.id || '',
      wireResourceId: form.wireResourceId || defaultWire?.resourceItemId || '',
      outerMoldSpecId: form.outerMoldSpecId || defaultMold?.id || '',
    };
  }, [form, defaultConnA, defaultConnB, defaultWire, defaultMold]);

  const prices = useMemo(() => book?.prices || [], [book]);

  // 执行实时核算
  const evaluation = useMemo(() => {
    return evaluateAutoQuote(effectiveForm, prices, catalog);
  }, [effectiveForm, prices, catalog]);

  const connA = useMemo(
    () => catalog?.connectors.find((c) => c.id === effectiveForm.connectorAId),
    [catalog, effectiveForm.connectorAId],
  );
  const connB = useMemo(
    () => catalog?.connectors.find((c) => c.id === effectiveForm.connectorBId),
    [catalog, effectiveForm.connectorBId],
  );
  const selectedWire = useMemo(
    () => catalog?.wires.find((w) => w.resourceItemId === effectiveForm.wireResourceId),
    [catalog, effectiveForm.wireResourceId],
  );
  const supportedOvermolds = useMemo(
    () => catalog?.overmolds.filter(isSupportedOvermold) || [],
    [catalog],
  );

  const handleUpdate = <K extends keyof AutoQuoteFormState>(field: K, value: AutoQuoteFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEndpointBChange = (type: AutoQuoteEndpointBType) => {
    setForm((prev) => {
      const next: AutoQuoteFormState = { ...prev, endpointBType: type };
      if (type === 'connector' && !prev.connectorBId && catalog?.connectors) {
        const candidate = catalog.connectors.find(isSupportedConnector);
        if (candidate) next.connectorBId = candidate.id;
      }
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col bg-slate-100 overflow-hidden">
      {/* 顶部简明横幅 */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-2 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
              <Calculator className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-none">线束自动报价系统</h1>
              <p className="text-[11px] text-slate-500 mt-0.5">
                基于现有物料目录与工时基准的零配置在线核算
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
            <span>实时公式引擎就绪</span>
          </div>
        </div>
      </div>

      {/* 主工作区：左表单 + 右展示 */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden p-3 sm:p-4 gap-3 sm:gap-4">
        {/* 左侧：业务配置表单 */}
        <div className="lg:w-[480px] xl:w-[500px] shrink-0 flex flex-col bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3 bg-slate-50/70">
            <h2 className="text-xs font-bold text-slate-800 tracking-wide uppercase">
              1. 选配参数与端部工艺
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {/* A 端连接器 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded bg-blue-100 text-[10px] font-bold text-blue-700">A</span>
                  A 端连接器料号
                </span>
                <span className="text-[11px] text-slate-400">仅限 M8/M12</span>
              </div>

              {connA ? (
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/80 p-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {connA.image ? (
                      <img
                        src={connA.image}
                        alt={connA.name}
                        className="h-9 w-9 shrink-0 rounded border border-slate-200 bg-white object-contain p-0.5"
                      />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-blue-100 font-bold text-blue-700">
                        A
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{connA.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {connA.model || connA.id} · {connA.pinCount}P · {connA.type === 'male' ? '公头' : connA.type === 'female' ? '母头' : '插座'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPickerModal('connA')}
                    className="shrink-0 cursor-pointer rounded-md bg-white border border-slate-200 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                  >
                    更换
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPickerModal('connA')}
                  className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-3 text-slate-600 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-600"
                >
                  <Database className="h-4 w-4" />
                  <span>点击选择 A 端连接器物料</span>
                </button>
              )}
            </div>

            {/* B 端形式与物料 */}
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded bg-purple-100 text-[10px] font-bold text-purple-700">B</span>
                  B 端形式
                </span>
              </div>

              {/* B 端形式三选一单选 */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'connector' as const, label: '连接器', note: '双端连接' },
                  { key: 'cut' as const, label: '切断', note: '平齐无加工' },
                  { key: 'strip-tin' as const, label: '剥皮沾锡', note: '待支持', badge: true },
                ].map((item) => {
                  const active = form.endpointBType === item.key;
                  return (
                    <button
                      type="button"
                      key={item.key}
                      onClick={() => handleEndpointBChange(item.key)}
                      className={`relative flex flex-col items-center justify-center rounded-lg border p-2 text-center transition cursor-pointer ${
                        active
                          ? 'border-blue-600 bg-blue-50/70 text-blue-700 font-semibold'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {item.badge && (
                        <span className="absolute -top-1.5 -right-1 rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-800">
                          待支持
                        </span>
                      )}
                      <span>{item.label}</span>
                      <span className="text-[10px] text-slate-400 font-normal">{item.note}</span>
                    </button>
                  );
                })}
              </div>

              {/* 当 B 端为连接器时显示连接器选择 */}
              {form.endpointBType === 'connector' && (
                <div className="mt-2 space-y-1.5">
                  {connB ? (
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/80 p-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {connB.image ? (
                          <img
                            src={connB.image}
                            alt={connB.name}
                            className="h-9 w-9 shrink-0 rounded border border-slate-200 bg-white object-contain p-0.5"
                          />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-purple-100 font-bold text-purple-700">
                            B
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{connB.name}</p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {connB.model || connB.id} · {connB.pinCount}P · {connB.type === 'male' ? '公头' : connB.type === 'female' ? '母头' : '插座'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPickerModal('connB')}
                        className="shrink-0 cursor-pointer rounded-md bg-white border border-slate-200 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                      >
                        更换
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPickerModal('connB')}
                      className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-3 text-slate-600 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-600"
                    >
                      <Database className="h-4 w-4" />
                      <span>点击选择 B 端连接器物料</span>
                    </button>
                  )}
                </div>
              )}

              {form.endpointBType === 'cut' && (
                <div className="rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-500 flex items-center gap-2 border border-slate-200/60">
                  <Scissors className="h-4 w-4 text-slate-400 shrink-0" />
                  <span>切断端按单端加工计费，不对切断端产生额外焊接或成型费用。</span>
                </div>
              )}

              {form.endpointBType === 'strip-tin' && (
                <div className="rounded-lg bg-amber-50 p-2.5 text-[11px] text-amber-800 border border-amber-200/80">
                  剥皮沾锡工艺计费待支持，首版暂不提供正式报价。
                </div>
              )}
            </div>

            {/* 线材选择与规格 */}
            <div className="space-y-1.5 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Cable className="h-4 w-4 text-blue-600" />
                  线材物料
                </span>
              </div>

              {selectedWire ? (
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/80 p-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {selectedWire.image ? (
                      <img
                        src={selectedWire.image}
                        alt={selectedWire.name}
                        className="h-9 w-9 shrink-0 rounded border border-slate-200 bg-white object-contain p-0.5"
                      />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-slate-200 text-slate-700">
                        <Cable className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{selectedWire.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {selectedWire.spec.kind === 'jacketed'
                          ? `${selectedWire.spec.coreCount}芯 · ${selectedWire.spec.awg ? `${selectedWire.spec.awg}AWG` : `${selectedWire.spec.conductorAreaMm2}mm²`} · ${selectedWire.spec.shielded ? '屏蔽' : '非屏蔽'} · OD${selectedWire.spec.outerDiameterMm ?? '-'}mm`
                          : `电子线 ${selectedWire.spec.awg}AWG`}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPickerModal('wire')}
                    className="shrink-0 cursor-pointer rounded-md bg-white border border-slate-200 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                  >
                    更换
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPickerModal('wire')}
                  className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-3 text-slate-600 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-600"
                >
                  <Cable className="h-4 w-4" />
                  <span>点击选择线材物料</span>
                </button>
              )}
            </div>

            {/* 模具配置：外模与内模 */}
            <div className="space-y-3 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-indigo-600" />
                  成型模具配置
                </span>
              </div>

              {/* 外模单选 */}
              <div className="space-y-1.5">
                <span className="text-slate-600 font-medium">外模材质</span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'none' as const, label: '无外模' },
                    { key: 'pvc-45p' as const, label: '黑色 PVC 45P' },
                    { key: 'tpe' as const, label: 'TPE (待支持)' },
                  ].map((item) => {
                    const active = form.outerMoldType === item.key;
                    return (
                      <button
                        type="button"
                        key={item.key}
                        onClick={() => handleUpdate('outerMoldType', item.key as AutoQuoteOuterMoldType)}
                        className={`rounded-lg border p-2 text-center transition cursor-pointer ${
                          active
                            ? 'border-blue-600 bg-blue-50/70 text-blue-700 font-semibold'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                {form.outerMoldType === 'pvc-45p' && (
                  <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-2.5 border border-slate-200">
                    <label className="block">
                      <span className="text-[11px] text-slate-500 font-medium">所选外模规格型号</span>
                      <select
                        value={effectiveForm.outerMoldSpecId}
                        onChange={(e) => handleUpdate('outerMoldSpecId', e.target.value)}
                        className="mt-1 w-full rounded border border-slate-300 bg-white p-1.5 text-xs focus:border-blue-500 outline-none"
                      >
                        <option value="">请选择适用外模型号</option>
                        {supportedOvermolds.map((mold) => (
                          <option key={mold.id} value={mold.id}>
                            {mold.name} ({mold.outerForm === 'straight' ? '直头' : '弯头'})
                          </option>
                        ))}
                      </select>
                    </label>

                    {form.endpointBType === 'connector' && (
                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="text-slate-600">外模成型端数</span>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name="outerMoldEnds"
                              checked={form.outerMoldEnds === 2}
                              onChange={() => handleUpdate('outerMoldEnds', 2)}
                              className="text-blue-600"
                            />
                            <span>双端成型 (2个)</span>
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name="outerMoldEnds"
                              checked={form.outerMoldEnds === 1}
                              onChange={() => handleUpdate('outerMoldEnds', 1)}
                              className="text-blue-600"
                            />
                            <span>仅A端成型 (1个)</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 内模单选 */}
              <div className="space-y-1.5">
                <span className="text-slate-600 font-medium">内模材质</span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'none' as const, label: '无内模' },
                    { key: 'pe' as const, label: 'PE 内模' },
                  ].map((item) => {
                    const active = form.innerMoldType === item.key;
                    return (
                      <button
                        type="button"
                        key={item.key}
                        onClick={() => handleUpdate('innerMoldType', item.key as AutoQuoteInnerMoldType)}
                        className={`rounded-lg border p-2 text-center transition cursor-pointer ${
                          active
                            ? 'border-blue-600 bg-blue-50/70 text-blue-700 font-semibold'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 长度与订单数量 */}
            <div className="space-y-3 border-t border-slate-100 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-700 flex items-center gap-1">
                      <Ruler className="h-3.5 w-3.5 text-blue-600" />
                      报价线长 (mm)
                    </span>
                  </div>
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
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold focus:border-blue-500 outline-none"
                  />
                  {form.lengthMm > 5000 && (
                    <span className="text-[10px] text-blue-600 mt-1 block">
                      超过 5000mm 需转人工核价
                    </span>
                  )}
                </label>

                <label className="block">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-700 flex items-center gap-1">
                      <Zap className="h-3.5 w-3.5 text-amber-600" />
                      订单数量 (条)
                    </span>
                  </div>
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
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold focus:border-blue-500 outline-none"
                  />
                </label>
              </div>

              {/* 快捷数量选择 */}
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span>快捷数量:</span>
                {[100, 500, 1000, 2000, 5000].map((qty) => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => handleUpdate('quantity', qty)}
                    className={`rounded px-1.5 py-0.5 border cursor-pointer ${
                      form.quantity === qty
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {qty}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：展示区 (Tab 切换：成本分析与报价 / 报价确认图) */}
        <div className="flex-1 min-w-0 flex flex-col bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Tab 导航 */}
          <div className="border-b border-slate-200 px-4 py-2.5 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveRightTab('quote')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  activeRightTab === 'quote'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calculator className="h-4 w-4" />
                <span>实时成本分析与报价</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveRightTab('drawing')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  activeRightTab === 'drawing'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileImage className="h-4 w-4" />
                <span>报价确认结构图</span>
              </button>
            </div>

            <div className="text-[11px] text-slate-500 hidden sm:flex items-center gap-1">
              <span>当前配置:</span>
              <span className="font-semibold text-slate-700">
                {effectiveForm.endpointBType === 'connector' ? '双头连接器' : '单头加工'} · {effectiveForm.lengthMm}mm
              </span>
            </div>
          </div>

          {/* 内容区 */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
            {activeRightTab === 'quote' ? (
              <div className="max-w-2xl mx-auto">
                <AutoQuotePriceCard
                  evaluation={evaluation}
                  prices={prices}
                  catalog={catalog}
                  loading={priceLoading}
                />
              </div>
            ) : (
              <div className="h-full">
                <AutoQuoteDrawingPreview
                  form={effectiveForm}
                  catalog={catalog}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 连接器选择弹窗 */}
      <ConnectorPickerModal
        isOpen={pickerModal === 'connA' || pickerModal === 'connB'}
        title={pickerModal === 'connA' ? '选择 A 端连接器' : '选择 B 端连接器'}
        connectors={catalog?.connectors || []}
        selectedId={pickerModal === 'connA' ? effectiveForm.connectorAId : effectiveForm.connectorBId}
        onSelect={(conn) => {
          if (pickerModal === 'connA') {
            handleUpdate('connectorAId', conn.id);
          } else {
            handleUpdate('connectorBId', conn.id);
          }
        }}
        onClose={() => setPickerModal(null)}
      />

      {/* 线材选择弹窗 */}
      <WirePickerModal
        isOpen={pickerModal === 'wire'}
        wires={catalog?.wires || []}
        selectedResourceId={effectiveForm.wireResourceId}
        onSelect={(wire) => {
          handleUpdate('wireResourceId', wire.resourceItemId);
        }}
        onClose={() => setPickerModal(null)}
      />
    </div>
  );
}
export default AutoQuotePage;

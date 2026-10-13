import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Cable,
  Calculator,
  Database,
  Download,
  FileSpreadsheet,
  Info,
  Layers,
  Loader2,
  Ruler,
  Scissors,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useCatalogStore } from '@/stores/catalogStore';
import { useUserStore } from '@/stores/userStore';
import { useServerQuote } from '@/lib/useServerQuote';
import { canViewPricing } from '@/lib/permissions';
import { formatQuoteMoney } from '@/lib/pricing';
import { createQuoteWorkbook } from '@/lib/quoteExport';
import { safeFilename } from '@/lib/designFile';
import { DEFAULT_QUOTE_LEAD_TIME } from '@/data/catalogOptions';
import {
  DEFAULT_AUTO_QUOTE_FORM,
  buildAutoQuoteConfig,
  type AutoQuoteEvaluation,
  deriveAutoQuoteSelection,
  isSupportedOvermold,
  type AutoQuoteEndpointBType,
  type AutoQuoteFormState,
  type AutoQuoteInnerMoldType,
} from '@/lib/autoQuote';
import { ConnectorPickerModal } from '@/components/autoQuote/ConnectorPickerModal';
import { WirePickerModal } from '@/components/autoQuote/WirePickerModal';
import { AutoQuotePriceCard } from '@/components/autoQuote/AutoQuotePriceCard';
import type { CatalogWire } from '@/types/catalog';
import type { Connector, OvermoldSpec } from '@/types/harness';

interface AutoQuoteConfigFormProps {
  form: AutoQuoteFormState;
  effectiveForm: AutoQuoteFormState;
  selection: ReturnType<typeof deriveAutoQuoteSelection>;
  connA?: Connector;
  connB?: Connector;
  selectedWire?: CatalogWire;
  supportedOvermolds: OvermoldSpec[];
  onUpdate: <K extends keyof AutoQuoteFormState>(field: K, value: AutoQuoteFormState[K]) => void;
  onEndpointBChange: (type: AutoQuoteEndpointBType) => void;
  onOpenPicker: (type: 'connA' | 'connB' | 'wire') => void;
}

function AutoQuoteConfigForm({
  form,
  effectiveForm,
  selection,
  connA,
  connB,
  selectedWire,
  supportedOvermolds,
  onUpdate,
  onEndpointBChange,
  onOpenPicker,
}: AutoQuoteConfigFormProps) {
  return (
    <>
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
              onClick={() => onOpenPicker('connA')}
              className="shrink-0 cursor-pointer rounded-md bg-white border border-slate-200 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
            >
              更换
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onOpenPicker('connA')}
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
            { key: 'strip-tin' as const, label: '剥皮沾锡', note: '尾端沾锡，不成型' },
          ].map((item) => {
            const active = form.endpointBType === item.key;
            return (
              <button
                type="button"
                key={item.key}
                onClick={() => onEndpointBChange(item.key)}
                className={`relative flex flex-col items-center justify-center rounded-lg border p-2 text-center transition cursor-pointer ${
                  active
                    ? 'border-blue-600 bg-blue-50/70 text-blue-700 font-semibold'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>{item.label}</span>
                <span className="text-[10px] text-slate-400 font-normal">{item.note}</span>
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-slate-500">
          {connA && typeof connA.shielded === 'boolean'
            ? `已按 A 端锁定：${connA.pinCount}芯 · ${connA.shielded ? '屏蔽' : '非屏蔽'}；B 端连接器和线材仅显示匹配项`
            : '请先选择 A 端连接器并补全目录中的屏蔽属性'}
        </p>
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
                  onClick={() => onOpenPicker('connB')}
                  className="shrink-0 cursor-pointer rounded-md bg-white border border-slate-200 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                >
                  更换
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onOpenPicker('connB')}
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
            A 端焊接成型，B 端剥皮沾锡；屏蔽线两端均计处理编织和热缩编织费用。
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

        {connA && selection.wires.length === 0 && (
          <p className="text-amber-700">没有与 A 端芯数及屏蔽属性一致的线材，请更换 A 端或补充物料目录</p>
        )}
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
              onClick={() => onOpenPicker('wire')}
              className="shrink-0 cursor-pointer rounded-md bg-white border border-slate-200 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
            >
              更换
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onOpenPicker('wire')}
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

        {/* 外模规格：材质随规格名称展示 */}
        <div className="space-y-1.5">
          <div className="space-y-2 rounded-lg bg-slate-50 p-2.5 border border-slate-200">
            <label className="block">
              <span className="text-[11px] text-slate-500 font-medium">外模规格（必选）</span>
              <select
                value={effectiveForm.outerMoldSpecId}
                onChange={(e) => onUpdate('outerMoldSpecId', e.target.value)}
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

            <p className="text-xs text-slate-600">
              {form.endpointBType === 'connector' ? 'A/B 双端成型（2 个外模）' : 'A 端成型（1 个外模）'}
            </p>
          </div>
        </div>

        {/* 内模单选 */}
        <div className="space-y-1.5">
          <p className="text-xs text-slate-500">外模必选：单头 1 个、双头 2 个；内模可选，双头启用时两端都有。</p>
          <span className="text-slate-600 font-medium">内模材质（可选）</span>
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
                  onClick={() => onUpdate('innerMoldType', item.key as AutoQuoteInnerMoldType)}
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

      {/* 线长配置 */}
      <div className="space-y-3 border-t border-slate-100 pt-3">
        <div>
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
                  onUpdate('lengthMm', val);
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
        </div>

        {/* 快捷线长选择 */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
          <span>快捷线长:</span>
          {[500, 1000, 2000, 3000, 5000].map((lengthMm) => (
            <button
              key={lengthMm}
              type="button"
              onClick={() => onUpdate('lengthMm', lengthMm)}
              className={`rounded px-1.5 py-0.5 border cursor-pointer ${
                form.lengthMm === lengthMm
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              {lengthMm} mm
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export function AutoQuotePage() {
  const catalog = useCatalogStore((state) => state.snapshot);
  const catalogStatus = useCatalogStore((state) => state.status);
  const catalogError = useCatalogStore((state) => state.error);
  const initializeCatalog = useCatalogStore((state) => state.initialize);

  const role = useUserStore((state) => state.currentUser?.role);
  const canViewDetails = canViewPricing(role);

  const [form, setForm] = useState<AutoQuoteFormState>(DEFAULT_AUTO_QUOTE_FORM);
  const [pickerModal, setPickerModal] = useState<'connA' | 'connB' | 'wire' | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // 初始化目录与价格
  useEffect(() => {
    if (catalogStatus === 'idle') {
      void initializeCatalog().catch(() => undefined);
    }
  }, [catalogStatus, initializeCatalog]);

  const selection = useMemo(() => deriveAutoQuoteSelection(form, catalog), [form, catalog]);
  const effectiveForm = selection.form;

  const built = useMemo(() => buildAutoQuoteConfig(effectiveForm, catalog), [effectiveForm, catalog]);
  const catalogLoading = catalogStatus === 'idle' || catalogStatus === 'loading';
  const quote = useServerQuote(catalogStatus === 'ready' ? built.config : null);
  const status: AutoQuoteEvaluation['status'] = catalogLoading ? 'catalog-loading'
    : catalogStatus === 'error' ? 'error'
    : !built.config ? 'incomplete'
    : quote.error ? 'error'
    : quote.loading ? 'loading'
    : quote.result?.status ?? 'waiting';
  const evaluation: AutoQuoteEvaluation = {
    ...built, config: built.config ?? undefined,
    status,
    issues: status === 'error' ? [catalogStatus === 'error' ? catalogError || '物料目录加载失败，请重试。' : quote.error!]
      : status === 'incomplete' ? built.issues
      : quote.result && quote.result.status !== 'ready' ? quote.result.issues : [],
    ...(status === 'ready' && quote.result?.status === 'ready' ? { price: quote.result.price, calculatedAt: quote.result.calculatedAt, settingsVersion: quote.result.settingsVersion, previousUnitPrice: quote.previousUnitPrice } : {}),
  };
  const retry = catalogStatus === 'error'
    ? () => { void initializeCatalog().catch(() => undefined); }
    : quote.retry;
  const statusLabels: Record<AutoQuoteEvaluation['status'], string> = {
    'catalog-loading': '正在加载物料目录', loading: '正在核算报价',
    error: catalogStatus === 'error' ? '物料目录加载失败' : '报价失败',
    incomplete: '请完善选配输入', ready: '报价已更新', waiting: '等待报价',
    manual: '需人工核价', blocked: '报价受阻',
  };

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
    setExportError(null);
    const nextForm = { ...effectiveForm, [field]: value };
    setForm(deriveAutoQuoteSelection(nextForm, catalog).form);
  };

  const handleEndpointBChange = (type: AutoQuoteEndpointBType) => {
    handleUpdate('endpointBType', type);
  };

  const handleExportPublicExcel = () => {
    if (!built.config || !evaluation.price) return;
    try {
      setExporting(true);
      setExportError(null);
      const workbook = createQuoteWorkbook(built.config, evaluation.price, 'public', role, 'unit', { catalog, calculatedAt: evaluation.calculatedAt, settingsVersion: evaluation.settingsVersion });
      const filename = safeFilename(`${built.config.name}_报价单.xlsx`);
      XLSX.writeFile(workbook, filename);
    } catch (err) {
      console.error('导出 Excel 失败:', err);
      setExportError('导出报价失败，请重试。');
    } finally {
      setExporting(false);
    }
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
            <span className={`flex h-2 w-2 rounded-full ${status === 'ready' ? 'bg-emerald-500' : status === 'error' ? 'bg-red-500' : 'bg-slate-400'}`} />
            <span role="status">{statusLabels[status]}</span>
          </div>
        </div>
      </div>

      {/* 主工作区 */}
      {canViewDetails ? (
        /* 工程师 / 管理员：桌面端双列，小屏单列 */
        <div data-testid="auto-quote-dual-column" className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden p-3 sm:p-4 gap-3 sm:gap-4">
          {/* 左侧：业务配置表单 */}
          <div className="lg:w-[480px] xl:w-[500px] shrink-0 flex flex-col bg-white rounded-xl border border-slate-200 shadow-xs lg:overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3 bg-slate-50/70 shrink-0">
              <h2 className="text-xs font-bold text-slate-800 tracking-wide uppercase">
                1. 选配参数与端部工艺
              </h2>
            </div>

            <div className="flex-1 lg:overflow-y-auto p-4 space-y-4 text-xs">
              <AutoQuoteConfigForm
                form={form}
                effectiveForm={effectiveForm}
                selection={selection}
                connA={connA}
                connB={connB}
                selectedWire={selectedWire}
                supportedOvermolds={supportedOvermolds}
                onUpdate={handleUpdate}
                onEndpointBChange={handleEndpointBChange}
                onOpenPicker={setPickerModal}
              />
            </div>
          </div>

          {/* 右侧：成本分析与报价 */}
          <div className="flex-1 min-w-0 flex flex-col bg-white rounded-xl border border-slate-200 shadow-xs lg:overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-2.5 bg-slate-50 flex items-center justify-between shrink-0">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <Calculator className="h-4 w-4 text-blue-600" />
                实时报价
              </h2>

              <div className="text-[11px] text-slate-500 hidden sm:flex items-center gap-1">
                <span>当前配置:</span>
                <span className="font-semibold text-slate-700">
                  {effectiveForm.endpointBType === 'connector' ? '双头连接器' : '单头加工'} · {effectiveForm.lengthMm}mm
                </span>
              </div>
            </div>

            {/* 内容区 */}
            <div className="flex-1 min-h-0 lg:overflow-y-auto p-4 sm:p-5">
              <div className="max-w-2xl mx-auto">
                <AutoQuotePriceCard
                  evaluation={evaluation}
                  catalog={catalog}
                  loading={status === 'loading'}
                  exportScope="unit"
                  onRetry={retry}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 业务员：单列布局，统一滚动，上方表单，下方紧凑报价，底部吸附简洁报价栏 */
        <div data-testid="auto-quote-single-column" className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* 统一滚动区域 */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-6">
            <div className="max-w-3xl mx-auto space-y-4">
              {/* 上方：业务选配表单卡片 */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="border-b border-slate-200 px-4 py-3 bg-slate-50/70">
                  <h2 className="text-xs font-bold text-slate-800 tracking-wide uppercase">
                    1. 选配参数与端部工艺
                  </h2>
                </div>
                <div className="p-4 sm:p-5 space-y-4 text-xs">
                  <AutoQuoteConfigForm
                    form={form}
                    effectiveForm={effectiveForm}
                    selection={selection}
                    connA={connA}
                    connB={connB}
                    selectedWire={selectedWire}
                    supportedOvermolds={supportedOvermolds}
                    onUpdate={handleUpdate}
                    onEndpointBChange={handleEndpointBChange}
                    onOpenPicker={setPickerModal}
                  />
                </div>
              </div>

              {/* 下方：报价结果紧凑展示，不再保留整块空白面板 */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="border-b border-slate-200 px-4 py-2.5 bg-slate-50 flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <Calculator className="h-4 w-4 text-blue-600" />
                    实时报价
                  </h2>

                  <div className="text-[11px] text-slate-500 hidden sm:flex items-center gap-1">
                    <span>当前配置:</span>
                    <span className="font-semibold text-slate-700">
                      {effectiveForm.endpointBType === 'connector' ? '双头连接器' : '单头加工'} · {effectiveForm.lengthMm}mm
                    </span>
                  </div>
                </div>

                <div className="p-4 sm:p-5">
                  <AutoQuotePriceCard
                    evaluation={evaluation}
                    catalog={catalog}
                    loading={status === 'loading'}
                    exportScope="unit"
                    onRetry={retry}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 底部吸附简洁报价栏：调整参数时仍能看到金额 */}
          <div data-testid="auto-quote-sticky-bar" className="shrink-0 border-t border-slate-200 bg-white/95 backdrop-blur-xs px-4 py-2.5 sm:px-6 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] z-20">
            <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-3">
              {status === 'error' ? (
                <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-red-700 py-1">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{evaluation.issues.join('；')}</span>
                  <button type="button" onClick={retry} className="text-blue-600 underline cursor-pointer">重试</button>
                </div>
              ) : status === 'loading' || status === 'catalog-loading' ? (
                <div className="flex items-center gap-2 text-xs text-blue-600 py-1">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>{statusLabels[status]}...</span>
                </div>
              ) : evaluation.status === 'ready' && evaluation.price ? (
                <>
                  <div className="flex items-center gap-3 sm:gap-6 min-w-0">
                    <div>
                      <span className="text-[10px] text-slate-500 block leading-tight">含税单价</span>
                      <span className="text-base sm:text-lg font-bold text-blue-600 tabular-nums leading-none">
                        ¥{formatQuoteMoney(evaluation.price.unitPrice)}
                      </span>
                    </div>
                    <div className="h-6 w-px bg-slate-200" />
                    <div>
                      <span className="text-[10px] text-slate-400 block leading-tight">交期参考</span>
                      <span className="text-xs font-medium text-slate-700 leading-none">
                        {DEFAULT_QUOTE_LEAD_TIME}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={exporting}
                    onClick={handleExportPublicExcel}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                  >
                    {exporting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    <span>导出报价 Excel</span>
                  </button>
                  {exportError && <p role="alert" className="w-full text-xs text-red-700">{exportError}</p>}
                </>
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-1">
                  {evaluation.status === 'manual' ? (
                    <>
                      <Info className="h-4 w-4 text-blue-500 shrink-0" />
                      <span>线长超过 5000mm 需转人工核价</span>
                    </>
                  ) : evaluation.status === 'blocked' ? (
                    <>
                      <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                      <span>缺少物料价格或配置不合规</span>
                    </>
                  ) : (
                    <>
                      <Info className="h-4 w-4 text-slate-400 shrink-0" />
                      <span>{statusLabels[status]}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 连接器选择弹窗 */}
      <ConnectorPickerModal
        key={`${pickerModal}-${effectiveForm.connectorAId}`}
        isOpen={pickerModal === 'connA' || pickerModal === 'connB'}
        title={pickerModal === 'connA' ? '选择 A 端连接器' : '选择 B 端连接器'}
        connectors={pickerModal === 'connA' ? catalog?.connectors || [] : selection.connectorsB}
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
        key={effectiveForm.connectorAId}
        isOpen={pickerModal === 'wire'}
        wires={selection.wires}
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

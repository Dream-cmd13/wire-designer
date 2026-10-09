import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Cable,
  Eye,
  FileSpreadsheet,
  Ruler,
  Scissors,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { AutoQuoteDrawingPreview } from '@/components/autoQuote/AutoQuoteDrawingPreview';
import { ConnectorPickerModal } from '@/components/autoQuote/ConnectorPickerModal';
import { WirePickerModal } from '@/components/autoQuote/WirePickerModal';
import { safeFilename } from '@/lib/designFile';
import {
  DEFAULT_AUTO_QUOTE_FORM,
  evaluateAutoQuote,
  isSupportedConnector,
  isSupportedOvermold,
  type AutoQuoteEndpointBType,
  type AutoQuoteEvaluation,
  type AutoQuoteFormState,
} from '@/lib/autoQuote';
import {
  downloadAutoQuoteDrawingPng,
  downloadAutoQuoteDrawingSvg,
} from '@/lib/autoQuoteDrawing';
import { formatQuoteMoney } from '@/lib/pricing';
import { createQuoteWorkbook } from '@/lib/quoteExport';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePriceStore } from '@/stores/priceStore';
import type { CatalogWire } from '@/types/catalog';

const QUICK_LENGTH_OPTIONS = [500, 1000, 1500, 2000, 3000, 5000];
const QUICK_QUANTITY_OPTIONS = [100, 500, 1000, 2000, 5000];

const STATUS_BADGE_STYLE: Record<AutoQuoteEvaluation['status'], { label: string; bg: string; text: string; dot: string }> = {
  ready: { label: '实时公式核算完成', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  manual: { label: '需转人工核价（>5米）', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
  blocked: { label: '核算受阻（缺少价格）', bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700', dot: 'bg-rose-500' },
  unsupported: { label: '包含待支持选项', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
  incomplete: { label: '待输入必填项', bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600', dot: 'bg-slate-400' },
};

function formatWireSummary(wire?: CatalogWire): string {
  if (!wire) return '未选线材';
  const spec = wire.spec;
  if (spec.kind === 'jacketed') {
    const size = spec.awg ? `${spec.awg}AWG` : `${spec.conductorAreaMm2 ?? '-'}mm²`;
    return `${spec.coreCount}芯 · ${size} · ${spec.shielded ? '屏蔽' : '非屏蔽'} · OD${spec.outerDiameterMm ?? '-'}mm`;
  }
  return `电子线 ${spec.awg}AWG · ${spec.color}`;
}

export function AutoQuote4Page() {
  const { snapshot: catalog, status: catalogStatus, initialize: initializeCatalog } = useCatalogStore();

  const priceStore = usePriceStore();
  const { book, load: loadPrices } = priceStore;

  const [form, setForm] = useState<AutoQuoteFormState>(DEFAULT_AUTO_QUOTE_FORM);
  const [pickerModal, setPickerModal] = useState<'connA' | 'connB' | 'wire' | null>(null);
  const [canvasView, setCanvasView] = useState<'topology' | 'drawing'>('topology');
  const [activeTab, setActiveTab] = useState<'cost' | 'specs' | 'processes'>('cost');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (catalogStatus === 'idle') {
      void initializeCatalog().catch(() => undefined);
    }
    void loadPrices().catch(() => undefined);
  }, [catalogStatus, initializeCatalog, loadPrices]);

  const defaultConnA = useMemo(
    () => catalog?.connectors?.find(isSupportedConnector),
    [catalog],
  );
  const defaultConnB = useMemo(
    () => catalog?.connectors?.filter(isSupportedConnector)[1] || defaultConnA,
    [catalog, defaultConnA],
  );
  const defaultWire = useMemo(
    () => catalog?.wires?.[0],
    [catalog],
  );
  const defaultMold = useMemo(
    () => catalog?.overmolds?.find(isSupportedOvermold),
    [catalog],
  );

  // 派生安全表单状态
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

  const evaluation = useMemo(() => {
    return evaluateAutoQuote(effectiveForm, prices, catalog);
  }, [effectiveForm, prices, catalog]);

  const connA = useMemo(
    () => catalog?.connectors?.find((c) => c.id === effectiveForm.connectorAId),
    [catalog, effectiveForm.connectorAId],
  );
  const connB = useMemo(
    () => catalog?.connectors?.find((c) => c.id === effectiveForm.connectorBId),
    [catalog, effectiveForm.connectorBId],
  );
  const wire = useMemo(
    () => catalog?.wires?.find((w) => w.resourceItemId === effectiveForm.wireResourceId),
    [catalog, effectiveForm.wireResourceId],
  );

  const handleUpdate = <K extends keyof AutoQuoteFormState>(field: K, value: AutoQuoteFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEndpointBChange = (type: AutoQuoteEndpointBType) => {
    setForm((prev) => {
      const next: AutoQuoteFormState = { ...prev, endpointBType: type };
      if (type === 'connector') {
        next.outerMoldEnds = 2;
        if (!prev.connectorBId && catalog?.connectors) {
          const candidate = catalog.connectors.find(isSupportedConnector);
          if (candidate) next.connectorBId = candidate.id;
        }
      } else {
        next.outerMoldEnds = 1;
      }
      return next;
    });
  };

  const handleExportExcel = () => {
    if (!evaluation.config || !evaluation.price) return;
    try {
      setExporting(true);
      const workbook = createQuoteWorkbook(evaluation.config, prices, catalog);
      const filename = safeFilename(`${evaluation.config.name}_自动报价4_成本分析.xlsx`);
      XLSX.writeFile(workbook, filename);
    } catch {
      // ignore
    } finally {
      setExporting(false);
    }
  };

  const statusStyle = STATUS_BADGE_STYLE[evaluation.status];

  // 计算材料成本与加工费占比
  const materialCostNum = evaluation.price ? parseFloat(evaluation.price.materialSubtotal) : 0;
  const laborCostNum = evaluation.price ? parseFloat(evaluation.price.laborSubtotal) : 0;
  const totalBaseCost = materialCostNum + laborCostNum;
  const materialPct = totalBaseCost > 0 ? Math.round((materialCostNum / totalBaseCost) * 100) : 50;
  const laborPct = 100 - materialPct;

  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100 overflow-hidden select-none">
      {/* 顶部高科技质感 HUD 导航横幅 */}
      <header className="shrink-0 border-b border-slate-800 bg-slate-950/90 px-4 py-2.5 sm:px-6 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-lg shadow-blue-500/20">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight text-white">自动报价4 · 交互拓扑与视觉画布</h1>
                <span className="rounded-full bg-cyan-950 px-2 py-0.5 text-[10px] font-medium text-cyan-400 border border-cyan-800/60">
                  Visual Blueprint Mode
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                以产品拓扑蓝图为主舞台，支持交互式端点选配与线长动态推演
              </p>
            </div>
          </div>

          {/* 实时核算状态胶囊与工具按钮 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${statusStyle.bg} ${statusStyle.text}`}>
              <span className={`h-2 w-2 rounded-full ${statusStyle.dot} animate-pulse`} />
              <span className="font-medium">{statusStyle.label}</span>
            </div>

            <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded-lg border border-slate-700">
              <button
                type="button"
                onClick={() => setCanvasView('topology')}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition ${
                  canvasView === 'topology'
                    ? 'bg-blue-600 text-white shadow-xs font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <SlidersHorizontal className="h-3 w-3" />
                交互拓扑
              </button>
              <button
                type="button"
                onClick={() => setCanvasView('drawing')}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition ${
                  canvasView === 'drawing'
                    ? 'bg-blue-600 text-white shadow-xs font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eye className="h-3 w-3" />
                工程图纸
              </button>
            </div>

            <button
              type="button"
              disabled={!evaluation.price || exporting}
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-40 transition"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
              <span>{exporting ? '导出中...' : '导出 Excel'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* 主体工作区 */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden p-3 sm:p-4 gap-3">
        {/* 左侧/上方：主舞台画布（拓扑交互或工程图） */}
        <div className="flex-1 flex flex-col min-h-0 rounded-xl border border-slate-800 bg-slate-950/60 shadow-xl overflow-hidden">
          {/* 画布顶部控制条 */}
          <div className="shrink-0 flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-2">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Cable className="h-4 w-4 text-cyan-400" />
              <span>结构示意：线长 L = {effectiveForm.lengthMm} mm</span>
              {effectiveForm.lengthMm > 5000 && (
                <span className="flex items-center gap-1 text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800 text-[11px]">
                  <AlertTriangle className="h-3 w-3" /> 超过5米，需人工核价
                </span>
              )}
            </div>

            {/* 快速长度预设胶囊 */}
            <div className="flex items-center gap-1 text-xs">
              <span className="text-[11px] text-slate-500 mr-1">快捷线长:</span>
              {QUICK_LENGTH_OPTIONS.map((len) => (
                <button
                  key={len}
                  type="button"
                  onClick={() => handleUpdate('lengthMm', len)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono transition ${
                    effectiveForm.lengthMm === len
                      ? 'bg-cyan-600 text-white font-bold'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                  }`}
                >
                  {len}mm
                </button>
              ))}
            </div>
          </div>

          {/* 画布主视口 */}
          <div className="flex-1 min-h-0 relative overflow-y-auto p-4 flex flex-col justify-center">
            {canvasView === 'drawing' ? (
              <div className="h-full flex flex-col bg-white rounded-lg p-2 overflow-auto text-slate-900">
                <AutoQuoteDrawingPreview form={effectiveForm} catalog={catalog} />
              </div>
            ) : (
              /* 交互式物理拓扑图 */
              <div className="w-full max-w-4xl mx-auto space-y-6">
                {/* 拓扑结构横向链条 */}
                <div className="relative rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-2xl backdrop-blur-xs">
                  {/* 顶部标尺与动态尺寸指示线 */}
                  <div className="mb-6 flex flex-col items-center">
                    <div className="w-full flex items-center justify-between text-cyan-400 text-xs font-mono px-6 mb-1">
                      <span>| 0 mm</span>
                      <span className="bg-cyan-950/90 border border-cyan-800 px-3 py-0.5 rounded-full text-cyan-300 font-semibold shadow-xs">
                        L = {effectiveForm.lengthMm} mm
                      </span>
                      <span>{effectiveForm.lengthMm} mm |</span>
                    </div>
                    {/* 双向标尺线条 */}
                    <div className="w-full flex items-center px-4">
                      <div className="h-2 w-0.5 bg-cyan-500" />
                      <div className="flex-1 h-0.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-500 relative">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-cyan-400 ring-4 ring-cyan-950" />
                      </div>
                      <div className="h-2 w-0.5 bg-cyan-500" />
                    </div>
                  </div>

                  {/* 物理连接链示意图 */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                    {/* A 端连接器卡片 */}
                    <div className="md:col-span-3 rounded-xl border border-blue-500/40 bg-blue-950/30 p-3 relative group hover:border-blue-400 transition">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">A 端连接器</span>
                        <span className="text-[10px] bg-blue-900/60 text-blue-300 px-1.5 py-0.2 rounded border border-blue-700/50">
                          {connA ? (connA.type === 'male' ? '公头' : '母头') : 'M12'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        {connA?.image ? (
                          <img
                            src={connA.image}
                            alt={connA.name}
                            className="h-10 w-10 shrink-0 rounded bg-slate-800 object-contain p-0.5 border border-slate-700"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 font-bold text-xs">
                            {connA?.series || 'M12'}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-slate-100">{connA?.name || '选择 A 端连接器'}</p>
                          <p className="truncate text-[11px] text-slate-400 font-mono">{connA?.model || 'M12-A-04P'}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPickerModal('connA')}
                        className="mt-2.5 w-full rounded-md border border-blue-600/50 bg-blue-600/20 py-1 text-center text-xs font-medium text-blue-300 hover:bg-blue-600 hover:text-white transition"
                      >
                        更换 A 端料号
                      </button>
                    </div>

                    {/* A 端外模注塑过渡 */}
                    <div className="md:col-span-2 flex flex-col items-center justify-center p-2 rounded-lg border border-slate-800 bg-slate-900/40">
                      <span className="text-[10px] text-slate-400 mb-1">A 端成型外模</span>
                      <span className="text-xs font-semibold text-cyan-300">
                        {effectiveForm.outerMoldType === 'pvc-45p' ? '黑色 PVC 45P' : '无外模'}
                      </span>
                      <div className="mt-1 flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleUpdate('outerMoldType', 'pvc-45p')}
                          className={`text-[10px] px-1.5 py-0.5 rounded transition ${
                            effectiveForm.outerMoldType === 'pvc-45p'
                              ? 'bg-cyan-600 text-white font-bold'
                              : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          PVC
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdate('outerMoldType', 'none')}
                          className={`text-[10px] px-1.5 py-0.5 rounded transition ${
                            effectiveForm.outerMoldType === 'none'
                              ? 'bg-cyan-600 text-white font-bold'
                              : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          无模
                        </button>
                      </div>
                    </div>

                    {/* 中间线缆本体 */}
                    <div className="md:col-span-2 flex flex-col items-center justify-center p-2 rounded-xl border border-slate-700 bg-slate-950/70 relative">
                      <span className="text-[10px] text-slate-400 mb-1">主体线材</span>
                      <div className="w-full h-3 bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 rounded-full shadow-inner my-1 flex items-center justify-center">
                        <div className="h-1 w-3/4 bg-slate-500 rounded-full" />
                      </div>
                      <p className="truncate w-full text-center text-xs font-semibold text-slate-200 mt-1">
                        {wire?.name || '选择线材'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setPickerModal('wire')}
                        className="mt-1.5 text-[10px] text-cyan-400 underline hover:text-cyan-300"
                      >
                        更换线材料号
                      </button>
                    </div>

                    {/* B 端外模过渡 */}
                    <div className="md:col-span-2 flex flex-col items-center justify-center p-2 rounded-lg border border-slate-800 bg-slate-900/40">
                      <span className="text-[10px] text-slate-400 mb-1">B 端成型外模</span>
                      <span className="text-xs font-semibold text-cyan-300">
                        {effectiveForm.endpointBType === 'connector'
                          ? (effectiveForm.outerMoldType === 'pvc-45p' ? '黑色 PVC 45P' : '无外模')
                          : '单端成型'}
                      </span>
                      <span className="text-[10px] text-slate-500 mt-1">
                        {effectiveForm.endpointBType === 'connector' ? '双端同步注塑' : '无B端外模'}
                      </span>
                    </div>

                    {/* B 端形式与连接器卡片 */}
                    <div className="md:col-span-3 rounded-xl border border-purple-500/40 bg-purple-950/30 p-3 relative group hover:border-purple-400 transition">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">B 端工艺形式</span>
                        <div className="flex gap-1 text-[10px]">
                          <button
                            type="button"
                            onClick={() => handleEndpointBChange('connector')}
                            className={`px-1.5 py-0.5 rounded transition ${
                              effectiveForm.endpointBType === 'connector'
                                ? 'bg-purple-600 text-white font-bold'
                                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            连接器
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEndpointBChange('cut')}
                            className={`px-1.5 py-0.5 rounded transition ${
                              effectiveForm.endpointBType === 'cut'
                                ? 'bg-purple-600 text-white font-bold'
                                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            切断
                          </button>
                        </div>
                      </div>

                      {effectiveForm.endpointBType === 'connector' ? (
                        <>
                          <div className="flex items-center gap-2.5">
                            {connB?.image ? (
                              <img
                                src={connB.image}
                                alt={connB.name}
                                className="h-10 w-10 shrink-0 rounded bg-slate-800 object-contain p-0.5 border border-slate-700"
                              />
                            ) : (
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-600/20 text-purple-400 border border-purple-500/30 font-bold text-xs">
                                {connB?.series || 'M12'}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-slate-100">{connB?.name || '选择 B 端连接器'}</p>
                              <p className="truncate text-[11px] text-slate-400 font-mono">{connB?.model || 'M12-A-04P母'}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPickerModal('connB')}
                            className="mt-2.5 w-full rounded-md border border-purple-600/50 bg-purple-600/20 py-1 text-center text-xs font-medium text-purple-300 hover:bg-purple-600 hover:text-white transition"
                          >
                            更换 B 端料号
                          </button>
                        </>
                      ) : (
                        <div className="py-2.5 text-center">
                          <Scissors className="mx-auto h-6 w-6 text-purple-400 mb-1" />
                          <p className="text-xs font-medium text-purple-200">平口齐头切断</p>
                          <p className="text-[10px] text-slate-400">单端 M12，另一端齐头平剪</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 物理长度动态调节滑块控制台 */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Ruler className="h-4 w-4 text-cyan-400" />
                      <span className="text-xs font-bold text-slate-200">线材实际长度调节 (100 ~ 5000mm)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={100}
                        max={10000}
                        step={50}
                        value={effectiveForm.lengthMm || ''}
                        onChange={(e) => handleUpdate('lengthMm', Math.max(1, parseInt(e.target.value) || 0))}
                        className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-mono font-bold text-cyan-300 text-right outline-none focus:border-cyan-500"
                      />
                      <span className="text-xs text-slate-400">mm</span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={100}
                    max={5000}
                    step={50}
                    value={Math.min(5000, effectiveForm.lengthMm)}
                    onChange={(e) => handleUpdate('lengthMm', parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />

                  <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                    <span>100mm</span>
                    <span>1000mm</span>
                    <span>2000mm</span>
                    <span>3000mm</span>
                    <span>4000mm</span>
                    <span>5000mm (自动报价上限)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右侧：实时 HUD 报价仪表盘与明细视窗 */}
        <div className="lg:w-[420px] xl:w-[460px] shrink-0 flex flex-col rounded-xl border border-slate-800 bg-slate-950/80 shadow-2xl overflow-hidden">
          {/* 实时单价与总价 HUD 核心卡片 */}
          <div className="p-4 border-b border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>含税含运费单价 (元/条)</span>
              <span className="text-[11px] text-slate-500">
                订单量: <strong className="text-slate-300 font-mono">{effectiveForm.quantity}</strong> 条
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-1 text-3xl font-extrabold tracking-tight text-white font-mono">
                <span className="text-xl text-cyan-400">¥</span>
                <span>{evaluation.price ? formatQuoteMoney(evaluation.price.unitPrice) : '--'}</span>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-400">订单总价</p>
                <p className="text-lg font-bold text-cyan-400 font-mono">
                  ¥ {evaluation.price ? formatQuoteMoney(evaluation.price.totalPrice) : '--'}
                </p>
              </div>
            </div>

            {/* 批量快速设定 */}
            <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">采购数量:</span>
              <div className="flex items-center gap-1">
                {QUICK_QUANTITY_OPTIONS.map((qty) => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => handleUpdate('quantity', qty)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono transition ${
                      effectiveForm.quantity === qty
                        ? 'bg-blue-600 text-white font-bold'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {qty}
                  </button>
                ))}
              </div>
            </div>

            {/* 成本结构比例条 */}
            {evaluation.price && (
              <div className="mt-3">
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>材料成本: {materialPct}%</span>
                  <span>制造加工工序: {laborPct}%</span>
                </div>
                <div className="h-2 w-full flex rounded-full overflow-hidden bg-slate-800">
                  <div
                    style={{ width: `${materialPct}%` }}
                    className="bg-blue-500 transition-all duration-300"
                    title={`材料小计 ¥${formatQuoteMoney(evaluation.price.materialSubtotal)}`}
                  />
                  <div
                    style={{ width: `${laborPct}%` }}
                    className="bg-emerald-500 transition-all duration-300"
                    title={`加工小计 ¥${formatQuoteMoney(evaluation.price.laborSubtotal)}`}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 核算阻碍或待支持提示 */}
          {evaluation.issues.length > 0 && (
            <div className="p-3 border-b border-slate-800 bg-amber-950/40 text-amber-300 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-amber-400">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>核算说明或限制提示</span>
              </div>
              <ul className="list-disc list-inside text-[11px] space-y-0.5 text-amber-200/90 pl-1">
                {evaluation.issues.map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 下部选项卡切换 */}
          <div className="shrink-0 flex border-b border-slate-800 bg-slate-900/90 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('cost')}
              className={`flex-1 py-2 font-medium text-center transition border-b-2 ${
                activeTab === 'cost'
                  ? 'border-cyan-500 text-cyan-400 bg-slate-900 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              工序与材料清单
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('specs')}
              className={`flex-1 py-2 font-medium text-center transition border-b-2 ${
                activeTab === 'specs'
                  ? 'border-cyan-500 text-cyan-400 bg-slate-900 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              物理规格确认
            </button>
          </div>

          {/* 选项卡内容 */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 text-xs space-y-3">
            {activeTab === 'cost' && (
              <>
                {evaluation.price ? (
                  <div className="space-y-3">
                    {/* 材料明细 */}
                    <div>
                      <div className="flex justify-between items-center text-[11px] font-bold text-slate-300 mb-1.5">
                        <span>物料明细 (单条用量)</span>
                        <span className="font-mono text-cyan-400">小计 ¥{formatQuoteMoney(evaluation.price.materialSubtotal)}</span>
                      </div>
                      <div className="space-y-1">
                        {evaluation.price.materials.map((m, idx) => (
                          <div key={idx} className="flex justify-between rounded bg-slate-900/80 p-2 text-[11px] border border-slate-800">
                            <div>
                              <p className="font-medium text-slate-200">{m.name}</p>
                              <p className="text-[10px] text-slate-500">用量: {m.points} · 单价 ¥{m.unitPrice}</p>
                            </div>
                            <span className="font-mono font-semibold text-slate-100">¥{formatQuoteMoney(m.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 工艺人工明细 */}
                    <div>
                      <div className="flex justify-between items-center text-[11px] font-bold text-slate-300 mb-1.5">
                        <span>加工与组装工时</span>
                        <span className="font-mono text-emerald-400">小计 ¥{formatQuoteMoney(evaluation.price.laborSubtotal)}</span>
                      </div>
                      <div className="space-y-1">
                        {evaluation.price.labor.map((l, idx) => (
                          <div key={idx} className="flex justify-between rounded bg-slate-900/80 p-2 text-[11px] border border-slate-800">
                            <div>
                              <p className="font-medium text-slate-200">{l.name}</p>
                              <p className="text-[10px] text-slate-500">点数: {l.points} · 费率 ¥{l.unitPrice}</p>
                            </div>
                            <span className="font-mono font-semibold text-slate-100">¥{formatQuoteMoney(l.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-center py-8 text-slate-500">物料和价格配置就绪后自动生成明细。</p>
                )}
              </>
            )}

            {activeTab === 'specs' && (
              <div className="space-y-2">
                <div className="rounded bg-slate-900/80 p-2.5 border border-slate-800 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-400">A 端型号:</span>
                    <span className="font-semibold text-slate-200">{connA?.name || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">B 端形态:</span>
                    <span className="font-semibold text-slate-200">
                      {effectiveForm.endpointBType === 'connector' ? (connB?.name || '-') : '切断齐头'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">线材规格:</span>
                    <span className="font-semibold text-slate-200">{formatWireSummary(wire)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">总长度 (L):</span>
                    <span className="font-semibold text-slate-200 font-mono">{effectiveForm.lengthMm} mm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">成型外模:</span>
                    <span className="font-semibold text-slate-200">
                      {effectiveForm.outerMoldType === 'pvc-45p' ? '黑色 PVC 45P' : '无外模'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">成型端数:</span>
                    <span className="font-semibold text-slate-200">{effectiveForm.outerMoldEnds} 端</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => downloadAutoQuoteDrawingSvg(effectiveForm, catalog)}
                    className="flex-1 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 font-medium transition"
                  >
                    下载 SVG 图纸
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadAutoQuoteDrawingPng(effectiveForm, catalog)}
                    className="flex-1 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 font-medium transition"
                  >
                    下载 PNG 图纸
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 连接器与线材弹窗选择器 */}
      {catalog && (
        <>
          <ConnectorPickerModal
            isOpen={pickerModal === 'connA'}
            title="选择 A 端连接器"
            connectors={catalog.connectors ?? []}
            selectedId={effectiveForm.connectorAId}
            onSelect={(c) => {
              handleUpdate('connectorAId', c.id);
              setPickerModal(null);
            }}
            onClose={() => setPickerModal(null)}
          />

          <ConnectorPickerModal
            isOpen={pickerModal === 'connB'}
            title="选择 B 端连接器"
            connectors={catalog.connectors ?? []}
            selectedId={effectiveForm.connectorBId}
            onSelect={(c) => {
              handleUpdate('connectorBId', c.id);
              setPickerModal(null);
            }}
            onClose={() => setPickerModal(null)}
          />

          <WirePickerModal
            isOpen={pickerModal === 'wire'}
            wires={catalog.wires ?? []}
            selectedResourceId={effectiveForm.wireResourceId}
            onSelect={(w) => {
              handleUpdate('wireResourceId', w.resourceItemId);
              setPickerModal(null);
            }}
            onClose={() => setPickerModal(null)}
          />
        </>
      )}
    </div>
  );
}

export default AutoQuote4Page;

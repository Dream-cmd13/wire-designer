import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  FileSpreadsheet,
  FileText,
  Printer,
  Ruler,
  TableProperties,
  TrendingDown,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ConnectorPickerModal } from '@/components/autoQuote/ConnectorPickerModal';
import { WirePickerModal } from '@/components/autoQuote/WirePickerModal';
import { safeFilename } from '@/lib/designFile';
import {
  DEFAULT_AUTO_QUOTE_FORM,
  evaluateAutoQuote,
  isSupportedConnector,
  isSupportedOvermold,
  type AutoQuoteEndpointBType,
  type AutoQuoteFormState,
  type AutoQuoteOuterMoldType,
} from '@/lib/autoQuote';
import { formatQuoteMoney } from '@/lib/pricing';
import { createQuoteWorkbook } from '@/lib/quoteExport';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePriceStore } from '@/stores/priceStore';

const TIER_QUANTITIES = [50, 100, 200, 500, 1000, 2000, 5000];
const TIER_LENGTHS = [500, 1000, 1500, 2000, 3000, 5000];

function estimateLeadTime(quantity: number): string {
  if (quantity <= 100) return '3-4 工作日';
  if (quantity <= 500) return '5-7 工作日';
  if (quantity <= 2000) return '7-10 工作日';
  return '12-15 工作日';
}

export function AutoQuote5Page() {
  const { snapshot: catalog, status: catalogStatus, initialize: initializeCatalog } = useCatalogStore();

  const priceStore = usePriceStore();
  const { book, load: loadPrices } = priceStore;

  const [form, setForm] = useState<AutoQuoteFormState>(DEFAULT_AUTO_QUOTE_FORM);
  const [viewMode, setViewMode] = useState<'matrix' | 'proposal'>('matrix');
  const [pickerModal, setPickerModal] = useState<'connA' | 'connB' | 'wire' | null>(null);

  // 商务函自定义字段
  const [clientCompany, setClientCompany] = useState('某高端智能装备（上海）有限公司');
  const [clientContact, setClientContact] = useState('张工 / 采购工程部');
  const [quoteNumber] = useState(() => `WHQ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-8821`);
  const [copied, setCopied] = useState(false);
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

  // 基准核算
  const baseEvaluation = useMemo(() => {
    return evaluateAutoQuote(effectiveForm, prices, catalog);
  }, [effectiveForm, prices, catalog]);

  // 批量阶梯核算矩阵
  const quantityTierResults = useMemo(() => {
    return TIER_QUANTITIES.map((qty) => {
      const evalRes = evaluateAutoQuote({ ...effectiveForm, quantity: qty }, prices, catalog);
      return {
        quantity: qty,
        evaluation: evalRes,
      };
    });
  }, [effectiveForm, prices, catalog]);

  // 长度对比核算矩阵
  const lengthTierResults = useMemo(() => {
    return TIER_LENGTHS.map((len) => {
      const evalRes = evaluateAutoQuote({ ...effectiveForm, lengthMm: len }, prices, catalog);
      return {
        lengthMm: len,
        evaluation: evalRes,
      };
    });
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
    if (!baseEvaluation.config || !baseEvaluation.price) return;
    try {
      setExporting(true);
      const workbook = createQuoteWorkbook(baseEvaluation.config, prices, catalog);
      const filename = safeFilename(`${baseEvaluation.config.name}_自动报价5_商务成本分析.xlsx`);
      XLSX.writeFile(workbook, filename);
    } catch {
      // ignore
    } finally {
      setExporting(false);
    }
  };

  const handleCopySummary = async () => {
    if (!baseEvaluation.price) return;
    const text = [
      `【线束商务报价函摘要】`,
      `单号: ${quoteNumber}`,
      `客户: ${clientCompany} (${clientContact})`,
      `规格: A端 ${connA?.name || 'M12'} / B端 ${effectiveForm.endpointBType === 'connector' ? (connB?.name || 'M12') : '切断'} / 线长 ${effectiveForm.lengthMm}mm`,
      `线材: ${wire?.name || '-'}`,
      `数量: ${effectiveForm.quantity} 条`,
      `含税单价: ¥${formatQuoteMoney(baseEvaluation.price.unitPrice)} / 条`,
      `含税总价: ¥${formatQuoteMoney(baseEvaluation.price.totalPrice)}`,
      `含13%增值税发票与标准运费。`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  // 首档基准价格，用于计算批量折扣
  const firstTierUnitPrice = quantityTierResults[0]?.evaluation.price
    ? parseFloat(quantityTierResults[0].evaluation.price.unitPrice)
    : 0;

  // 成本拆解比例
  const materialSub = baseEvaluation.price ? parseFloat(baseEvaluation.price.materialSubtotal) : 0;
  const laborSub = baseEvaluation.price ? parseFloat(baseEvaluation.price.laborSubtotal) : 0;
  const costSum = materialSub + laborSub;
  const materialRatio = costSum > 0 ? Math.round((materialSub / costSum) * 100) : 60;
  const laborRatio = 100 - materialRatio;

  return (
    <div className="flex h-full flex-col bg-slate-100 overflow-hidden text-slate-800">
      {/* 顶部通栏横幅 */}
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-2.5 sm:px-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
              <TableProperties className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-slate-900">自动报价5 · 阶梯比价矩阵与商务报价单</h1>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 border border-indigo-200">
                  B2B Commercial Pro
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                专为大宗采购与商务谈判设计的起订批量比价矩阵与正式外发报价函
              </p>
            </div>
          </div>

          {/* 视图模式切换与导出 */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('matrix')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition ${
                  viewMode === 'matrix'
                    ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TableProperties className="h-3.5 w-3.5" />
                阶梯比价矩阵
              </button>
              <button
                type="button"
                onClick={() => setViewMode('proposal')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition ${
                  viewMode === 'proposal'
                    ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                正式商务报价函
              </button>
            </div>

            <button
              type="button"
              disabled={!baseEvaluation.price || exporting}
              onClick={handleExportExcel}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 shadow-xs"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              <span>{exporting ? '导出中...' : 'Excel'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* 紧凑横向规格快速选配栏 */}
      <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* A 端 */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-2.5 py-1">
            <span className="font-semibold text-slate-500 text-[11px]">A端:</span>
            <button
              type="button"
              onClick={() => setPickerModal('connA')}
              className="font-medium text-blue-600 hover:underline max-w-[120px] truncate"
            >
              {connA?.name || '选择A端'}
            </button>
          </div>

          {/* B 端 */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-2.5 py-1">
            <span className="font-semibold text-slate-500 text-[11px]">B端:</span>
            <select
              value={effectiveForm.endpointBType}
              onChange={(e) => handleEndpointBChange(e.target.value as AutoQuoteEndpointBType)}
              className="font-medium text-slate-700 bg-transparent outline-none cursor-pointer"
            >
              <option value="connector">连接器</option>
              <option value="cut">齐头切断</option>
            </select>
            {effectiveForm.endpointBType === 'connector' && (
              <button
                type="button"
                onClick={() => setPickerModal('connB')}
                className="font-medium text-purple-600 hover:underline max-w-[120px] truncate border-l border-slate-200 pl-1.5"
              >
                {connB?.name || '选择B端'}
              </button>
            )}
          </div>

          {/* 线材 */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-2.5 py-1">
            <span className="font-semibold text-slate-500 text-[11px]">线材:</span>
            <button
              type="button"
              onClick={() => setPickerModal('wire')}
              className="font-medium text-slate-800 hover:underline max-w-[140px] truncate"
            >
              {wire?.name || '选择线材'}
            </button>
          </div>

          {/* 外模 */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-2.5 py-1">
            <span className="font-semibold text-slate-500 text-[11px]">外模:</span>
            <select
              value={effectiveForm.outerMoldType}
              onChange={(e) => handleUpdate('outerMoldType', e.target.value as AutoQuoteOuterMoldType)}
              className="font-medium text-slate-700 bg-transparent outline-none cursor-pointer"
            >
              <option value="pvc-45p">黑色 PVC 45P</option>
              <option value="none">无外模</option>
            </select>
          </div>

          {/* 基准长度 */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-md px-2.5 py-1">
            <span className="font-semibold text-slate-500 text-[11px]">基准线长:</span>
            <input
              type="number"
              min={100}
              max={10000}
              step={100}
              value={effectiveForm.lengthMm || ''}
              onChange={(e) => handleUpdate('lengthMm', Math.max(1, parseInt(e.target.value) || 0))}
              className="w-16 font-mono font-bold text-slate-800 outline-none text-right"
            />
            <span className="text-slate-400 text-[11px]">mm</span>
          </div>

          {/* 基准采购量 */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-md px-2.5 py-1">
            <span className="font-semibold text-slate-500 text-[11px]">基准数量:</span>
            <input
              type="number"
              min={1}
              max={1000000}
              step={100}
              value={effectiveForm.quantity || ''}
              onChange={(e) => handleUpdate('quantity', Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 font-mono font-bold text-slate-800 outline-none text-right"
            />
            <span className="text-slate-400 text-[11px]">条</span>
          </div>
        </div>
      </div>

      {/* 主视口 */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {viewMode === 'matrix' ? (
          /* 视图 1：阶梯比价矩阵 */
          <div className="max-w-6xl mx-auto space-y-6">
            {/* 顶栏快速概览看板 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-xs">
                <span className="text-xs text-indigo-600 font-semibold">基准采购单价 (含税)</span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold text-indigo-950 font-mono">
                    ¥{baseEvaluation.price ? formatQuoteMoney(baseEvaluation.price.unitPrice) : '--'}
                  </span>
                  <span className="text-xs text-slate-500">/ 条</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  当前设定基准数量: {effectiveForm.quantity} 条
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <span className="text-xs text-slate-500 font-medium">基准订单含税总价</span>
                <div className="mt-1 text-2xl font-extrabold text-slate-900 font-mono">
                  ¥{baseEvaluation.price ? formatQuoteMoney(baseEvaluation.price.totalPrice) : '--'}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  包含 13% 增值税及常规物流运费
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <span className="text-xs text-slate-500 font-medium">单件成本构成占比</span>
                <div className="mt-2 h-2 w-full flex rounded-full overflow-hidden bg-slate-100">
                  <div style={{ width: `${materialRatio}%` }} className="bg-indigo-600" />
                  <div style={{ width: `${laborRatio}%` }} className="bg-emerald-500" />
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-slate-600">
                  <span>物料: {materialRatio}%</span>
                  <span>工时加工: {laborRatio}%</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col justify-between">
                <div>
                  <span className="text-xs text-slate-500 font-medium">核算引擎状态</span>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {baseEvaluation.status === 'ready' ? '公式引擎实时计算完成' : '需人工核对或完善'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewMode('proposal')}
                  className="mt-2 flex items-center justify-center gap-1 w-full rounded-lg bg-indigo-600 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition"
                >
                  <FileText className="h-3.5 w-3.5" />
                  生成正式外发报价单
                </button>
              </div>
            </div>

            {/* 核心表格 1：起订量阶梯比价矩阵 */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-indigo-600" />
                  <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    起订量梯度价格矩阵 (Tier Matrix · {effectiveForm.lengthMm}mm)
                  </h2>
                </div>
                <span className="text-[11px] text-slate-500">
                  点击行右侧按钮可直接同步为当前基准量
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                    <tr>
                      <th className="py-2.5 px-4">采购批量 (PCS)</th>
                      <th className="py-2.5 px-4">含税单价 (元/条)</th>
                      <th className="py-2.5 px-4">阶梯降幅 (%)</th>
                      <th className="py-2.5 px-4">订单总价 (元)</th>
                      <th className="py-2.5 px-4">单件材料成本</th>
                      <th className="py-2.5 px-4">单件加工费用</th>
                      <th className="py-2.5 px-4">预估交期</th>
                      <th className="py-2.5 px-4 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {quantityTierResults.map(({ quantity: qty, evaluation: evalRes }) => {
                      const isCurrent = effectiveForm.quantity === qty;
                      const uPrice = evalRes.price ? parseFloat(evalRes.price.unitPrice) : 0;
                      const savings = (firstTierUnitPrice > 0 && uPrice > 0)
                        ? ((firstTierUnitPrice - uPrice) / firstTierUnitPrice) * 100
                        : 0;

                      return (
                        <tr
                          key={qty}
                          className={`hover:bg-slate-50/80 transition ${
                            isCurrent ? 'bg-indigo-50/60 font-semibold' : ''
                          }`}
                        >
                          <td className="py-2.5 px-4 font-mono">
                            <span className="flex items-center gap-1.5">
                              {qty} 条
                              {isCurrent && (
                                <span className="rounded bg-indigo-600 text-white text-[10px] px-1.5 py-0.2 font-normal">
                                  基准量
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono font-bold text-indigo-700">
                            ¥{evalRes.price ? formatQuoteMoney(evalRes.price.unitPrice) : '--'}
                          </td>
                          <td className="py-2.5 px-4 font-mono">
                            {savings > 0 ? (
                              <span className="text-emerald-600 font-bold">-{savings.toFixed(1)}%</span>
                            ) : (
                              <span className="text-slate-400">基准档 (0%)</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-900">
                            ¥{evalRes.price ? formatQuoteMoney(evalRes.price.totalPrice) : '--'}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-600">
                            ¥{evalRes.price ? formatQuoteMoney(evalRes.price.materialSubtotal) : '--'}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-600">
                            ¥{evalRes.price ? formatQuoteMoney(evalRes.price.laborSubtotal) : '--'}
                          </td>
                          <td className="py-2.5 px-4 text-slate-500">
                            {estimateLeadTime(qty)}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleUpdate('quantity', qty)}
                              className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 transition"
                            >
                              设为当前量
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 核心表格 2：线材长度跨度比价矩阵 */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Ruler className="h-4 w-4 text-indigo-600" />
                  <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    长度档位价格对比 (Length Tiers · {effectiveForm.quantity}条)
                  </h2>
                </div>
                <span className="text-[11px] text-slate-500">
                  分析不同成品线长对采购单价的边际影响
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                    <tr>
                      <th className="py-2.5 px-4">成品线长 (mm)</th>
                      <th className="py-2.5 px-4">含税单价 (元/条)</th>
                      <th className="py-2.5 px-4">订单总价 (元)</th>
                      <th className="py-2.5 px-4">材料成本小计</th>
                      <th className="py-2.5 px-4 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lengthTierResults.map(({ lengthMm: len, evaluation: evalRes }) => {
                      const isCurrent = effectiveForm.lengthMm === len;
                      return (
                        <tr
                          key={len}
                          className={`hover:bg-slate-50/80 transition ${
                            isCurrent ? 'bg-indigo-50/60 font-semibold' : ''
                          }`}
                        >
                          <td className="py-2.5 px-4 font-mono">
                            <span className="flex items-center gap-1.5">
                              {len} mm ({(len / 1000).toFixed(1)}m)
                              {isCurrent && (
                                <span className="rounded bg-indigo-600 text-white text-[10px] px-1.5 py-0.2 font-normal">
                                  基准长
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                            ¥{evalRes.price ? formatQuoteMoney(evalRes.price.unitPrice) : '--'}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-indigo-700">
                            ¥{evalRes.price ? formatQuoteMoney(evalRes.price.totalPrice) : '--'}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-600">
                            ¥{evalRes.price ? formatQuoteMoney(evalRes.price.materialSubtotal) : '--'}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleUpdate('lengthMm', len)}
                              className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 transition"
                            >
                              设为当前长
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          /* 视图 2：正式商务报价函（可打印排版） */
          <div className="max-w-4xl mx-auto space-y-4">
            {/* 打印与操作工具栏 */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-xs print:hidden">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <FileText className="h-4 w-4 text-indigo-600" />
                <span>报价函已就绪，可直接打印或转存为 PDF</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? '已复制摘要' : '复制文本摘要'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 shadow-xs"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>打印 / 另存为 PDF</span>
                </button>
              </div>
            </div>

            {/* 纸质版报价单排版区域 */}
            <div className="bg-white rounded-xl border border-slate-300 p-8 sm:p-10 shadow-sm print:p-0 print:border-none print:shadow-none space-y-6">
              {/* 企业公司抬头 */}
              <div className="border-b-2 border-indigo-900 pb-5">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-slate-900">
                      工业线束制造与互联技术有限公司
                    </h2>
                    <p className="text-xs text-slate-500 uppercase tracking-widest mt-0.5">
                      INDUSTRIAL WIRE HARNESS INTERCONNECT CO., LTD.
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      地址: 工业园区线束智能制造基地 8 号楼 · 电话: 021-88888888
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-bold px-3 py-1 rounded">
                      商务报价函 (QUOTATION)
                    </span>
                    <p className="font-mono text-xs font-semibold text-slate-700 mt-2">
                      单号: {quoteNumber}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      日期: {new Date().toISOString().slice(0, 10)}
                    </p>
                  </div>
                </div>
              </div>

              {/* 客户与项目信息交互输入 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50/70 p-4 rounded-lg border border-slate-200 print:bg-transparent">
                <div>
                  <span className="text-slate-500 font-medium">客户名称:</span>
                  <input
                    type="text"
                    value={clientCompany}
                    onChange={(e) => setClientCompany(e.target.value)}
                    className="w-full mt-1 bg-transparent font-semibold text-slate-900 border-b border-dashed border-slate-300 focus:border-indigo-600 outline-none pb-0.5"
                  />
                </div>
                <div>
                  <span className="text-slate-500 font-medium">联络人 / 部门:</span>
                  <input
                    type="text"
                    value={clientContact}
                    onChange={(e) => setClientContact(e.target.value)}
                    className="w-full mt-1 bg-transparent font-semibold text-slate-900 border-b border-dashed border-slate-300 focus:border-indigo-600 outline-none pb-0.5"
                  />
                </div>
                <div>
                  <span className="text-slate-500 font-medium">报价有效期限:</span>
                  <p className="mt-1 font-semibold text-slate-900">自报价之日起 30 个自然日内有效</p>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">结算币种与税率:</span>
                  <p className="mt-1 font-semibold text-slate-900">人民币 CNY · 含 13% 增值税专用发票</p>
                </div>
              </div>

              {/* 报价产品明细表 */}
              <div>
                <table className="w-full text-left text-xs border border-slate-200">
                  <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-semibold">
                    <tr>
                      <th className="p-3">序号</th>
                      <th className="p-3">产品名称与完整规格</th>
                      <th className="p-3 text-center">数量</th>
                      <th className="p-3 text-center">单位</th>
                      <th className="p-3 text-right">含税单价 (元)</th>
                      <th className="p-3 text-right">含税合价 (元)</th>
                      <th className="p-3 text-center">交期</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="p-3 font-mono text-center">01</td>
                      <td className="p-3 space-y-1">
                        <p className="font-bold text-slate-900 text-sm">
                          定制线束组件 (A端 M12 / {effectiveForm.endpointBType === 'connector' ? '双头注塑' : '单头切断'})
                        </p>
                        <p className="text-slate-600">
                          <strong>A端:</strong> {connA?.name || 'M12-A-04P公'} ({connA?.model || '-'})
                        </p>
                        <p className="text-slate-600">
                          <strong>B端:</strong> {effectiveForm.endpointBType === 'connector' ? (connB?.name || 'M12-A-04P母') : '齐头切断'}
                        </p>
                        <p className="text-slate-600">
                          <strong>线材:</strong> {wire?.name || '标准护套线'} · 长度 L = {effectiveForm.lengthMm} mm
                        </p>
                        <p className="text-slate-600">
                          <strong>外模:</strong> {effectiveForm.outerMoldType === 'pvc-45p' ? '黑色 PVC 45P' : '无外模'}
                        </p>
                      </td>
                      <td className="p-3 font-mono text-center font-bold">{effectiveForm.quantity}</td>
                      <td className="p-3 text-center">条</td>
                      <td className="p-3 font-mono text-right font-bold text-slate-900">
                        ¥{baseEvaluation.price ? formatQuoteMoney(baseEvaluation.price.unitPrice) : '--'}
                      </td>
                      <td className="p-3 font-mono text-right font-bold text-indigo-700 text-sm">
                        ¥{baseEvaluation.price ? formatQuoteMoney(baseEvaluation.price.totalPrice) : '--'}
                      </td>
                      <td className="p-3 text-center text-slate-600">
                        {estimateLeadTime(effectiveForm.quantity)}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200 font-bold">
                    <tr>
                      <td colSpan={5} className="p-3 text-right text-slate-700">
                        订单总金额 (含 13% 增值税及运费):
                      </td>
                      <td className="p-3 text-right font-mono text-base text-indigo-700">
                        ¥{baseEvaluation.price ? formatQuoteMoney(baseEvaluation.price.totalPrice) : '--'}
                      </td>
                      <td className="p-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* 商务条款与交付承诺 */}
              <div className="border border-slate-200 rounded-lg p-4 text-[11px] text-slate-600 space-y-1.5 leading-relaxed">
                <h4 className="font-bold text-slate-800 text-xs mb-1">商务及质量条款声明：</h4>
                <p>1. <strong>品质执行规范：</strong>产品遵循 IPC/WHMA-A-620 工业级标准生产制造，出厂前实行 100% 导通、绝缘耐压及线序校验。</p>
                <p>2. <strong>运输与运费：</strong>供方承担中国大陆境内指定送达地点的标准物流与保价运费。</p>
                <p>3. <strong>开票说明：</strong>报价已包含 13% 增值税专用发票，货物验收合格后开具。</p>
                <p>4. <strong>技术变更：</strong>本报价单基于当前选配规格测算，若后续图纸或线序发生工程变更，价格将随之微调。</p>
              </div>

              {/* 签章栏 */}
              <div className="grid grid-cols-2 gap-8 pt-8">
                <div className="border-t border-slate-300 pt-3">
                  <p className="font-semibold text-xs text-slate-800">供方授权代表签署 (签字/公章):</p>
                  <div className="h-16 flex items-end">
                    <p className="text-[11px] text-slate-400">工业线束制造与互联技术有限公司 [业务专用章]</p>
                  </div>
                </div>
                <div className="border-t border-slate-300 pt-3">
                  <p className="font-semibold text-xs text-slate-800">需方客户确认签署 (签字/盖章):</p>
                  <div className="h-16 flex items-end">
                    <p className="text-[11px] text-slate-400">确认回签日期: ______年____月____日</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 物料弹窗选择器 */}
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

export default AutoQuote5Page;

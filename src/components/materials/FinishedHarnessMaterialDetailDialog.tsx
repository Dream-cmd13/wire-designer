import { useEffect, useState } from 'react';
import {
  Calculator,
  Calendar,
  Check,
  ChevronRight,
  Copy,
  DollarSign,
  ExternalLink,
  FileSpreadsheet,
  Info,
  Layers,
  Package,
  X,
} from 'lucide-react';
import { finishedHarnessMaterialRepository } from '@/repositories/finishedHarnessMaterialRepository';
import { ExcelPreviewModal } from './ExcelPreviewModal';
import type {
  FinishedHarnessCostAnalysis,
  FinishedHarnessMaterial,
} from '@/types/finishedHarnessMaterial';

interface FinishedHarnessMaterialDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  material: FinishedHarnessMaterial | null;
}

function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return '暂无';
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return isoString;
  }
}

function formatAmount(value: number | null | undefined, digits: number): string {
  return value != null ? value.toFixed(digits) : '原表未提供';
}

function formatTableCell(value: number | null | undefined, digits: number): string {
  return value != null ? value.toFixed(digits) : '-';
}

export function FinishedHarnessMaterialDetailDialog({
  isOpen,
  onClose,
  material,
}: FinishedHarnessMaterialDetailDialogProps) {
  const currentPlatformNo = isOpen ? material?.platformNo ?? null : null;
  const [loadedData, setLoadedData] = useState<{
    platformNo: string;
    analysis: FinishedHarnessCostAnalysis | null;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'process' | 'bom' | 'labor'>('process');
  const [showExcelPreview, setShowExcelPreview] = useState<boolean>(false);
  const [copiedReport, setCopiedReport] = useState<boolean>(false);

  // 渲染期派生状态：当前物料变化时自动判断加载状态与数据，无需在 effect 中同步 setState
  const loadingAnalysis = Boolean(currentPlatformNo && loadedData?.platformNo !== currentPlatformNo);
  const costAnalysis =
    loadedData && loadedData.platformNo === currentPlatformNo ? loadedData.analysis : null;

  useEffect(() => {
    if (!isOpen || showExcelPreview) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, showExcelPreview]);

  // 加载该成品料号的成本分析数据
  useEffect(() => {
    if (!isOpen || !material?.platformNo) {
      return;
    }

    const targetNo = material.platformNo;
    let isCancelled = false;

    finishedHarnessMaterialRepository
      .getCostAnalysisByPlatformNo(targetNo)
      .then((data) => {
        if (!isCancelled) {
          setLoadedData({ platformNo: targetNo, analysis: data });
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error('加载成品线束成本分析失败:', err);
          setLoadedData({ platformNo: targetNo, analysis: null });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, material?.platformNo]);

  if (!isOpen || !material) return null;

  const supplierNo = material.supplier?.supplier_no || material.supplierNo;
  const totalCost = costAnalysis ? costAnalysis.totalCost : material.totalCost;
  const salesPrice = costAnalysis
    ? costAnalysis.salesPrice
    : material.salesPrice ?? material.sonPriceLow;
  const samplePrice = costAnalysis ? costAnalysis.samplePrice : material.samplePrice;
  const quotePrice = costAnalysis ? costAnalysis.quotePrice : material.quotePrice;

  // 售价口径提示按原表实际公式动态显示，避免写死“30% 毛利”
  const salesPriceHint = (() => {
    if (!costAnalysis) return '目录/CRM 基础价';
    const step = costAnalysis.calculationSteps.find((s) => s.stepKey === 'sales_price');
    const margin = step?.formula?.match(/目标毛利率\s*(\d+)%/);
    if (margin) return `目标毛利率 ${margin[1]}%`;
    return '按原表公式推导';
  })();

  const handleCopyReport = async () => {
    if (!material) return;
    const lines: string[] = [
      `【万连成品线束方案成本核算与报价报告】`,
      `平台料号：${material.platformNo}`,
      `物料名称：${material.sonName || '未命名'}`,
      `供应商：${supplierNo || '未配置'}`,
      costAnalysis?.customerName ? `客户名称：${costAnalysis.customerName}` : '',
      costAnalysis?.customerPartNo ? `客户料号：${costAnalysis.customerPartNo}` : '',
      `----------------------------------------`,
      `【核心价格指标】`,
      `• 综合总成本：¥ ${formatAmount(totalCost, 4)} 元`,
      `• 销售定价：¥ ${formatAmount(salesPrice, 4)} 元`,
      `• 样品单价：¥ ${formatAmount(samplePrice, 4)} 元`,
      `• 建议对外报价：¥ ${formatAmount(quotePrice, 4)} 元`,
    ];

    if (costAnalysis) {
      lines.push(
        `----------------------------------------`,
        `【成本与损耗核算构成】`,
        `• 原材料小计：¥ ${formatAmount(costAnalysis.materialCost, 4)} 元 (损耗金: ¥ ${formatAmount(costAnalysis.materialLoss, 4)} 元)`,
        `• 人工工时小计：¥ ${formatAmount(costAnalysis.laborCost, 4)} 元 (损耗金: ¥ ${formatAmount(costAnalysis.laborLoss, 4)} 元)`,
        `• 管理与税费：¥ ${formatAmount(costAnalysis.taxCost, 4)} 元`,
      );

      if (costAnalysis.calculationSteps && costAnalysis.calculationSteps.length > 0) {
        lines.push(
          `----------------------------------------`,
          `【价格推导计算过程明细】`,
        );
        for (const s of costAnalysis.calculationSteps) {
          lines.push(
            `• [${s.stepKey}] ${s.name}: ${s.expression} = ¥ ${formatAmount(s.result, 4)}`,
          );
        }
      }

      if (costAnalysis.sourceExcelFile) {
        lines.push(
          `----------------------------------------`,
          `来源原始文件：${costAnalysis.sourceExcelFile} (${costAnalysis.sourceSheetName})`,
        );
      }
    }

    const text = lines.filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2500);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="finished-harness-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50 rounded-t-xl">
          <div>
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              <h3 id="finished-harness-detail-title" className="text-base font-bold text-slate-900">
                成品线束物料详情
              </h3>
              {costAnalysis && (
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                  已核算成本与公式
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-3">
              <span className="font-mono text-xs font-semibold text-blue-600">
                {material.platformNo}
              </span>
              <span
                className={`text-xs truncate max-w-[360px] ${
                  material.sonName ? 'text-slate-500 font-medium' : 'text-slate-400 italic'
                }`}
              >
                {material.sonName || '未命名'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyReport}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition shadow-2xs"
              title="一键复制格式化报价推导报告到剪贴板"
            >
              {copiedReport ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-medium">已复制报告</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-slate-500" />
                  <span>复制核算报告</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="关闭 (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {/* 四大价格指标卡片看板 */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <DollarSign className="h-4 w-4 text-slate-500" />
                <span>价格信息</span>
              </div>
              {costAnalysis && (
                <span className="text-[11px] text-slate-400 font-mono">
                  来源: {costAnalysis.sourceExcelFile} ({costAnalysis.sourceSheetName})
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* 总成本 / 成本分析 */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                <span className="text-slate-500 text-[11px] block">成本分析：</span>
                <div className="mt-1 font-mono text-base font-bold text-slate-800">
                  {totalCost != null ? `¥ ${totalCost.toFixed(2)}` : '暂无'}
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">材料+工时及损耗</span>
              </div>

              {/* 建议售价 */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                <span className="text-emerald-700 text-[11px] font-medium block">最低售价：</span>
                <div className="mt-1 font-mono text-base font-bold text-emerald-700">
                  {salesPrice != null ? `¥ ${salesPrice.toFixed(2)}` : '暂无'}
                </div>
                <span className="text-[10px] text-emerald-600/80 mt-0.5 block">{salesPriceHint}</span>
              </div>

              {/* 打样样品价 */}
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                <span className="text-amber-700 text-[11px] font-medium block">样品价：</span>
                <div className="mt-1 font-mono text-base font-bold text-amber-800">
                  {samplePrice != null ? `¥ ${samplePrice.toFixed(2)}` : '暂无'}
                </div>
                <span className="text-[10px] text-amber-600/80 mt-0.5 block">通常按保本成本 2 倍核算</span>
              </div>

              {/* 正式/核定报价 */}
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
                <span className="text-indigo-700 text-[11px] font-medium block">正式报价：</span>
                <div className="mt-1 font-mono text-base font-bold text-indigo-800">
                  {quotePrice != null ? `¥ ${quotePrice.toFixed(2)}` : '暂无'}
                </div>
                <span className="text-[10px] text-indigo-600/80 mt-0.5 block">速通或客户核定报价</span>
              </div>
            </div>
          </section>

          {/* 价格计算过程与公式推导专区 */}
          <section className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-blue-600" />
                <span className="font-semibold text-slate-800">成本核算与定价公式推导过程</span>
              </div>

              {/* 明细切换 Tab */}
              <div className="flex items-center gap-1 rounded-md bg-slate-200/60 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('process')}
                  className={`cursor-pointer rounded px-2.5 py-1 font-medium transition ${
                    activeTab === 'process'
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  计算过程 ({costAnalysis?.calculationSteps?.length ?? 0}步)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('bom')}
                  className={`cursor-pointer rounded px-2.5 py-1 font-medium transition ${
                    activeTab === 'bom'
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  BOM物料明细 ({costAnalysis?.bomItems?.length ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('labor')}
                  className={`cursor-pointer rounded px-2.5 py-1 font-medium transition ${
                    activeTab === 'labor'
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  工序工时清单 ({costAnalysis?.laborItems?.length ?? 0})
                </button>
              </div>
            </div>

            <div className="p-4">
              {loadingAnalysis && (
                <div className="py-8 text-center text-slate-400">
                  正在加载成本推导过程与明细...
                </div>
              )}

              {!loadingAnalysis && !costAnalysis && (
                <div className="py-8 text-center text-slate-400">
                  该料号尚未录入成本分析表，仅展示主表基础售价。
                </div>
              )}

              {!loadingAnalysis && costAnalysis && (
                <div>
                  {/* Tab 1: 计算公式与推导轨迹 */}
                  {activeTab === 'process' && (
                    <div className="space-y-3">
                      <div className="text-[11px] text-slate-500 mb-2">
                        以下呈现该料号从各零件单价、损耗、工时费逐步推导至含税成本与各档定价的完整数学过程：
                      </div>

                      <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                        {costAnalysis.calculationSteps.map((step, idx) => (
                          <div
                            key={step.stepKey || idx}
                            className="flex flex-col sm:flex-row sm:items-center justify-between p-3 hover:bg-slate-50/70 transition gap-2"
                          >
                            <div className="flex items-start gap-3">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-600">
                                {idx + 1}
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-slate-800">{step.name}</span>
                                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-slate-600">
                                    {step.formula}
                                  </code>
                                </div>
                                <div className="mt-1 text-[11px] text-slate-500">
                                  代入: <span className="font-mono text-slate-700">{step.expression}</span>
                                  {step.description && (
                                    <span className="ml-2 text-slate-400">({step.description})</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 sm:text-right shrink-0 pl-8 sm:pl-0">
                              <ChevronRight className="hidden sm:block h-3.5 w-3.5 text-slate-300" />
                              <span className="font-mono font-bold text-sm text-slate-900">
                                {step.result != null ? `¥ ${Number(step.result).toFixed(2)}` : '未核定'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tab 2: BOM 原材料明细 */}
                  {activeTab === 'bom' && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500">
                            <th className="py-2 px-2.5 w-12 text-center">序号</th>
                            <th className="py-2 px-2.5 w-20">类型</th>
                            <th className="py-2 px-2.5">规格型号</th>
                            <th className="py-2 px-2.5 w-20">品牌</th>
                            <th className="py-2 px-2.5 w-16 text-right">用量</th>
                            <th className="py-2 px-2.5 w-14 text-center">单位</th>
                            <th className="py-2 px-2.5 w-20 text-right">单价 (元)</th>
                            <th className="py-2 px-2.5 w-24 text-right">总价 (元)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {costAnalysis.bomItems.map((item) => (
                            <tr key={item.index} className="hover:bg-slate-50">
                              <td className="py-2 px-2.5 text-center text-slate-400">{item.index}</td>
                              <td className="py-2 px-2.5 font-medium text-slate-700">{item.type || '-'}</td>
                              <td className="py-2 px-2.5 font-mono text-slate-800">{item.spec || '-'}</td>
                              <td className="py-2 px-2.5 text-slate-500">{item.brand || '-'}</td>
                              <td className="py-2 px-2.5 text-right font-mono">
                                {item.qty != null ? item.qty : '-'}
                              </td>
                              <td className="py-2 px-2.5 text-center text-slate-500">{item.unit || '-'}</td>
                              <td className="py-2 px-2.5 text-right font-mono text-slate-600">
                                {formatTableCell(item.unitPrice, 4)}
                              </td>
                              <td className="py-2 px-2.5 text-right font-mono font-semibold text-slate-900">
                                {formatTableCell(item.totalPrice, 4)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-slate-200 bg-slate-50/50 font-semibold text-slate-800">
                            <td colSpan={7} className="py-2 px-2.5 text-right">
                              材料总价小计:
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono text-blue-600">
                              ¥ {formatAmount(costAnalysis.materialCost, 4)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  {/* Tab 3: 工序工时清单 */}
                  {activeTab === 'labor' && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500">
                            <th className="py-2 px-2.5 w-12 text-center">序号</th>
                            <th className="py-2 px-2.5 w-32">工序名称</th>
                            <th className="py-2 px-2.5 w-24 text-right">效率单价 (元/点)</th>
                            <th className="py-2 px-2.5 w-20 text-right">点数</th>
                            <th className="py-2 px-2.5 w-24 text-right">工时费 (元)</th>
                            <th className="py-2 px-2.5">作业重点说明</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {costAnalysis.laborItems.map((item) => (
                            <tr key={item.index} className="hover:bg-slate-50">
                              <td className="py-2 px-2.5 text-center text-slate-400">{item.index}</td>
                              <td className="py-2 px-2.5 font-medium text-slate-800">{item.name}</td>
                              <td className="py-2 px-2.5 text-right font-mono text-slate-600">
                                {formatTableCell(item.ratePerPoint, 2)}
                              </td>
                              <td className="py-2 px-2.5 text-right font-mono">
                                {item.points != null ? item.points : '-'}
                              </td>
                              <td className="py-2 px-2.5 text-right font-mono font-semibold text-slate-900">
                                {formatTableCell(item.cost, 2)}
                              </td>
                              <td className="py-2 px-2.5 text-slate-500">{item.note || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-slate-200 bg-slate-50/50 font-semibold text-slate-800">
                            <td colSpan={4} className="py-2 px-2.5 text-right">
                              工时费用小计:
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono text-blue-600">
                              ¥ {formatAmount(costAnalysis.laborCost, 2)}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* 基础信息与包装信息 */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-slate-800 font-semibold">
                <Info className="h-4 w-4 text-slate-500" />
                <span>基础信息</span>
              </div>
              <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                <div>
                  <span className="text-slate-500">平台料号：</span>
                  <span className="font-mono font-medium text-slate-900">{material.platformNo}</span>
                </div>
                <div>
                  <span className="text-slate-500">物料名称：</span>
                  {material.sonName ? (
                    <span className="font-medium text-slate-900">{material.sonName}</span>
                  ) : (
                    <span className="text-slate-400 italic">未命名</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-500">源物料 ID：</span>
                  <span className="font-mono text-slate-700">
                    {material.sourceMaterialId != null ? material.sourceMaterialId : '暂无'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">源产品 ID：</span>
                  <span className="font-mono text-slate-700">
                    {material.sourceGoodsId != null ? material.sourceGoodsId : '暂无'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">单位：</span>
                  <span className="text-slate-800">{material.sonUnit || 'pcs'}</span>
                </div>
                <div>
                  <span className="text-slate-500">供应商：</span>
                  <span className="font-mono font-medium text-slate-800">
                    {supplierNo || '暂无编号'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-slate-800 font-semibold">
                  <Layers className="h-4 w-4 text-slate-500" />
                  <span>包装信息</span>
                </div>
                <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                  <div>
                    <span className="text-slate-500">包装方式：</span>
                    <span className="text-slate-800">{material.packingWay || '暂无'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">包装规格：</span>
                    <span className="text-slate-800">
                      {material.packing != null ? String(material.packing) : '暂无'}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-1.5 text-slate-800 font-semibold">
                  <ExternalLink className="h-4 w-4 text-slate-500" />
                  <span>图纸信息</span>
                </div>
                <div className="space-y-2.5 rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="truncate max-w-[260px]">
                      <span className="text-slate-500">2D图纸: </span>
                      {material.file2d ? (
                        <span className="font-mono text-slate-700" title={material.file2d}>
                          {material.file2d}
                        </span>
                      ) : (
                        <span className="text-slate-400">暂无图纸</span>
                      )}
                    </div>
                    {material.file2d && (
                      <a
                        href={material.file2d}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1 font-medium text-white shadow-xs hover:bg-blue-700 transition text-[11px]"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>打开图纸</span>
                      </a>
                    )}
                  </div>

                  {costAnalysis && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 pt-2">
                      <div className="truncate max-w-[260px]">
                        <span className="text-slate-500">来源Excel: </span>
                        <span className="font-mono text-slate-700" title={costAnalysis.sourceExcelFile}>
                          {costAnalysis.sourceExcelFile}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowExcelPreview(true)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1 font-medium text-white shadow-xs hover:bg-emerald-700 transition text-[11px]"
                      >
                        <FileSpreadsheet className="h-3 w-3" />
                        <span>预览来源 Excel</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* 元数据 */}
          <section className="border-t border-slate-100 pt-3">
            <div className="mb-1 text-slate-500 font-medium">元数据</div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <div className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                <span>创建时间：{formatDate(material.createdAt)}</span>
                <span className="mx-2">|</span>
                <span>更新时间：{formatDate(material.updatedAt)}</span>
              </div>
              {costAnalysis && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowExcelPreview(true)}
                    className="cursor-pointer inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 hover:underline font-medium"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    <span>来源文件：{costAnalysis.sourceExcelFile} (点击在线预览)</span>
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3 bg-slate-50/50 rounded-b-xl">
          <div>
            {costAnalysis && (
              <button
                type="button"
                onClick={() => setShowExcelPreview(true)}
                className="cursor-pointer inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 transition shadow-2xs"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                <span>打开来源 Excel 在线预览</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md border border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs"
          >
            关闭
          </button>
        </div>
      </div>

      {/* 来源 Excel 在线预览弹窗 */}
      {costAnalysis && (
        <ExcelPreviewModal
          isOpen={showExcelPreview}
          onClose={() => setShowExcelPreview(false)}
          fileName={costAnalysis.sourceExcelFile}
          initialSheetName={costAnalysis.sourceSheetName}
          filePath={costAnalysis.sourceExcelPath}
          fileUrl={costAnalysis.sourceExcelUrl || material.sourceExcelUrl}
        />
      )}
    </div>
  );
}

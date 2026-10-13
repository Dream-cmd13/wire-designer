import { useState } from 'react';
import { AlertCircle, AlertTriangle, Download, FileSpreadsheet, Info, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatQuoteMoney, type QuoteLine } from '@/lib/pricing';
import { createQuoteWorkbook, formatQuoteTime } from '@/lib/quoteExport';
import { safeFilename } from '@/lib/designFile';
import { DEFAULT_QUOTE_LEAD_TIME } from '@/data/catalogOptions';
import type { AutoQuoteEvaluation } from '@/lib/autoQuote';
import { useUserStore } from '@/stores/userStore';
import { canViewPricing } from '@/lib/permissions';
import type { CatalogSnapshot } from '@/types/catalog';

interface AutoQuotePriceCardProps {
  evaluation: AutoQuoteEvaluation;
  catalog: CatalogSnapshot | null;
  loading: boolean;
  exportScope?: 'unit' | 'order';
  onRetry?: () => void;
}

function AmountRow({ name, amount }: { name: string; amount: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs">
      <span className="text-slate-600">{name}</span>
      <span className="tabular-nums font-medium text-slate-900">¥{formatQuoteMoney(amount)}</span>
    </div>
  );
}

function Lines({ lines }: { lines: QuoteLine[] }) {
  return (
    <div className="space-y-1.5">
      {lines.map((line, index) => (
        <div key={index} className="rounded bg-slate-50/80 p-2 text-xs">
          <div className="flex justify-between">
            <span className="font-medium text-slate-700">{line.name}</span>
            <span className="font-semibold text-slate-900 tabular-nums">
              ¥{formatQuoteMoney(line.amount)}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            用量: {line.points} × 单价 ¥{line.unitPrice}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AutoQuotePriceCard({
  evaluation,
  catalog,
  loading,
  exportScope = 'order',
  onRetry,
}: AutoQuotePriceCardProps) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { issues, price, config } = evaluation;
  const status = loading ? 'loading' : evaluation.status;
  const role = useUserStore(s => s.currentUser?.role);
  const internal = canViewPricing(role) ? price?.breakdown : undefined;

  const handleExportExcel = (mode: 'public' | 'internal' = 'public') => {
    if (!config || !price) return;
    try {
      setExporting(true);
      setExportError(null);
      const workbook = createQuoteWorkbook(config, price, mode, role, exportScope, { catalog, calculatedAt: evaluation.calculatedAt, settingsVersion: evaluation.settingsVersion });
      const filename = safeFilename(`${config.name}_${mode === 'internal' ? '成本分析' : '报价单'}.xlsx`);
      XLSX.writeFile(workbook, filename);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : '导出 Excel 失败');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 加载中状态 */}
      {(status === 'loading' || status === 'catalog-loading') && (
        <div aria-busy="true" className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-700">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>{status === 'catalog-loading' ? '正在加载物料目录...' : '正在核算报价...'}</span>
        </div>
      )}

      {status === 'error' && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <p>{issues.join('；')}</p>
          {onRetry && <button type="button" onClick={onRetry} className="mt-2 cursor-pointer text-blue-600 underline">重试</button>}
        </div>
      )}

      {status === 'waiting' && (
        <p role="status" className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">等待报价，请确认已登录且报价权限就绪。</p>
      )}

      {/* 待支持状态提示 */}
      {status === 'unsupported' && (
        <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 text-xs text-amber-900 space-y-1.5">
          <div className="flex items-center gap-2 font-semibold text-amber-800 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>所选配置包含待支持选项</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-amber-800/90 pl-1">
            {issues.map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
          </ul>
          <p className="pt-1 text-[11px] text-amber-700">
            为保证核算严谨，系统已清除历史报价，不生成漏算费用的正式金额。
          </p>
        </div>
      )}

      {/* 需人工核价状态提示 */}
      {status === 'manual' && (
        <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4 text-xs text-blue-900 space-y-1.5">
          <div className="flex items-center gap-2 font-semibold text-blue-800 text-sm">
            <Info className="h-4 w-4 shrink-0 text-blue-600" />
            <span>需转人工核价</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-blue-800 pl-1">
            {issues.map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
          </ul>
          <p className="pt-1 text-[11px] text-blue-700">
            线长超过 5 米的线束规格或特殊工艺需由工程核价专员进行成本确认。
          </p>
        </div>
      )}

      {/* 阻断状态 (缺价或物料不满足) */}
      {status === 'blocked' && (
        <div className="rounded-lg border-l-4 border-rose-500 bg-rose-50 p-4 text-xs text-rose-900 space-y-1.5">
          <div className="flex items-center gap-2 font-semibold text-rose-800 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>报价计算受阻 (缺少物料价格或配置不合规)</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-rose-800 pl-1">
            {issues.map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
          </ul>
          <p className="pt-1 text-[11px] text-rose-700">
            请确认物料库中是否已维护对应物料的含税价格档位。
          </p>
        </div>
      )}

      {/* 未填写完全状态 */}
      {status === 'incomplete' && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-slate-700">
            <Info className="h-4 w-4 text-slate-400" />
            <span>请完善选配输入</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 pl-1 text-slate-500">
            {issues.map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 正式报价结果 */}
      {status === 'ready' && price && (
        <div className="space-y-3.5">
          <div className="space-y-2 text-xs text-slate-600">
            <p>核价时间：{formatQuoteTime(evaluation.calculatedAt)}</p>
            {onRetry && <button type="button" onClick={onRetry} className="cursor-pointer text-blue-600 underline">重新核价</button>}
            <p>导出当前核价结果；需要最新价格请先重新核价。</p>
            {evaluation.previousUnitPrice && <p role="status" className="text-amber-700">单价由 ¥{formatQuoteMoney(evaluation.previousUnitPrice)} 更新为 ¥{formatQuoteMoney(price.unitPrice)}</p>}
          </div>
          {/* 单价与交期 */}
          <div className="rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-4 text-white shadow-sm">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-blue-100">含税含运费单价</span>
              <span className="text-2xl font-bold tracking-tight tabular-nums">
                ¥{formatQuoteMoney(price.unitPrice)}
              </span>
            </div>
            <p className="mt-3 border-t border-blue-400/40 pt-2.5 text-[11px] text-blue-200">
              交期参考：{DEFAULT_QUOTE_LEAD_TIME}
            </p>
          </div>

          {/* 材料成本拆解 */}
          {internal && <>
          <details open className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <summary className="cursor-pointer font-semibold text-slate-800 select-none flex justify-between items-center text-xs">
              <span>材料成本拆解</span>
              <span className="text-blue-600 font-bold tabular-nums">
                合计 ¥{formatQuoteMoney(internal.materialSubtotal)}
              </span>
            </summary>
            <div className="mt-2.5">
              <Lines lines={internal.materials} />
            </div>
          </details>

          {/* 加工费明细 */}
          <details open className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <summary className="cursor-pointer font-semibold text-slate-800 select-none flex justify-between items-center text-xs">
              <span>加工费工序明细</span>
              <span className="text-blue-600 font-bold tabular-nums">
                合计 ¥{formatQuoteMoney(internal.laborSubtotal)}
              </span>
            </summary>
            <div className="mt-2.5">
              <Lines lines={internal.labor} />
            </div>
          </details>

          {/* 综合损耗与成本核算 */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-1.5">
            <div className="font-semibold text-slate-700 text-xs mb-1">
              成本与损耗分析
            </div>
            <AmountRow name="材料损耗" amount={internal.materialLoss} />
            <AmountRow name="加工损耗" amount={internal.processingLoss} />
            <AmountRow name="产品含税成本" amount={internal.cost} />
            <AmountRow name="产品含税售价" amount={internal.sellingPrice} />
            <AmountRow name="运费" amount={internal.freight} />
          </div>
          <button onClick={() => handleExportExcel('internal')} className="text-sm text-blue-700">导出内部成本分析表</button>
          </>}

          {/* 导出按钮 */}
          <button
            type="button"
            disabled={exporting}
            onClick={() => handleExportExcel()}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 px-4 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <FileSpreadsheet className="h-4 w-4" />
            <span>导出报价 Excel</span>
          </button>

          {exportError && (
            <p className="text-xs text-rose-600">{exportError}</p>
          )}
        </div>
      )}
    </div>
  );
}

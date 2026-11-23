import { useState } from 'react';
import { AlertCircle, Calculator, Download, FileSpreadsheet, Info, Loader2, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatQuoteMoney, type QuoteLine } from '@/lib/pricing';
import { createQuoteWorkbook, formatQuoteTime } from '@/lib/quoteExport';
import { safeFilename } from '@/lib/designFile';
import type { AutoQuoteEvaluation } from '@/lib/autoQuote';
import { useUserStore } from '@/stores/userStore';
import { canViewPricing } from '@/lib/permissions';
import type { CatalogSnapshot } from '@/types/catalog';
import { PageHeaderActions } from '@/components/layout/PageHeaderActions';

interface AutoQuotePriceCardProps {
  evaluation: AutoQuoteEvaluation;
  catalog: CatalogSnapshot | null;
  loading: boolean;
  exportScope?: 'unit' | 'order';
  exportInHeader?: boolean;
  layout?: 'card' | 'sticky';
  configSummary?: string;
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

function LineRow({ line }: { line: QuoteLine }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-2.5 py-1.5 text-xs">
      <span className="font-medium text-slate-700">{line.name}</span>
      <div className="ml-auto flex items-baseline gap-3 tabular-nums">
        <span className="text-[11px] text-slate-400">
          {line.points} × ¥{line.unitPrice}
        </span>
        <span className="min-w-[4.25rem] text-right font-semibold text-slate-900">
          ¥{formatQuoteMoney(line.amount)}
        </span>
      </div>
    </div>
  );
}

function Lines({ lines, collapseZero = false }: { lines: QuoteLine[]; collapseZero?: boolean }) {
  const activeLines = collapseZero
    ? lines.filter((line) => line.points > 0 || Number(line.amount) > 0)
    : lines;
  const zeroLines = collapseZero
    ? lines.filter((line) => line.points === 0 && Number(line.amount) === 0)
    : [];

  return (
    <div className="space-y-1.5">
      {activeLines.length > 0 && (
        <div className="divide-y divide-slate-100 rounded-md border border-slate-100 bg-slate-50/70">
          {activeLines.map((line, index) => (
            <LineRow key={`${line.name}-${index}`} line={line} />
          ))}
        </div>
      )}
      {zeroLines.length > 0 && (
        <details className="rounded-md border border-slate-100 bg-slate-50/50 text-[11px] text-slate-500">
          <summary className="cursor-pointer select-none px-2.5 py-1.5 hover:text-slate-700">
            另有 {zeroLines.length} 项未发生工序（¥0.00）
          </summary>
          <div className="divide-y divide-slate-100 border-t border-slate-100">
            {zeroLines.map((line, index) => (
              <LineRow key={`${line.name}-${index}`} line={line} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export function AutoQuotePriceCard({
  evaluation,
  catalog,
  loading,
  exportScope = 'order',
  exportInHeader = false,
  layout = 'card',
  configSummary,
  onRetry,
}: AutoQuotePriceCardProps) {
  const [exporting, setExporting] = useState(false);
  const [exportErrorState, setExportErrorState] = useState<{ key: string; message: string } | null>(null);

  const { issues, price, config } = evaluation;
  const status = loading ? 'loading' : evaluation.status;
  const role = useUserStore(s => s.currentUser?.role);
  const internal = canViewPricing(role) ? price?.breakdown : undefined;
  const quoteKey = `${evaluation.calculatedAt ?? ''}:${price?.unitPrice ?? ''}:${config?.name ?? ''}`;
  const exportError = exportErrorState?.key === quoteKey ? exportErrorState.message : null;

  const handleExportExcel = (mode: 'public' | 'internal' = 'public') => {
    if (!config || !price) return;
    try {
      setExporting(true);
      setExportErrorState(null);
      const workbook = createQuoteWorkbook(config, price, mode, role, exportScope, { catalog, calculatedAt: evaluation.calculatedAt, settingsVersion: evaluation.settingsVersion });
      const filename = safeFilename(`${config.name}_${mode === 'internal' ? '成本分析' : '报价单'}.xlsx`);
      XLSX.writeFile(workbook, filename);
    } catch (err) {
      console.error('导出 Excel 失败:', err);
      setExportErrorState({ key: quoteKey, message: '导出报价失败，请重试。' });
    } finally {
      setExporting(false);
    }
  };

  if (layout === 'sticky') {
    const stickyBadge = (
      <span className="inline-flex shrink-0 items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700">
        <Calculator className="h-3 w-3" />
        实时报价
      </span>
    );

    return (
      <div className="space-y-2">
        {(status === 'loading' || status === 'catalog-loading') && (
          <div aria-busy="true" className="flex flex-wrap items-center gap-2 py-1 text-xs text-blue-600">
            {stickyBadge}
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            <span>{status === 'catalog-loading' ? '正在加载物料目录...' : '正在核算报价...'}</span>
          </div>
        )}

        {status === 'error' && (
          <div role="alert" className="flex flex-wrap items-center gap-2 py-1 text-xs text-red-700">
            {stickyBadge}
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{issues.join('；')}</span>
            {onRetry && (
              <button type="button" onClick={onRetry} className="cursor-pointer font-medium text-blue-600 underline">
                重试
              </button>
            )}
          </div>
        )}

        {status === 'waiting' && (
          <div role="status" className="flex flex-wrap items-center gap-2 py-1 text-xs text-slate-600">
            {stickyBadge}
            <Info className="h-4 w-4 shrink-0 text-slate-400" />
            <span>等待报价，请确认已登录且报价权限就绪。</span>
          </div>
        )}

        {status === 'manual' && (
          <div className="flex flex-wrap items-center gap-2 py-1 text-xs text-blue-800">
            {stickyBadge}
            <Info className="h-4 w-4 shrink-0 text-blue-600" />
            <span className="font-semibold">需转人工核价</span>
            <span className="text-blue-700">
              {issues.length > 0 ? issues.join('；') : '线长超过 5000mm 需由工程核价专员确认。'}
            </span>
          </div>
        )}

        {status === 'blocked' && (
          <div className="flex flex-wrap items-center gap-2 py-1 text-xs text-rose-800">
            {stickyBadge}
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span className="font-semibold">报价计算受阻</span>
            <span className="text-rose-700">
              {issues.length > 0 ? issues.join('；') : '缺少物料价格或配置不合规'}
            </span>
          </div>
        )}

        {status === 'incomplete' && (
          <div className="flex flex-wrap items-center gap-2 py-1 text-xs text-slate-600">
            {stickyBadge}
            <Info className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="font-semibold text-slate-700">请完善选配输入</span>
            {issues.length > 0 && <span className="text-slate-500">{issues.join('；')}</span>}
          </div>
        )}

        {status === 'ready' && price && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {stickyBadge}
                <span className="text-xs font-medium text-slate-600">含税含运费单价</span>
                {configSummary && (
                  <span className="hidden text-[11px] text-slate-400 sm:inline">· {configSummary}</span>
                )}
              </div>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-xl font-bold leading-none tracking-tight text-blue-600 tabular-nums sm:text-2xl">
                  ¥{formatQuoteMoney(price.unitPrice)}
                </span>
                <span className="text-[11px] text-slate-500">
                  核价时间：{formatQuoteTime(evaluation.calculatedAt)}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                导出当前核价结果；需要最新价格请先重新核价。
              </p>
              {evaluation.previousUnitPrice && (
                <p role="status" className="text-[11px] font-medium text-amber-700">
                  单价由 ¥{formatQuoteMoney(evaluation.previousUnitPrice)} 更新为 ¥{formatQuoteMoney(price.unitPrice)}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs transition hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-600"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
                  <span>重新核价</span>
                </button>
              )}
              <button
                type="button"
                disabled={exporting}
                onClick={() => handleExportExcel('public')}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-600 px-3.5 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                <span>导出报价 Excel</span>
              </button>
            </div>
          </div>
        )}

        {exportError && (
          <p role="alert" className="text-xs text-rose-600">{exportError}</p>
        )}
      </div>
    );
  }

  const exportButtons = (
    <div className={exportInHeader ? 'flex items-center gap-1.5' : 'space-y-2'}>
      {internal && (
        <button
          type="button"
          disabled={exporting}
          onClick={() => handleExportExcel('internal')}
          className={
            exportInHeader
              ? 'h-8 cursor-pointer whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-blue-700 transition hover:border-blue-300 hover:bg-blue-50/50 disabled:opacity-50'
              : 'flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-2 text-xs font-medium text-blue-700 transition hover:bg-blue-100/70 disabled:opacity-50'
          }
        >
          导出内部成本分析表
        </button>
      )}
      <button
        type="button"
        disabled={exporting}
        onClick={() => handleExportExcel('public')}
        className={`flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap bg-emerald-600 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 ${
          exportInHeader ? 'h-8 rounded-md px-2.5' : 'w-full rounded-lg px-4 py-2.5 shadow-xs'
        }`}
      >
        {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {!exportInHeader && <FileSpreadsheet className="h-4 w-4" />}
        <span>导出报价 Excel</span>
      </button>
    </div>
  );

  return (
    <div className="space-y-3.5">
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
        <div className="space-y-3">
          <div className="space-y-1.5 text-xs text-slate-600">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>核价时间：{formatQuoteTime(evaluation.calculatedAt)}</span>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-600 transition cursor-pointer"
                >
                  <RefreshCw className="h-3 w-3 text-slate-400" />
                  <span>重新核价</span>
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500">导出当前核价结果；需要最新价格请先重新核价。</p>
            {evaluation.previousUnitPrice && <p role="status" className="text-amber-700">单价由 ¥{formatQuoteMoney(evaluation.previousUnitPrice)} 更新为 ¥{formatQuoteMoney(price.unitPrice)}</p>}
          </div>
          {/* 单价 */}
          <div className="rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-4 text-white shadow-sm">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-blue-100">含税含运费单价</span>
              <span className="text-2xl font-bold tracking-tight tabular-nums">
                ¥{formatQuoteMoney(price.unitPrice)}
              </span>
            </div>
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
            <div className="mt-2">
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
            <div className="mt-2">
              <Lines lines={internal.labor} collapseZero />
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
          </>}

          {exportInHeader ? <PageHeaderActions>{exportButtons}</PageHeaderActions> : exportButtons}

          {exportError && (
            <p role="alert" className="text-xs text-rose-600">{exportError}</p>
          )}
        </div>
      )}
    </div>
  );
}

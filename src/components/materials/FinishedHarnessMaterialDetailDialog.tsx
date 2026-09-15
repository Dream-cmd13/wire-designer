import { useEffect } from 'react';
import {
  Boxes,
  Calendar,
  DollarSign,
  ExternalLink,
  FileText,
  Info,
  Package,
  X,
} from 'lucide-react';
import type { FinishedHarnessMaterial } from '@/types/finishedHarnessMaterial';

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

export function FinishedHarnessMaterialDetailDialog({
  isOpen,
  onClose,
  material,
}: FinishedHarnessMaterialDetailDialogProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !material) return null;

  const supplierNo = material.supplier?.supplier_no || material.supplierNo;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="finished-harness-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              <h3 id="finished-harness-detail-title" className="text-base font-bold text-slate-900">
                成品线束物料详情
              </h3>
            </div>
            <p className="mt-1 font-mono text-xs font-semibold text-blue-600">
              {material.platformNo}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="关闭 (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {/* 基础信息 */}
          <section>
            <div className="mb-2.5 flex items-center gap-1.5 text-slate-800 font-semibold">
              <Info className="h-4 w-4 text-slate-500" />
              <span>基础信息</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3.5">
              <div>
                <span className="text-slate-500">平台料号：</span>
                <span className="font-mono font-medium text-slate-900">{material.platformNo}</span>
              </div>
              <div>
                <span className="text-slate-500">物料名称：</span>
                <span className="font-medium text-slate-900">{material.sonName}</span>
              </div>
              <div>
                <span className="text-slate-500">源物料 ID：</span>
                <span className="font-mono text-slate-700">{material.sourceMaterialId}</span>
              </div>
              <div>
                <span className="text-slate-500">源产品 ID：</span>
                <span className="font-mono text-slate-700">
                  {material.sourceGoodsId != null ? material.sourceGoodsId : '暂无'}
                </span>
              </div>
              <div>
                <span className="text-slate-500">单位：</span>
                <span className="text-slate-800">{material.sonUnit || '暂无'}</span>
              </div>
              <div>
                <span className="text-slate-500">供应商编号：</span>
                <span className="font-mono font-medium text-slate-800">
                  {supplierNo || '暂无编号'}
                </span>
              </div>
            </div>
          </section>

          {/* 包装信息 */}
          <section>
            <div className="mb-2.5 flex items-center gap-1.5 text-slate-800 font-semibold">
              <Boxes className="h-4 w-4 text-slate-500" />
              <span>包装信息</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3.5">
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
          </section>

          {/* 价格信息 */}
          <section>
            <div className="mb-2.5 flex items-center gap-1.5 text-slate-800 font-semibold">
              <DollarSign className="h-4 w-4 text-slate-500" />
              <span>价格信息</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3.5">
              <div>
                <span className="block text-slate-500 mb-0.5">最低售价：</span>
                {material.sonPriceLow != null ? (
                  <span className="inline-block font-mono font-bold text-emerald-700 text-sm">
                    ¥ {Number(material.sonPriceLow).toFixed(2)}
                  </span>
                ) : (
                  <span className="text-slate-400">暂无</span>
                )}
              </div>
              <div>
                <span className="block text-slate-500 mb-0.5">成本分析：</span>
                <span className="text-slate-400">暂无</span>
              </div>
              <div>
                <span className="block text-slate-500 mb-0.5">正式报价：</span>
                <span className="text-slate-400">暂无</span>
              </div>
            </div>
          </section>

          {/* 图纸信息 */}
          <section>
            <div className="mb-2.5 flex items-center gap-1.5 text-slate-800 font-semibold">
              <FileText className="h-4 w-4 text-slate-500" />
              <span>图纸信息</span>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3.5">
              {material.file2d ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="truncate max-w-[420px]" title={material.file2d}>
                    <span className="text-slate-500">外发供应商图纸：</span>
                    <span className="font-mono text-slate-700">{material.file2d}</span>
                  </div>
                  <a
                    href={material.file2d}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white shadow-xs hover:bg-blue-700 transition"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>打开图纸</span>
                  </a>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="text-slate-500">外发供应商图纸：</span>
                  <span>暂无图纸</span>
                </div>
              )}
            </div>
          </section>

          {/* 元数据 */}
          <section>
            <div className="mb-2.5 flex items-center gap-1.5 text-slate-800 font-semibold">
              <Calendar className="h-4 w-4 text-slate-500" />
              <span>元数据</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3.5">
              <div>
                <span className="text-slate-500">创建时间：</span>
                <span className="font-mono text-slate-700">{formatDate(material.createdAt)}</span>
              </div>
              <div>
                <span className="text-slate-500">更新时间：</span>
                <span className="font-mono text-slate-700">{formatDate(material.updatedAt)}</span>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-100 px-6 py-3 bg-slate-50/50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md border border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

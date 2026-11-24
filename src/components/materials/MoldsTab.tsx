import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { useMaterialTabPage } from './useMaterialTabPage';
import { MaterialPagination } from '@/components/materials/MaterialPagination';
import { PriceUpdateInfo } from '@/components/materials/PriceUpdateInfo';
import type { MaterialPriceIndex, MoldRow } from '@/components/materials/materialPriceLookup';
import { formatMaterialPrice } from '@/lib/materialPriceEdit';
import { materialPriceTierKey, type QuoteMaterial } from '@/lib/quoteMaterials';
import type { OvermoldSpec } from '@/types/harness';

interface MoldsTabState {
  query: string;
  page: number;
  pageSize: number;
}

interface MoldsTabProps {
  overmolds: OvermoldSpec[];
  moldRows: MoldRow[];
  priceIndex: MaterialPriceIndex;
  catalogStatus: string;
  catalogReady: boolean;
  isRefreshing: boolean;
  active: boolean;
  initialPage: number;
  renderEditPriceButton: (resourceId: string, kind: QuoteMaterial['kind']) => ReactNode;
}

export function MoldsTab({
  overmolds,
  moldRows,
  priceIndex,
  catalogStatus,
  catalogReady,
  isRefreshing,
  active,
  initialPage,
  renderEditPriceButton,
}: MoldsTabProps) {
  const [state, setState] = useState<MoldsTabState>(() => ({
    query: '',
    page: initialPage,
    pageSize: 20,
  }));
  const { query: accQuery, pageSize: accPageSize } = state;
  const accTableRef = useRef<HTMLDivElement>(null);

  const filteredOvermolds = useMemo(() => {
    const q = accQuery.trim().toLowerCase();
    return moldRows.filter(({ candidate, parent }) => !q ||
      [candidate.name, parent.name, parent.id, candidate.specification,
        candidate.kind === 'inner-mold' ? '内模' : '外模'].some(value => value.toLowerCase().includes(q)));
  }, [moldRows, accQuery]);

  const { page: safeAccPage, rows: paginatedOvermolds } = useMaterialTabPage(
    filteredOvermolds, state, setState,
    catalogReady,
  );

  if (!active) return null;
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5 sm:gap-3">
      <section className="shrink-0 rounded-lg border border-slate-200 bg-white p-2.5 sm:p-3 shadow-xs">
        <label className="relative block max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={accQuery}
            onChange={(e) => {
              setState((prev) => ({ ...prev, query: e.target.value, page: 1 }));
            }}
            placeholder="搜索模具名称、代号、材质"
            className="h-8.5 w-full rounded-md border border-slate-200 bg-white pr-3 pl-9 text-xs outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </label>
      </section>

      <section className="relative flex-1 min-h-0 flex flex-col rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
        {isRefreshing && (
          <div
            data-testid="acc-syncing-progress"
            className="absolute top-0 left-0 right-0 z-20 h-0.5 bg-blue-100 overflow-hidden"
          >
            <div className="h-full w-full bg-blue-600 animate-pulse" />
          </div>
        )}
        <div ref={accTableRef} className="flex-1 min-h-0 overflow-auto">
          <table className="min-w-[1150px] w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 uppercase text-slate-500 shadow-2xs">
              <tr>
                <th className="min-w-[180px] px-4 py-3 font-semibold">物料名称与代号</th>
                <th className="w-[140px] min-w-[120px] px-4 py-3 font-semibold">类型</th>
                <th className="w-[140px] min-w-[120px] px-4 py-3 font-semibold">规格与工程特征</th>
                <th className="w-[120px] min-w-[100px] px-4 py-3 font-semibold">材质与硬度</th>
                <th className="w-[120px] min-w-[110px] px-4 py-3 font-semibold text-right">含税单价</th>
                <th className="w-[80px] min-w-[80px] px-4 py-3 font-semibold text-center">计价单位</th>
                <th className="min-w-[170px] px-4 py-3 font-semibold">价格更新时间</th>
                <th className="min-w-[110px] px-4 py-3 font-semibold">价格更新人</th>
                <th className="min-w-[90px] px-4 py-3 font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedOvermolds.map(({ candidate, parent }) => {
                const price = priceIndex.moldMap.get(materialPriceTierKey(candidate));
                const inner = candidate.kind === 'inner-mold';
                return (
                  <tr key={materialPriceTierKey(candidate)} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{candidate.name}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-blue-600">{parent.id}</p>
                      {inner && <p className="mt-1 text-[11px] text-slate-500">所属外模：{parent.name}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{inner ? '内模' : '外模'}</td>
                    <td className="px-4 py-3 text-slate-600">{parent.outerForm === 'bent' ? '90°弯头成型' : '直头成型'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <p>{inner ? parent.innerMaterial : parent.outerMaterial}</p>
                      {!inner && parent.outerHardness && <p className="text-[11px] text-slate-400">硬度：{parent.outerHardness}</p>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {price ? <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700">¥ {formatMaterialPrice(price.taxIncludedPrice)}</span>
                        : <span className="text-slate-400">待定价</span>}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">元/个</td>
                    <td className="px-4 py-3 whitespace-nowrap"><PriceUpdateInfo price={price} field="time" /></td>
                    <td className="px-4 py-3"><PriceUpdateInfo price={price} field="user" /></td>
                    <td className="px-4 py-3 whitespace-nowrap">{renderEditPriceButton(candidate.resourceId, candidate.kind)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {catalogStatus === 'loading' && overmolds.length === 0 && (
            <div className="py-14 text-center text-sm text-slate-500">
              正在加载模具物料...
            </div>
          )}

          {filteredOvermolds.length === 0 &&
            (catalogStatus !== 'loading' || overmolds.length > 0) && (
              <div className="py-14 text-center text-sm text-slate-500">
                未找到匹配的模具。
              </div>
            )}
        </div>

        <MaterialPagination
          currentPage={safeAccPage}
          pageSize={accPageSize}
          totalCount={filteredOvermolds.length}
          onPageChange={(page) => setState((prev) => ({ ...prev, page }))}
          onPageSizeChange={(pageSize) => setState((prev) => ({ ...prev, pageSize, page: 1 }))}
          scrollContainerRef={accTableRef}
        />
      </section>
    </div>
  );
}

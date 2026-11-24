import { useMemo, useRef, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Search } from 'lucide-react';
import { MaterialPagination } from '@/components/materials/MaterialPagination';
import { PriceUpdateInfo } from '@/components/materials/PriceUpdateInfo';
import {
  getConnectorPriceFromIndex,
  type MaterialPriceIndex,
} from '@/components/materials/materialPriceLookup';
import { formatMaterialPrice } from '@/lib/materialPriceEdit';
import type { QuoteMaterial } from '@/lib/quoteMaterials';
import type { Connector } from '@/types/harness';

export interface ConnectorsTabState {
  query: string;
  supplierNo: string;
  series: string;
  shielded: string;
  type: string;
  pinCount: string;
  priceStatus: 'all' | 'priced' | 'unpriced';
  page: number;
  pageSize: number;
}

interface ConnectorsTabProps {
  connectors: Connector[];
  priceIndex: MaterialPriceIndex;
  catalogStatus: string;
  isRefreshing: boolean;
  state: ConnectorsTabState;
  onStateChange: Dispatch<SetStateAction<ConnectorsTabState>>;
  renderEditPriceButton: (resourceId: string, kind: QuoteMaterial['kind']) => ReactNode;
}

export function ConnectorsTab({
  connectors,
  priceIndex,
  catalogStatus,
  isRefreshing,
  state,
  onStateChange,
  renderEditPriceButton,
}: ConnectorsTabProps) {
  const {
    query: connQuery,
    supplierNo: connSupplierNo,
    series: connSeries,
    shielded: connShielded,
    type: connType,
    pinCount: connPinCount,
    priceStatus: connPriceStatus,
    page: connPage,
    pageSize: connPageSize,
  } = state;
  const connTableRef = useRef<HTMLDivElement>(null);

  const connSupplierNos = useMemo(
    () =>
      Array.from(new Set(connectors.map((c) => c.supplierNo || '未配置供应商')))
        .filter(Boolean)
        .sort(),
    [connectors],
  );
  const connAllSeries = useMemo(
    () => Array.from(new Set(connectors.map((c) => c.series).filter(Boolean))).sort() as string[],
    [connectors],
  );
  const connPinCounts = useMemo(
    () => Array.from(new Set(connectors.map((c) => c.pinCount))).sort((a, b) => a - b),
    [connectors],
  );

  const filteredConnectors = useMemo(() => {
    const q = connQuery.trim().toLowerCase();
    return connectors.filter((c) => {
      const supplierDisplay = c.supplierNo || '未配置供应商';
      const matchQ =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.model?.toLowerCase().includes(q) ||
        c.series?.toLowerCase().includes(q) ||
        (c.supplierNo ? c.supplierNo.toLowerCase().includes(q) : false);

      const matchM = connSupplierNo === 'all' || supplierDisplay === connSupplierNo;
      const matchS = connSeries === 'all' || c.series === connSeries;
      const matchSh =
        connShielded === 'all' ||
        (connShielded === 'shielded' && c.shielded === true) ||
        (connShielded === 'unshielded' && c.shielded === false);
      const matchT = connType === 'all' || c.type === connType;
      const matchP = connPinCount === 'all' || c.pinCount === Number(connPinCount);

      const hasPrice = Boolean(getConnectorPriceFromIndex(priceIndex, c));
      const matchPr =
        connPriceStatus === 'all' ||
        (connPriceStatus === 'priced' && hasPrice) ||
        (connPriceStatus === 'unpriced' && !hasPrice);

      return matchQ && matchM && matchS && matchSh && matchT && matchP && matchPr;
    });
  }, [
    connectors,
    connQuery,
    connSupplierNo,
    connSeries,
    connShielded,
    connType,
    connPinCount,
    connPriceStatus,
    priceIndex,
  ]);

  const totalConnPages = Math.max(1, Math.ceil(filteredConnectors.length / connPageSize));
  const safeConnPage = Math.min(Math.max(1, connPage), totalConnPages);

  const paginatedConnectors = useMemo(() => {
    const start = (safeConnPage - 1) * connPageSize;
    return filteredConnectors.slice(start, start + connPageSize);
  }, [filteredConnectors, safeConnPage, connPageSize]);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5 sm:gap-3">
      <section className="shrink-0 rounded-lg border border-slate-200 bg-white p-2.5 sm:p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative block min-w-[200px] flex-[2_1_220px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={connQuery}
              onChange={(e) => {
                onStateChange((prev) => ({ ...prev, query: e.target.value, page: 1 }));
              }}
              placeholder="搜索连接器名称、型号、供应商、ID"
              className="h-8.5 w-full rounded-md border border-slate-200 bg-white pr-3 pl-9 text-xs outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <select
            value={connSupplierNo}
            onChange={(e) => {
              onStateChange((prev) => ({ ...prev, supplierNo: e.target.value, page: 1 }));
            }}
            className="h-8.5 min-w-[104px] flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400"
          >
            <option value="all">全部供应商</option>
            {connSupplierNos.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={connSeries}
            onChange={(e) => {
              onStateChange((prev) => ({ ...prev, series: e.target.value, page: 1 }));
            }}
            className="h-8.5 min-w-[96px] flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400"
          >
            <option value="all">全部系列</option>
            {connAllSeries.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={connShielded}
            onChange={(e) => {
              onStateChange((prev) => ({ ...prev, shielded: e.target.value, page: 1 }));
            }}
            className="h-8.5 min-w-[104px] flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400"
          >
            <option value="all">全部屏蔽状态</option>
            <option value="shielded">已屏蔽</option>
            <option value="unshielded">未屏蔽</option>
          </select>

          <select
            value={connType}
            onChange={(e) => {
              onStateChange((prev) => ({ ...prev, type: e.target.value, page: 1 }));
            }}
            className="h-8.5 min-w-[92px] flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400"
          >
            <option value="all">全部类型</option>
            <option value="male">公头 (male)</option>
            <option value="female">母头 (female)</option>
            <option value="receptacle">插座 (receptacle)</option>
          </select>

          <select
            value={connPinCount}
            onChange={(e) => {
              onStateChange((prev) => ({ ...prev, pinCount: e.target.value, page: 1 }));
            }}
            className="h-8.5 min-w-[96px] flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400"
          >
            <option value="all">全部 PIN 数</option>
            {connPinCounts.map((pin) => (
              <option key={pin} value={pin}>
                {pin}P
              </option>
            ))}
          </select>

          <select
            value={connPriceStatus}
            onChange={(e) => {
              onStateChange((prev) => ({
                ...prev,
                priceStatus: e.target.value as 'all' | 'priced' | 'unpriced',
                page: 1,
              }));
            }}
            className="h-8.5 min-w-[104px] flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400"
          >
            <option value="all">全部价格状态</option>
            <option value="priced">已定价</option>
            <option value="unpriced">待定价</option>
          </select>

          {(connQuery || connSupplierNo !== 'all' || connSeries !== 'all' || connShielded !== 'all' || connType !== 'all' || connPinCount !== 'all' || connPriceStatus !== 'all') && (
            <button
              type="button"
              onClick={() => {
                onStateChange((prev) => ({
                  ...prev,
                  query: '',
                  supplierNo: 'all',
                  series: 'all',
                  shielded: 'all',
                  type: 'all',
                  pinCount: 'all',
                  priceStatus: 'all',
                  page: 1,
                }));
              }}
              className="h-8.5 shrink-0 cursor-pointer rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              重置筛选
            </button>
          )}
        </div>
      </section>

      <section className="relative flex-1 min-h-0 flex flex-col rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
        {isRefreshing && (
          <div
            data-testid="conn-syncing-progress"
            className="absolute top-0 left-0 right-0 z-20 h-0.5 bg-blue-100 overflow-hidden"
          >
            <div className="h-full w-full bg-blue-600 animate-pulse" />
          </div>
        )}
        <div ref={connTableRef} className="flex-1 min-h-0 overflow-auto">
          <table className="min-w-[1020px] w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 uppercase text-slate-500 shadow-2xs">
              <tr>
                <th className="min-w-[190px] px-4 py-2.5 font-semibold">连接器与型号</th>
                <th className="w-[125px] min-w-[105px] px-4 py-2.5 font-semibold">供应商与系列</th>
                <th className="w-[105px] min-w-[95px] px-4 py-2.5 font-semibold">类型 / 屏蔽</th>
                <th className="w-[95px] min-w-[85px] px-4 py-2.5 font-semibold">PIN / 间距</th>
                <th className="min-w-[170px] px-4 py-2.5 font-semibold">电气与防护规格</th>
                <th className="w-[120px] min-w-[110px] px-4 py-2.5 font-semibold text-right">含税单价</th>
                <th className="w-[80px] min-w-[80px] px-4 py-2.5 font-semibold text-center">计价单位</th>
                <th className="min-w-[160px] px-4 py-2.5 font-semibold">价格更新时间</th>
                <th className="min-w-[105px] px-4 py-2.5 font-semibold">价格更新人</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedConnectors.map((c) => {
                const price = getConnectorPriceFromIndex(priceIndex, c);
                const protectionTags = [
                  c.ingressProtection,
                  c.flammabilityRating,
                  c.temperatureRangeC
                    ? `${c.temperatureRangeC.min ?? ''}~${c.temperatureRangeC.max ?? ''}℃`
                    : '',
                ].filter(Boolean);
                return (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-slate-900">{c.name}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-blue-600">
                        {c.model || c.id}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      <p className="text-slate-800 font-medium">
                        {c.supplierNo || '未配置供应商'}
                      </p>
                      {c.series && <p className="text-[11px] text-slate-400">{c.series}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      <p>
                        {c.type === 'male'
                          ? '公头'
                          : c.type === 'female'
                            ? '母头'
                            : c.type === 'receptacle'
                              ? '插座'
                              : c.type}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {c.shielded !== undefined ? (c.shielded ? '已屏蔽' : '未屏蔽') : '-'}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {c.pinCount}P
                      </span>
                      {c.pitch ? (
                        <p className="mt-1 text-[11px] text-slate-500">{c.pitch}mm</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {(c.ratedVoltageV || c.ratedCurrentA) && (
                        <p className="font-medium text-slate-700">
                          {c.ratedVoltageV ? `${c.ratedVoltageV}V` : ''}
                          {c.ratedVoltageV && c.ratedCurrentA ? ' · ' : ''}
                          {c.ratedCurrentA ? `${c.ratedCurrentA}A` : ''}
                        </p>
                      )}
                      {protectionTags.length > 0 ? (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {protectionTags.map((tag) => (
                            <span
                              key={tag}
                              className="whitespace-nowrap rounded bg-slate-100/90 px-1.5 py-0.5 text-[10px] text-slate-500"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        !c.ratedVoltageV && !c.ratedCurrentA && <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="w-[120px] min-w-[110px] px-4 py-2.5 text-right">
                      {price ? (
                        <span className="inline-block whitespace-nowrap rounded-md border border-emerald-200/90 bg-emerald-50/90 px-2.5 py-0.5 text-xs font-bold tabular-nums text-emerald-700 shadow-2xs">
                          ¥ {formatMaterialPrice(price.taxIncludedPrice)}
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 text-xs text-slate-400">待定价</span>
                      )}
                      {renderEditPriceButton(c.resourceItemId || c.id, 'connector')}
                    </td>
                    <td className="w-[80px] min-w-[80px] px-4 py-2.5 text-center text-slate-500 whitespace-nowrap">
                      {price?.unit ?? '元/个'}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap"><PriceUpdateInfo price={price} field="time" /></td>
                    <td className="px-4 py-2.5"><PriceUpdateInfo price={price} field="user" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {catalogStatus === 'loading' && connectors.length === 0 && (
            <div className="py-14 text-center text-sm text-slate-500">
              正在加载连接器物料...
            </div>
          )}

          {filteredConnectors.length === 0 && (catalogStatus !== 'loading' || connectors.length > 0) && (
            <div className="py-14 text-center text-sm text-slate-500">
              未找到匹配的连接器。
            </div>
          )}
        </div>

        <MaterialPagination
          currentPage={safeConnPage}
          pageSize={connPageSize}
          totalCount={filteredConnectors.length}
          onPageChange={(page) => onStateChange((prev) => ({ ...prev, page }))}
          onPageSizeChange={(pageSize) => onStateChange((prev) => ({ ...prev, pageSize, page: 1 }))}
          scrollContainerRef={connTableRef}
        />
      </section>
    </div>
  );
}

import { useMemo, useRef, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Search } from 'lucide-react';
import { MaterialPagination } from '@/components/materials/MaterialPagination';
import { PriceUpdateInfo } from '@/components/materials/PriceUpdateInfo';
import {
  formatWireTierLength,
  getWirePricesFromIndex,
  type MaterialPriceIndex,
} from '@/components/materials/materialPriceLookup';
import { formatMaterialPrice } from '@/lib/materialPriceEdit';
import type { QuoteMaterial } from '@/lib/quoteMaterials';
import type { CatalogWire } from '@/types/catalog';

export interface WiresTabState {
  query: string;
  kind: string;
  awg: string;
  shielded: string;
  priceStatus: 'all' | 'priced' | 'unpriced';
  page: number;
  pageSize: number;
}

interface WiresTabProps {
  wires: CatalogWire[];
  priceIndex: MaterialPriceIndex;
  catalogStatus: string;
  isRefreshing: boolean;
  state: WiresTabState;
  onStateChange: Dispatch<SetStateAction<WiresTabState>>;
  renderEditPriceButton: (resourceId: string, kind: QuoteMaterial['kind']) => ReactNode;
}

export function WiresTab({
  wires,
  priceIndex,
  catalogStatus,
  isRefreshing,
  state,
  onStateChange,
  renderEditPriceButton,
}: WiresTabProps) {
  const {
    query: wireQuery,
    kind: wireKind,
    awg: wireAwg,
    shielded: wireShielded,
    priceStatus: wirePriceStatus,
    page: wirePage,
    pageSize: wirePageSize,
  } = state;
  const wireTableRef = useRef<HTMLDivElement>(null);

  const wireAwgs = useMemo(() => {
    const set = new Set<number>();
    for (const w of wires) {
      if (w.spec.awg != null) set.add(w.spec.awg);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [wires]);

  const filteredWires = useMemo(() => {
    const q = wireQuery.trim().toLowerCase();
    return wires.filter((w) => {
      const matchQ =
        !q ||
        w.name.toLowerCase().includes(q) ||
        w.id.toLowerCase().includes(q) ||
        w.model?.toLowerCase().includes(q) ||
        (w.supplierNo ? w.supplierNo.toLowerCase().includes(q) : false) ||
        (w.spec.ulNumber ? String(w.spec.ulNumber).toLowerCase().includes(q) : false) ||
        (w.spec.awg != null &&
          (String(w.spec.awg).includes(q) ||
            `${w.spec.awg}awg`.includes(q) ||
            `${w.spec.awg} awg`.includes(q)));

      const matchK =
        wireKind === 'all' ||
        (wireKind === 'electronic' && w.spec.kind === 'electronic') ||
        (wireKind === 'jacketed' && w.spec.kind === 'jacketed');

      const matchA = wireAwg === 'all' || w.spec.awg === Number(wireAwg);

      const isShielded = w.spec.kind === 'jacketed' && Boolean(w.spec.shielded);
      const matchSh =
        wireShielded === 'all' ||
        (wireShielded === 'shielded' && isShielded) ||
        (wireShielded === 'unshielded' && !isShielded);

      const hasPrice = getWirePricesFromIndex(priceIndex, w).length > 0;
      const matchPr =
        wirePriceStatus === 'all' ||
        (wirePriceStatus === 'priced' && hasPrice) ||
        (wirePriceStatus === 'unpriced' && !hasPrice);

      return matchQ && matchK && matchA && matchSh && matchPr;
    });
  }, [wires, wireQuery, wireKind, wireAwg, wireShielded, wirePriceStatus, priceIndex]);

  const totalWirePages = Math.max(1, Math.ceil(filteredWires.length / wirePageSize));
  const safeWirePage = Math.min(Math.max(1, wirePage), totalWirePages);

  const paginatedWires = useMemo(() => {
    const start = (safeWirePage - 1) * wirePageSize;
    return filteredWires.slice(start, start + wirePageSize);
  }, [filteredWires, safeWirePage, wirePageSize]);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5 sm:gap-3">
      <section className="shrink-0 rounded-lg border border-slate-200 bg-white p-2.5 sm:p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative block min-w-[200px] flex-[2_1_220px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={wireQuery}
              onChange={(e) => {
                onStateChange((prev) => ({ ...prev, query: e.target.value, page: 1 }));
              }}
              placeholder="搜索线缆名称、型号、UL标号、AWG"
              className="h-8.5 w-full rounded-md border border-slate-200 bg-white pr-3 pl-9 text-xs outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <select
            value={wireKind}
            onChange={(e) => {
              onStateChange((prev) => ({ ...prev, kind: e.target.value, page: 1 }));
            }}
            className="h-8.5 min-w-[112px] flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400"
          >
            <option value="all">全部线种类型</option>
            <option value="electronic">电子线 (单芯)</option>
            <option value="jacketed">护套线 (多芯/屏蔽)</option>
          </select>

          <select
            value={wireAwg}
            onChange={(e) => {
              onStateChange((prev) => ({ ...prev, awg: e.target.value, page: 1 }));
            }}
            className="h-8.5 min-w-[112px] flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400"
          >
            <option value="all">全部 AWG 规格</option>
            {wireAwgs.map((awg) => (
              <option key={awg} value={awg}>
                {awg} AWG
              </option>
            ))}
          </select>

          <select
            value={wireShielded}
            onChange={(e) => {
              onStateChange((prev) => ({ ...prev, shielded: e.target.value, page: 1 }));
            }}
            className="h-8.5 min-w-[108px] flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400"
          >
            <option value="all">全部屏蔽状态</option>
            <option value="shielded">已屏蔽</option>
            <option value="unshielded">非屏蔽</option>
          </select>

          <select
            value={wirePriceStatus}
            onChange={(e) => {
              onStateChange((prev) => ({
                ...prev,
                priceStatus: e.target.value as 'all' | 'priced' | 'unpriced',
                page: 1,
              }));
            }}
            className="h-8.5 min-w-[108px] flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400"
          >
            <option value="all">全部价格状态</option>
            <option value="priced">已定价</option>
            <option value="unpriced">待定价</option>
          </select>

          {(wireQuery || wireKind !== 'all' || wireAwg !== 'all' || wireShielded !== 'all' || wirePriceStatus !== 'all') && (
            <button
              type="button"
              onClick={() => {
                onStateChange((prev) => ({
                  ...prev,
                  query: '',
                  kind: 'all',
                  awg: 'all',
                  shielded: 'all',
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
            data-testid="wire-syncing-progress"
            className="absolute top-0 left-0 right-0 z-20 h-0.5 bg-blue-100 overflow-hidden"
          >
            <div className="h-full w-full bg-blue-600 animate-pulse" />
          </div>
        )}
        <div ref={wireTableRef} className="flex-1 min-h-0 overflow-auto">
          <table className="min-w-[1060px] w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 uppercase text-slate-500 shadow-2xs">
              <tr>
                <th className="min-w-[180px] px-4 py-3 font-semibold">线缆名称与型号</th>
                <th className="w-[100px] min-w-[90px] px-4 py-3 font-semibold">线种 / UL标号</th>
                <th className="w-[110px] min-w-[100px] px-4 py-3 font-semibold">线规 / 导体</th>
                <th className="w-[90px] min-w-[80px] px-4 py-3 font-semibold">芯数 / 屏蔽</th>
                <th className="w-[110px] min-w-[100px] px-4 py-3 font-semibold">绝缘与外径 OD</th>
                <th className="w-[110px] min-w-[100px] px-4 py-3 font-semibold">耐温与电气</th>
                <th className="w-[240px] min-w-[230px] px-3.5 py-3 font-semibold text-right">参考单价与档位</th>
                <th className="w-[80px] min-w-[80px] px-4 py-3 font-semibold text-center">计价单位</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedWires.map((w) => {
                const wireTiers = getWirePricesFromIndex(priceIndex, w);
                const s = w.spec;
                return (
                  <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{w.name}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-blue-600">
                        {w.model || w.id}
                      </p>
                      {w.supplierNo && (
                        <p className="text-[11px] text-slate-400">
                          {w.supplierNo}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <p className="font-medium text-slate-800">
                        {s.kind === 'electronic' ? '电子线' : '护套线'}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {s.ulNumber ? `UL${s.ulNumber}` : '-'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {s.awg != null ? `${s.awg} AWG` : '-'}
                      </span>
                      {s.kind === 'jacketed' && s.conductorAreaMm2 && (
                        <span className="ml-1 text-[11px] text-slate-500">
                          {s.conductorAreaMm2} mm²
                        </span>
                      )}
                      {s.conductorMaterial && (
                        <p className="mt-1 text-[11px] text-slate-400">{s.conductorMaterial}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <p className="font-medium">
                        {s.kind === 'jacketed' ? `${s.coreCount} 芯` : '单芯'}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {s.kind === 'jacketed' ? (s.shielded ? '屏蔽' : '非屏蔽') : '无屏蔽'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <p className="font-medium">
                        {s.outerDiameterMm != null
                          ? `OD ${s.outerDiameterMm}mm`
                          : s.insulationDiameterMm != null
                            ? `OD ${s.insulationDiameterMm}mm`
                            : '-'}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {s.kind === 'jacketed'
                          ? s.jacketMaterial || '-'
                          : s.insulationMaterial || '-'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <p>
                        {s.ratedVoltageV ? `${s.ratedVoltageV}V` : ''}
                        {s.temperatureRangeC
                          ? ` · ${s.temperatureRangeC.min ?? ''}~${s.temperatureRangeC.max ?? ''}℃`
                          : ''}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {s.flameTest || s.ingressProtection || '-'}
                      </p>
                    </td>
                    <td className="w-[240px] min-w-[230px] px-3.5 py-3 text-right">
                      {wireTiers.length > 0 ? (
                        <div className="flex flex-col items-end">
                          {wireTiers.length === 1 ? (
                            <div
                              className="inline-flex flex-wrap items-center gap-1.5 rounded-md border border-emerald-200/90 bg-emerald-50/90 px-2.5 py-1 text-xs whitespace-nowrap shadow-2xs"
                              title={`线长档位 ≤ ${formatWireTierLength(wireTiers[0].lengthMm)} (${wireTiers[0].lengthMm}mm): 含税单价 ¥${formatMaterialPrice(wireTiers[0].taxIncludedPrice)} / 条`}
                            >
                              <span className="font-mono text-xs font-semibold text-emerald-700">
                                {formatWireTierLength(wireTiers[0].lengthMm)}:
                              </span>
                              <span className="tabular-nums font-bold text-emerald-800">
                                ¥ {formatMaterialPrice(wireTiers[0].taxIncludedPrice)}
                              </span>
                              <div className="w-full"><PriceUpdateInfo price={wireTiers[0]} /></div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-1.5 w-full min-w-[230px]">
                              {wireTiers.map((tier) => {
                                const lenStr = formatWireTierLength(tier.lengthMm);
                                return (
                                  <div
                                    key={tier.lengthMm}
                                    className="flex flex-wrap items-center justify-between gap-1 rounded-md border border-emerald-200/90 bg-emerald-50/90 px-2 py-1 text-xs whitespace-nowrap shadow-2xs"
                                    title={`线长档位 ≤ ${lenStr} (${tier.lengthMm}mm): 含税单价 ¥${formatMaterialPrice(tier.taxIncludedPrice)} / 条`}
                                  >
                                    <span className="font-mono text-xs font-semibold text-emerald-700">
                                      {lenStr}:
                                    </span>
                                    <span className="tabular-nums font-bold text-emerald-800">
                                      ¥ {formatMaterialPrice(tier.taxIncludedPrice)}
                                    </span>
                                    <div className="w-full"><PriceUpdateInfo price={tier} /></div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-block px-2 py-1 text-xs text-slate-400">
                          待定价
                        </span>
                      )}
                      {renderEditPriceButton(w.resourceItemId || w.id, 'wire')}
                    </td>
                    <td className="w-[80px] min-w-[80px] px-4 py-3 text-center text-slate-500 whitespace-nowrap">
                      元/条
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {catalogStatus === 'loading' && wires.length === 0 && (
            <div className="py-14 text-center text-sm text-slate-500">
              正在加载线缆物料...
            </div>
          )}

          {filteredWires.length === 0 && (catalogStatus !== 'loading' || wires.length > 0) && (
            <div className="py-14 text-center text-sm text-slate-500">
              未找到匹配的线缆规格。
            </div>
          )}
        </div>

        <MaterialPagination
          currentPage={safeWirePage}
          pageSize={wirePageSize}
          totalCount={filteredWires.length}
          onPageChange={(page) => onStateChange((prev) => ({ ...prev, page }))}
          onPageSizeChange={(pageSize) => onStateChange((prev) => ({ ...prev, pageSize, page: 1 }))}
          scrollContainerRef={wireTableRef}
        />
      </section>
    </div>
  );
}

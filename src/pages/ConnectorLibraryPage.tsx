import { useMemo, useState } from 'react';
import { Database, Search } from 'lucide-react';
import { useCatalogStore } from '@/stores/catalogStore';
import { getCatalogConnectors } from '@/lib/catalogRuntime';

export function ConnectorLibraryPage() {
  const connectors = useCatalogStore((state) => getCatalogConnectors(state.snapshot));
  const [query, setQuery] = useState('');
  const [manufacturer, setManufacturer] = useState('all');
  const [series, setSeries] = useState('all');
  const [shielded, setShielded] = useState('all');
  const [type, setType] = useState('all');
  const [pinCount, setPinCount] = useState('all');

  const allManufacturers = useMemo(() => Array.from(new Set(connectors.map((c) => c.manufacturer))).filter(Boolean).sort(), [connectors]);
  const allSeries = useMemo(() => Array.from(new Set(connectors.map((c) => c.series).filter(Boolean))).sort() as string[], [connectors]);
  const allTypes = useMemo(() => Array.from(new Set(connectors.map((c) => c.type))).sort(), [connectors]);

  const filteredConnectors = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return connectors.filter((connector) => {
      const matchesQuery =
        !normalizedQuery ||
        connector.name.toLowerCase().includes(normalizedQuery) ||
        connector.id.toLowerCase().includes(normalizedQuery) ||
        connector.model?.toLowerCase().includes(normalizedQuery) ||
        connector.series?.toLowerCase().includes(normalizedQuery) ||
        connector.manufacturer.toLowerCase().includes(normalizedQuery);
      const matchesManufacturer = manufacturer === 'all' || connector.manufacturer === manufacturer;
      const matchesSeries = series === 'all' || connector.series === series;
      const matchesShielded =
        shielded === 'all' ||
        (shielded === 'shielded' && connector.shielded === true) ||
        (shielded === 'unshielded' && connector.shielded === false);
      const matchesType = type === 'all' || connector.type === type;
      const matchesPinCount = pinCount === 'all' || connector.pinCount === Number(pinCount);
      return matchesQuery && matchesManufacturer && matchesSeries && matchesShielded && matchesType && matchesPinCount;
    });
  }, [connectors, manufacturer, series, shielded, pinCount, query, type]);

  const pinCounts = Array.from(new Set(connectors.map((connector) => connector.pinCount))).sort((a, b) => a - b);

  return (
    <div className="h-full overflow-y-auto bg-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 lg:p-5">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-slate-900">数据库连接器</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                连接器数据来自标准物料库。
              </p>
            </div>
            <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
              共 {filteredConnectors.length} / {connectors.length} 项
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
            <label className="relative block sm:col-span-2">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索名称、型号、系列、厂商或 ID"
                className="h-10 w-full rounded-md border border-slate-200 bg-white pr-3 pl-9 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <select
              value={manufacturer}
              onChange={(event) => setManufacturer(event.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">全部厂商</option>
              {allManufacturers.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select
              value={series}
              onChange={(event) => setSeries(event.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">全部系列</option>
              {allSeries.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select
              value={shielded}
              onChange={(event) => setShielded(event.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">全部屏蔽状态</option>
              <option value="shielded">已屏蔽</option>
              <option value="unshielded">未屏蔽</option>
            </select>
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">全部类型</option>
              {allTypes.map((item) => (
                <option key={item} value={item}>{item === 'male' ? '公头 (male)' : item === 'female' ? '母头 (female)' : item}</option>
              ))}
            </select>
            <select
              value={pinCount}
              onChange={(event) => setPinCount(event.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">全部 PIN 数</option>
              {pinCounts.map((count) => (
                <option key={count} value={count}>{count}P</option>
              ))}
            </select>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[960px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">连接器与型号</th>
                  <th className="px-4 py-3 font-semibold">厂商与系列</th>
                  <th className="px-4 py-3 font-semibold">类型 / 屏蔽</th>
                  <th className="px-4 py-3 font-semibold">PIN / 间距</th>
                  <th className="px-4 py-3 font-semibold">电气与防护规格</th>
                  <th className="px-4 py-3 font-semibold">材质</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredConnectors.map((connector) => (
                  <tr key={connector.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{connector.name}</p>
                      <p className="mt-0.5 text-xs font-mono text-blue-600">
                        {connector.model || connector.id}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <p className="text-slate-800">{connector.manufacturer}</p>
                      {connector.series && <p className="text-xs text-slate-400">{connector.series}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <p>{connector.type === 'male' ? '公头' : connector.type === 'female' ? '母头' : connector.type}</p>
                      <p className="text-xs text-slate-400">
                        {connector.shielded !== undefined ? (connector.shielded ? '已屏蔽' : '未屏蔽') : '-'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                        {connector.pinCount}P
                      </span>
                      <p className="mt-1 text-xs text-slate-500">
                        {connector.pitch ? `${connector.pitch}mm` : '-'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <p>
                        {connector.ratedVoltageV ? `${connector.ratedVoltageV}V` : ''}
                        {connector.ratedVoltageV && connector.ratedCurrentA ? ' · ' : ''}
                        {connector.ratedCurrentA ? `${connector.ratedCurrentA}A` : ''}
                      </p>
                      <p className="text-slate-400">
                        {[
                          connector.ingressProtection,
                          connector.flammabilityRating,
                          connector.temperatureRangeC ? `${connector.temperatureRangeC.min ?? ''}~${connector.temperatureRangeC.max ?? ''}℃` : '',
                        ].filter(Boolean).join(' · ') || '-'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      <div className="max-w-xs truncate" title={connector.housingMaterial ?? connector.contactMaterial ?? '-'}>
                        {connector.housingMaterial ?? connector.contactMaterial ?? '-'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredConnectors.length === 0 && (
            <div className="py-14 text-center text-sm text-slate-500">
              未找到匹配的连接器。
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

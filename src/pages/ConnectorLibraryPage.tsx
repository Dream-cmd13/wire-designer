import { useMemo, useState } from 'react';
import { Database, Search } from 'lucide-react';
import { useCatalogStore } from '@/stores/catalogStore';
import { getCatalogConnectors } from '@/lib/catalogRuntime';

export function ConnectorLibraryPage() {
  const connectors = useCatalogStore((state) => getCatalogConnectors(state.snapshot));
  const [query, setQuery] = useState('');
  const [manufacturer, setManufacturer] = useState('all');
  const [type, setType] = useState('all');
  const [pinCount, setPinCount] = useState('all');
  const allManufacturers = useMemo(() => Array.from(new Set(connectors.map((connector) => connector.manufacturer))).sort(), [connectors]);
  const allTypes = useMemo(() => Array.from(new Set(connectors.map((connector) => connector.type))).sort(), [connectors]);

  const filteredConnectors = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return connectors.filter((connector) => {
      const matchesQuery =
        !normalizedQuery ||
        connector.name.toLowerCase().includes(normalizedQuery) ||
        connector.id.toLowerCase().includes(normalizedQuery) ||
        connector.manufacturer.toLowerCase().includes(normalizedQuery);
      const matchesManufacturer = manufacturer === 'all' || connector.manufacturer === manufacturer;
      const matchesType = type === 'all' || connector.type === type;
      const matchesPinCount = pinCount === 'all' || connector.pinCount === Number(pinCount);
      return matchesQuery && matchesManufacturer && matchesType && matchesPinCount;
    });
  }, [connectors, manufacturer, pinCount, query, type]);

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
                连接器数据来自 Supabase 目录表。
              </p>
            </div>
            <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
              共 {filteredConnectors.length} / {connectors.length} 项
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <label className="relative block">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索名称、ID、厂商"
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
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">全部类型</option>
              {allTypes.map((item) => (
                <option key={item} value={item}>{item}</option>
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
            <table className="min-w-[860px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">连接器</th>
                  <th className="px-4 py-3 font-semibold">厂商</th>
                  <th className="px-4 py-3 font-semibold">类型</th>
                  <th className="px-4 py-3 font-semibold">PIN</th>
                  <th className="px-4 py-3 font-semibold">间距</th>
                  <th className="px-4 py-3 font-semibold">材料</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredConnectors.map((connector) => (
                  <tr key={connector.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{connector.name}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{connector.id}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{connector.manufacturer}</td>
                    <td className="px-4 py-3 text-slate-600">{connector.type}</td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                        {connector.pinCount}P
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {connector.pitch ? `${connector.pitch}mm` : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
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

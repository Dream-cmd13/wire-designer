import type { DrawingCatalogFilters, DrawingCatalogResource } from '@/types/drawing';

const field = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500';

type Props = {
  title: string;
  resources: DrawingCatalogResource[];
  filters: DrawingCatalogFilters;
  selectedId?: string;
  loading?: boolean;
  error?: string;
  onFiltersChange: (filters: DrawingCatalogFilters) => void;
  onSelect: (resource: DrawingCatalogResource) => void;
  onRetry: () => void;
};

export function DrawingResourceSelect({ title, resources, filters, selectedId, loading, error, onFiltersChange, onSelect, onRetry }: Props) {
  const values = <K extends keyof DrawingCatalogResource>(key: K) => [...new Set(resources.map((item) => item[key]).filter(Boolean).map(String))];
  const patch = (next: Partial<DrawingCatalogFilters>) => onFiltersChange({ ...filters, ...next });
  return <section className="rounded border border-slate-200 p-3">
    <h4 className="mb-3 text-sm font-semibold text-slate-800">{title}</h4>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs text-slate-600">资源类型<select className={field} value={filters.resourceType ?? 'connector'} onChange={(event) => patch({ resourceType: event.target.value as DrawingCatalogFilters['resourceType'] })}><option value="connector">连接器</option><option value="model">模型</option></select></label>
      <label className="text-xs text-slate-600">名称<input className={field} value={filters.query ?? ''} onChange={(event) => patch({ query: event.target.value })} placeholder="例如 XH2.54" /></label>
      <label className="text-xs text-slate-600">公/母<select className={field} value={filters.gender ?? ''} onChange={(event) => patch({ gender: event.target.value ? event.target.value as DrawingCatalogFilters['gender'] : undefined })}><option value="">全部</option><option value="male">公头</option><option value="female">母头</option><option value="receptacle">插座</option></select></label>
      <label className="text-xs text-slate-600">资源分组<select className={field} value={filters.resourceGroup ?? ''} onChange={(event) => patch({ resourceGroup: event.target.value || undefined })}><option value="">全部</option>{values('resourceGroup').map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs text-slate-600">系列<select className={field} value={filters.series ?? ''} onChange={(event) => patch({ series: event.target.value || undefined })}><option value="">全部</option>{values('series').map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs text-slate-600">PIN 位数<select className={field} value={filters.pinCount ?? ''} onChange={(event) => patch({ pinCount: event.target.value ? Number(event.target.value) : undefined })}><option value="">全部</option>{values('pinCount').map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs text-slate-600">排位<select className={field} value={filters.rowCount ?? ''} onChange={(event) => patch({ rowCount: event.target.value ? Number(event.target.value) : undefined })}><option value="">全部</option>{values('rowCount').map((value) => <option key={value} value={value}>{value}排</option>)}</select></label>
      <label className="text-xs text-slate-600">间距<select className={field} value={filters.pitchMm ?? ''} onChange={(event) => patch({ pitchMm: event.target.value ? Number(event.target.value) : undefined })}><option value="">全部</option>{values('pitchMm').map((value) => <option key={value} value={value}>{value}mm</option>)}</select></label>
    </div>
    {loading && <p className="mt-3 text-xs text-slate-500">公共资源加载中…</p>}
    {error && <div className="mt-3 rounded bg-red-50 p-2 text-xs text-red-700">{error}<button type="button" className="ml-2 underline" onClick={onRetry}>重试</button></div>}
    {!loading && !error && resources.length === 0 && <p className="mt-3 rounded bg-slate-50 p-3 text-xs text-slate-500">没有符合条件的公共资源。</p>}
    <div className="mt-3 grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2">
      {resources.map((resource) => <button type="button" key={resource.resourceItemId} onClick={() => onSelect(resource)} className={`rounded border p-2 text-left text-xs ${selectedId === resource.id || selectedId === resource.resourceItemId ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}><strong className="block text-slate-800">{resource.name}</strong><span className="text-slate-500 text-[11px]">{resource.model ? `${resource.model} · ` : ''}{resource.specification || `${resource.pinCount ?? '-'}PIN · ${resource.rowCount ?? '-'}排 · ${resource.pitchMm ?? '-'}mm`}</span></button>)}
    </div>
  </section>;
}

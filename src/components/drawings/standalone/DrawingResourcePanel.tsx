import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, X } from 'lucide-react';
import { drawingCatalogRepository } from '@/lib/drawingCatalogRepository';
import type { DrawingCatalogResource, DrawingCommonPhrase, DrawingIconResource, DrawingResourceKind } from '@/types/drawing';

interface Props {
  open: boolean;
  onClose: () => void;
  onAddKind: (kind: DrawingResourceKind) => void;
  onAddCatalog: (resource: DrawingCatalogResource) => void;
  onAddPhrase: (phrase: DrawingCommonPhrase) => void;
  onAddIcon: (icon: DrawingIconResource) => void;
}

const localTools: Array<{ kind: DrawingResourceKind; label: string }> = [
  { kind: 'connector', label: '连接器/模型' }, { kind: 'wire-bundle', label: '线材' },
  { kind: 'accessory', label: '辅材' }, { kind: 'wiring-table', label: '接线表' },
  { kind: 'bom-table', label: '物料表' }, { kind: 'table', label: '表格' },
  { kind: 'tech-requirements', label: '物料规格' },
];

export function DrawingResourcePanel({ open, onClose, onAddKind, onAddCatalog, onAddPhrase, onAddIcon }: Props) {
  const [tab, setTab] = useState<'resources' | 'phrases' | 'icons'>('resources');
  const [resources, setResources] = useState<DrawingCatalogResource[]>([]);
  const [phrases, setPhrases] = useState<DrawingCommonPhrase[]>([]);
  const [icons, setIcons] = useState<DrawingIconResource[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!drawingCatalogRepository) { setError('Supabase 尚未配置。'); return; }
    setLoading(true); setError('');
    try {
      const [nextResources, nextPhrases, nextIcons] = await Promise.all([
        drawingCatalogRepository.listResources(), drawingCatalogRepository.listCommonPhrases(), drawingCatalogRepository.listIcons(),
      ]);
      setResources(nextResources); setPhrases(nextPhrases); setIcons(nextIcons);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '公共资源加载失败。'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) void load(); }, [open]);
  const normalized = query.trim().toLocaleLowerCase();
  const visibleResources = useMemo(() => resources.filter((item) => !normalized || `${item.name} ${item.model} ${item.category}`.toLocaleLowerCase().includes(normalized)), [normalized, resources]);

  if (!open) return null;
  return <aside className="absolute left-3 top-3 z-30 flex max-h-[calc(100%-1.5rem)] w-80 flex-col rounded-lg border border-slate-200 bg-white shadow-2xl" aria-label="绘图资源">
    <header className="flex items-center justify-between border-b px-4 py-3"><div><h2 className="text-sm font-semibold text-slate-900">绘图资源</h2><p className="text-xs text-slate-500">公共资源 · Supabase</p></div><button type="button" aria-label="关闭绘图资源" onClick={onClose}><X className="h-4 w-4"/></button></header>
    <div className="flex gap-1 border-b p-2">{([['resources', '公共资源'], ['phrases', '常用语'], ['icons', '图标']] as const).map(([key, label]) => <button type="button" key={key} onClick={() => setTab(key)} className={`flex-1 rounded px-2 py-1.5 text-xs ${tab === key ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}</div>
    <label className="m-3 flex items-center gap-2 rounded border border-slate-200 px-2"><Search className="h-4 w-4 text-slate-400"/><input className="min-w-0 flex-1 py-2 text-xs outline-none" placeholder="搜索名称、型号、类别" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
      {loading && <p className="py-6 text-center text-xs text-slate-500">正在读取公共资源…</p>}
      {error && <button type="button" onClick={() => void load()} className="flex w-full items-center justify-center gap-2 rounded bg-red-50 p-3 text-xs text-red-700"><RefreshCw className="h-4 w-4"/>{error} 点击重试</button>}
      {!loading && !error && tab === 'resources' && <><div className="mb-3 grid grid-cols-2 gap-2">{localTools.map((tool) => <button type="button" key={tool.kind} onClick={() => onAddKind(tool.kind)} className="rounded border border-slate-200 p-2 text-left text-xs hover:border-blue-300 hover:bg-blue-50">{tool.label}</button>)}</div><div className="space-y-2">{visibleResources.map((resource) => <button type="button" key={resource.catalogItemId} onClick={() => onAddCatalog(resource)} className="block w-full rounded border border-slate-200 p-2 text-left hover:border-blue-300"><strong className="block text-xs text-slate-800">{resource.name}</strong><span className="text-[11px] text-slate-500">{resource.resourceType} · {resource.model || resource.specification}</span></button>)}</div></>}
      {!loading && !error && tab === 'phrases' && <div className="space-y-2">{phrases.filter((item) => !normalized || item.phrase.toLocaleLowerCase().includes(normalized)).map((item) => <button type="button" key={item.id} onClick={() => onAddPhrase(item)} className="block w-full rounded border border-slate-200 p-2 text-left text-xs hover:bg-blue-50"><span className="text-slate-400">{item.category} · </span>{item.phrase}</button>)}</div>}
      {!loading && !error && tab === 'icons' && <div className="grid grid-cols-3 gap-2">{icons.filter((item) => !normalized || item.name.toLocaleLowerCase().includes(normalized)).map((item) => <button type="button" key={item.id} onClick={() => onAddIcon(item)} className="rounded border border-slate-200 p-2 text-center text-xs hover:bg-blue-50"><svg viewBox="0 0 24 24" className="mx-auto mb-1 h-7 w-7 fill-none stroke-current"><path d={item.svgPath}/></svg>{item.name}</button>)}</div>}
    </div>
  </aside>;
}

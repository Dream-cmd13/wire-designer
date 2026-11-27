import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  CircleX,
  FileText,
  GitFork,
  LayoutGrid,
  Minus,
  Pencil,
  Puzzle,
  RefreshCw,
  Scissors,
  Search,
  Share2,
  SlidersHorizontal,
  Table2,
  Type,
  Waypoints,
  X,
} from 'lucide-react';
import { LoginRequiredHint } from '@/components/auth/LoginRequiredHint';
import { drawingCatalogRepository } from '@/lib/drawingCatalogRepository';
import type { DrawingComponentGraphicCategory } from '@/lib/drawingStaticResources';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import type { DrawingCatalogResource, DrawingCommonPhrase, DrawingIconResource, DrawingResourceKind } from '@/types/drawing';

interface Props {
  open: boolean;
  canUseCatalog?: boolean;
  onClose: () => void;
  onAddKind: (kind: DrawingResourceKind) => void;
  onAddCatalog: (resource: DrawingCatalogResource) => void;
  onAddPhrase: (phrase: DrawingCommonPhrase) => void;
  onAddIcon: (icon: DrawingIconResource) => void;
  onOpenCustomTable?: () => void;
  onOpenProcessNotes?: () => void;
  onOpenComponentLibrary?: (category: DrawingComponentGraphicCategory) => void;
}

const COMPONENT_GRAPHIC_ITEMS: Array<{ category: DrawingComponentGraphicCategory; icon: typeof Puzzle }> = [
  { category: '包装方式', icon: Puzzle },
  { category: '工艺说明', icon: FileText },
  { category: '裁线图型', icon: Scissors },
  { category: '线材图型', icon: Waypoints },
  { category: '辅材图型', icon: SlidersHorizontal },
  { category: '不规则图型', icon: LayoutGrid },
  { category: '物料规格', icon: Table2 },
  { category: '线材截面图', icon: Minus },
];

export function DrawingResourcePanel({
  open,
  canUseCatalog = false,
  onClose,
  onAddKind,
  onAddCatalog,
  onAddPhrase,
  onAddIcon,
  onOpenCustomTable,
  onOpenProcessNotes,
  onOpenComponentLibrary,
}: Props) {
  const [tab, setTab] = useState<'menu' | 'resources' | 'phrases' | 'icons'>('menu');
  const [resources, setResources] = useState<DrawingCatalogResource[]>([]);
  const [phrases, setPhrases] = useState<DrawingCommonPhrase[]>([]);
  const [icons, setIcons] = useState<DrawingIconResource[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [nextPhrases, nextIcons] = await Promise.all([
        drawingCatalogRepository.listCommonPhrases(),
        drawingCatalogRepository.listIcons(),
      ]);
      setPhrases(nextPhrases);
      setIcons(nextIcons);
      if (!canUseCatalog) {
        setResources([]);
        return;
      }
      try {
        setResources(await drawingCatalogRepository.listResources());
      } catch (reason) {
        console.error('公共资源加载失败:', reason);
        setError(getUserErrorMessage(reason, '公共资源加载失败，请重试。'));
      }
    } catch (reason) {
      console.error('静态绘图资源加载失败:', reason);
      setError(getUserErrorMessage(reason, '绘图资源加载失败，请重试。'));
    } finally {
      setLoading(false);
    }
  };

  // The overlay opening is the external event that starts its Supabase fetch.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { if (open) void load(); }, [open, canUseCatalog]);

  const normalized = query.trim().toLocaleLowerCase();
  const visibleResources = useMemo(
    () => resources.filter((item) => !normalized || `${item.name} ${item.model} ${item.resourceGroup}`.toLocaleLowerCase().includes(normalized)),
    [normalized, resources],
  );

  if (!open) return null;

  const menuItemClass = 'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs text-slate-700 transition hover:bg-blue-50 hover:text-blue-600';

  return (
    <aside
      className="absolute left-2.5 top-2 z-30 flex max-h-[calc(100%-1rem)] w-64 max-w-[calc(100%-1.25rem)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
      aria-label="绘图资源"
    >
      {/* Top tab strip for quick switch between Menu / Public Catalog / Phrases / Icons */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-2 py-1.5">
        <div className="flex flex-1 gap-1">
          {([
            ['menu', '绘图资源'],
            ['resources', '公共资源'],
            ['phrases', '常用语'],
            ['icons', '图标'],
          ] as const).map(([key, label]) => (
            <button
              type="button"
              key={key}
              onClick={() => setTab(key)}
              className={`rounded px-1.5 py-1 text-[11px] transition ${
                tab === key
                  ? 'bg-white font-medium text-blue-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" aria-label="关闭绘图资源" onClick={onClose} className="ml-1 rounded p-0.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {tab === 'menu' && (
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          <button type="button" onClick={() => onAddKind('connector')} className={menuItemClass}>
            <Puzzle className="h-3.5 w-3.5 text-slate-500" />连接器/模型
          </button>
          <button type="button" onClick={() => onAddKind('wire-bundle')} className={menuItemClass}>
            <Type className="h-3.5 w-3.5 text-slate-500" />线材
          </button>
          <button type="button" onClick={() => onAddKind('bom-table')} className={menuItemClass}>
            <Table2 className="h-3.5 w-3.5 text-slate-500" />物料表
          </button>
          <button type="button" onClick={() => onAddKind('polyline')} className={menuItemClass}>
            <GitFork className="h-3.5 w-3.5 text-slate-500" />分岔线
          </button>
          <button type="button" onClick={() => onAddKind('line')} className={menuItemClass}>
            <CircleX className="h-3.5 w-3.5 text-slate-500" />交叉线
          </button>

          <div className="my-1 border-t border-slate-100" />

          <button
            type="button"
            onClick={() => {
              if (onOpenProcessNotes) onOpenProcessNotes();
              else onAddKind('tech-requirements');
            }}
            className={menuItemClass}
          >
            <FileText className="h-3.5 w-3.5 text-slate-500" />工艺说明
          </button>

          <div className="my-1 border-t border-slate-100" />
          <div className="px-3 py-1 text-[11px] font-medium text-slate-400">接线图</div>

          <button
            type="button"
            onClick={() => {
              if (onOpenCustomTable) onOpenCustomTable();
              else onAddKind('table');
            }}
            className={menuItemClass}
          >
            <Table2 className="h-3.5 w-3.5 text-slate-500" />自定义接线表
          </button>
          <button type="button" onClick={() => onAddKind('wiring-table')} className={menuItemClass}>
            <Share2 className="h-3.5 w-3.5 text-slate-500" />自定义接线关系
          </button>
          <button type="button" onClick={() => onAddKind('wiring-table')} className={menuItemClass}>
            <Share2 className="h-3.5 w-3.5 text-slate-500" />标准接线图
          </button>
          <button type="button" onClick={() => onAddKind('accessory')} className={menuItemClass}>
            <Pencil className="h-3.5 w-3.5 text-slate-500" />焊接示意图
          </button>

          <div className="my-1 border-t border-slate-100" />
          <div className="px-3 py-1 text-[11px] font-medium text-slate-400">组件图型</div>

          {COMPONENT_GRAPHIC_ITEMS.map(({ category, icon: Icon }) => (
            <button
              key={category}
              type="button"
              onClick={() => onOpenComponentLibrary?.(category)}
              className={`${menuItemClass} justify-between`}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-3.5 w-3.5 text-slate-500" />
                {category}
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </button>
          ))}

          {!canUseCatalog && (
            <div className="m-2">
              <LoginRequiredHint message="登录后可查看公共物料目录。" />
            </div>
          )}
        </div>
      )}

      {tab !== 'menu' && (
        <>
          <label className="m-2.5 flex items-center gap-2 rounded border border-slate-200 px-2">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              className="min-w-0 flex-1 py-1.5 text-xs outline-none"
              placeholder="搜索名称、型号、资源分组"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5">
            {tab === 'resources' && (
              !canUseCatalog ? (
                <LoginRequiredHint message="登录后可查看公共物料目录。" />
              ) : (
                <>
                  {loading && <p className="py-6 text-center text-xs text-slate-500">正在读取公共资源…</p>}
                  {error && (
                    <button type="button" onClick={() => void load()} className="flex w-full items-center justify-center gap-2 rounded bg-red-50 p-3 text-xs text-red-700">
                      <RefreshCw className="h-4 w-4" />{error} 点击重试
                    </button>
                  )}
                  {!loading && !error && (
                    <div className="space-y-1.5">
                      {visibleResources.map((resource) => (
                        <button
                          type="button"
                          key={resource.resourceItemId}
                          onClick={() => onAddCatalog(resource)}
                          className="block w-full rounded border border-slate-200 p-2 text-left hover:border-blue-300 hover:bg-blue-50/40"
                        >
                          <strong className="block text-xs text-slate-800">{resource.name}</strong>
                          <span className="text-[11px] text-slate-500">
                            {resource.resourceType} · {resource.model || resource.specification}
                          </span>
                          {resource.imageError && (
                            <span className="mt-1 block text-[11px] text-amber-700">
                              缩略图加载失败：{getUserErrorMessage(resource.imageError, '图片暂时无法加载，请稍后重试。')}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )
            )}

            {!loading && tab === 'phrases' && (
              <div className="space-y-1.5">
                {phrases.filter((item) => !normalized || item.phrase.toLocaleLowerCase().includes(normalized)).map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => onAddPhrase(item)}
                    className="block w-full rounded border border-slate-200 p-2 text-left text-xs hover:bg-blue-50"
                  >
                    <span className="text-slate-400">{item.category} · </span>
                    {item.phrase}
                  </button>
                ))}
              </div>
            )}

            {!loading && tab === 'icons' && (
              <div className="grid grid-cols-3 gap-1.5">
                {icons.filter((item) => !normalized || item.name.toLocaleLowerCase().includes(normalized)).map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => onAddIcon(item)}
                    className="rounded border border-slate-200 p-1.5 text-center text-[11px] hover:bg-blue-50"
                  >
                    <svg viewBox="0 0 24 24" className="mx-auto mb-1 h-6 w-6 fill-none stroke-current">
                      <path d={item.svgPath} />
                    </svg>
                    {item.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Heart, Keyboard, Search, Star, X } from 'lucide-react';
import { drawingCatalogRepository } from '@/lib/drawingCatalogRepository';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import type { DrawingIconResource } from '@/types/drawing';

type IconLibraryView = 'all' | 'recent' | 'favorites';

interface Props {
  open: boolean;
  onClose: () => void;
  onAddIcon: (icon: DrawingIconResource) => void;
}

const FAVORITES_STORAGE_KEY = 'drawing-workbench-icon-favorites';
const RECENT_STORAGE_KEY = 'drawing-workbench-icon-recent';

function readStoredIds(key: string): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeStoredIds(key: string, ids: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Local storage is optional; the library remains usable when it is unavailable.
  }
}

export function DrawingIconLibraryDialog({ open, onClose, onAddIcon }: Props) {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [view, setView] = useState<IconLibraryView>('all');
  const [category, setCategory] = useState<string>('全部');
  const [query, setQuery] = useState('');
  const [icons, setIcons] = useState<DrawingIconResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => typeof window === 'undefined' ? [] : readStoredIds(FAVORITES_STORAGE_KEY));
  const [recent, setRecent] = useState<string[]>(() => typeof window === 'undefined' ? [] : readStoredIds(RECENT_STORAGE_KEY));
  const [activeIndex, setActiveIndex] = useState(0);

  const loadIcons = useCallback(async () => {
    if (!drawingCatalogRepository) {
      setCatalogError('Supabase 尚未配置。');
      return;
    }
    setLoading(true);
    setCatalogError('');
    try {
      setIcons(await drawingCatalogRepository.listIcons());
    } catch (reason) {
      setCatalogError(getUserErrorMessage(reason, '图标目录加载失败，请重试。'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) void loadIcons();
  }, [loadIcons, open]);

  const iconCategories = useMemo(
    () => ['全部', ...new Set(icons.map((item) => item.category))],
    [icons],
  );

  const visibleIcons = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const favoriteSet = new Set(favorites);
    const source = view === 'recent'
      ? recent.map((id) => icons.find((item) => item.id === id)).filter((item): item is DrawingIconResource => Boolean(item))
      : view === 'favorites'
        ? icons.filter((item) => favoriteSet.has(item.id))
        : icons;
    return source.filter((item) => {
      if (category !== '全部' && item.category !== category) return false;
      return !normalizedQuery || `${item.name} ${item.category}`.toLocaleLowerCase().includes(normalizedQuery);
    });
  }, [category, favorites, icons, query, recent, view]);

  const selectedIndex = Math.min(activeIndex, Math.max(visibleIcons.length - 1, 0));

  const confirmIcon = useCallback((icon: DrawingIconResource) => {
    const nextRecent = [icon.id, ...recent.filter((id) => id !== icon.id)].slice(0, 12);
    setRecent(nextRecent);
    writeStoredIds(RECENT_STORAGE_KEY, nextRecent);
    onAddIcon(icon);
    onClose();
  }, [onAddIcon, onClose, recent]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (!visibleIcons.length) return;
      if (event.target instanceof HTMLInputElement && event.key !== 'Enter') return;
      const delta = event.key === 'ArrowRight' ? 1
        : event.key === 'ArrowLeft' ? -1
          : event.key === 'ArrowDown' ? 5
            : event.key === 'ArrowUp' ? -5
              : 0;
      if (delta !== 0) {
        event.preventDefault();
        setActiveIndex((selectedIndex + delta + visibleIcons.length) % visibleIcons.length);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        setActiveIndex(0);
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        setActiveIndex(visibleIcons.length - 1);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const selected = visibleIcons[selectedIndex];
        if (selected) confirmIcon(selected);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmIcon, onClose, open, selectedIndex, visibleIcons]);

  const toggleFavorite = (icon: DrawingIconResource) => {
    const nextFavorites = favorites.includes(icon.id)
      ? favorites.filter((id) => id !== icon.id)
      : [icon.id, ...favorites];
    setFavorites(nextFavorites);
    writeStoredIds(FAVORITES_STORAGE_KEY, nextFavorites);
  };

  const tabs: Array<{ key: IconLibraryView; label: string; count?: number }> = [
    { key: 'all', label: '全部' },
    { key: 'recent', label: '最近使用', count: recent.length },
    { key: 'favorites', label: '收藏符号', count: favorites.length },
  ];

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawing-icon-library-title"
        className="flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="drawing-icon-library-title" className="text-base font-semibold text-slate-900">工程图纸图标大全</h2>
            <p className="mt-1 text-xs text-slate-500">选择符号后双击确认，也可以按 Enter 插入；Esc 关闭窗口。</p>
          </div>
          <button type="button" aria-label="关闭图标库" title="关闭（Esc）" onClick={onClose} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.key}
              onClick={() => { setView(tab.key); setActiveIndex(0); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${view === tab.key ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {tab.label}{tab.count ? ` ${tab.count}` : ''}
            </button>
          ))}
          <span className="ml-auto hidden items-center gap-1.5 text-[11px] text-slate-400 md:flex">
            <Keyboard className="h-3.5 w-3.5" />
            ← → ↑ ↓ 导航 · Enter 确认 · Esc 关闭
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="shrink-0 border-b border-slate-200 bg-slate-50/70 p-3 md:w-44 md:border-b-0 md:border-r">
            <p className="px-2 pb-2 text-xs font-semibold text-slate-500">分类</p>
            <div className="flex gap-1.5 overflow-x-auto md:flex-col md:overflow-visible">
              {iconCategories.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => { setCategory(item); setActiveIndex(0); }}
                  className={`shrink-0 rounded-md px-2.5 py-2 text-left text-xs transition ${category === item ? 'bg-white font-medium text-blue-700 shadow-sm ring-1 ring-blue-100' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </aside>

          <main className="flex min-h-0 flex-1 flex-col p-4">
            <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
                placeholder="搜索符号名称或类别"
                aria-label="搜索图标"
                className="min-w-0 flex-1 py-2.5 text-sm outline-none"
              />
            </label>

            {loading && <p className="mt-3 text-xs text-slate-500">正在读取图标目录…</p>}
            {catalogError && (
              <button type="button" onClick={() => void loadIcons()} className="mt-3 w-full rounded-lg bg-red-50 px-3 py-2 text-left text-xs text-red-700">
                {catalogError} 点击重试
              </button>
            )}

            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>共 {visibleIcons.length} 个符号</span>
              <span className="hidden items-center gap-2 sm:flex"><span>悬停查看 Tooltip</span><span>·</span><span>单击选择</span><span>·</span><span>双击确认</span></span>
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              {visibleIcons.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                  {visibleIcons.map((icon, index) => {
                    const favorite = favorites.includes(icon.id);
                    const active = index === selectedIndex;
                    return (
                      <div
                        role="option"
                        tabIndex={0}
                        key={icon.id}
                        aria-selected={active}
                        title={`${icon.name} · ${icon.category} · 双击确认`}
                        onClick={() => setActiveIndex(index)}
                        onDoubleClick={() => confirmIcon(icon)}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={`group relative flex min-h-24 flex-col items-center justify-center rounded-xl border p-2 text-center transition ${active ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-100' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/60'}`}
                      >
                        <svg viewBox="0 0 24 24" className="h-10 w-10 fill-none stroke-current stroke-[1.4]" aria-hidden="true">
                          <path d={icon.svgPath} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="mt-2 max-w-full truncate text-[11px] font-medium">{icon.name}</span>
                        <span className="mt-0.5 max-w-full truncate text-[10px] text-slate-400">{icon.category}</span>
                        <span className="absolute right-1.5 top-1.5">
                          <button
                            type="button"
                            aria-label={favorite ? `取消收藏${icon.name}` : `收藏${icon.name}`}
                            title={favorite ? '取消收藏' : '收藏符号'}
                            onClick={(event) => { event.stopPropagation(); toggleFavorite(icon); }}
                            className={`rounded p-1 transition ${favorite ? 'text-amber-500' : 'text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-white hover:text-amber-500'}`}
                          >
                            <Star className="h-3.5 w-3.5" fill={favorite ? 'currentColor' : 'none'} />
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-full min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 text-center">
                  <Heart className="h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-600">暂无匹配符号</p>
                  <p className="mt-1 text-xs text-slate-400">可以切换分类或清空搜索条件。</p>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              <span>当前：{visibleIcons[selectedIndex]?.name ?? '未选择'}</span>
              <span className="flex items-center gap-1">
                <ChevronLeft className="h-3.5 w-3.5" />
                <ChevronRight className="h-3.5 w-3.5" />
                <ChevronUp className="h-3.5 w-3.5" />
                <ChevronDown className="h-3.5 w-3.5" />
                键盘导航
              </span>
            </div>
          </main>
        </div>
      </section>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Search, X } from 'lucide-react';
import {
  listStaticDrawingComponentGraphics,
  type DrawingComponentGraphic,
  type DrawingComponentGraphicCategory,
} from '@/lib/drawingStaticResources';

const ALL_CATEGORIES: DrawingComponentGraphicCategory[] = [
  '包装方式',
  '工艺说明',
  '裁线图型',
  '线材图型',
  '辅材图型',
  '不规则图型',
  '物料规格',
  '线材截面图',
];

interface DrawingComponentLibraryModalProps {
  mode: 'packaging' | 'component';
  initialCategory?: DrawingComponentGraphicCategory;
  initialSelectedId?: string;
  onClose: () => void;
  onConfirm: (graphic: DrawingComponentGraphic) => void;
}

export function DrawingComponentLibraryModal({
  mode,
  initialCategory = '包装方式',
  initialSelectedId = '',
  onClose,
  onConfirm,
}: DrawingComponentLibraryModalProps) {
  const [nameQuery, setNameQuery] = useState('');
  const [category, setCategory] = useState<DrawingComponentGraphicCategory | ''>(
    mode === 'packaging' ? '包装方式' : initialCategory,
  );
  const [subCategory, setSubCategory] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [appliedCategory, setAppliedCategory] = useState<DrawingComponentGraphicCategory | ''>(
    mode === 'packaging' ? '包装方式' : initialCategory,
  );
  const [appliedSubCategory, setAppliedSubCategory] = useState('');
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [jumpInput, setJumpInput] = useState('1');

  const allItems = useMemo(() => listStaticDrawingComponentGraphics(), []);
  const availableSubCategories = useMemo(
    () => [
      ...new Set(
        allItems
          .filter((item) => !category || item.category === category)
          .map((item) => item.subCategory)
          .filter(Boolean),
      ),
    ],
    [allItems, category],
  );

  const filtered = useMemo(() => {
    const q = appliedQuery.trim().toLocaleLowerCase();
    return allItems.filter((item) => {
      if (mode === 'packaging' && item.category !== '包装方式') return false;
      if (mode === 'component' && appliedCategory && item.category !== appliedCategory) return false;
      if (appliedSubCategory && item.subCategory !== appliedSubCategory) return false;
      if (!q) return true;
      return `${item.name} ${item.category} ${item.subCategory}`.toLocaleLowerCase().includes(q);
    });
  }, [allItems, appliedCategory, appliedQuery, appliedSubCategory, mode]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedGraphic = allItems.find((item) => item.id === selectedId);

  const handleSearch = () => {
    setAppliedQuery(nameQuery);
    setAppliedCategory(category);
    setAppliedSubCategory(subCategory);
    setPage(1);
  };

  const handleReset = () => {
    const defaultCategory = mode === 'packaging' ? '包装方式' : initialCategory;
    setNameQuery('');
    setCategory(defaultCategory);
    setSubCategory('');
    setAppliedQuery('');
    setAppliedCategory(defaultCategory);
    setAppliedSubCategory('');
    setPage(1);
  };

  const title = mode === 'packaging'
    ? '选择包装方式'
    : `组件图型 · ${appliedCategory || '全部'}`;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h3 className="text-base font-medium text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={`关闭${title}`}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span className="shrink-0 font-medium">组件名称</span>
            <input
              value={nameQuery}
              onChange={(event) => setNameQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSearch();
              }}
              placeholder={mode === 'packaging' ? '请输入包装方式组件名称' : '请输入组件名称'}
              className="w-48 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
            />
          </label>

          {mode === 'component' && (
            <>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <span className="shrink-0 font-medium">组件类型</span>
                <select
                  value={category}
                  onChange={(event) => {
                    const nextCat = event.target.value as DrawingComponentGraphicCategory | '';
                    setCategory(nextCat);
                    setSubCategory('');
                  }}
                  className="w-36 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
                >
                  <option value="">全部</option>
                  {ALL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-600">
                <span className="shrink-0 font-medium">组件子类</span>
                <select
                  value={subCategory}
                  onChange={(event) => setSubCategory(event.target.value)}
                  className="w-36 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
                >
                  <option value="">请选择或输入子类</option>
                  {availableSubCategories.map((sub) => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </label>
            </>
          )}

          <button
            type="button"
            onClick={handleSearch}
            className="inline-flex items-center gap-1 rounded-md bg-blue-500 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
          >
            <Search className="h-3.5 w-3.5" />搜索
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />重置
          </button>
        </div>

        <div className="min-h-[300px] flex-1 overflow-y-auto p-5">
          {paged.length === 0 ? (
            <p className="py-12 text-center text-xs text-slate-400">没有匹配的组件图型。</p>
          ) : (
            <div className={`grid gap-3 ${mode === 'packaging' ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
              {paged.map((item) => {
                const active = selectedId === item.id;
                const thumbUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.svgPreview)}`;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      if (mode === 'component') {
                        onConfirm(item);
                      } else {
                        setSelectedId(item.id);
                      }
                    }}
                    className={`flex flex-col items-center rounded-lg border p-2.5 text-center transition ${
                      active
                        ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500'
                        : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-xs'
                    }`}
                  >
                    <div className="mb-2 flex h-24 w-full items-center justify-center rounded border border-slate-100 bg-slate-50/50 p-1.5">
                      <img src={thumbUrl} alt="" className="max-h-full max-w-full object-contain" />
                    </div>
                    <div className="line-clamp-1 w-full text-xs font-medium text-slate-700">{item.name}</div>
                    {mode === 'component' && (
                      <div className="mt-1.5 flex items-center justify-center gap-1">
                        <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">
                          {item.category}
                        </span>
                        <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-600">
                          {item.subCategory}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-600">
            <span>共 {filtered.length} 条</span>
            {mode === 'packaging' && (
              <select
                aria-label="每页条数"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                className="rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none"
              >
                <option value={8}>8条/页</option>
                <option value={12}>12条/页</option>
                <option value={24}>24条/页</option>
              </select>
            )}
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 disabled:opacity-40"
                aria-label="上一页"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setPage(pageNum)}
                  className={`h-7 min-w-7 rounded px-2 text-xs font-medium ${
                    pageNum === safePage
                      ? 'bg-blue-500 text-white'
                      : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {pageNum}
                </button>
              ))}
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 disabled:opacity-40"
                aria-label="下一页"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <label className="flex items-center gap-1">
              <span>前往</span>
              <input
                value={jumpInput}
                onChange={(event) => setJumpInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    const target = Number(jumpInput);
                    if (Number.isFinite(target) && target >= 1) {
                      setPage(Math.min(totalPages, Math.floor(target)));
                    }
                  }
                }}
                className="w-11 rounded border border-slate-200 px-1.5 py-1 text-center text-xs outline-none focus:border-blue-500"
              />
              <span>页</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            {mode === 'packaging' && (
              <button
                type="button"
                disabled={!selectedGraphic}
                onClick={() => { if (selectedGraphic) onConfirm(selectedGraphic); }}
                className="rounded-md bg-blue-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-45"
              >
                确定
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

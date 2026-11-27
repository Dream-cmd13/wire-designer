import { useEffect, useMemo, useState } from 'react';
import { Download, Plus, RefreshCw, Search, X } from 'lucide-react';
import { LoginRequiredHint } from '@/components/auth/LoginRequiredHint';
import { DrawingMaterialFormDialog } from '@/components/drawings/standalone/DrawingMaterialFormDialog';
import { downloadDrawingMaterialXlsx } from '@/lib/drawingMaterialExport';
import { drawingMaterialRepository, type CompanyMaterial } from '@/lib/drawingMaterialRepository';
import type { DrawingMaterialInput } from '@/lib/drawingMaterials';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import type { DrawingBomTableObject, DrawingDocument } from '@/types/drawing';

interface Props {
  drawing: DrawingDocument;
  table: DrawingBomTableObject;
  canUseCatalog?: boolean;
  onAddCurrent: (input: DrawingMaterialInput) => void;
  onUpdateCurrent?: (rowIndex: number, input: DrawingMaterialInput) => void;
  onMoveCurrent?: (rowIndex: number, direction: 'up' | 'down') => void;
  onRemoveCurrent?: (rowIndex: number) => void;
  onClose: () => void;
}

export function DrawingMaterialTableDialog({
  drawing,
  table,
  canUseCatalog = false,
  onAddCurrent,
  onUpdateCurrent,
  onMoveCurrent,
  onRemoveCurrent,
  onClose,
}: Props) {
  const [tab, setTab] = useState<'current' | 'company'>('current');
  const [materials, setMaterials] = useState<CompanyMaterial[]>([]);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<{
    mode: 'current' | 'company';
    editIndex?: number;
    initial?: Partial<DrawingMaterialInput>;
  } | null>(null);

  const load = async () => {
    if (!canUseCatalog) { setMaterials([]); setError(''); return; }
    if (!drawingMaterialRepository) { setError('物料服务尚未配置，无法读取公司物料表。'); return; }
    setLoading(true); setError('');
    try { setMaterials(await drawingMaterialRepository.list()); }
    catch (reason) { setError(getUserErrorMessage(reason, '公司物料加载失败，请重试。')); }
    finally { setLoading(false); }
  };

  // Opening this dialog is the external event that starts its company-material fetch.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [canUseCatalog]);

  const visibleMaterials = useMemo(() => {
    const normalized = appliedQuery.trim().toLocaleLowerCase();
    return !normalized
      ? materials
      : materials.filter((item) => `${item.code} ${item.nameAndSpecification} ${item.unit} ${item.note}`.toLocaleLowerCase().includes(normalized));
  }, [appliedQuery, materials]);

  const exportCurrent = () => {
    try { downloadDrawingMaterialXlsx(drawing, table); }
    catch (reason) { setError(getUserErrorMessage(reason, '物料表导出失败，请重试。')); }
  };

  const columns = ['序号', '物料编码', '物料名称/规格', '单位', '用量', '备注'] as const;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/25 p-4 backdrop-blur-[1px]"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="material-table-title"
        className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 id="material-table-title" className="text-base font-medium text-slate-900">物料表</h2>
          <button type="button" aria-label="关闭物料表" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex gap-6 border-b border-slate-200 px-5">
          {([['current', '当前物料表'], ['company', '公司物料表']] as const).map(([key, label]) => (
            <button
              type="button"
              key={key}
              onClick={() => setTab(key)}
              className={`border-b-2 py-2.5 text-sm transition ${
                tab === key
                  ? 'border-blue-500 font-medium text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {tab === 'current' ? (
            <>
              <div className="mb-4 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setForm({ mode: 'current' })}
                  className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100"
                >
                  <Plus className="h-3.5 w-3.5" />添加物料
                </button>
                <button
                  type="button"
                  onClick={exportCurrent}
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-100"
                >
                  <Download className="h-3.5 w-3.5" />导出物料表（XLSX）
                </button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600">
                      {columns.map((column) => (
                        <th key={column} className="border-b border-slate-200 px-3 py-2.5 text-center font-medium">{column}</th>
                      ))}
                      <th className="w-40 border-b border-slate-200 px-3 py-2.5 text-center font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {table.rows.map((row, index) => (
                      <tr key={`${row.序号}-${index}`} className="hover:bg-slate-50/60">
                        {columns.map((column) => (
                          <td
                            key={column}
                            className={`px-3 py-2.5 text-slate-700 ${column === '物料名称/规格' || column === '备注' ? 'max-w-xs text-center' : 'text-center'}`}
                          >
                            {row[column] ?? ''}
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-center">
                          <div className="inline-flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => setForm({
                                mode: 'current',
                                editIndex: index,
                                initial: {
                                  code: row.物料编码 ?? '',
                                  nameAndSpecification: row['物料名称/规格'] ?? '',
                                  unit: row.单位 ?? '',
                                  quantity: row.用量 ?? '',
                                  note: row.备注 ?? '',
                                },
                              })}
                              className="text-blue-600 hover:underline"
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              disabled={index === 0 || !onMoveCurrent}
                              onClick={() => onMoveCurrent?.(index, 'up')}
                              className="text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
                            >
                              上移
                            </button>
                            <button
                              type="button"
                              disabled={index === table.rows.length - 1 || !onMoveCurrent}
                              onClick={() => onMoveCurrent?.(index, 'down')}
                              className="text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
                            >
                              下移
                            </button>
                            <button
                              type="button"
                              disabled={!onRemoveCurrent}
                              onClick={() => onRemoveCurrent?.(index)}
                              className="text-blue-600 hover:text-red-600 hover:underline disabled:text-slate-300"
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {table.rows.length === 0 && (
                      <tr>
                        <td colSpan={columns.length + 1} className="py-10 text-center text-slate-400">
                          当前物料表暂无物料，点击上方「添加物料」添加。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : !canUseCatalog ? (
            <LoginRequiredHint message="登录后可查看并新增公司物料。" />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <label className="flex min-w-64 flex-1 items-center gap-2 rounded-lg border border-slate-300 px-3">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') setAppliedQuery(query); }}
                    placeholder="物料名称/规格请输入搜索"
                    className="min-w-0 flex-1 py-2 text-xs outline-none"
                  />
                </label>
                <button type="button" onClick={() => setAppliedQuery(query)} className="rounded-md bg-blue-500 px-4 py-2 text-xs font-medium text-white hover:bg-blue-600">
                  搜索
                </button>
                <button type="button" onClick={() => setForm({ mode: 'company' })} className="rounded-md border border-blue-200 px-4 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50">
                  新增物料
                </button>
                <button type="button" onClick={() => { setQuery(''); setAppliedQuery(''); }} className="rounded-md border border-slate-200 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50">
                  重置
                </button>
              </div>
              {loading && <p className="py-10 text-center text-xs text-slate-500">正在读取公司物料…</p>}
              {error && (
                <button type="button" onClick={() => void load()} className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700">
                  <RefreshCw className="h-4 w-4" />{error} 点击重试
                </button>
              )}
              {!loading && !error && (
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-left text-slate-600">
                      {['序号', '物料编码', '物料名称/规格', '单位', '操作', '备注'].map((label) => (
                        <th key={label} className="border border-slate-200 px-3 py-2">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMaterials.map((item, index) => (
                      <tr key={item.id}>
                        <td className="border border-slate-200 px-3 py-2">{index + 1}</td>
                        <td className="border border-slate-200 px-3 py-2">{item.code}</td>
                        <td className="border border-slate-200 px-3 py-2">{item.nameAndSpecification}</td>
                        <td className="border border-slate-200 px-3 py-2">{item.unit}</td>
                        <td className="border border-slate-200 px-3 py-2">
                          <button
                            type="button"
                            onClick={() => setForm({
                              mode: 'current',
                              initial: { code: item.code, nameAndSpecification: item.nameAndSpecification, unit: item.unit, quantity: '1', note: item.note },
                            })}
                            className="text-blue-600 hover:underline"
                          >
                            添加
                          </button>
                        </td>
                        <td className="border border-slate-200 px-3 py-2">{item.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-blue-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
          >
            确定
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            取消
          </button>
        </footer>
      </section>

      {form && (
        <DrawingMaterialFormDialog
          key={`${form.mode}:${form.editIndex ?? 'new'}:${form.initial?.code ?? ''}`}
          mode={form.mode}
          isEdit={form.editIndex !== undefined}
          initial={form.initial}
          suggestions={materials}
          onClose={() => setForm(null)}
          onSubmit={async (input) => {
            if (form.mode === 'current') {
              if (form.editIndex !== undefined && onUpdateCurrent) {
                onUpdateCurrent(form.editIndex, input);
              } else {
                onAddCurrent(input);
              }
              setForm(null);
              return;
            }
            if (!drawingMaterialRepository) throw new Error('物料服务尚未配置。');
            await drawingMaterialRepository.create({
              code: input.code,
              nameAndSpecification: input.nameAndSpecification,
              unit: input.unit,
              note: input.note,
            });
            await load();
            setForm(null);
          }}
        />
      )}
    </div>
  );
}

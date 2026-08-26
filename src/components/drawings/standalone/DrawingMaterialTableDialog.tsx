import { useEffect, useMemo, useState } from 'react';
import { Download, Plus, RefreshCw, Search, X } from 'lucide-react';
import { DrawingMaterialFormDialog } from '@/components/drawings/standalone/DrawingMaterialFormDialog';
import { downloadDrawingMaterialXlsx } from '@/lib/drawingMaterialExport';
import { drawingMaterialRepository, type CompanyMaterial } from '@/lib/drawingMaterialRepository';
import type { DrawingMaterialInput } from '@/lib/drawingMaterials';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import type { DrawingBomTableObject, DrawingDocument } from '@/types/drawing';

interface Props {
  drawing: DrawingDocument;
  table: DrawingBomTableObject;
  onAddCurrent: (input: DrawingMaterialInput) => void;
  onClose: () => void;
}

export function DrawingMaterialTableDialog({ drawing, table, onAddCurrent, onClose }: Props) {
  const [tab, setTab] = useState<'current' | 'company'>('current');
  const [materials, setMaterials] = useState<CompanyMaterial[]>([]);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<{ mode: 'current' | 'company'; initial?: Partial<DrawingMaterialInput> } | null>(null);

  const load = async () => {
    if (!drawingMaterialRepository) { setError('物料服务尚未配置，无法读取公司物料表。'); return; }
    setLoading(true); setError('');
    try { setMaterials(await drawingMaterialRepository.list()); }
    catch (reason) { setError(getUserErrorMessage(reason, '公司物料加载失败，请重试。')); }
    finally { setLoading(false); }
  };
  // Opening this dialog is the external event that starts its company-material fetch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);
  const visibleMaterials = useMemo(() => {
    const normalized = appliedQuery.trim().toLocaleLowerCase();
    return !normalized ? materials : materials.filter((item) => `${item.code} ${item.nameAndSpecification} ${item.unit} ${item.note}`.toLocaleLowerCase().includes(normalized));
  }, [appliedQuery, materials]);

  const exportCurrent = () => {
    try { downloadDrawingMaterialXlsx(drawing, table); }
    catch (reason) { setError(getUserErrorMessage(reason, '物料表导出失败，请重试。')); }
  };

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/25 p-4 backdrop-blur-[1px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="material-table-title" className="flex max-h-[84vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b px-5 py-4">
        <div><h2 id="material-table-title" className="text-lg font-semibold text-slate-900">物料表</h2><p className="text-xs text-slate-500">维护当前图纸物料或从公司物料库添加</p></div>
        <button type="button" aria-label="关闭物料表" onClick={onClose} className="rounded p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5"/></button>
      </header>
      <div className="flex gap-1 border-b px-5 pt-3">
        {([['current', '当前物料表'], ['company', '公司物料表']] as const).map(([key, label]) => <button type="button" key={key} onClick={() => setTab(key)} className={`border-b-2 px-4 py-2 text-sm ${tab === key ? 'border-blue-600 font-medium text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>)}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        {tab === 'current' ? <>
          <div className="mb-4 flex justify-end gap-2">
            <button type="button" onClick={() => setForm({ mode: 'current' })} className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"><Plus className="h-4 w-4"/>添加物料</button>
            <button type="button" onClick={exportCurrent} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4"/>导出物料表（XLSX）</button>
          </div>
          <MaterialRows rows={table.rows}/>
        </> : <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="flex min-w-64 flex-1 items-center gap-2 rounded-lg border border-slate-300 px-3"><Search className="h-4 w-4 text-slate-400"/><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') setAppliedQuery(query); }} placeholder="物料名称/规格请输入搜索" className="min-w-0 flex-1 py-2 text-sm outline-none"/></label>
            <button type="button" onClick={() => setAppliedQuery(query)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">搜索</button>
            <button type="button" onClick={() => setForm({ mode: 'company' })} className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700">新增物料</button>
            <button type="button" onClick={() => { setQuery(''); setAppliedQuery(''); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700">重置</button>
          </div>
          {loading && <p className="py-10 text-center text-sm text-slate-500">正在读取公司物料…</p>}
          {error && <button type="button" onClick={() => void load()} className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"><RefreshCw className="h-4 w-4"/>{error} 点击重试</button>}
          {!loading && !error && <table className="w-full border-collapse text-sm"><thead><tr className="bg-slate-50 text-left text-slate-600">{['序号', '物料编码', '物料名称/规格', '单位', '操作', '备注'].map((label) => <th key={label} className="border border-slate-200 px-3 py-2">{label}</th>)}</tr></thead><tbody>{visibleMaterials.map((item, index) => <tr key={item.id}><td className="border border-slate-200 px-3 py-2">{index + 1}</td><td className="border border-slate-200 px-3 py-2">{item.code}</td><td className="border border-slate-200 px-3 py-2">{item.nameAndSpecification}</td><td className="border border-slate-200 px-3 py-2">{item.unit}</td><td className="border border-slate-200 px-3 py-2"><button type="button" onClick={() => setForm({ mode: 'current', initial: { code: item.code, nameAndSpecification: item.nameAndSpecification, unit: item.unit, quantity: '1', note: item.note } })} className="text-blue-600 hover:underline">添加</button></td><td className="border border-slate-200 px-3 py-2">{item.note}</td></tr>)}</tbody></table>}
        </>}
      </div>
    </section>
    {form && <DrawingMaterialFormDialog key={`${form.mode}:${form.initial?.code ?? 'new'}`} mode={form.mode} initial={form.initial} suggestions={materials} onClose={() => setForm(null)} onSubmit={async (input) => {
      if (form.mode === 'current') { onAddCurrent(input); setForm(null); return; }
      if (!drawingMaterialRepository) throw new Error('物料服务尚未配置。');
      await drawingMaterialRepository.create({ code: input.code, nameAndSpecification: input.nameAndSpecification, unit: input.unit, note: input.note });
      await load();
      setForm(null);
    }}/>}
  </div>;
}

function MaterialRows({ rows }: { rows: DrawingBomTableObject['rows'] }) {
  const columns = ['序号', '物料编码', '物料名称/规格', '单位', '用量', '备注'];
  return <table className="w-full border-collapse text-sm"><thead><tr className="bg-slate-50 text-left text-slate-600">{columns.map((column) => <th key={column} className="border border-slate-200 px-3 py-2">{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.序号}-${index}`}>{columns.map((column) => <td key={column} className="border border-slate-200 px-3 py-2">{row[column] ?? ''}</td>)}</tr>)}</tbody></table>;
}

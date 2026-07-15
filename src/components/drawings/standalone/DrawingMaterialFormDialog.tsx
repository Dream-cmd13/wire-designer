import { useState } from 'react';
import { X } from 'lucide-react';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import type { CompanyMaterial } from '@/lib/drawingMaterialRepository';
import type { DrawingMaterialInput } from '@/lib/drawingMaterials';

interface Props {
  mode: 'current' | 'company';
  initial?: Partial<DrawingMaterialInput>;
  suggestions: CompanyMaterial[];
  onSubmit: (input: DrawingMaterialInput) => void | Promise<void>;
  onClose: () => void;
}

const fieldClass = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

export function DrawingMaterialFormDialog({ mode, initial, suggestions, onSubmit, onClose }: Props) {
  const [values, setValues] = useState<DrawingMaterialInput>({
    code: initial?.code ?? '',
    nameAndSpecification: initial?.nameAndSpecification ?? '',
    unit: initial?.unit ?? '',
    quantity: initial?.quantity ?? (mode === 'current' ? '1' : ''),
    note: initial?.note ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const update = (field: keyof DrawingMaterialInput, value: string) => setValues((current) => ({ ...current, [field]: value }));

  const submit = async () => {
    const nextErrors: Record<string, string> = {};
    if (!values.code.trim()) nextErrors.code = '请输入物料编码。';
    if (!values.nameAndSpecification.trim()) nextErrors.nameAndSpecification = '请输入物料名称/规格。';
    if (!values.unit.trim()) nextErrors.unit = '请输入单位。';
    if (mode === 'current' && (!values.quantity.trim() || Number(values.quantity) <= 0)) nextErrors.quantity = '请输入大于 0 的用量。';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSubmitting(true); setSubmitError('');
    try { await onSubmit(values); }
    catch (reason) { setSubmitError(getUserErrorMessage(reason, mode === 'company' ? '公司物料保存失败，请重试。' : '物料添加失败，请重试。')); }
    finally { setSubmitting(false); }
  };

  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/30 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
    <form role="dialog" aria-modal="true" aria-labelledby="material-form-title" onSubmit={(event) => { event.preventDefault(); void submit(); }} className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
      <header className="flex items-center justify-between">
        <h2 id="material-form-title" className="text-base font-semibold text-slate-900">{mode === 'company' ? '新增公司物料' : '添加物料'}</h2>
        <button type="button" aria-label="关闭物料表单" disabled={submitting} onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4"/></button>
      </header>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <label className="text-sm font-medium text-slate-700">物料编码
          <input value={values.code} onChange={(event) => update('code', event.target.value)} placeholder="请输入物料编码" className={fieldClass}/>
          {errors.code && <span role="alert" className="mt-1 block text-xs text-red-600">{errors.code}</span>}
        </label>
        <label className="text-sm font-medium text-slate-700">单位
          <input list="drawing-material-units" value={values.unit} onChange={(event) => update('unit', event.target.value)} placeholder="请输入或选择单位" className={fieldClass}/>
          <datalist id="drawing-material-units">{[...new Set(suggestions.map((item) => item.unit).filter(Boolean))].map((unit) => <option key={unit} value={unit}/>)}</datalist>
          {errors.unit && <span role="alert" className="mt-1 block text-xs text-red-600">{errors.unit}</span>}
        </label>
      </div>
      <label className="mt-4 block text-sm font-medium text-slate-700">物料名称/规格
        <input list="drawing-material-specifications" value={values.nameAndSpecification} onChange={(event) => update('nameAndSpecification', event.target.value)} placeholder="输入或选择物料规格" className={fieldClass}/>
        <datalist id="drawing-material-specifications">{suggestions.map((item) => <option key={item.id} value={item.nameAndSpecification}/>)}</datalist>
        {errors.nameAndSpecification && <span role="alert" className="mt-1 block text-xs text-red-600">{errors.nameAndSpecification}</span>}
      </label>
      {mode === 'current' && <label className="mt-4 block text-sm font-medium text-slate-700">用量
        <input type="number" min="0.001" step="any" value={values.quantity} onChange={(event) => update('quantity', event.target.value)} placeholder="请输入用量" className={fieldClass}/>
        {errors.quantity && <span role="alert" className="mt-1 block text-xs text-red-600">{errors.quantity}</span>}
      </label>}
      <label className="mt-4 block text-sm font-medium text-slate-700">备注
        <textarea value={values.note} onChange={(event) => update('note', event.target.value)} placeholder="请输入备注" rows={3} className={fieldClass}/>
      </label>
      {submitError && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
      <footer className="mt-5 flex justify-end gap-2">
        <button type="button" disabled={submitting} onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">取消</button>
        <button type="submit" disabled={submitting} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300">{submitting ? '保存中…' : '确定'}</button>
      </footer>
    </form>
  </div>;
}

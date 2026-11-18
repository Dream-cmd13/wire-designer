import { useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Box, Pencil, X } from 'lucide-react';
import { ModelViewer } from '@/components/models/ModelViewer';
import { buildDwgHarnessModel, suggestDwgHarness, type M12Connector } from '@/lib/dwg/dwgHarnessPreview';
import type { DwgDrawing } from '@/lib/dwg/dwgTypes';
import type { ParsedModel } from '@/lib/models/modelTypes';

const closeClass = 'shrink-0 rounded-md p-2 text-slate-600 hover:bg-slate-100';
const fieldClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600';
const connectorLabel = { male: 'M12 公头', female: 'M12 母头' } as const;

export function DwgHarnessPreviewDialog({ drawing, fileName, onClose }: { drawing: DwgDrawing; fileName: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [hints] = useState(() => suggestDwgHarness(fileName, drawing.entities));
  const [length, setLength] = useState(hints.length?.mm.toString() ?? '');
  const [diameter, setDiameter] = useState(hints.diameter?.mm.toString() ?? '');
  const [connector, setConnector] = useState<M12Connector | ''>(hints.connector ?? '');
  const [model, setModel] = useState<ParsedModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hints.partNumber || !connector) return;
    setError(null);
    try { setModel(buildDwgHarnessModel({ lengthMm: Number(length), diameterMm: Number(diameter), connector })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '未能生成 3D 示意。'); }
  }

  return <dialog ref={dialog} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    className={`fixed inset-0 m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white text-slate-900 shadow-xl backdrop:bg-black/40 ${model ? 'max-w-5xl' : 'max-w-md'}`}>
    <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
      <div className="min-w-0">
        <h2 id={titleId} className="text-base font-semibold">线束 3D 示意</h2>
        <p className="mt-1 truncate text-xs text-slate-600" title={fileName}>{fileName}</p>
      </div>
      <button type="button" className={closeClass} title="关闭 3D 示意" aria-label="关闭 3D 示意" onClick={onClose}><X size={18} /></button>
    </header>
    {!hints.partNumber ? <p className="p-4 text-sm">未识别到唯一的 M12 料号，无法生成 3D 示意。</p> : model ? <>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
        <p className="break-words">总长 {Number(length)} mm · 外径 {Number(diameter)} mm · {connector && connectorLabel[connector]}占位</p>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 hover:bg-slate-50" onClick={() => setModel(null)}>
          <Pencil size={14} />修改参数
        </button>
      </div>
      <div className="flex h-[clamp(20rem,60dvh,39rem)] min-w-0">
        <ModelViewer model={model} modelKey={null} status="直线示意 · 非安装模型，不用于加工或量测" />
      </div>
    </> : <form onSubmit={submit} className="space-y-4 p-4">
      <p className="text-sm text-slate-700">{hints.partNumber} · 单段线缆，一端 M12，另一端为线缆截面。</p>
      <label className="block space-y-1.5 text-sm">
        <span>标称总长 (mm)</span>
        <input aria-label="标称总长 (mm)" className={fieldClass} type="number" inputMode="decimal" step="any" required value={length}
          onChange={(event) => { setLength(event.target.value); setError(null); }} />
        <span className="block text-xs text-slate-600">{hints.length ? `图纸标注：${hints.length.note}` : '未读到唯一的总长标注，请填写。'}</span>
      </label>
      <label className="block space-y-1.5 text-sm">
        <span>线缆外径 (mm)</span>
        <input aria-label="线缆外径 (mm)" className={fieldClass} type="number" inputMode="decimal" step="any" required value={diameter}
          onChange={(event) => { setDiameter(event.target.value); setError(null); }} />
        <span className="block text-xs text-slate-600">{hints.diameter ? `图纸标注：${hints.diameter.note}` : '未读到唯一的线缆外径标注，请填写。'}</span>
      </label>
      <label className="block space-y-1.5 text-sm">连接器占位
        <select className={fieldClass} required value={connector} onChange={(event) => setConnector(event.target.value as M12Connector | '')}>
          <option value="" disabled>请选择端头</option>
          <option value="male">{connectorLabel.male}</option>
          <option value="female">{connectorLabel.female}</option>
        </select>
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Box size={16} />确认并生成
        </button>
      </div>
    </form>}
  </dialog>;
}

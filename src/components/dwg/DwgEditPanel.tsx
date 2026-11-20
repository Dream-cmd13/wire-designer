import { useState } from 'react';
import type { DwgEditOperation } from '@/lib/dwg/dwgEdit';
import type { DwgEditSource } from '@/lib/dwg/dwgTypes';

const button = 'rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-medium hover:border-blue-400 disabled:opacity-50';

interface Props {
  hits: DwgEditSource[];
  selection: DwgEditSource | undefined;
  operations: DwgEditOperation[];
  busy: boolean;
  generated: boolean;
  parent: boolean;
  canSave: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  onSelect: (key: string) => void;
  onApply: (target: DwgEditSource, value: string) => void;
  onUndo: () => void;
  onGenerate: () => void;
  onCancel: () => void;
  onDownload: () => void;
  onSave: () => void;
}

function EditField({ target, value, onApply }: { target: DwgEditSource; value: string; onApply: Props['onApply'] }) {
  const [text, setText] = useState(value);
  const field = 'w-full rounded-md border border-slate-300 bg-white p-2';
  return <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); onApply(target, text); }}>
    <label className="grid gap-1">
      {target.kind === 'DIMENSION' ? '尺寸显示文字' : '修改文字'}
      {target.multiline ? <textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} className={field} maxLength={4096} />
        : <input value={text} onChange={(event) => setText(event.target.value)} className={field} maxLength={4096} />}
    </label>
    {target.kind === 'DIMENSION' && <p className="text-slate-500">只改显示文字，尺寸几何保持原样。</p>}
    <button className={button} disabled={text === value}>应用到草稿预览</button>
  </form>;
}

export function DwgEditPanel(props: Props) {
  const { selection, operations, hits, busy, generated } = props;
  const text = selection && (operations.find((operation) => operation.handle === selection.handle)?.newText ?? selection.expectedText);
  return <aside data-dwg-overlay aria-label="DWG 编辑属性" className="absolute bottom-3 right-3 z-10 grid max-h-[calc(100%-1.5rem)] w-72 max-w-[calc(100%-1.5rem)] gap-2 overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-lg">
    <p className="font-semibold">{generated ? '生成文件预览' : '编辑图纸'} · {operations.length} 项修改</p>
    {!selection && !generated && <p>点击文字或尺寸线选择对象，拖动画布可平移。</p>}
    {!generated && !busy && hits.length > 1 && <label className="grid gap-1">重叠对象
      <select className="w-full rounded border border-slate-300" value={selection?.key ?? ''} onChange={(event) => props.onSelect(event.target.value)}>
        <option value="" disabled>请选择一个对象</option>
        {hits.map((item) => <option key={item.key} value={item.key}>{item.kind} {item.handle} {item.expectedText.slice(0, 32)}</option>)}
      </select>
    </label>}
    {selection && !generated && !busy && <>
      <p className="font-mono">{selection.kind} {selection.handle}</p>
      {selection.expectedText && <pre aria-label="原文字" className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2">{selection.expectedText}</pre>}
      {selection.readOnlyReason ? <p className="text-amber-800">{selection.readOnlyReason}</p>
        : <EditField key={JSON.stringify([selection.key, text])} target={selection} value={text ?? ''} onApply={props.onApply} />}
    </>}
    {props.error && <p role="alert" className="text-red-700">{props.error}</p>}
    <div className="flex flex-wrap gap-1.5">
      {busy ? <><span className="self-center" role="status">生成中…</span><button type="button" className={button} onClick={props.onCancel}>取消生成</button></> : <>
        <button type="button" className={button} onClick={props.onUndo} disabled={!operations.length || props.saving}>撤回上次修改</button>
        {generated ? <>
          <button type="button" className={button} onClick={props.onDownload}>下载修订 DWG</button>
          <button type="button" className={button} onClick={props.onSave} disabled={!props.canSave || props.saving || props.saved}>
            {props.saved ? '修订件已保存' : props.saving ? '保存中…' : props.parent ? '另存为新版' : '保存到云端'}
          </button>
        </> : <button type="button" className={button} onClick={props.onGenerate} disabled={!operations.length || props.saving}>生成 DWG</button>}
      </>}
    </div>
  </aside>;
}

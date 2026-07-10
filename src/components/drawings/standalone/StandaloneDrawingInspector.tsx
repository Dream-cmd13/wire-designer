import type { DrawingDocument, DrawingObject } from '@/types/drawing';

interface StandaloneDrawingInspectorProps {
  drawing: DrawingDocument;
  selectedObjectId: string | null;
  onStartEdit: () => void;
  onUpdateObject: (objectId: string, patch: Partial<DrawingObject>) => void;
}

function numeric(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function StandaloneDrawingInspector({ drawing, selectedObjectId, onStartEdit, onUpdateObject }: StandaloneDrawingInspectorProps) {
  const object = drawing.objects.find((candidate) => candidate.id === selectedObjectId);
  if (!object) {
    return <aside className="w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4 text-sm text-slate-500">选择画布对象后可编辑位置、尺寸、图层与业务属性。</aside>;
  }
  const update = (patch: Partial<DrawingObject>) => { onStartEdit(); onUpdateObject(object.id, patch); };
  const readonly = object.locked;
  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-900">对象属性</h3><span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{object.kind}</span></div>
      <label className="mt-4 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={object.locked} onChange={(event) => update({ locked: event.target.checked })} /> 锁定对象</label>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {([['X', 'x'], ['Y', 'y'], ['宽', 'width'], ['高', 'height'], ['旋转', 'rotation'], ['图层', 'zIndex']] as const).map(([label, key]) => (
          <label key={key} className="text-xs font-medium text-slate-600">{label}<input disabled={readonly} type="number" value={object[key]} onChange={(event) => update({ [key]: numeric(event.target.value) } as Partial<DrawingObject>)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100" /></label>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
        <label className="text-xs font-medium text-slate-600">填充色<input disabled={readonly} type="color" value={object.style.fill} onChange={(event) => update({ style: { ...object.style, fill: event.target.value } } as Partial<DrawingObject>)} className="mt-1 h-9 w-full" /></label>
        <label className="text-xs font-medium text-slate-600">边线色<input disabled={readonly} type="color" value={object.style.stroke} onChange={(event) => update({ style: { ...object.style, stroke: event.target.value } } as Partial<DrawingObject>)} className="mt-1 h-9 w-full" /></label>
        <label className="text-xs font-medium text-slate-600">线宽<input disabled={readonly} type="number" min="1" value={object.style.strokeWidth} onChange={(event) => update({ style: { ...object.style, strokeWidth: numeric(event.target.value) } } as Partial<DrawingObject>)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" /></label>
        <label className="text-xs font-medium text-slate-600">字号<input disabled={readonly} type="number" min="8" value={object.style.fontSize} onChange={(event) => update({ style: { ...object.style, fontSize: numeric(event.target.value) } } as Partial<DrawingObject>)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" /></label>
      </div>
      {(object.kind === 'text' || object.kind === 'label') && <label className="mt-4 block text-xs font-medium text-slate-600">文字<textarea disabled={readonly} value={object.text} onChange={(event) => update({ text: event.target.value } as Partial<DrawingObject>)} className="mt-1 min-h-20 w-full rounded border border-slate-300 p-2 text-sm" /></label>}
      {(object.kind === 'connector' || object.kind === 'accessory' || object.kind === 'wire-bundle' || object.kind === 'dimension') && <label className="mt-4 block text-xs font-medium text-slate-600">标签<input disabled={readonly} value={object.label} onChange={(event) => update({ label: event.target.value } as Partial<DrawingObject>)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" /></label>}
      {object.kind === 'title-block' && <div className="mt-4 space-y-3">{([['标题', 'title'], ['图号', 'drawingNo'], ['版本', 'revision']] as const).map(([label, key]) => <label key={key} className="block text-xs font-medium text-slate-600">{label}<input disabled={readonly} value={object[key]} onChange={(event) => update({ [key]: event.target.value } as Partial<DrawingObject>)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" /></label>)}</div>}
    </aside>
  );
}

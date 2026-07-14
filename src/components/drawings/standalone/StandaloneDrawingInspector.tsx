import type { DrawingDocument, DrawingObject, DrawingObjectStyle } from '@/types/drawing';

interface Props {
  drawing: DrawingDocument;
  selectedObjectId: string | null;
  selectedObjectIds?: string[];
  onStartEdit: () => void;
  onUpdateObject: (objectId: string, patch: Partial<DrawingObject>) => void;
  onUpdateObjects?: (objectIds: string[], patch: Partial<DrawingObject>, stylePatch?: Partial<DrawingObjectStyle>) => void;
  onSetLayer?: (objectIds: string[], target: number) => void;
}

function numeric(value: string) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
const inputClass = 'mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100';

export function StandaloneDrawingInspector({ drawing, selectedObjectId, selectedObjectIds, onStartEdit, onUpdateObject, onUpdateObjects, onSetLayer }: Props) {
  const selectionIds = selectedObjectIds ?? (selectedObjectId ? [selectedObjectId] : []);
  const selection = drawing.objects.filter((candidate) => selectionIds.includes(candidate.id));
  const object = drawing.objects.find((candidate) => candidate.id === selectedObjectId);
  if (!object) return <aside className="w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4 text-sm text-slate-500">选择画布对象后，可编辑位置、尺寸、图层、锁定状态与业务属性。</aside>;
  const multiple = selection.length > 1;
  const update = (patch: Partial<DrawingObject>, stylePatch?: Partial<DrawingObjectStyle>) => {
    onStartEdit();
    if (multiple && onUpdateObjects) onUpdateObjects(selectionIds, patch, stylePatch);
    else onUpdateObject(object.id, stylePatch ? { ...patch, style: { ...object.style, ...stylePatch } } as Partial<DrawingObject> : patch);
  };
  const readonly = selection.every((candidate) => candidate.locked);
  return <aside className="w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4">
    <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-900">对象属性</h3><span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{multiple ? `已选择 ${selection.length} 个` : object.kind}</span></div>
    <label className="mt-4 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={selection.every((candidate) => candidate.locked)} onChange={(event) => update({ locked: event.target.checked })}/> 锁定对象</label>
    {!multiple && <div className="mt-4 grid grid-cols-2 gap-3">{([['X', 'x'], ['Y', 'y'], ['宽', 'width'], ['高', 'height'], ['旋转', 'rotation']] as const).map(([label, key]) => <label key={key} className="text-xs font-medium text-slate-600">{label}<input disabled={readonly} type="number" value={object[key]} onChange={(event) => update({ [key]: numeric(event.target.value) } as Partial<DrawingObject>)} className={inputClass}/></label>)}</div>}
    <label className="mt-3 block text-xs font-medium text-slate-600">图层位置<input disabled={readonly} type="number" value={object.zIndex} onChange={(event) => { onStartEdit(); if (onSetLayer) onSetLayer(selectionIds, numeric(event.target.value)); else onUpdateObject(object.id, { zIndex: numeric(event.target.value) }); }} className={inputClass}/></label>
    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
      <label className="text-xs font-medium text-slate-600">填充色<input disabled={readonly} type="color" value={object.style.fill} onChange={(event) => update({}, { fill: event.target.value })} className="mt-1 h-9 w-full"/></label>
      <label className="text-xs font-medium text-slate-600">边线颜色<input disabled={readonly} type="color" value={object.style.stroke} onChange={(event) => update({}, { stroke: event.target.value })} className="mt-1 h-9 w-full"/></label>
      <label className="text-xs font-medium text-slate-600">线宽<input disabled={readonly} type="number" min="1" value={object.style.strokeWidth} onChange={(event) => update({}, { strokeWidth: numeric(event.target.value) })} className={inputClass}/></label>
      <label className="text-xs font-medium text-slate-600">字号<input disabled={readonly} type="number" min="8" value={object.style.fontSize} onChange={(event) => update({}, { fontSize: numeric(event.target.value) })} className={inputClass}/></label>
    </div>
    {!multiple && (object.kind === 'text' || object.kind === 'label') && <label className="mt-4 block text-xs font-medium text-slate-600">文字<textarea disabled={readonly} value={object.text} onChange={(event) => update({ text: event.target.value } as Partial<DrawingObject>)} className={`${inputClass} min-h-20 p-2`}/></label>}
    {!multiple && (object.kind === 'connector' || object.kind === 'accessory' || object.kind === 'wire-bundle' || object.kind === 'dimension') && <label className="mt-4 block text-xs font-medium text-slate-600">标签<input disabled={readonly} value={object.label} onChange={(event) => update({ label: event.target.value } as Partial<DrawingObject>)} className={inputClass}/></label>}
    {!multiple && (object.kind === 'table' || object.kind === 'bom-table' || object.kind === 'wiring-table') && <label className="mt-4 block text-xs font-medium text-slate-600">表格标题<input disabled={readonly} value={object.title} onChange={(event) => update({ title: event.target.value } as Partial<DrawingObject>)} className={inputClass}/></label>}
    {!multiple && object.kind === 'tech-requirements' && <label className="mt-4 block text-xs font-medium text-slate-600">技术要求<textarea disabled={readonly} value={object.requirements.join('\n')} onChange={(event) => update({ requirements: event.target.value.split('\n').filter(Boolean) } as Partial<DrawingObject>)} className={`${inputClass} min-h-28 p-2`}/></label>}
    {!multiple && object.kind === 'title-block' && <div className="mt-4 space-y-3">{([['标题', 'title'], ['图号', 'drawingNo'], ['版本', 'revision']] as const).map(([label, key]) => <label key={key} className="block text-xs font-medium text-slate-600">{label}<input disabled={readonly} value={object[key]} onChange={(event) => update({ [key]: event.target.value } as Partial<DrawingObject>)} className={inputClass}/></label>)}</div>}
  </aside>;
}

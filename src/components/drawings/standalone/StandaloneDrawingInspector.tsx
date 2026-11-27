import { useState } from 'react';
import { ChevronDown, PanelRightClose, SlidersHorizontal } from 'lucide-react';
import type { DrawingDocument, DrawingObject, DrawingObjectStyle } from '@/types/drawing';

interface Props {
  drawing: DrawingDocument;
  selectedObjectId: string | null;
  selectedObjectIds?: string[];
  onStartEdit: () => void;
  onUpdateObject: (objectId: string, patch: Partial<DrawingObject>) => void;
  onUpdateObjects?: (objectIds: string[], patch: Partial<DrawingObject>, stylePatch?: Partial<DrawingObjectStyle>) => void;
  onSetLayer?: (objectIds: string[], target: number) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  canZoomIn?: boolean;
  canZoomOut?: boolean;
}

function numeric(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const cardClass = 'rounded-lg border border-slate-200 bg-white p-2.5 shadow-2xs';
const cardTitleClass = 'mb-2 flex items-center gap-2 text-[11px] font-medium text-slate-600';
const inputClass = 'h-7 w-full min-w-0 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400';

function CardHeader({ title }: { title: string }) {
  return (
    <div className={cardTitleClass}>
      <span className="shrink-0">{title}</span>
      <span className="h-px flex-1 bg-slate-100" />
    </div>
  );
}

function ColorRow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-slate-500">
      <span className="w-7 shrink-0">{label}</span>
      <div className={`relative flex h-7 flex-1 items-center justify-between rounded border border-slate-200 px-2 ${disabled ? 'bg-slate-50 opacity-60' : 'bg-white hover:border-slate-300'}`}>
        <span
          className="h-3.5 w-3.5 rounded-xs border border-slate-300"
          style={{ backgroundColor: value || '#ffffff' }}
        />
        <input
          type="color"
          aria-label={label}
          disabled={disabled}
          value={value || '#ffffff'}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </div>
    </label>
  );
}

export function StandaloneDrawingInspector({
  drawing,
  selectedObjectId,
  selectedObjectIds,
  onStartEdit,
  onUpdateObject,
  onUpdateObjects,
  onSetLayer,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  canZoomIn = true,
  canZoomOut = true,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const selectionIds = selectedObjectIds ?? (selectedObjectId ? [selectedObjectId] : []);
  const selection = drawing.objects.filter((candidate) => selectionIds.includes(candidate.id));
  const object = drawing.objects.find((candidate) => candidate.id === selectedObjectId);
  const hasSelection = Boolean(object);
  const multiple = selection.length > 1;
  const readonly = !object || selection.every((candidate) => candidate.locked);

  if (collapsed) {
    return (
      <button
        type="button"
        className="absolute right-3 top-3 z-20 inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-md hover:bg-slate-50"
        aria-label="展开对象属性"
        onClick={() => setCollapsed(false)}
      >
        <SlidersHorizontal className="h-4 w-4" />属性
      </button>
    );
  }

  const update = (patch: Partial<DrawingObject>, stylePatch?: Partial<DrawingObjectStyle>) => {
    if (!object) return;
    onStartEdit();
    if (multiple && onUpdateObjects) {
      onUpdateObjects(selectionIds, patch, stylePatch);
    } else {
      onUpdateObject(
        object.id,
        stylePatch ? { ...patch, style: { ...object.style, ...stylePatch } } as Partial<DrawingObject> : patch,
      );
    }
  };

  return (
    <aside
      aria-label="对象属性"
      className="flex h-full w-60 shrink-0 flex-col border-l border-slate-200 bg-slate-50/80"
    >
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2">
        <span className="text-xs font-semibold text-slate-700">
          {multiple ? `已选择 ${selection.length} 个` : object ? `属性 · ${object.kind}` : '画布属性'}
        </span>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="收起对象属性"
          title="收起对象属性"
          onClick={() => setCollapsed(true)}
        >
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5">
        {/* 位置 */}
        <section className={cardClass}>
          <CardHeader title="位置" />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="shrink-0">距左</span>
              <input
                aria-label="距左"
                disabled={readonly || multiple}
                type="number"
                value={object && !multiple ? Math.round(object.x) : ''}
                onChange={(event) => update({ x: numeric(event.target.value) })}
                className={inputClass}
              />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="shrink-0">距顶</span>
              <input
                aria-label="距顶"
                disabled={readonly || multiple}
                type="number"
                value={object && !multiple ? Math.round(object.y) : ''}
                onChange={(event) => update({ y: numeric(event.target.value) })}
                className={inputClass}
              />
            </label>
          </div>
        </section>

        {/* 宽/高 */}
        <section className={cardClass}>
          <CardHeader title="宽/高" />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="shrink-0">宽度</span>
              <input
                aria-label="宽度"
                disabled={readonly || multiple}
                type="number"
                min={1}
                value={object && !multiple ? Math.round(object.width) : ''}
                onChange={(event) => update({ width: Math.max(1, numeric(event.target.value)) })}
                className={inputClass}
              />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="shrink-0">高度</span>
              <input
                aria-label="高度"
                disabled={readonly || multiple}
                type="number"
                min={1}
                value={object && !multiple ? Math.round(object.height) : ''}
                onChange={(event) => update({ height: Math.max(1, numeric(event.target.value)) })}
                className={inputClass}
              />
            </label>
          </div>
        </section>

        {/* 缩放 */}
        <section className={cardClass}>
          <CardHeader title="缩放" />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="shrink-0">X 轴</span>
              <input
                aria-label="X 轴"
                disabled={readonly || multiple}
                type="number"
                step="0.1"
                min="0.1"
                defaultValue={object && !multiple ? 1 : ''}
                key={`sx-${object?.id ?? 'none'}`}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
                onBlur={(event) => {
                  if (!object) return;
                  const factor = numeric(event.target.value);
                  if (factor > 0 && factor !== 1) {
                    update({ width: Math.max(4, Math.round(object.width * factor)) });
                    event.target.value = '1';
                  }
                }}
                className={inputClass}
              />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="shrink-0">Y 轴</span>
              <input
                aria-label="Y 轴"
                disabled={readonly || multiple}
                type="number"
                step="0.1"
                min="0.1"
                defaultValue={object && !multiple ? 1 : ''}
                key={`sy-${object?.id ?? 'none'}`}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
                onBlur={(event) => {
                  if (!object) return;
                  const factor = numeric(event.target.value);
                  if (factor > 0 && factor !== 1) {
                    update({ height: Math.max(4, Math.round(object.height * factor)) });
                    event.target.value = '1';
                  }
                }}
                className={inputClass}
              />
            </label>
          </div>
        </section>

        {/* 旋转 */}
        <section className={cardClass}>
          <CardHeader title="旋转" />
          <label className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="w-7 shrink-0">角度</span>
            <input
              aria-label="角度"
              disabled={readonly || multiple}
              type="number"
              value={object && !multiple ? object.rotation : ''}
              onChange={(event) => update({ rotation: numeric(event.target.value) })}
              className={inputClass}
            />
          </label>
        </section>

        {/* 粗细 */}
        <section className={cardClass}>
          <CardHeader title="粗细" />
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className="w-7 shrink-0">粗细</span>
              <input
                aria-label="粗细"
                disabled={readonly}
                type="number"
                min={1}
                value={object ? object.style.strokeWidth : ''}
                onChange={(event) => update({}, { strokeWidth: Math.max(1, numeric(event.target.value)) })}
                className={inputClass}
              />
            </label>
            {hasSelection && (
              <label className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="w-7 shrink-0">字号</span>
                <input
                  aria-label="字号"
                  disabled={readonly}
                  type="number"
                  min={8}
                  value={object?.style.fontSize ?? ''}
                  onChange={(event) => update({}, { fontSize: Math.max(8, numeric(event.target.value)) })}
                  className={inputClass}
                />
              </label>
            )}
            {object && (object.kind === 'line' || object.kind === 'polyline' || object.kind === 'curve' || object.kind === 'freehand') && (
              <label className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="w-7 shrink-0">线型</span>
                <select
                  aria-label="线型"
                  disabled={readonly}
                  value={object.style.dash ?? 'solid'}
                  onChange={(event) => update({}, { dash: event.target.value as 'solid' | 'dashed' | 'dotted' | 'dash-dot' })}
                  className={inputClass}
                >
                  <option value="solid">实线</option>
                  <option value="dashed">虚线</option>
                  <option value="dotted">点线</option>
                  <option value="dash-dot">点划线</option>
                </select>
              </label>
            )}
          </div>
        </section>

        {/* 颜色 */}
        <section className={cardClass}>
          <CardHeader title="颜色" />
          <div className="space-y-1.5">
            <ColorRow
              label="边框"
              disabled={readonly}
              value={object?.style.stroke ?? '#111827'}
              onChange={(stroke) => update({}, { stroke })}
            />
            <ColorRow
              label="填充"
              disabled={readonly}
              value={object?.style.fill ?? '#ffffff'}
              onChange={(fill) => update({}, { fill })}
            />
            <ColorRow
              label="文字"
              disabled={readonly}
              value={object?.style.color ?? '#111827'}
              onChange={(color) => update({}, { color })}
            />
          </div>
        </section>

        {/* 对象属性扩展 (锁定/图层/内容) */}
        {object && (
          <section className={cardClass}>
            <CardHeader title="对象设置" />
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={selection.every((candidate) => candidate.locked)}
                  onChange={(event) => update({ locked: event.target.checked })}
                />
                锁定对象
              </label>
              <label className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="w-7 shrink-0">图层</span>
                <input
                  aria-label="图层位置"
                  disabled={readonly}
                  type="number"
                  value={object.zIndex}
                  onChange={(event) => {
                    onStartEdit();
                    if (onSetLayer) onSetLayer(selectionIds, numeric(event.target.value));
                    else onUpdateObject(object.id, { zIndex: numeric(event.target.value) });
                  }}
                  className={inputClass}
                />
              </label>

              {!multiple && (object.kind === 'text' || object.kind === 'label') && (
                <label className="block text-[11px] text-slate-500">
                  文字
                  <textarea
                    disabled={readonly}
                    value={object.text}
                    onChange={(event) => update({ text: event.target.value } as Partial<DrawingObject>)}
                    className={`${inputClass} mt-1 min-h-16 py-1`}
                  />
                </label>
              )}

              {!multiple && (object.kind === 'connector' || object.kind === 'accessory' || object.kind === 'wire-bundle' || object.kind === 'dimension') && (
                <label className="block text-[11px] text-slate-500">
                  标签
                  <input
                    disabled={readonly}
                    value={object.label}
                    onChange={(event) => update({ label: event.target.value } as Partial<DrawingObject>)}
                    className={`${inputClass} mt-1`}
                  />
                </label>
              )}

              {!multiple && (object.kind === 'table' || object.kind === 'bom-table' || object.kind === 'wiring-table') && (
                <label className="block text-[11px] text-slate-500">
                  表格标题
                  <input
                    disabled={readonly}
                    value={object.title}
                    onChange={(event) => update({ title: event.target.value } as Partial<DrawingObject>)}
                    className={`${inputClass} mt-1`}
                  />
                </label>
              )}

              {!multiple && object.kind === 'tech-requirements' && (
                <label className="block text-[11px] text-slate-500">
                  技术要求
                  <textarea
                    disabled={readonly}
                    value={object.requirements.join('\n')}
                    onChange={(event) => update({ requirements: event.target.value.split('\n').filter(Boolean) } as Partial<DrawingObject>)}
                    className={`${inputClass} mt-1 min-h-24 py-1`}
                  />
                </label>
              )}

              {!multiple && object.kind === 'title-block' && (
                <div className="space-y-2">
                  {([
                    ['标题', 'title'],
                    ['图号', 'drawingNo'],
                    ['版本', 'revision'],
                  ] as const).map(([label, key]) => (
                    <label key={key} className="block text-[11px] text-slate-500">
                      {label}
                      <input
                        disabled={readonly}
                        value={object[key]}
                        onChange={(event) => update({ [key]: event.target.value } as Partial<DrawingObject>)}
                        className={`${inputClass} mt-1`}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* 整体缩放 */}
        <section className={cardClass}>
          <CardHeader title="整体缩放" />
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              disabled={!canZoomIn}
              onClick={onZoomIn}
              className="rounded border border-slate-200 bg-white py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              放大
            </button>
            <button
              type="button"
              disabled={!canZoomOut}
              onClick={onZoomOut}
              className="rounded border border-slate-200 bg-white py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              缩小
            </button>
            <button
              type="button"
              onClick={onZoomReset}
              className="rounded border border-slate-200 bg-white py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              还原
            </button>
          </div>
        </section>
      </div>
    </aside>
  );
}

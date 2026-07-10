import { FilePenLine, MousePointer2 } from 'lucide-react';
import type { HarnessConfig, ProductionDrawingObject } from '@/types/harness';

interface DrawingObjectInspectorProps {
  config: HarnessConfig;
  selectedObjectId: string | null;
  onSelectObject: (objectId: string | null) => void;
  onUpdateObject: (objectId: string, patch: Partial<ProductionDrawingObject>) => void;
}

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

function objectKindLabel(kind: ProductionDrawingObject['kind']) {
  switch (kind) {
    case 'connector':
      return '连接器';
    case 'wire-bundle':
      return '线束';
    case 'dimension':
      return '尺寸';
    case 'text':
      return '文本';
    case 'bom-table':
      return 'BOM';
    case 'wiring-table':
      return '接线表';
    case 'title-block':
      return '标题栏';
    case 'tech-requirements':
      return '技术要求';
    default:
      return '对象';
  }
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      <input
        type="number"
        value={Math.round(value)}
        onChange={(event) => onChange(Number(event.target.value))}
        className={inputClass}
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </label>
  );
}

export function DrawingObjectInspector({
  config,
  selectedObjectId,
  onSelectObject,
  onUpdateObject,
}: DrawingObjectInspectorProps) {
  const objects = config.productionDrawing?.objects ?? [];
  const selectedObject = objects.find((object) => object.id === selectedObjectId) ?? null;

  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-center gap-2">
        <FilePenLine className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-slate-900">对象属性</h3>
      </div>

      <label className="block">
        <span className="text-[11px] font-medium text-slate-500">当前对象</span>
        <select
          value={selectedObjectId ?? ''}
          onChange={(event) => onSelectObject(event.target.value || null)}
          className={`${inputClass} mt-1`}
        >
          <option value="">未选择</option>
          {objects.map((object) => (
            <option key={object.id} value={object.id}>
              {objectKindLabel(object.kind)} · {object.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>

      {!selectedObject ? (
        <div className="mt-6 rounded-md border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
          <MousePointer2 className="mx-auto mb-2 h-5 w-5 text-slate-300" />
          选择画布中的图纸对象后，可编辑位置、尺寸和业务字段。
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <section className="rounded-md border border-slate-200 p-3">
            <div className="mb-3 text-xs font-semibold text-slate-700">
              {objectKindLabel(selectedObject.kind)} · 布局
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="X"
                value={selectedObject.x}
                onChange={(x) => onUpdateObject(selectedObject.id, { x })}
              />
              <NumberField
                label="Y"
                value={selectedObject.y}
                onChange={(y) => onUpdateObject(selectedObject.id, { y })}
              />
              <NumberField
                label="宽"
                value={selectedObject.width}
                onChange={(width) => onUpdateObject(selectedObject.id, { width })}
              />
              <NumberField
                label="高"
                value={selectedObject.height}
                onChange={(height) => onUpdateObject(selectedObject.id, { height })}
              />
            </div>
          </section>

          {selectedObject.kind === 'connector' && (
            <section className="rounded-md border border-slate-200 p-3">
              <TextField
                label="显示名称"
                value={selectedObject.label}
                onChange={(label) => onUpdateObject(selectedObject.id, { label } as Partial<ProductionDrawingObject>)}
              />
              <p className="mt-2 text-xs text-slate-500">{selectedObject.pinCount} PIN · {selectedObject.side}</p>
            </section>
          )}

          {selectedObject.kind === 'dimension' && (
            <section className="rounded-md border border-slate-200 p-3">
              <TextField
                label="尺寸标注"
                value={selectedObject.label}
                onChange={(label) => onUpdateObject(selectedObject.id, { label } as Partial<ProductionDrawingObject>)}
              />
            </section>
          )}

          {selectedObject.kind === 'text' && (
            <section className="space-y-3 rounded-md border border-slate-200 p-3">
              <TextField
                label="文本"
                value={selectedObject.text}
                onChange={(text) => onUpdateObject(selectedObject.id, { text } as Partial<ProductionDrawingObject>)}
              />
              <NumberField
                label="字号"
                value={selectedObject.fontSize}
                onChange={(fontSize) => onUpdateObject(selectedObject.id, { fontSize } as Partial<ProductionDrawingObject>)}
              />
            </section>
          )}

          {selectedObject.kind === 'title-block' && (
            <section className="space-y-3 rounded-md border border-slate-200 p-3">
              <TextField
                label="标题"
                value={selectedObject.title}
                onChange={(title) => onUpdateObject(selectedObject.id, { title } as Partial<ProductionDrawingObject>)}
              />
              <TextField
                label="图号"
                value={selectedObject.drawingNo}
                onChange={(drawingNo) => onUpdateObject(selectedObject.id, { drawingNo } as Partial<ProductionDrawingObject>)}
              />
              <TextField
                label="版本"
                value={selectedObject.revision}
                onChange={(revision) => onUpdateObject(selectedObject.id, { revision } as Partial<ProductionDrawingObject>)}
              />
            </section>
          )}

          {selectedObject.kind === 'tech-requirements' && (
            <section className="rounded-md border border-slate-200 p-3">
              <label className="block">
                <span className="text-[11px] font-medium text-slate-500">技术要求</span>
                <textarea
                  value={selectedObject.requirements.join('\n')}
                  onChange={(event) => onUpdateObject(selectedObject.id, {
                    requirements: event.target.value
                      .split('\n')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  } as Partial<ProductionDrawingObject>)}
                  rows={6}
                  className={`${inputClass} mt-1 resize-none leading-5`}
                />
              </label>
            </section>
          )}

          {selectedObject.kind === 'bom-table' && (
            <section className="rounded-md border border-slate-200 p-3 text-xs text-slate-600">
              <p className="font-medium text-slate-700">BOM 行</p>
              <p className="mt-1">{selectedObject.rows.length} 行物料。当前版本随 HarnessConfig 自动生成。</p>
            </section>
          )}

          {selectedObject.kind === 'wiring-table' && (
            <section className="rounded-md border border-slate-200 p-3 text-xs text-slate-600">
              <p className="font-medium text-slate-700">接线表</p>
              <p className="mt-1">{selectedObject.rows.length} 行接线明细。当前版本随 HarnessConfig 自动生成。</p>
            </section>
          )}

          {selectedObject.kind === 'wire-bundle' && (
            <section className="rounded-md border border-slate-200 p-3 text-xs text-slate-600">
              <p className="font-medium text-slate-700">线束摘要</p>
              <p className="mt-1">{selectedObject.wireCount} 芯 · {selectedObject.jacketed ? '多芯/屏蔽线' : '普通线'}</p>
            </section>
          )}
        </div>
      )}
    </aside>
  );
}

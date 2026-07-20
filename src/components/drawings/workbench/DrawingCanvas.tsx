import { DRAWING_TABLE_LINE_COLOR } from '@/lib/drawingTableLayout';
import type { HarnessConfig, ProductionDrawingObject } from '@/types/harness';

interface DrawingCanvasProps {
  config: HarnessConfig;
  selectedObjectId?: string;
  onSelectObject?: (objectId: string | null) => void;
  zoom?: number;
}

function styleFromObject(object: ProductionDrawingObject) {
  return {
    left: `${(object.x / 1200) * 100}%`,
    top: `${(object.y / 800) * 100}%`,
    width: `${(object.width / 1200) * 100}%`,
    height: `${(object.height / 800) * 100}%`,
  };
}

const drawingTableLineStyle = { borderColor: DRAWING_TABLE_LINE_COLOR };

function objectFrameClass(object: ProductionDrawingObject, selected: boolean, extra = '') {
  const editable = object.kind === 'wire-bundle' ? '' : 'cursor-pointer';
  const selectedClass = selected ? 'ring-2 ring-blue-500 ring-offset-2' : '';
  return `${editable} ${selectedClass} ${extra}`.trim();
}

function DrawingObjectView({
  object,
  selected,
  onSelect,
}: {
  object: ProductionDrawingObject;
  selected: boolean;
  onSelect: () => void;
}) {
  if (object.kind === 'connector') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onSelect();
        }}
        className={objectFrameClass(object, selected, 'absolute rounded border border-slate-900 bg-white text-[10px] text-slate-900')}
        style={styleFromObject(object)}
      >
        <div className="border-b border-slate-900 px-2 py-1 font-semibold">{object.label}</div>
        <div className="grid h-[calc(100%-24px)] grid-cols-2 gap-x-1 overflow-hidden p-2">
          {Array.from({ length: Math.min(object.pinCount, 40) }, (_, index) => (
            <span key={index} className="flex items-center gap-1 truncate">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-800" />
              {index + 1}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (object.kind === 'wire-bundle') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onSelect();
        }}
        className={objectFrameClass(object, selected, 'absolute')}
        style={styleFromObject(object)}
      >
        <div className="absolute left-0 top-1/2 h-8 w-full -translate-y-1/2 rounded-full border border-slate-900 bg-slate-100" />
        {Array.from({ length: Math.min(object.wireCount, 12) }, (_, index) => (
          <div
            key={index}
            className="absolute left-0 right-0 h-px bg-slate-700"
            style={{ top: `${20 + index * 5}%` }}
          />
        ))}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-5 text-[10px] font-medium text-slate-700">
          {object.jacketed ? '多芯线束' : '电子线束'} · {object.wireCount} 芯
        </div>
      </div>
    );
  }

  if (object.kind === 'dimension') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onSelect();
        }}
        className={objectFrameClass(object, selected, 'absolute text-center text-[11px] font-semibold text-slate-900')}
        style={styleFromObject(object)}
      >
        <div className="relative mx-auto mt-4 h-px w-full bg-slate-900">
          <span className="absolute -left-1 -top-1.5 h-3 w-px bg-slate-900" />
          <span className="absolute -right-1 -top-1.5 h-3 w-px bg-slate-900" />
        </div>
        <span className="inline-block bg-white px-2">{object.label}</span>
      </div>
    );
  }

  if (object.kind === 'tech-requirements') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onSelect();
        }}
        className={objectFrameClass(object, selected, 'absolute border border-slate-900 bg-white p-2 text-[10px] text-slate-900')}
        style={styleFromObject(object)}
      >
        <div className="mb-1 font-semibold">技术要求</div>
        <ol className="space-y-1">
          {object.requirements.map((item, index) => (
            <li key={item}>{index + 1}. {item}</li>
          ))}
        </ol>
      </div>
    );
  }

  if (object.kind === 'bom-table') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onSelect();
        }}
        className={objectFrameClass(object, selected, 'absolute border bg-white text-[9px] text-slate-900')}
        style={{ ...styleFromObject(object), ...drawingTableLineStyle }}
      >
        <div className="grid grid-cols-[38px_1fr_48px] border-b font-semibold" style={drawingTableLineStyle}>
          <span className="border-r px-1 py-1" style={drawingTableLineStyle}>序号</span>
          <span className="border-r px-1 py-1" style={drawingTableLineStyle}>物料描述</span>
          <span className="px-1 py-1">数量</span>
        </div>
        {object.rows.slice(0, 5).map((row) => (
          <div key={row.item} className="grid grid-cols-[38px_1fr_48px] border-b" style={drawingTableLineStyle}>
            <span className="border-r px-1 py-1" style={drawingTableLineStyle}>{row.item}</span>
            <span className="truncate border-r px-1 py-1" style={drawingTableLineStyle}>{row.description}</span>
            <span className="px-1 py-1">{row.quantity}</span>
          </div>
        ))}
      </div>
    );
  }

  if (object.kind === 'wiring-table') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onSelect();
        }}
        className={objectFrameClass(object, selected, 'absolute border bg-white text-[8px] text-slate-900')}
        style={{ ...styleFromObject(object), ...drawingTableLineStyle }}
      >
        <div className="grid grid-cols-[28px_52px_1fr_48px_44px_44px_52px] border-b font-semibold" style={drawingTableLineStyle}>
          <span className="border-r px-1 py-1" style={drawingTableLineStyle}>No.</span>
          <span className="border-r px-1 py-1" style={drawingTableLineStyle}>颜色</span>
          <span className="border-r px-1 py-1" style={drawingTableLineStyle}>线号</span>
          <span className="border-r px-1 py-1" style={drawingTableLineStyle}>接线</span>
          <span className="border-r px-1 py-1" style={drawingTableLineStyle}>始端</span>
          <span className="border-r px-1 py-1" style={drawingTableLineStyle}>末端</span>
          <span className="px-1 py-1">长度</span>
        </div>
        {object.rows.slice(0, 4).map((row) => (
          <div key={row.item} className="grid grid-cols-[28px_52px_1fr_48px_44px_44px_52px] border-b" style={drawingTableLineStyle}>
            <span className="border-r px-1 py-1" style={drawingTableLineStyle}>{row.item}</span>
            <span className="flex min-w-0 items-center gap-1 border-r px-1 py-1" style={drawingTableLineStyle}>
              <span className="h-2 w-2 shrink-0 rounded-full border" style={{ ...drawingTableLineStyle, backgroundColor: row.color }} />
              <span className="truncate">{row.color}</span>
            </span>
            <span className="truncate border-r px-1 py-1" style={drawingTableLineStyle}>{row.signalName}</span>
            <span className="truncate border-r px-1 py-1" style={drawingTableLineStyle}>{row.connectionNo}</span>
            <span className="border-r px-1 py-1" style={drawingTableLineStyle}>{row.startPin ?? '-'}</span>
            <span className="border-r px-1 py-1" style={drawingTableLineStyle}>{row.endPin ?? '-'}</span>
            <span className="px-1 py-1">{row.lengthMm ? `${row.lengthMm}mm` : '-'}</span>
          </div>
        ))}
      </div>
    );
  }

  if (object.kind === 'title-block') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onSelect();
        }}
        className={objectFrameClass(object, selected, 'absolute grid grid-cols-[1fr_80px] border bg-white text-[10px] text-slate-900')}
        style={{ ...styleFromObject(object), ...drawingTableLineStyle }}
      >
        <div className="border-r p-2" style={drawingTableLineStyle}>
          <div className="font-semibold">{object.title}</div>
          <div className="mt-1">图号：{object.drawingNo}</div>
        </div>
        <div className="p-2">版本：{object.revision}</div>
      </div>
    );
  }

  if (object.kind === 'text') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onSelect();
        }}
        className={objectFrameClass(object, selected, 'absolute border border-transparent bg-white p-1 text-slate-900')}
        style={{ ...styleFromObject(object), fontSize: object.fontSize }}
      >
        {object.text}
      </div>
    );
  }

  return (
    <div className="absolute border border-slate-300 bg-white p-1 text-[10px]" style={styleFromObject(object)}>
      图纸对象
    </div>
  );
}

export function DrawingCanvas({ config, selectedObjectId, onSelectObject, zoom = 1 }: DrawingCanvasProps) {
  const drawing = config.productionDrawing;

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[linear-gradient(#e2e8f0_1px,transparent_1px),linear-gradient(90deg,#e2e8f0_1px,transparent_1px)] bg-[size:24px_24px] p-4">
      <div
        className="mx-auto w-full"
        style={{
          minWidth: `${860 * zoom}px`,
          maxWidth: `${1180 * zoom}px`,
          width: `${zoom * 100}%`,
        }}
      >
        <div
          className="relative aspect-[3/2] border border-slate-900 bg-white shadow-sm"
          onClick={() => onSelectObject?.(null)}
        >
          <div className="absolute inset-5 border border-slate-900" />
          {drawing ? (
            drawing.objects.map((object) => (
              <DrawingObjectView
                key={object.id}
                object={object}
                selected={selectedObjectId === object.id}
                onSelect={() => onSelectObject?.(object.id)}
              />
            ))
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
              请使用绘图向导生成 A4 制造图预览。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

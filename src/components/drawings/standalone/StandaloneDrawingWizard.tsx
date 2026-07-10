import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Wand2, X } from 'lucide-react';
import { CONNECTORS, WIRE_COLORS } from '@/lib/data';
import { createDrawingFromWizard, validateStandaloneDrawingWizard } from '@/lib/drawingGenerator';
import type { DrawingConnectorResource, DrawingDocument, DrawingWizardDraft } from '@/types/drawing';

interface StandaloneDrawingWizardProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (drawing: DrawingDocument) => void;
}

const fieldClass = 'mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500';

function resourceFromConnector(connector: typeof CONNECTORS[number]): DrawingConnectorResource {
  return {
    id: connector.id,
    name: connector.name,
    gender: connector.type,
    pinCount: connector.pinCount,
    category: connector.manufacturer || '通用连接器',
    series: connector.name.split(' ')[0] || connector.name,
    rowCount: connector.pinCount >= 20 ? 2 : 1,
    pitchMm: connector.pitch,
    scope: 'public',
  };
}

function createDefaultWire(index: number, lengthMm: number) {
  return {
    pin: index + 1,
    color: WIRE_COLORS[index % WIRE_COLORS.length]?.hex ?? '#111827',
    lengthMm,
    wireNo: `WIRE-${String(index + 1).padStart(2, '0')}`,
    connectionNo: String(index + 1),
    targetPin: index + 1,
  };
}

function resizeWires(draft: DrawingWizardDraft, pinCount: number) {
  return Array.from(
    { length: Math.min(pinCount, 40) },
    (_, index) => draft.wires[index] ?? createDefaultWire(index, draft.totalLengthMm),
  );
}

function getSelectedPinCount(draft: DrawingWizardDraft) {
  return draft.topology.topology === 'single-end'
    ? draft.singleConnector?.pinCount ?? 1
    : Math.min(draft.leftConnector?.pinCount ?? 1, draft.rightConnector?.pinCount ?? 1);
}

function resourceSummary(resource: DrawingConnectorResource | undefined) {
  if (!resource) return '未选择';
  const pitch = resource.pitchMm ? ` / ${resource.pitchMm}mm` : '';
  return `${resource.name} / ${resource.pinCount}PIN / ${resource.rowCount}排${pitch}`;
}

function wireKindLabel(kind: DrawingWizardDraft['topology']['wireKind']) {
  const labels: Record<DrawingWizardDraft['topology']['wireKind'], string> = {
    electronic: '普通线',
    twisted: '绞线',
    ribbon: '排线',
    parallel: '并线',
    shielded: '屏蔽线/多芯线',
  };
  return labels[kind];
}

function defaultDraft(resources: DrawingConnectorResource[]): DrawingWizardDraft {
  const connector = resources.find((resource) => resource.id === 'a1008h-2x20p') ?? resources[0];
  const draft: DrawingWizardDraft = {
    topology: { drawingType: 'internal', topology: 'double-end', wireKind: 'shielded' },
    leftConnector: connector,
    rightConnector: connector,
    singleConnector: connector,
    drawingNo: 'WH-A1008H-40P',
    totalLengthMm: 320,
    toleranceMm: 10,
    hasMold: false,
    heatShrink: '',
    wires: [],
  };
  return { ...draft, wires: resizeWires(draft, connector?.pinCount ?? 1) };
}

export function StandaloneDrawingWizard({ open, onClose, onGenerate }: StandaloneDrawingWizardProps) {
  const resources = useMemo(() => CONNECTORS.map(resourceFromConnector), []);
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState('A1008H');
  const [draft, setDraft] = useState(() => defaultDraft(resources));
  const isSingle = draft.topology.topology === 'single-end';
  const filtered = resources.filter((resource) => `${resource.name} ${resource.series} ${resource.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  const validation = validateStandaloneDrawingWizard(draft);

  if (!open) return null;
  const updateTopology = (patch: Partial<DrawingWizardDraft['topology']>) => setDraft((current) => {
    const next = { ...current, topology: { ...current.topology, ...patch } };
    return { ...next, wires: resizeWires(next, getSelectedPinCount(next)) };
  });
  const updateResource = (key: 'singleConnector' | 'leftConnector' | 'rightConnector', id: string) => setDraft((current) => {
    const next = { ...current, [key]: resources.find((resource) => resource.id === id) };
    return { ...next, wires: resizeWires(next, getSelectedPinCount(next)) };
  });
  const canNext = step === 0 || (step === 1 && (isSingle ? Boolean(draft.singleConnector) : Boolean(draft.leftConnector && draft.rightConnector))) || step >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-blue-600"/><div><h2 className="font-semibold text-slate-900">线图配置向导</h2><p className="text-xs text-slate-500">生成独立的制造图纸，不关联项目。</p></div></div><button type="button" onClick={onClose} className="rounded p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4"/></button></header>
        <div className="flex gap-2 border-b border-slate-200 px-5 py-3">{['拓扑', '连接器/模型', '属性与颜色', '预览'].map((label, index) => <button type="button" key={label} onClick={() => setStep(index)} className={`rounded-full px-3 py-1 text-xs font-medium ${step === index ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{index + 1}. {label}</button>)}</div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {step === 0 && <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">类型<select value={draft.topology.drawingType} onChange={(event) => updateTopology({ drawingType: event.target.value as DrawingWizardDraft['topology']['drawingType'] })} className={fieldClass}><option value="internal">内线</option><option value="external">外线</option><option value="gallery">图库</option></select></label>
            <label className="text-sm font-medium text-slate-700">子类型<select value={draft.topology.topology} onChange={(event) => updateTopology({ topology: event.target.value as DrawingWizardDraft['topology']['topology'] })} className={fieldClass}><option value="single-end">单头</option><option value="double-end">双头</option><option value="one-to-many">1:1:N</option></select></label>
            <label className="text-sm font-medium text-slate-700">线材类型<select value={draft.topology.wireKind} onChange={(event) => updateTopology({ wireKind: event.target.value as DrawingWizardDraft['topology']['wireKind'] })} className={fieldClass}><option value="electronic">普通线</option><option value="twisted">绞线</option><option value="ribbon">排线</option><option value="parallel">并线</option><option value="shielded">屏蔽线</option></select></label>
          </div>}
          {step === 1 && <div><label className="block text-sm font-medium text-slate-700">搜索名称、系列、类别<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如 XH2.54" className={fieldClass}/></label><div className={`mt-4 grid gap-4 ${isSingle ? '' : 'md:grid-cols-2'}`}>
            <ResourceSelect title={isSingle ? '连接器/模型' : '左连接器/模型'} resources={filtered} value={isSingle ? draft.singleConnector?.id : draft.leftConnector?.id} onChange={(id) => updateResource(isSingle ? 'singleConnector' : 'leftConnector', id)}/>
            {!isSingle && <ResourceSelect title="右连接器/模型" resources={filtered} value={draft.rightConnector?.id} onChange={(id) => updateResource('rightConnector', id)}/>} 
          </div></div>}
          {step === 2 && <div className="space-y-4"><div className="grid gap-4 md:grid-cols-4"><label className="text-sm font-medium text-slate-700">图号<input value={draft.drawingNo} onChange={(event) => setDraft({ ...draft, drawingNo: event.target.value })} className={fieldClass}/></label><label className="text-sm font-medium text-slate-700">总长度 (mm)<input type="number" value={draft.totalLengthMm} onChange={(event) => setDraft({ ...draft, totalLengthMm: Number(event.target.value), wires: draft.wires.map((wire) => ({ ...wire, lengthMm: Number(event.target.value) })) })} className={fieldClass}/></label><label className="text-sm font-medium text-slate-700">公差 (mm)<input type="number" value={draft.toleranceMm} onChange={(event) => setDraft({ ...draft, toleranceMm: Number(event.target.value) })} className={fieldClass}/></label><label className="text-sm font-medium text-slate-700">热缩套管<input value={draft.heatShrink ?? ''} onChange={(event) => setDraft({ ...draft, heatShrink: event.target.value })} className={fieldClass}/></label></div><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={draft.hasMold} onChange={(event) => setDraft({ ...draft, hasMold: event.target.checked })}/> 外线模具</label><div className="overflow-auto rounded border border-slate-200"><table className="w-full text-left text-xs"><thead className="bg-slate-50"><tr>{['PIN', '颜色', '长度', '线号', '接线', '目标 PIN'].map((label) => <th key={label} className="px-2 py-2">{label}</th>)}</tr></thead><tbody>{draft.wires.map((wire, index) => <tr key={wire.pin} className="border-t border-slate-100"><td className="px-2 py-2">{wire.pin}</td><td className="px-2 py-2"><input type="color" value={wire.color} onChange={(event) => setDraft({ ...draft, wires: draft.wires.map((item, itemIndex) => itemIndex === index ? { ...item, color: event.target.value } : item) })}/></td><td className="px-2 py-2"><input className="w-20 rounded border px-1" type="number" value={wire.lengthMm} onChange={(event) => setDraft({ ...draft, wires: draft.wires.map((item, itemIndex) => itemIndex === index ? { ...item, lengthMm: Number(event.target.value) } : item) })}/></td><td className="px-2 py-2"><input className="w-24 rounded border px-1" value={wire.wireNo} onChange={(event) => setDraft({ ...draft, wires: draft.wires.map((item, itemIndex) => itemIndex === index ? { ...item, wireNo: event.target.value } : item) })}/></td><td className="px-2 py-2"><input className="w-16 rounded border px-1" value={wire.connectionNo} onChange={(event) => setDraft({ ...draft, wires: draft.wires.map((item, itemIndex) => itemIndex === index ? { ...item, connectionNo: event.target.value } : item) })}/></td><td className="px-2 py-2"><input className="w-16 rounded border px-1" type="number" value={wire.targetPin} onChange={(event) => setDraft({ ...draft, wires: draft.wires.map((item, itemIndex) => itemIndex === index ? { ...item, targetPin: Number(event.target.value) } : item) })}/></td></tr>)}</tbody></table></div></div>}
          {step === 3 && <div className="space-y-3"><h3 className="font-semibold text-slate-900">生成预览</h3><div className="rounded border border-slate-200 p-4 text-sm text-slate-700"><p>拓扑：{isSingle ? '单头' : '双头'} · {wireKindLabel(draft.topology.wireKind)}</p><p>连接器：{isSingle ? resourceSummary(draft.singleConnector) : `${resourceSummary(draft.leftConnector)} → ${resourceSummary(draft.rightConnector)}`}</p><p>总长：{draft.totalLengthMm}±{draft.toleranceMm}mm</p><p>线材行：{draft.wires.length} 条，已填线号 {draft.wires.filter((wire) => wire.wireNo.trim()).length}/{draft.wires.length}，未填长度 {draft.wires.filter((wire) => !wire.lengthMm || wire.lengthMm <= 0).length}/{draft.wires.length}</p><p>将生成制造图对象：连接器、线束、尺寸、接线表、物料表、技术要求和标题栏。</p></div>{validation.errors.length > 0 && <ul className="rounded bg-red-50 p-3 text-sm text-red-700">{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul>}{validation.warnings.length > 0 && <ul className="rounded bg-amber-50 p-3 text-sm text-amber-700">{validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}</div>}
        </div>
        <footer className="flex items-center justify-between border-t border-slate-200 px-5 py-3"><button type="button" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))} className="flex items-center gap-1 rounded border px-3 py-2 text-sm disabled:opacity-40"><ChevronLeft className="h-4 w-4"/>上一步</button>{step < 3 ? <button type="button" disabled={!canNext} onClick={() => setStep((value) => Math.min(3, value + 1))} className="flex items-center gap-1 rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-40">下一步<ChevronRight className="h-4 w-4"/></button> : <button type="button" disabled={validation.errors.length > 0} onClick={() => onGenerate(createDrawingFromWizard(draft))} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40">确认生成</button>}</footer>
      </div>
    </div>
  );
}

function ResourceSelect({ title, resources, value, onChange }: { title: string; resources: DrawingConnectorResource[]; value?: string; onChange: (id: string) => void }) {
  return <label className="block rounded border border-slate-200 p-3 text-sm font-medium text-slate-700">{title}<select value={value ?? ''} onChange={(event) => onChange(event.target.value)} className={fieldClass}>{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name} · {resource.pinCount}PIN · {resource.pitchMm ?? '-'}mm</option>)}</select><p className="mt-2 text-xs font-normal text-slate-500">公共资源；可按名称、系列、类别筛选。当前系统的私人资源会保存至本机图纸库。</p></label>;
}

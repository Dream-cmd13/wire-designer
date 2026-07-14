import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Wand2, X } from 'lucide-react';
import { DrawingResourceSelect } from '@/components/drawings/standalone/DrawingResourceSelect';
import { DrawingWireBatchEditor } from '@/components/drawings/standalone/DrawingWireBatchEditor';
import { WIRE_COLORS } from '@/lib/data';
import { drawingCatalogRepository, filterDrawingCatalogResources } from '@/lib/drawingCatalogRepository';
import { applyDrawingWireBatch, countDrawingMaterialKinds, createDrawingFromWizard, validateStandaloneDrawingWizard } from '@/lib/drawingGenerator';
import type { DrawingCatalogFilters, DrawingCatalogResource, DrawingConnectorResource, DrawingDocument, DrawingTemplateSummary, DrawingWizardDraft } from '@/types/drawing';

interface StandaloneDrawingWizardProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (drawing: DrawingDocument) => void;
  onLoadTemplate?: (drawing: DrawingDocument) => void;
}

const fieldClass = 'mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500';

function connectorFromResource(resource: DrawingCatalogResource): DrawingConnectorResource {
  return {
    id: resource.id, name: resource.name, gender: resource.gender ?? 'receptacle', pinCount: resource.pinCount ?? 1,
    category: resource.category, series: resource.series ?? resource.model, rowCount: resource.rowCount ?? 1,
    pitchMm: resource.pitchMm, scope: 'public',
  };
}

function defaultWire(index: number, lengthMm: number) {
  return { pin: index + 1, color: WIRE_COLORS[index % WIRE_COLORS.length]?.hex ?? '#111827', lengthMm, wireNo: `WIRE-${String(index + 1).padStart(2, '0')}`, connectionNo: String(index + 1), targetPin: index + 1 };
}

function resizeWires(draft: DrawingWizardDraft, count: number) {
  return Array.from({ length: Math.min(40, Math.max(1, count)) }, (_, index) => draft.wires[index] ?? defaultWire(index, draft.totalLengthMm));
}

function initialDraft(): DrawingWizardDraft {
  return { topology: { drawingType: 'internal', topology: 'double-end', wireKind: 'shielded' }, drawingNo: 'WH-NEW', totalLengthMm: 320, toleranceMm: 5, hasMold: false, heatShrink: '', wires: [defaultWire(0, 320)] };
}

export function StandaloneDrawingWizard({ open, onClose, onGenerate, onLoadTemplate }: StandaloneDrawingWizardProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<DrawingWizardDraft>(initialDraft);
  const [resources, setResources] = useState<DrawingCatalogResource[]>([]);
  const [templates, setTemplates] = useState<DrawingTemplateSummary[]>([]);
  const [filters, setFilters] = useState<DrawingCatalogFilters>({ resourceType: 'connector' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const isSingle = draft.topology.topology === 'single-end';
  const filtered = useMemo(() => filterDrawingCatalogResources(resources, filters), [filters, resources]);
  const wireResources = resources.filter((resource) => resource.resourceType === 'wire');
  const validation = validateStandaloneDrawingWizard(draft);

  const loadResources = async () => {
    if (!drawingCatalogRepository) { setError('Supabase 尚未配置，无法读取公共资源。'); return; }
    setLoading(true); setError('');
    try {
      const [catalog, gallery] = await Promise.all([drawingCatalogRepository.listResources({}), drawingCatalogRepository.listTemplates()]);
      setResources(catalog); setTemplates(gallery);
      setDraft((current) => {
        const connectors = catalog.filter((resource) => resource.resourceType === 'connector');
        const connector = connectors[0] ? connectorFromResource(connectors[0]) : undefined;
        const wireResource = catalog.find((resource) => resource.resourceType === 'wire');
        const next = { ...current, singleConnector: current.singleConnector ?? connector, leftConnector: current.leftConnector ?? connector, rightConnector: current.rightConnector ?? connector, wireResource: current.wireResource ?? wireResource };
        return { ...next, wires: resizeWires(next, connector?.pinCount ?? 1) };
      });
    } catch (reason) { setError(reason instanceof Error ? reason.message : '公共资源加载失败。'); }
    finally { setLoading(false); }
  };

  // Opening the wizard is the external event that starts its one-time catalog fetch.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { if (open && resources.length === 0 && !loading) void loadResources(); }, [open]);
  if (!open) return null;

  const updateTopology = (patch: Partial<DrawingWizardDraft['topology']>) => setDraft((current) => {
    const topology = { ...current.topology, ...patch };
    const next = { ...current, topology, hasMold: patch.drawingType === 'external' ? true : current.hasMold };
    const pinCount = topology.topology === 'single-end' ? next.singleConnector?.pinCount : Math.min(next.leftConnector?.pinCount ?? 1, next.rightConnector?.pinCount ?? 1);
    return { ...next, wires: resizeWires(next, pinCount ?? 1) };
  });

  const selectConnector = (key: 'singleConnector' | 'leftConnector' | 'rightConnector', resource: DrawingCatalogResource) => setDraft((current) => {
    const next = { ...current, [key]: connectorFromResource(resource), modelResource: resource.resourceType === 'model' ? resource : current.modelResource };
    const count = next.topology.topology === 'single-end' ? next.singleConnector?.pinCount : Math.min(next.leftConnector?.pinCount ?? 1, next.rightConnector?.pinCount ?? 1);
    return { ...next, wires: resizeWires(next, count ?? 1) };
  });

  const loadTemplate = async () => {
    if (!drawingCatalogRepository || !selectedTemplateId) return;
    try { (onLoadTemplate ?? onGenerate)(await drawingCatalogRepository.loadTemplate(selectedTemplateId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '图库模板加载失败。'); }
  };

  const canNext = step === 0
    || (step === 1 && (draft.topology.drawingType === 'gallery' ? Boolean(selectedTemplateId) : isSingle ? Boolean(draft.singleConnector) : Boolean(draft.leftConnector && draft.rightConnector)))
    || step === 2;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
    <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
      <header className="flex items-center justify-between border-b px-5 py-4"><div className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-blue-600"/><div><h2 className="font-semibold">线图配置向导</h2><p className="text-xs text-slate-500">公共资源统一读取 Supabase</p></div></div><button type="button" onClick={onClose} aria-label="关闭"><X className="h-4 w-4"/></button></header>
      <nav className="flex gap-2 border-b px-5 py-3">{['类型', '连接器/模型', '属性与颜色', '预览'].map((label, index) => <button type="button" key={label} onClick={() => setStep(index)} className={`rounded-full px-3 py-1 text-xs ${step === index ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>{index + 1}. {label}</button>)}</nav>
      <main className="min-h-0 flex-1 overflow-y-auto p-5">
        {step === 0 && <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm">类型<select className={fieldClass} value={draft.topology.drawingType} onChange={(event) => updateTopology({ drawingType: event.target.value as DrawingWizardDraft['topology']['drawingType'] })}><option value="internal">内线</option><option value="external">外线</option><option value="gallery">图库</option></select></label>
          <label className="text-sm">子类型<select className={fieldClass} value={draft.topology.topology} onChange={(event) => updateTopology({ topology: event.target.value as 'single-end' | 'double-end' })}><option value="single-end">单头</option><option value="double-end">双头</option></select></label>
          <label className="text-sm">线材类型<select className={fieldClass} value={draft.topology.wireKind} onChange={(event) => updateTopology({ wireKind: event.target.value as DrawingWizardDraft['topology']['wireKind'] })}><option value="electronic">普通线</option><option value="twisted">绞线</option><option value="ribbon">排线</option><option value="parallel">并线</option><option value="shielded">屏蔽线</option></select></label>
        </div>}
        {step === 1 && draft.topology.drawingType === 'gallery' && <section><h3 className="mb-3 font-semibold">图库模板</h3>{templates.map((template) => <button type="button" key={template.id} onClick={() => setSelectedTemplateId(template.id)} className={`mb-2 block w-full rounded border p-3 text-left ${selectedTemplateId === template.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}><strong>{template.name}</strong><span className="ml-2 text-xs text-slate-500">{template.category} · V{template.currentVersion}</span><p className="text-xs text-slate-500">{template.description}</p></button>)}</section>}
        {step === 1 && draft.topology.drawingType !== 'gallery' && <div className="space-y-4">
          <DrawingResourceSelect title={isSingle ? '连接器/模型' : '左连接器/模型'} resources={filtered} filters={filters} selectedId={(isSingle ? draft.singleConnector : draft.leftConnector)?.id} loading={loading} error={error} onFiltersChange={setFilters} onSelect={(resource) => selectConnector(isSingle ? 'singleConnector' : 'leftConnector', resource)} onRetry={() => void loadResources()} />
          {!isSingle && <DrawingResourceSelect title="右连接器/模型" resources={filtered} filters={filters} selectedId={draft.rightConnector?.id} loading={loading} error={error} onFiltersChange={setFilters} onSelect={(resource) => selectConnector('rightConnector', resource)} onRetry={() => void loadResources()} />}
        </div>}
        {step === 2 && <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-5"><label className="text-sm">图号<input className={fieldClass} value={draft.drawingNo} onChange={(event) => setDraft({ ...draft, drawingNo: event.target.value })}/></label><label className="text-sm">线材规格<select className={fieldClass} value={draft.wireResource?.catalogItemId ?? ''} onChange={(event) => setDraft({ ...draft, wireResource: wireResources.find((resource) => resource.catalogItemId === event.target.value) })}><option value="">请选择</option>{wireResources.map((resource) => <option key={resource.catalogItemId} value={resource.catalogItemId}>{resource.name}</option>)}</select></label><label className="text-sm">总长度(mm)<input className={fieldClass} type="number" value={draft.totalLengthMm} onChange={(event) => setDraft({ ...draft, totalLengthMm: Number(event.target.value) })}/></label><label className="text-sm">公差(mm)<input className={fieldClass} type="number" value={draft.toleranceMm} onChange={(event) => setDraft({ ...draft, toleranceMm: Number(event.target.value) })}/></label><label className="text-sm">物料种类<input className={fieldClass} readOnly value={countDrawingMaterialKinds(draft)}/></label></div>
          <div className="flex gap-4"><label className="text-sm"><input type="checkbox" checked={draft.hasMold} onChange={(event) => setDraft({ ...draft, hasMold: event.target.checked })}/> 模具有/无</label><label className="text-sm">热缩套管<input className="ml-2 rounded border px-2 py-1" value={draft.heatShrink ?? ''} onChange={(event) => setDraft({ ...draft, heatShrink: event.target.value })}/></label></div>
          <DrawingWireBatchEditor onApply={(batch) => setDraft({ ...draft, wires: applyDrawingWireBatch(draft.wires, batch) })}/>
          <div className="overflow-auto rounded border"><table className="w-full text-xs"><thead><tr>{['PIN', '颜色', '长度', '线号', '接线号', '目标 PIN'].map((label) => <th key={label} className="p-2 text-left">{label}</th>)}</tr></thead><tbody>{draft.wires.map((wire, index) => <tr key={wire.pin} className="border-t"><td className="p-2">{wire.pin}</td><td><input type="color" value={wire.color} onChange={(event) => setDraft({ ...draft, wires: draft.wires.map((item, i) => i === index ? { ...item, color: event.target.value } : item) })}/></td><td><input className="w-20 border" type="number" value={wire.lengthMm} onChange={(event) => setDraft({ ...draft, wires: draft.wires.map((item, i) => i === index ? { ...item, lengthMm: Number(event.target.value) } : item) })}/></td><td><input className="w-24 border" value={wire.wireNo} onChange={(event) => setDraft({ ...draft, wires: draft.wires.map((item, i) => i === index ? { ...item, wireNo: event.target.value } : item) })}/></td><td>{wire.connectionNo}</td><td><input className="w-16 border" type="number" value={wire.targetPin ?? ''} onChange={(event) => setDraft({ ...draft, wires: draft.wires.map((item, i) => i === index ? { ...item, targetPin: Number(event.target.value) } : item) })}/></td></tr>)}</tbody></table></div>
        </div>}
        {step === 3 && <div className="space-y-3"><h3 className="font-semibold">生成预览</h3><div className="rounded border p-4 text-sm"><p>{isSingle ? '单头' : '双头'} · {draft.wires.length} 芯 · {draft.totalLengthMm}±{draft.toleranceMm}mm</p><p>线材：{draft.wireResource?.name ?? '未选择'} · 物料种类：{countDrawingMaterialKinds(draft)}</p></div>{validation.errors.length > 0 && <ul className="rounded bg-red-50 p-3 text-sm text-red-700">{validation.errors.map((item) => <li key={item}>{item}</li>)}</ul>}{validation.warnings.length > 0 && <ul className="rounded bg-amber-50 p-3 text-sm text-amber-700">{validation.warnings.map((item) => <li key={item}>{item}</li>)}</ul>}</div>}
      </main>
      <footer className="flex justify-between border-t px-5 py-3"><button type="button" disabled={step === 0} onClick={() => setStep((value) => value - 1)} className="flex items-center rounded border px-3 py-2 text-sm disabled:opacity-40"><ChevronLeft className="h-4 w-4"/>上一步</button>{step < 3 ? <button type="button" disabled={!canNext} onClick={() => setStep((value) => value + 1)} className="flex items-center rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-40">下一步<ChevronRight className="h-4 w-4"/></button> : draft.topology.drawingType === 'gallery' ? <button type="button" disabled={!selectedTemplateId} onClick={() => void loadTemplate()} className="rounded bg-blue-600 px-4 py-2 text-sm text-white">载入模板</button> : <button type="button" disabled={validation.errors.length > 0} onClick={() => onGenerate(createDrawingFromWizard(draft))} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40">确认生成</button>}</footer>
    </div>
  </div>;
}

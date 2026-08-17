import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FilePlus2, LayoutTemplate, Wand2, X } from 'lucide-react';
import { DrawingResourceSelect } from '@/components/drawings/standalone/DrawingResourceSelect';
import { DrawingWireBatchEditor } from '@/components/drawings/standalone/DrawingWireBatchEditor';
import { useCatalogStore } from '@/stores/catalogStore';
import { getCatalogWireColors } from '@/lib/catalogRuntime';
import { drawingCatalogRepository, filterDrawingCatalogResources } from '@/lib/drawingCatalogRepository';
import { applyDrawingWireBatch, countDrawingMaterialKinds, createDrawingFromWizard, validateStandaloneDrawingWizard } from '@/lib/drawingGenerator';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import type {
  DrawingCatalogFilters,
  DrawingCatalogResource,
  DrawingConnectorResource,
  DrawingDocument,
  DrawingEndpointForm,
  DrawingTemplateSummary,
  DrawingWizardDraft,
} from '@/types/drawing';

interface StandaloneDrawingWizardProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (drawing: DrawingDocument) => void;
  onLoadTemplate?: (drawing: DrawingDocument) => void;
}

type WizardMode = 'drawing' | 'template';

const steps = ['连接器/模型', '属性与颜色', '预览'] as const;
const fieldClass = 'mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500';

function connectorFromResource(resource: DrawingCatalogResource): DrawingConnectorResource {
  return {
    id: resource.id,
    name: resource.name,
    gender: resource.gender ?? 'receptacle',
    pinCount: resource.pinCount ?? 1,
    category: resource.resourceGroup,
    series: resource.series ?? resource.model,
    rowCount: resource.rowCount ?? 1,
    pitchMm: resource.pitchMm,
    scope: 'public',
  };
}

function defaultWire(index: number, lengthMm: number, wireColors: Array<{ hex: string }>) {
  return {
    pin: index + 1,
    color: wireColors[index % Math.max(wireColors.length, 1)]?.hex ?? '#111827',
    lengthMm,
    wireNo: `WIRE-${String(index + 1).padStart(2, '0')}`,
    connectionNo: String(index + 1),
    targetPin: index + 1,
  };
}

function resizeWires(draft: DrawingWizardDraft, count: number, wireColors: Array<{ hex: string }>) {
  return Array.from(
    { length: Math.min(40, Math.max(1, count)) },
    (_, index) => draft.wires[index] ?? defaultWire(index, draft.totalLengthMm, wireColors),
  );
}

function initialDraft(wireColors: Array<{ hex: string }>): DrawingWizardDraft {
  return {
    endpointForm: 'double-end',
    drawingNo: '',
    totalLengthMm: 320,
    toleranceMm: 5,
    hasMold: false,
    wires: [defaultWire(0, 320, wireColors)],
  };
}

function resourceSummary(resource: DrawingCatalogResource | undefined) {
  if (!resource) return '未选择';
  return [resource.name, resource.model, resource.specification].filter(Boolean).join(' · ');
}

export function StandaloneDrawingWizard({ open, onClose, onGenerate, onLoadTemplate }: StandaloneDrawingWizardProps) {
  const wireColors = useCatalogStore((state) => getCatalogWireColors(state.snapshot));
  const [mode, setMode] = useState<WizardMode>('drawing');
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<DrawingWizardDraft>(() => initialDraft(wireColors));
  const [resources, setResources] = useState<DrawingCatalogResource[]>([]);
  const [templates, setTemplates] = useState<DrawingTemplateSummary[]>([]);
  const [filters, setFilters] = useState<DrawingCatalogFilters>({ resourceType: 'connector' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  const isSingle = draft.endpointForm === 'single-end';
  const filtered = useMemo(() => filterDrawingCatalogResources(resources, filters), [filters, resources]);
  const wireResources = resources.filter((resource) => resource.resourceType === 'wire');
  const protectiveSleeveResources = resources.filter((resource) => resource.resourceType === 'protective_sleeve');
  const validation = validateStandaloneDrawingWizard(draft);

  const loadResources = async () => {
    if (!drawingCatalogRepository) {
      setError('Supabase 尚未配置，无法读取公共资源。');
      return;
    }

    const selectedProtectiveSleeveId = draft.protectiveSleeveResource?.resourceItemId;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const [catalog, gallery] = await Promise.all([
        drawingCatalogRepository.listResources({}),
        drawingCatalogRepository.listTemplates(),
      ]);
      setResources(catalog);
      setTemplates(gallery);
      setDraft((current) => {
        const connectors = catalog.filter((resource) => resource.resourceType === 'connector');
        const connector = connectors[0] ? connectorFromResource(connectors[0]) : undefined;
        const wireResource = catalog.find((resource) => resource.resourceType === 'wire');
        const protectiveSleeveResource = selectedProtectiveSleeveId
          ? catalog.find((resource) => resource.resourceType === 'protective_sleeve' && resource.resourceItemId === selectedProtectiveSleeveId)
          : current.protectiveSleeveResource;
        const next = {
          ...current,
          singleConnector: current.singleConnector ?? connector,
          leftConnector: current.leftConnector ?? connector,
          rightConnector: current.rightConnector ?? connector,
          wireResource: current.wireResource ?? wireResource,
          protectiveSleeveResource,
        };
        return { ...next, wires: resizeWires(next, connector?.pinCount ?? 1, wireColors) };
      });
      if (selectedProtectiveSleeveId && !catalog.some((resource) => resource.resourceItemId === selectedProtectiveSleeveId && resource.resourceType === 'protective_sleeve')) {
        setNotice('已选热缩套管已失效，请重新选择。');
      }
    } catch (reason) {
      console.error('公共资源加载失败:', reason);
      setError(getUserErrorMessage(reason, '公共资源加载失败，请重试。'));
    } finally {
      setLoading(false);
    }
  };

  // Opening the wizard is the external event that starts its one-time catalog fetch.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { if (open && resources.length === 0 && !loading) void loadResources(); }, [open]);

  if (!open) return null;

  const selectEndpointForm = (endpointForm: DrawingEndpointForm) => setDraft((current) => {
    const next = { ...current, endpointForm };
    const pinCount = endpointForm === 'single-end'
      ? next.singleConnector?.pinCount
      : Math.min(next.leftConnector?.pinCount ?? 1, next.rightConnector?.pinCount ?? 1);
    return { ...next, wires: resizeWires(next, pinCount ?? 1, wireColors) };
  });

  const selectConnector = (key: 'singleConnector' | 'leftConnector' | 'rightConnector', resource: DrawingCatalogResource) => setDraft((current) => {
    const next = {
      ...current,
      [key]: connectorFromResource(resource),
      modelResource: resource.resourceType === 'model' ? resource : current.modelResource,
    };
    const count = next.endpointForm === 'single-end'
      ? next.singleConnector?.pinCount
      : Math.min(next.leftConnector?.pinCount ?? 1, next.rightConnector?.pinCount ?? 1);
    return { ...next, wires: resizeWires(next, count ?? 1, wireColors) };
  });

  const selectProtectiveSleeve = (resourceItemId: string) => {
    const protectiveSleeveResource = protectiveSleeveResources.find((resource) => resource.resourceItemId === resourceItemId);
    setDraft((current) => ({ ...current, protectiveSleeveResource }));
    setNotice('');
  };

  const loadTemplate = async () => {
    if (!drawingCatalogRepository || !selectedTemplateId) return;
    try {
      (onLoadTemplate ?? onGenerate)(await drawingCatalogRepository.loadTemplate(selectedTemplateId));
    } catch (reason) {
      console.error('图库模板加载失败:', reason);
      setError(getUserErrorMessage(reason, '图库模板加载失败，请重试。'));
    }
  };

  const connectorsReady = isSingle
    ? Boolean(draft.singleConnector)
    : Boolean(draft.leftConnector && draft.rightConnector);
  const canNext = step !== 0 || connectorsReady;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
    <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
      <header className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-blue-600" />
          <div>
            <h2 className="font-semibold">线图配置向导</h2>
            <p className="text-xs text-slate-500">公共资源统一读取 Supabase</p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭"><X className="h-4 w-4" /></button>
      </header>

      <div className="flex flex-wrap gap-2 border-b px-5 py-3">
        <button
          type="button"
          onClick={() => { setMode('drawing'); setStep(0); setError(''); }}
          className={`flex items-center gap-2 rounded border px-3 py-2 text-sm ${mode === 'drawing' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-700'}`}
        >
          <FilePlus2 className="h-4 w-4" />新建图纸
        </button>
        <button
          type="button"
          onClick={() => { setMode('template'); setError(''); }}
          className={`flex items-center gap-2 rounded border px-3 py-2 text-sm ${mode === 'template' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-700'}`}
        >
          <LayoutTemplate className="h-4 w-4" />从模板创建
        </button>
      </div>

      {mode === 'drawing' && <nav className="flex gap-2 border-b px-5 py-3">
        {steps.map((label, index) => <button
          type="button"
          key={label}
          onClick={() => setStep(index)}
          className={`rounded-full px-3 py-1 text-xs ${step === index ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}
        >
          {index + 1}. {label}
        </button>)}
      </nav>}

      <main className="min-h-0 flex-1 overflow-y-auto p-5">
        {mode === 'template' && <section className="space-y-3">
          <h3 className="font-semibold">图库模板</h3>
          {loading && <p className="text-sm text-slate-500">模板加载中…</p>}
          {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">
            {error}<button type="button" className="ml-2 underline" onClick={() => void loadResources()}>重试</button>
          </div>}
          {!loading && !error && templates.length === 0 && <p className="rounded bg-slate-50 p-3 text-sm text-slate-500">暂无可用图库模板。</p>}
          <div className="grid gap-2 md:grid-cols-2">
            {templates.map((template) => <button
              type="button"
              key={template.id}
              onClick={() => setSelectedTemplateId(template.id)}
              className={`rounded border p-3 text-left ${selectedTemplateId === template.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}
            >
              <strong>{template.name}</strong>
              <span className="ml-2 text-xs text-slate-500">{template.category} · V{template.currentVersion}</span>
              <p className="mt-1 text-xs text-slate-500">{template.description}</p>
            </button>)}
          </div>
        </section>}

        {mode === 'drawing' && step === 0 && <div className="space-y-4">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">端头形式</h3>
            <div className="inline-flex rounded border border-slate-300 p-1" role="group" aria-label="端头形式">
              {([
                ['single-end', '单头'],
                ['double-end', '双头'],
              ] as const).map(([value, label]) => <button
                type="button"
                key={value}
                aria-pressed={draft.endpointForm === value}
                onClick={() => selectEndpointForm(value)}
                className={`min-w-20 rounded px-3 py-1.5 text-sm ${draft.endpointForm === value ? 'bg-blue-600 text-white' : 'text-slate-700'}`}
              >
                {label}
              </button>)}
            </div>
          </section>
          <DrawingResourceSelect
            title={isSingle ? '连接器/模型' : '左连接器/模型'}
            resources={filtered}
            filters={filters}
            selectedId={(isSingle ? draft.singleConnector : draft.leftConnector)?.id}
            loading={loading}
            error={error}
            onFiltersChange={setFilters}
            onSelect={(resource) => selectConnector(isSingle ? 'singleConnector' : 'leftConnector', resource)}
            onRetry={() => void loadResources()}
          />
          {!isSingle && <DrawingResourceSelect
            title="右连接器/模型"
            resources={filtered}
            filters={filters}
            selectedId={draft.rightConnector?.id}
            loading={loading}
            error={error}
            onFiltersChange={setFilters}
            onSelect={(resource) => selectConnector('rightConnector', resource)}
            onRetry={() => void loadResources()}
          />}
        </div>}

        {mode === 'drawing' && step === 1 && <div className="space-y-4">
          {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">
            {error}<button type="button" className="ml-2 underline" onClick={() => void loadResources()}>重试</button>
          </div>}
          {notice && <p className="rounded bg-amber-50 p-3 text-sm text-amber-700">{notice}</p>}
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <label className="text-sm">图号
              <input className={fieldClass} value={draft.drawingNo} onChange={(event) => setDraft({ ...draft, drawingNo: event.target.value })} />
            </label>
            <label className="text-sm">线材规格
              <select className={fieldClass} value={draft.wireResource?.resourceItemId ?? ''} onChange={(event) => setDraft({ ...draft, wireResource: wireResources.find((resource) => resource.resourceItemId === event.target.value) })}>
                <option value="">请选择</option>
                {wireResources.map((resource) => <option key={resource.resourceItemId} value={resource.resourceItemId}>{resourceSummary(resource)}</option>)}
              </select>
            </label>
            <label className="text-sm">热缩套管
              <select className={fieldClass} value={draft.protectiveSleeveResource?.resourceItemId ?? ''} onChange={(event) => selectProtectiveSleeve(event.target.value)}>
                <option value="">不使用</option>
                {protectiveSleeveResources.map((resource) => <option key={resource.resourceItemId} value={resource.resourceItemId}>{resourceSummary(resource)}</option>)}
              </select>
            </label>
            <label className="text-sm">总长度(mm)
              <input className={fieldClass} type="number" value={draft.totalLengthMm} onChange={(event) => setDraft({ ...draft, totalLengthMm: Number(event.target.value) })} />
            </label>
            <label className="text-sm">公差(mm)
              <input className={fieldClass} type="number" value={draft.toleranceMm} onChange={(event) => setDraft({ ...draft, toleranceMm: Number(event.target.value) })} />
            </label>
            <label className="text-sm">物料种类
              <input className={fieldClass} readOnly value={countDrawingMaterialKinds(draft)} />
            </label>
          </div>
          {!loading && !error && protectiveSleeveResources.length === 0 && <p className="text-sm text-slate-500">暂无可用热缩套管。</p>}
          {draft.protectiveSleeveResource && <p className="text-xs text-slate-500">已选：{resourceSummary(draft.protectiveSleeveResource)}</p>}
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.hasMold} onChange={(event) => setDraft({ ...draft, hasMold: event.target.checked })} />
            使用模具
          </label>
          <DrawingWireBatchEditor onApply={(batch) => setDraft({ ...draft, wires: applyDrawingWireBatch(draft.wires, batch) })} />
          <div className="overflow-auto rounded border">
            <table className="w-full text-xs">
              <thead><tr>{['PIN', '颜色', '长度', '线号', '接线号', '目标 PIN'].map((label) => <th key={label} className="p-2 text-left">{label}</th>)}</tr></thead>
              <tbody>{draft.wires.map((wire, index) => <tr key={wire.pin} className="border-t">
                <td className="p-2">{wire.pin}</td>
                <td><input type="color" value={wire.color} onChange={(event) => setDraft({ ...draft, wires: draft.wires.map((item, itemIndex) => itemIndex === index ? { ...item, color: event.target.value } : item) })} /></td>
                <td><input className="w-20 border" type="number" value={wire.lengthMm} onChange={(event) => setDraft({ ...draft, wires: draft.wires.map((item, itemIndex) => itemIndex === index ? { ...item, lengthMm: Number(event.target.value) } : item) })} /></td>
                <td><input className="w-24 border" value={wire.wireNo} onChange={(event) => setDraft({ ...draft, wires: draft.wires.map((item, itemIndex) => itemIndex === index ? { ...item, wireNo: event.target.value } : item) })} /></td>
                <td>{wire.connectionNo}</td>
                <td><input className="w-16 border" type="number" value={wire.targetPin ?? ''} onChange={(event) => setDraft({ ...draft, wires: draft.wires.map((item, itemIndex) => itemIndex === index ? { ...item, targetPin: Number(event.target.value) } : item) })} /></td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>}

        {mode === 'drawing' && step === 2 && <div className="space-y-3">
          <h3 className="font-semibold">生成预览</h3>
          <dl className="grid gap-x-6 gap-y-2 border-y border-slate-200 py-4 text-sm md:grid-cols-2">
            <div><dt className="text-slate-500">端头形式</dt><dd>{isSingle ? '单头' : '双头'}</dd></div>
            <div><dt className="text-slate-500">连接器/模型</dt><dd>{isSingle ? draft.singleConnector?.name ?? '未选择' : `${draft.leftConnector?.name ?? '未选择'} → ${draft.rightConnector?.name ?? '未选择'}`}</dd></div>
            <div><dt className="text-slate-500">线材</dt><dd>{resourceSummary(draft.wireResource)}</dd></div>
            <div><dt className="text-slate-500">热缩套管</dt><dd>{resourceSummary(draft.protectiveSleeveResource)}</dd></div>
            <div><dt className="text-slate-500">芯数</dt><dd>{draft.wires.length}</dd></div>
            <div><dt className="text-slate-500">长度与公差</dt><dd>{draft.totalLengthMm}±{draft.toleranceMm}mm</dd></div>
            <div><dt className="text-slate-500">物料种类</dt><dd>{countDrawingMaterialKinds(draft)}</dd></div>
            <div><dt className="text-slate-500">图号</dt><dd>{draft.drawingNo || '未填写'}</dd></div>
          </dl>
          {validation.errors.length > 0 && <ul className="rounded bg-red-50 p-3 text-sm text-red-700">{validation.errors.map((item) => <li key={item}>{item}</li>)}</ul>}
          {validation.warnings.length > 0 && <ul className="rounded bg-amber-50 p-3 text-sm text-amber-700">{validation.warnings.map((item) => <li key={item}>{item}</li>)}</ul>}
        </div>}
      </main>

      {mode === 'template'
        ? <footer className="flex justify-end border-t px-5 py-3">
          <button type="button" disabled={!selectedTemplateId} onClick={() => void loadTemplate()} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40">载入模板</button>
        </footer>
        : <footer className="flex justify-between border-t px-5 py-3">
          <button type="button" disabled={step === 0} onClick={() => setStep((value) => value - 1)} className="flex items-center rounded border px-3 py-2 text-sm disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" />上一步
          </button>
          {step < steps.length - 1
            ? <button type="button" disabled={!canNext} onClick={() => setStep((value) => value + 1)} className="flex items-center rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-40">
              下一步<ChevronRight className="h-4 w-4" />
            </button>
            : <button type="button" disabled={validation.errors.length > 0} onClick={() => onGenerate(createDrawingFromWizard(draft))} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40">确认生成</button>}
        </footer>}
    </div>
  </div>;
}

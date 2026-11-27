import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { LoginRequiredHint } from '@/components/auth/LoginRequiredHint';
import { DrawingComponentLibraryModal } from '@/components/drawings/standalone/DrawingComponentLibraryModal';
import { DrawingProcessNotesModal, type ProcessNotesTab } from '@/components/drawings/standalone/DrawingProcessNotesModal';
import { DrawingResourceSelect } from '@/components/drawings/standalone/DrawingResourceSelect';
import { DrawingWireBatchEditor } from '@/components/drawings/standalone/DrawingWireBatchEditor';
import { DrawingWizardPreview, type WizardSlotTarget } from '@/components/drawings/standalone/DrawingWizardPreview';
import { WIRE_COLORS } from '@/data/catalogOptions';
import { getCatalogWireColors } from '@/lib/catalogRuntime';
import { drawingCatalogRepository, filterDrawingCatalogResources } from '@/lib/drawingCatalogRepository';
import { serializeDrawingSvg } from '@/lib/drawingExport';
import { loadStaticDrawingTemplate } from '@/lib/drawingStaticResources';
import {
  applyDrawingWireBatch,
  countDrawingMaterialKinds,
  createDrawingFromWizard,
  getDrawingWireColorHex,
  getDrawingWireColorName,
  validateStandaloneDrawingWizard,
} from '@/lib/drawingGenerator';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import { useCatalogStore } from '@/stores/catalogStore';
import type {
  DrawingCatalogFilters,
  DrawingCatalogResource,
  DrawingCommonPhrase,
  DrawingConnectorResource,
  DrawingDocument,
  DrawingExternalTailStyle,
  DrawingInternalWireStyle,
  DrawingTemplateSummary,
  DrawingWizardDraft,
} from '@/types/drawing';

interface StandaloneDrawingWizardProps {
  open: boolean;
  canUseCatalog?: boolean;
  onClose: () => void;
  onGenerate: (drawing: DrawingDocument) => void;
  onLoadTemplate?: (drawing: DrawingDocument) => void;
}

type WizardTab = 'internal' | 'external' | 'library';

const inputClass = 'w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none transition focus:border-blue-500';
const defaultLengthMm = 320;

const exampleConnector: DrawingConnectorResource = {
  id: 'builtin:four-pin',
  name: '示例 4 针连接器',
  gender: 'receptacle',
  pinCount: 4,
  category: '示例',
  series: '',
  rowCount: 1,
  scope: 'builtin',
};

const exampleCable: DrawingCatalogResource = {
  id: 'builtin:four-core',
  resourceItemId: 'builtin:four-core',
  resourceType: 'wire',
  name: '示例 4 芯护套线',
  model: '',
  resourceGroup: '示例',
  wireKind: 'jacketed',
  coreColors: ['棕色', '白色', '蓝色', '黑色'],
};

function connectorFromResource(resource: DrawingCatalogResource): DrawingConnectorResource {
  return {
    id: resource.id,
    name: resource.name,
    model: resource.model,
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

function resizeWiresForCount(
  draft: DrawingWizardDraft,
  targetCount: number,
  wireColors: Array<{ hex: string }>,
) {
  const count = Math.min(40, Math.max(1, targetCount));
  return Array.from({ length: count }, (_, index) => {
    if (draft.wires[index]) return draft.wires[index];
    const wire = defaultWire(index, draft.totalLengthMm || defaultLengthMm, wireColors);
    const coreColor = draft.wireResource?.coreColors?.[index];
    return coreColor ? { ...wire, color: getDrawingWireColorName(coreColor) } : wire;
  });
}

function withWireResource(
  draft: DrawingWizardDraft,
  wireResource: DrawingCatalogResource | undefined,
): DrawingWizardDraft {
  const coreColors = wireResource?.coreColors;
  return {
    ...draft,
    wireResource,
    cableCutLengthMm: wireResource === exampleCable ? defaultLengthMm : draft.cableCutLengthMm,
    shieldTermination: undefined,
    wires: coreColors?.length
      ? draft.wires.map((wire, index) => ({
          ...wire,
          color: coreColors[index] ? getDrawingWireColorName(coreColors[index]) : wire.color,
        }))
      : draft.wires.map((wire) => ({
          ...wire,
          color: getDrawingWireColorHex(wire.color) ?? '#111827',
        })),
  };
}

function initialDraft(wireColors: Array<{ hex: string }>): DrawingWizardDraft {
  const base: DrawingWizardDraft = {
    endpointForm: 'double-end',
    wizardMode: 'internal',
    internalWireStyle: 'normal',
    externalTailStyle: 'double-connector',
    leftConnector: exampleConnector,
    rightConnector: exampleConnector,
    singleConnector: exampleConnector,
    leftConnectorCount: 1,
    rightConnectorCount: 1,
    tailCount: 1,
    tailCoreCount: 4,
    tinningLengthMm: 0,
    tinningToleranceMm: 0,
    halfStrip: false,
    hasTopView: false,
    ferriteCount: 0,
    ferriteResources: [],
    hasTailClamp: false,
    hasProtectiveSleeve: false,
    mainWireWidthPx: 14,
    tailWireSpacingPx: 20,
    tailWireWidthPx: 8,
    includeWiringTable: true,
    processNotes: [],
    drawingNo: '',
    totalLengthMm: defaultLengthMm,
    toleranceMm: 5,
    hasMold: false,
    wires: [],
  };
  const withWire = withWireResource(base, exampleCable);
  return { ...withWire, wires: resizeWiresForCount(withWire, 4, wireColors) };
}

function resourceSummary(resource: DrawingCatalogResource | undefined) {
  if (!resource) return '未选择';
  const specification = resource.specification?.split(' · ').filter((part) => part !== resource.model);
  return [resource.name, resource.name.includes(resource.model) ? '' : resource.model, ...(specification ?? [])]
    .filter(Boolean)
    .join(' · ');
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span className="h-3.5 w-1 rounded-full bg-blue-500" />
      <h3 className="text-xs font-semibold text-slate-800">{title}</h3>
    </div>
  );
}

function SegmentedButtons<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<readonly [T, string]>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
      {options.map(([optionValue, label]) => {
        const active = value === optionValue;
        return (
          <button
            key={String(optionValue)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(optionValue)}
            className={`min-w-9 rounded px-2.5 py-1 text-xs font-medium transition ${
              active
                ? 'bg-blue-500 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function TailStyleThumbnail({ style }: { style: DrawingExternalTailStyle }) {
  if (style === 'double-connector') {
    return (
      <svg viewBox="0 0 88 28" className="h-7 w-20 shrink-0 rounded bg-slate-100" aria-hidden="true">
        <rect x="4" y="10" width="52" height="8" rx="1" fill="#1e293b" />
        <rect x="56" y="8" width="14" height="12" rx="1.5" fill="#64748b" />
        <rect x="70" y="10" width="12" height="8" rx="1" fill="#cbd5e1" stroke="#475569" strokeWidth="1" />
      </svg>
    );
  }
  if (style === 'single-tinned') {
    return (
      <svg viewBox="0 0 88 28" className="h-7 w-20 shrink-0 rounded bg-slate-100" aria-hidden="true">
        <rect x="4" y="10" width="32" height="8" rx="1" fill="#475569" />
        <line x1="36" y1="12" x2="72" y2="7" stroke="#dc2626" strokeWidth="2" />
        <line x1="36" y1="14" x2="72" y2="14" stroke="#16a34a" strokeWidth="2" />
        <line x1="36" y1="16" x2="72" y2="21" stroke="#111827" strokeWidth="2" />
        <rect x="72" y="6" width="8" height="2" fill="#94a3b8" />
        <rect x="72" y="13" width="8" height="2" fill="#94a3b8" />
        <rect x="72" y="20" width="8" height="2" fill="#94a3b8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 88 28" className="h-7 w-20 shrink-0 rounded bg-slate-100" aria-hidden="true">
      <rect x="4" y="10" width="30" height="8" rx="1" fill="#1e293b" />
      <line x1="34" y1="12" x2="62" y2="8" stroke="#dc2626" strokeWidth="1.8" />
      <line x1="34" y1="14" x2="62" y2="14" stroke="#16a34a" strokeWidth="1.8" />
      <line x1="34" y1="16" x2="62" y2="20" stroke="#111827" strokeWidth="1.8" />
      <rect x="62" y="5" width="18" height="18" rx="1.5" fill="#f8fafc" stroke="#475569" strokeWidth="1.2" />
    </svg>
  );
}

export function StandaloneDrawingWizard({ open, ...props }: StandaloneDrawingWizardProps) {
  return open ? <DrawingWizardSession key={String(Boolean(props.canUseCatalog))} {...props} /> : null;
}

function DrawingWizardSession({
  canUseCatalog = false,
  onClose,
  onGenerate,
  onLoadTemplate,
}: Omit<StandaloneDrawingWizardProps, 'open'>) {
  const wireColors = useCatalogStore((state) => getCatalogWireColors(state.snapshot));
  const [tab, setTab] = useState<WizardTab>('internal');
  const [draft, setDraft] = useState<DrawingWizardDraft>(() => initialDraft(wireColors));
  const [resources, setResources] = useState<DrawingCatalogResource[]>([]);
  const [templates, setTemplates] = useState<DrawingTemplateSummary[]>([]);
  const [phrases, setPhrases] = useState<DrawingCommonPhrase[]>([]);
  const [filters, setFilters] = useState<DrawingCatalogFilters>({ resourceType: 'connector' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [catalogRequest, setCatalogRequest] = useState<{ sleeveId?: string }>({});

  // Slot / terminal resource picker modal
  const [activeSlot, setActiveSlot] = useState<WizardSlotTarget | null>(null);
  // Process / tech / phrases modal (Images 6 & 7)
  const [notesModalTab, setNotesModalTab] = useState<ProcessNotesTab | null>(null);
  // Packaging graphic modal (Image 8)
  const [packagingModalOpen, setPackagingModalOpen] = useState(false);
  // Wiring diagram modal
  const [wiringModalOpen, setWiringModalOpen] = useState(false);

  // Wire detail checkboxes
  const [selectedWirePins, setSelectedWirePins] = useState<number[]>([]);

  // Library (图库) search & pagination (Image 4)
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryCategory, setLibraryCategory] = useState('');
  const [appliedLibraryQuery, setAppliedLibraryQuery] = useState('');
  const [appliedLibraryCategory, setAppliedLibraryCategory] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryPageSize, setLibraryPageSize] = useState(5);
  const [jumpPageInput, setJumpPageInput] = useState('1');

  const retryResources = () => {
    setLoading(true);
    setError('');
    setCatalogRequest({ sleeveId: draft.protectiveSleeveResource?.resourceItemId });
  };

  useEffect(() => {
    let active = true;
    const { sleeveId } = catalogRequest;
    void Promise.all([
      drawingCatalogRepository.listTemplates(),
      drawingCatalogRepository.listCommonPhrases(),
    ]).then(async ([gallery, loadedPhrases]) => {
      if (!active) return;
      setTemplates(gallery);
      setPhrases(loadedPhrases);
      if (!canUseCatalog) return;

      const catalog = await drawingCatalogRepository.listResources({});
      if (!active) return;
      setResources(catalog);
      if (sleeveId && !catalog.some((resource) => resource.resourceType === 'protective_sleeve' && resource.resourceItemId === sleeveId)) {
        setDraft((current) => current.protectiveSleeveResource?.resourceItemId === sleeveId
          ? { ...current, protectiveSleeveResource: undefined }
          : current);
      }
    }).catch((reason: unknown) => {
      if (!active) return;
      console.error('公共资源加载失败:', reason);
      setError(getUserErrorMessage(reason, '公共资源加载失败，请重试。'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [canUseCatalog, catalogRequest]);

  const wireResources = useMemo(
    () => resources.filter((resource) => resource.resourceType === 'wire'),
    [resources],
  );
  const moldResources = useMemo(
    () => resources.filter((resource) => resource.resourceType === 'model'),
    [resources],
  );
  const filteredCatalog = useMemo(
    () => filterDrawingCatalogResources(resources, filters),
    [filters, resources],
  );

  const hasCustomLeftConnector = Boolean(draft.leftConnector && draft.leftConnector.id !== exampleConnector.id);
  const hasCustomRightConnector = Boolean(draft.rightConnector && draft.rightConnector.id !== exampleConnector.id);

  const switchModeTab = (nextTab: WizardTab) => {
    setTab(nextTab);
    setError('');
    if (nextTab === 'internal') {
      setDraft((current) => ({ ...current, wizardMode: 'internal' }));
    } else if (nextTab === 'external') {
      setDraft((current) => {
        const tailStyle = current.externalTailStyle ?? 'double-connector';
        return {
          ...current,
          wizardMode: 'external',
          endpointForm: tailStyle === 'single-tinned' ? 'single-end' : 'double-end',
        };
      });
    }
  };

  const selectExternalTailStyle = (tailStyle: DrawingExternalTailStyle) => {
    setDraft((current) => {
      const next: DrawingWizardDraft = {
        ...current,
        wizardMode: 'external',
        externalTailStyle: tailStyle,
        endpointForm: tailStyle === 'single-tinned' ? 'single-end' : 'double-end',
        mainWireWidthPx: tailStyle === 'double-connector' ? (current.mainWireWidthPx ?? 14) : 15,
      };
      return next;
    });
  };

  const selectWireResource = (resourceItemId: string) => {
    const resource = resourceItemId === exampleCable.resourceItemId
      ? exampleCable
      : wireResources.find((item) => item.resourceItemId === resourceItemId);
    setDraft((current) => {
      const next = withWireResource(current, resource);
      return { ...next, wires: resizeWiresForCount(next, next.wires.length || 4, wireColors) };
    });
  };

  const handleSelectSlotResource = (resource: DrawingCatalogResource) => {
    if (!activeSlot) return;
    setDraft((current) => {
      if (activeSlot.kind === 'left-connector') {
        const connector = connectorFromResource(resource);
        const next: DrawingWizardDraft = {
          ...current,
          leftConnector: connector,
          singleConnector: connector,
          modelResource: resource.resourceType === 'model' ? resource : current.modelResource,
        };
        return { ...next, wires: resizeWiresForCount(next, connector.pinCount, wireColors) };
      }
      if (activeSlot.kind === 'right-connector') {
        const connector = connectorFromResource(resource);
        const targetPinCount = current.wizardMode === 'internal' && current.leftConnector && current.leftConnector.id !== exampleConnector.id
          ? Math.min(current.leftConnector.pinCount, connector.pinCount)
          : connector.pinCount;
        const next: DrawingWizardDraft = {
          ...current,
          rightConnector: connector,
          modelResource: resource.resourceType === 'model' ? resource : current.modelResource,
        };
        return { ...next, wires: resizeWiresForCount(next, targetPinCount, wireColors) };
      }
      if (activeSlot.kind === 'ferrite') {
        const list = [...(current.ferriteResources ?? [])];
        list[activeSlot.index] = resource;
        return { ...current, ferriteResources: list };
      }
      return { ...current, tailClampResource: resource };
    });
    setActiveSlot(null);
  };

  const openSlotPicker = (slot: WizardSlotTarget) => {
    setFilters({
      resourceType: slot.kind === 'ferrite' || slot.kind === 'tail-clamp' ? 'accessory' : 'connector',
    });
    setActiveSlot(slot);
  };

  const validation = validateStandaloneDrawingWizard(draft);
  const materialKindCount = draft.materialKindCountOverride ?? countDrawingMaterialKinds(draft);

  const handleGenerate = () => {
    if (validation.errors.length > 0) {
      setError(validation.errors[0]);
      return;
    }
    const generated = createDrawingFromWizard(draft);
    onGenerate(generated);
  };

  const handleLoadTemplate = async () => {
    if (!selectedTemplateId) return;
    try {
      (onLoadTemplate ?? onGenerate)(await drawingCatalogRepository.loadTemplate(selectedTemplateId));
    } catch (reason) {
      console.error('图库模板加载失败:', reason);
      setError(getUserErrorMessage(reason, '图库模板加载失败，请重试。'));
    }
  };

  // Library filtering + SVG thumbnail previews
  const templateCategories = useMemo(
    () => [...new Set(templates.map((item) => item.category).filter(Boolean))],
    [templates],
  );
  const filteredTemplates = useMemo(() => {
    const q = appliedLibraryQuery.trim().toLocaleLowerCase();
    return templates.filter((item) => {
      if (appliedLibraryCategory && item.category !== appliedLibraryCategory) return false;
      if (!q) return true;
      return `${item.name} ${item.category} ${item.description}`.toLocaleLowerCase().includes(q);
    });
  }, [appliedLibraryCategory, appliedLibraryQuery, templates]);

  const totalLibraryPages = Math.max(1, Math.ceil(filteredTemplates.length / libraryPageSize));
  const safeLibraryPage = Math.min(libraryPage, totalLibraryPages);
  const pagedTemplates = filteredTemplates.slice(
    (safeLibraryPage - 1) * libraryPageSize,
    safeLibraryPage * libraryPageSize,
  );

  const coreColorOptions = useMemo(() => {
    const fromWire = [...new Set(draft.wireResource?.coreColors?.map(getDrawingWireColorName))];
    return fromWire.length > 0 ? fromWire : WIRE_COLORS.map((item) => item.name);
  }, [draft.wireResource]);

  const allWirePinsSelected = draft.wires.length > 0 && draft.wires.every((w) => selectedWirePins.includes(w.pin));
  const toggleAllWirePins = () => {
    setSelectedWirePins(allWirePinsSelected ? [] : draft.wires.map((w) => w.pin));
  };
  const toggleWirePin = (pin: number) => {
    setSelectedWirePins((current) => (
      current.includes(pin) ? current.filter((item) => item !== pin) : [...current, pin]
    ));
  };

  const applyBatchToSelectedWires = (batch: Parameters<typeof applyDrawingWireBatch>[1]) => {
    const targetPins = selectedWirePins.length > 0
      ? new Set(selectedWirePins)
      : new Set(draft.wires.map((w) => w.pin));
    const updatedAll = applyDrawingWireBatch(draft.wires, batch);
    setDraft((current) => ({
      ...current,
      wires: current.wires.map((wire, index) => (targetPins.has(wire.pin) ? updatedAll[index] : wire)),
    }));
  };

  const isExternal = tab === 'external';
  const tailStyle = draft.externalTailStyle ?? 'double-connector';
  const showWireDetailCard = tab === 'internal' || (isExternal && tailStyle !== 'double-connector');
  const pinLockedByTerminal = tab === 'internal' && (hasCustomLeftConnector || hasCustomRightConnector);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 sm:p-5" role="dialog" aria-modal="true" aria-label="配置向导">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-slate-50 shadow-2xl">
        {/* Modal Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <h2 className="text-base font-medium text-slate-900">配置向导</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Top 3 Tabs: 内线 / 外线 / 图库 */}
        <nav className="flex shrink-0 gap-7 border-b border-slate-200 bg-white px-6" aria-label="向导模式">
          {([
            ['internal', '内线'],
            ['external', '外线'],
            ['library', '图库'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => switchModeTab(key)}
              className={`border-b-2 py-2.5 text-sm font-medium transition ${
                tab === key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Main Content Area */}
        <main className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab !== 'library' && !canUseCatalog && (
            <div className="mx-auto max-w-md py-12">
              <LoginRequiredHint message="登录后可使用配置向导新建图纸。" />
            </div>
          )}

          {tab !== 'library' && canUseCatalog && (
            <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
              {/* LEFT PARAMETER COLUMN */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                {tab === 'internal' ? (
                  <>
                    {/* 基本参数 */}
                    <section>
                      <SectionTitle title="基本参数" />
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-[78px_1fr] items-center gap-2">
                          <span className="text-right text-xs text-slate-600">线型</span>
                          <select
                            aria-label="线型"
                            value={draft.internalWireStyle ?? 'normal'}
                            onChange={(event) => setDraft({
                              ...draft,
                              internalWireStyle: event.target.value as DrawingInternalWireStyle,
                            })}
                            className={inputClass}
                          >
                            <option value="normal">普通线</option>
                            <option value="shielded">屏蔽线</option>
                            <option value="twisted">双绞线</option>
                            <option value="ribbon">排线</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-[78px_1fr] items-center gap-2">
                          <span className="text-right text-xs text-slate-600">线号</span>
                          <select
                            aria-label="线材规格"
                            value={draft.wireResource?.resourceItemId ?? ''}
                            onChange={(event) => selectWireResource(event.target.value)}
                            className={inputClass}
                          >
                            <option value={exampleCable.resourceItemId}>{exampleCable.name}</option>
                            {wireResources.map((resource) => (
                              <option key={resource.resourceItemId} value={resource.resourceItemId}>
                                {resourceSummary(resource)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-[78px_1fr] items-center gap-2">
                          <span className="text-right text-xs text-slate-600">总长度(mm)</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              aria-label="总长度(mm)"
                              type="number"
                              min={0}
                              step="any"
                              value={draft.totalLengthMm}
                              onChange={(event) => setDraft({ ...draft, totalLengthMm: Number(event.target.value) })}
                              className={inputClass}
                            />
                            <span className="text-xs text-slate-400">±</span>
                            <input
                              aria-label="长度公差(mm)"
                              type="number"
                              min={0}
                              step="any"
                              value={draft.toleranceMm}
                              onChange={(event) => setDraft({ ...draft, toleranceMm: Number(event.target.value) })}
                              className={`${inputClass} w-20`}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-[78px_1fr] items-start gap-2">
                          <span className="pt-1.5 text-right text-xs text-slate-600">裁线长度</span>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <input
                                aria-label="护套线下料长度 (mm)"
                                type="number"
                                min={0}
                                step="any"
                                value={draft.cableCutLengthMm ?? ''}
                                placeholder="0"
                                onChange={(event) => setDraft({
                                  ...draft,
                                  cableCutLengthMm: event.target.value === '' ? undefined : Number(event.target.value),
                                })}
                                className={inputClass}
                              />
                              <span className="shrink-0 text-xs text-slate-500">mm</span>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-400">物料表线长：有裁线长度时为裁线长度，否则为总长度</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-[78px_1fr] items-center gap-2">
                          <span className="text-right text-xs text-slate-600">PIN位数</span>
                          <div className="flex items-center gap-2">
                            <input
                              aria-label="PIN位数"
                              type="number"
                              min={1}
                              max={40}
                              disabled={pinLockedByTerminal}
                              value={draft.wires.length}
                              onChange={(event) => {
                                const nextCount = Math.min(40, Math.max(1, Number(event.target.value) || 1));
                                setDraft((current) => ({
                                  ...current,
                                  wires: resizeWiresForCount(current, nextCount, wireColors),
                                }));
                              }}
                              className={`${inputClass} w-20 disabled:bg-slate-100`}
                            />
                            <span className="text-[11px] text-slate-400">有端子时由端子Pin数决定</span>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* 端子 */}
                    <section className="border-t border-slate-100 pt-3">
                      <SectionTitle title="端子" />
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                            <span>左端子</span>
                            {hasCustomLeftConnector && (
                              <button
                                type="button"
                                onClick={() => setDraft({ ...draft, leftConnector: exampleConnector })}
                                className="text-[11px] text-slate-400 hover:text-red-500"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => openSlotPicker({ kind: 'left-connector' })}
                            className="flex h-16 w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-2 text-center text-xs text-slate-500 transition hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-600"
                          >
                            {hasCustomLeftConnector ? (
                              <>
                                <span className="max-w-full truncate font-medium text-slate-800">{draft.leftConnector?.name}</span>
                                <span className="text-[10px] text-slate-400">{draft.leftConnector?.pinCount}PIN · 点击更换</span>
                              </>
                            ) : (
                              <>
                                <Plus className="mb-0.5 h-3.5 w-3.5" />
                                <span>点击选择</span>
                              </>
                            )}
                          </button>
                        </div>

                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                            <span>右端子</span>
                            {hasCustomRightConnector && (
                              <button
                                type="button"
                                onClick={() => setDraft({ ...draft, rightConnector: exampleConnector })}
                                className="text-[11px] text-slate-400 hover:text-red-500"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => openSlotPicker({ kind: 'right-connector' })}
                            className="flex h-16 w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-2 text-center text-xs text-slate-500 transition hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-600"
                          >
                            {hasCustomRightConnector ? (
                              <>
                                <span className="max-w-full truncate font-medium text-slate-800">{draft.rightConnector?.name}</span>
                                <span className="text-[10px] text-slate-400">{draft.rightConnector?.pinCount}PIN · 点击更换</span>
                              </>
                            ) : (
                              <>
                                <Plus className="mb-0.5 h-3.5 w-3.5" />
                                <span>点击选择</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </section>

                    {/* 端头工艺 */}
                    <section className="border-t border-slate-100 pt-3">
                      <SectionTitle title="端头工艺" />
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-[78px_1fr] items-center gap-2">
                          <span className="text-right text-xs text-slate-600">尾部上锡(mm)</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={draft.tinningLengthMm ?? 0}
                              onChange={(event) => setDraft({ ...draft, tinningLengthMm: Number(event.target.value) })}
                              className={inputClass}
                            />
                            <span className="text-xs text-slate-400">±</span>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={draft.tinningToleranceMm ?? 0}
                              onChange={(event) => setDraft({ ...draft, tinningToleranceMm: Number(event.target.value) })}
                              className={inputClass}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-[78px_1fr] items-center gap-2">
                          <span className="text-right text-xs text-slate-600">半剥</span>
                          <SegmentedButtons
                            value={draft.halfStrip ? 'yes' : 'no'}
                            options={[['no', '否'], ['yes', '是']] as const}
                            onChange={(val) => setDraft({ ...draft, halfStrip: val === 'yes' })}
                          />
                        </div>
                      </div>
                    </section>

                    {/* 其他 */}
                    <section className="border-t border-slate-100 pt-3">
                      <SectionTitle title="其他" />
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-[78px_1fr] items-center gap-2">
                          <span className="text-right text-xs text-slate-600">模具</span>
                          <select
                            aria-label="模具"
                            value={draft.hasMold ? (draft.modelResource?.resourceItemId ?? '__generic__') : ''}
                            onChange={(event) => {
                              const value = event.target.value;
                              if (!value) {
                                setDraft({ ...draft, hasMold: false, modelResource: undefined });
                              } else {
                                const modelResource = moldResources.find((item) => item.resourceItemId === value);
                                setDraft({ ...draft, hasMold: true, modelResource });
                              }
                            }}
                            className={inputClass}
                          >
                            <option value="">无</option>
                            <option value="__generic__">通用模具</option>
                            {moldResources.map((item) => (
                              <option key={item.resourceItemId} value={item.resourceItemId}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-[78px_1fr] items-center gap-2">
                          <span className="text-right text-xs text-slate-600">物料种类数量</span>
                          <div className="inline-flex w-full items-center overflow-hidden rounded-md border border-slate-200 bg-white">
                            <button
                              type="button"
                              aria-label="减少物料种类数量"
                              onClick={() => setDraft({ ...draft, materialKindCountOverride: Math.max(1, materialKindCount - 1) })}
                              className="flex h-7 w-8 items-center justify-center border-r border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                            >
                              -
                            </button>
                            <input
                              aria-label="物料种类"
                              readOnly
                              value={materialKindCount}
                              className="h-7 min-w-0 flex-1 text-center text-xs text-slate-800 outline-none"
                            />
                            <button
                              type="button"
                              aria-label="增加物料种类数量"
                              onClick={() => setDraft({ ...draft, materialKindCountOverride: materialKindCount + 1 })}
                              className="flex h-7 w-8 items-center justify-center border-l border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    </section>
                  </>
                ) : (
                  /* EXTERNAL TAB LEFT COLUMN (Images 3, 5, 6) */
                  <>
                    {/* 尾部样式 */}
                    <section>
                      <SectionTitle title="尾部样式" />
                      <div className="space-y-2">
                        {([
                          ['double-connector', '双头连接器', '两头都是连接器，不露线'],
                          ['single-tinned', '单头尾部上锡', '线芯裸露，末端上锡'],
                          ['single-crimped', '单头尾部打端', '线尾压接连接器'],
                        ] as const).map(([value, label, description]) => {
                          const active = tailStyle === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={active}
                              onClick={() => selectExternalTailStyle(value)}
                              className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition ${
                                active
                                  ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500'
                                  : 'border-slate-200 bg-white hover:border-blue-300'
                              }`}
                            >
                              <TailStyleThumbnail style={value} />
                              <div className="min-w-0">
                                <div className={`text-xs font-semibold ${active ? 'text-blue-600' : 'text-slate-800'}`}>
                                  {label}
                                </div>
                                <div className="text-[11px] text-slate-400">{description}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    {/* 基本参数 */}
                    <section className="border-t border-slate-100 pt-3">
                      <SectionTitle title="基本参数" />
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-[72px_1fr] items-center gap-2">
                          <span className="text-right text-xs text-slate-600">线号</span>
                          <div>
                            <select
                              aria-label="线材规格"
                              value={draft.wireResource?.resourceItemId ?? ''}
                              onChange={(event) => selectWireResource(event.target.value)}
                              className={inputClass}
                            >
                              <option value={exampleCable.resourceItemId}>线号(可输入，也可从下拉选择) · {exampleCable.name}</option>
                              {wireResources.map((resource) => (
                                <option key={resource.resourceItemId} value={resource.resourceItemId}>
                                  {resourceSummary(resource)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-[72px_1fr] items-center gap-2">
                          <span className="text-right text-xs text-slate-600">总线长(mm)</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              aria-label="总线长(mm)"
                              type="number"
                              min={0}
                              step="any"
                              value={draft.totalLengthMm}
                              onChange={(event) => setDraft({ ...draft, totalLengthMm: Number(event.target.value) })}
                              className={inputClass}
                            />
                            <span className="text-xs text-slate-400">±</span>
                            <input
                              aria-label="公差(mm)"
                              type="number"
                              min={0}
                              step="any"
                              value={draft.toleranceMm}
                              onChange={(event) => setDraft({ ...draft, toleranceMm: Number(event.target.value) })}
                              className={`${inputClass} w-20`}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-[72px_1fr] items-start gap-2">
                          <span className="pt-1.5 text-right text-xs text-slate-600">裁线长度</span>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <input
                                aria-label="护套线下料长度 (mm)"
                                type="number"
                                min={0}
                                step="any"
                                value={draft.cableCutLengthMm ?? ''}
                                placeholder="0"
                                onChange={(event) => setDraft({
                                  ...draft,
                                  cableCutLengthMm: event.target.value === '' ? undefined : Number(event.target.value),
                                })}
                                className={inputClass}
                              />
                              <span className="shrink-0 text-xs text-slate-500">mm</span>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-400">物料表线长：有裁线长度时为裁线长度，否则为总长度</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-[72px_1fr] items-start gap-2">
                          <span className="pt-1.5 text-right text-xs text-slate-600">主线线宽</span>
                          <div>
                            <input
                              type="number"
                              min={4}
                              max={32}
                              value={draft.mainWireWidthPx ?? 14}
                              onChange={(event) => setDraft({ ...draft, mainWireWidthPx: Number(event.target.value) || 14 })}
                              className={inputClass}
                            />
                            <p className="mt-1 text-[11px] text-slate-400">
                              当前 {draft.mainWireWidthPx ?? 14}px(调这个数 = 主线的粗细)
                            </p>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* 结构(只定数量) */}
                    <section className="border-t border-slate-100 pt-3">
                      <SectionTitle title="结构(只定数量)" />
                      <div className="space-y-2.5">
                        {tailStyle === 'double-connector' && (
                          <div className="grid grid-cols-[84px_1fr] items-center gap-2">
                            <span className="text-right text-xs text-slate-600">左边连接器数</span>
                            <div className="flex items-center gap-2">
                              <SegmentedButtons
                                value={draft.leftConnectorCount ?? 1}
                                options={[[1, '1'], [2, '2'], [3, '3'], [4, '4']] as const}
                                onChange={(count) => setDraft({ ...draft, leftConnectorCount: count })}
                              />
                              <span className="text-[11px] text-slate-400">多对多</span>
                            </div>
                          </div>
                        )}

                        {tailStyle !== 'single-tinned' && (
                          <div className="grid grid-cols-[84px_1fr] items-center gap-2">
                            <span className="text-right text-xs text-slate-600">右边连接器数</span>
                            <div className="flex items-center gap-2">
                              <SegmentedButtons
                                value={draft.rightConnectorCount ?? 1}
                                options={[[1, '1'], [2, '2'], [3, '3'], [4, '4']] as const}
                                onChange={(count) => setDraft({ ...draft, rightConnectorCount: count })}
                              />
                              <span className="text-[11px] text-slate-400">
                                {tailStyle === 'double-connector' ? '右侧连接器' : '每个连接器各带自己的线芯'}
                              </span>
                            </div>
                          </div>
                        )}

                        {tailStyle === 'single-tinned' && (
                          <>
                            <div className="grid grid-cols-[84px_1fr] items-center gap-2">
                              <span className="text-right text-xs text-slate-600">尾数</span>
                              <div className="flex items-center gap-2">
                                <SegmentedButtons
                                  value={draft.tailCount ?? 1}
                                  options={[[1, '1'], [2, '2'], [3, '3'], [4, '4']] as const}
                                  onChange={(count) => setDraft({ ...draft, tailCount: count })}
                                />
                                <span className="text-[11px] text-slate-400">右侧几个尾</span>
                              </div>
                            </div>

                            <div className="grid grid-cols-[84px_1fr] items-center gap-2">
                              <span className="text-right text-xs text-slate-600">线尾芯数</span>
                              <div className="flex items-center gap-2">
                                <div className="inline-flex items-center overflow-hidden rounded-md border border-slate-200">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextCount = Math.max(1, draft.wires.length - 1);
                                      setDraft({ ...draft, tailCoreCount: nextCount, wires: resizeWiresForCount(draft, nextCount, wireColors) });
                                    }}
                                    className="h-7 w-7 bg-slate-50 text-xs text-slate-600 hover:bg-slate-100"
                                  >
                                    -
                                  </button>
                                  <span className="w-9 text-center text-xs text-slate-800">{draft.wires.length}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextCount = Math.min(40, draft.wires.length + 1);
                                      setDraft({ ...draft, tailCoreCount: nextCount, wires: resizeWiresForCount(draft, nextCount, wireColors) });
                                    }}
                                    className="h-7 w-7 bg-slate-50 text-xs text-slate-600 hover:bg-slate-100"
                                  >
                                    +
                                  </button>
                                </div>
                                <span className="text-[11px] text-slate-400">每个尾都一样</span>
                              </div>
                            </div>

                            <div className="grid grid-cols-[84px_1fr] items-center gap-2">
                              <span className="text-right text-xs text-slate-600">半剥</span>
                              <div className="flex items-center gap-2">
                                <SegmentedButtons
                                  value={draft.halfStrip ? 'yes' : 'no'}
                                  options={[['no', '否'], ['yes', '是']] as const}
                                  onChange={(val) => setDraft({ ...draft, halfStrip: val === 'yes' })}
                                />
                                <span className="text-[11px] text-slate-400">锡头之后再露一段本色线芯</span>
                              </div>
                            </div>
                          </>
                        )}

                        <div className="grid grid-cols-[84px_1fr] items-start gap-2">
                          <span className="pt-1.5 text-right text-xs text-slate-600">连接器俯视图</span>
                          <div>
                            <SegmentedButtons
                              value={draft.hasTopView ? 'yes' : 'no'}
                              options={[['no', '无'], ['yes', '有']] as const}
                              onChange={(val) => setDraft({ ...draft, hasTopView: val === 'yes' })}
                            />
                            <p className="mt-1 text-[11px] text-slate-400">连接器旁边加画一张俯视图(不计入线长)</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-[84px_1fr] items-center gap-2">
                          <span className="text-right text-xs text-slate-600">磁环数</span>
                          <SegmentedButtons
                            value={draft.ferriteCount ?? 0}
                            options={[[0, '0'], [1, '1'], [2, '2']] as const}
                            onChange={(count) => setDraft({ ...draft, ferriteCount: count })}
                          />
                        </div>

                        {tailStyle !== 'double-connector' && (
                          <>
                            <div className="grid grid-cols-[84px_1fr] items-start gap-2">
                              <span className="pt-1.5 text-right text-xs text-slate-600">线尾卡位</span>
                              <div>
                                <SegmentedButtons
                                  value={draft.hasTailClamp ? 'yes' : 'no'}
                                  options={[['no', '无'], ['yes', '有']] as const}
                                  onChange={(val) => setDraft({
                                    ...draft,
                                    hasTailClamp: val === 'yes',
                                    hasProtectiveSleeve: val === 'yes' ? false : draft.hasProtectiveSleeve,
                                  })}
                                />
                                <p className="mt-1 text-[11px] text-slate-400">贴在线尾(裸线芯)的根部；与热缩套管二选一</p>
                              </div>
                            </div>

                            <div className="grid grid-cols-[84px_1fr] items-start gap-2">
                              <span className="pt-1.5 text-right text-xs text-slate-600">热缩套管</span>
                              <div>
                                <SegmentedButtons
                                  value={draft.hasProtectiveSleeve ? 'yes' : 'no'}
                                  options={[['no', '无'], ['yes', '有']] as const}
                                  onChange={(val) => setDraft({
                                    ...draft,
                                    hasProtectiveSleeve: val === 'yes',
                                    hasTailClamp: val === 'yes' ? false : draft.hasTailClamp,
                                  })}
                                />
                                <p className="mt-1 text-[11px] text-slate-400">套在线尾根部、只露出约 5px(不改变线长)；与线尾卡位二选一</p>
                              </div>
                            </div>
                          </>
                        )}

                        <p className="pt-1 text-[11px] leading-relaxed text-slate-400">
                          磁环/卡位已带默认图型。要换型号请直接点右侧预览图里的{' '}
                          <span className="font-medium text-blue-600">蓝色虚线框</span> (框右上角有「点击更换」标签)。
                        </p>
                      </div>
                    </section>
                  </>
                )}
              </div>

              {/* RIGHT PREVIEW + WIRE TABLE COLUMN */}
              <div className="flex min-w-0 flex-col gap-3">
                <DrawingWizardPreview
                  mode={tab === 'external' ? 'external' : 'internal'}
                  draft={draft}
                  hasCustomLeftConnector={hasCustomLeftConnector}
                  hasCustomRightConnector={hasCustomRightConnector}
                  onSelectSlot={openSlotPicker}
                  onChangeTailSpacing={(tailWireSpacingPx) => setDraft({ ...draft, tailWireSpacingPx })}
                  onChangeTailWidth={(tailWireWidthPx) => setDraft({ ...draft, tailWireWidthPx })}
                />

                {showWireDetailCard && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="h-3.5 w-1 rounded-full bg-blue-500" />
                        <h4 className="text-xs font-semibold text-slate-800">
                          {tab === 'internal'
                            ? '线材明细'
                            : tailStyle === 'single-tinned'
                              ? '线尾 线材明细'
                              : '连接器1 线材明细'}
                        </h4>
                        <span className="text-[11px] text-slate-400">
                          共 {draft.wires.length} 根 · 勾选多行可批量改
                        </span>
                      </div>

                      {selectedWirePins.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => applyBatchToSelectedWires({ connection: 'straight' })}
                            className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-blue-50 hover:text-blue-600"
                          >
                            顺序接线
                          </button>
                          <button
                            type="button"
                            onClick={() => applyBatchToSelectedWires({ connection: 'reverse' })}
                            className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-blue-50 hover:text-blue-600"
                          >
                            反序接线
                          </button>
                          <button
                            type="button"
                            onClick={() => applyBatchToSelectedWires({ wireNoPrefix: 'W-', startNumber: 1 })}
                            className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-blue-50 hover:text-blue-600"
                          >
                            递增线号
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-slate-100">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="w-8 px-2.5 py-2 text-left">
                              <input
                                type="checkbox"
                                aria-label="全选线材"
                                checked={allWirePinsSelected}
                                onChange={toggleAllWirePins}
                              />
                            </th>
                            <th className="w-10 px-2 py-2 text-left font-medium">#</th>
                            <th className="w-28 px-2 py-2 text-left font-medium">颜色</th>
                            <th className="w-28 px-2 py-2 text-left font-medium">长度</th>
                            <th className="px-2 py-2 text-left font-medium">线号</th>
                            <th className="w-24 px-2 py-2 text-left font-medium">接线</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {draft.wires.map((wire, index) => {
                            const hex = getDrawingWireColorHex(wire.color) ?? '#111827';
                            const colorName = getDrawingWireColorName(wire.color);
                            return (
                              <tr key={wire.pin} className="hover:bg-slate-50/70">
                                <td className="px-2.5 py-1.5">
                                  <input
                                    type="checkbox"
                                    aria-label={`选择第 ${wire.pin} 根线材`}
                                    checked={selectedWirePins.includes(wire.pin)}
                                    onChange={() => toggleWirePin(wire.pin)}
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 text-[11px] font-medium text-blue-600">
                                    {wire.pin}
                                  </span>
                                </td>
                                <td className="px-2 py-1.5">
                                  <div className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-1.5 py-1">
                                    <span className="h-2.5 w-2.5 shrink-0 rounded-xs border border-slate-300" style={{ backgroundColor: hex }} />
                                    <select
                                      aria-label={`PIN ${wire.pin} 芯色`}
                                      value={colorName}
                                      onChange={(event) => setDraft({
                                        ...draft,
                                        wires: draft.wires.map((item, idx) => idx === index ? { ...item, color: event.target.value } : item),
                                      })}
                                      className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none"
                                    >
                                      {!coreColorOptions.includes(colorName) && (
                                        <option value={colorName}>{colorName}</option>
                                      )}
                                      {coreColorOptions.map((color) => (
                                        <option key={color} value={color}>{color}</option>
                                      ))}
                                    </select>
                                  </div>
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    aria-label={`PIN ${wire.pin} 长度`}
                                    type="number"
                                    min={0.1}
                                    step="any"
                                    value={wire.lengthMm}
                                    onChange={(event) => setDraft({
                                      ...draft,
                                      wires: draft.wires.map((item, idx) => idx === index ? { ...item, lengthMm: Number(event.target.value) } : item),
                                    })}
                                    className="w-24 rounded border border-slate-200 px-2 py-1 text-center text-xs text-slate-700 outline-none focus:border-blue-500"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    aria-label={`PIN ${wire.pin} 线号`}
                                    value={wire.wireNo}
                                    placeholder="线号"
                                    onChange={(event) => setDraft({
                                      ...draft,
                                      wires: draft.wires.map((item, idx) => idx === index ? { ...item, wireNo: event.target.value } : item),
                                    })}
                                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-500"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <select
                                    aria-label={`PIN ${wire.pin} 接线`}
                                    value={wire.targetPin ?? wire.pin}
                                    onChange={(event) => setDraft({
                                      ...draft,
                                      wires: draft.wires.map((item, idx) => idx === index ? { ...item, targetPin: Number(event.target.value) } : item),
                                    })}
                                    className="w-16 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-500"
                                  >
                                    {Array.from({ length: Math.max(draft.rightConnector?.pinCount ?? draft.wires.length, draft.wires.length) }, (_, idx) => idx + 1).map((pin) => (
                                      <option key={pin} value={pin}>{pin}</option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* LIBRARY TAB (Image 4) */}
          {tab === 'library' && (
            <section className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <span>搜索</span>
                  <input
                    value={libraryQuery}
                    onChange={(event) => setLibraryQuery(event.target.value)}
                    placeholder="请输入"
                    className="w-48 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <span>行业与应用</span>
                  <select
                    value={libraryCategory}
                    onChange={(event) => setLibraryCategory(event.target.value)}
                    className="w-56 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
                  >
                    <option value="">请选择</option>
                    {templateCategories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setAppliedLibraryQuery(libraryQuery);
                    setAppliedLibraryCategory(libraryCategory);
                    setLibraryPage(1);
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-500 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
                >
                  <Search className="h-3.5 w-3.5" />搜索
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLibraryQuery('');
                    setLibraryCategory('');
                    setAppliedLibraryQuery('');
                    setAppliedLibraryCategory('');
                    setLibraryPage(1);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />重置
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-100">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="w-48 px-4 py-2.5 text-center font-medium">示例图</th>
                      <th className="w-44 px-4 py-2.5 text-center font-medium">行业与应用</th>
                      <th className="px-4 py-2.5 text-center font-medium">名称</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedTemplates.map((template) => (
                      <TemplateTableRow
                        key={template.id}
                        template={template}
                        selected={selectedTemplateId === template.id}
                        onSelect={() => setSelectedTemplateId(template.id)}
                      />
                    ))}
                    {!loading && pagedTemplates.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-12 text-center text-slate-400">暂无匹配图库模板。</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-end gap-3 text-xs text-slate-600">
                <span>共 {filteredTemplates.length} 条</span>
                <select
                  aria-label="每页条数"
                  value={libraryPageSize}
                  onChange={(event) => {
                    setLibraryPageSize(Number(event.target.value));
                    setLibraryPage(1);
                  }}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none"
                >
                  <option value={5}>5条/页</option>
                  <option value={10}>10条/页</option>
                  <option value={20}>20条/页</option>
                </select>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safeLibraryPage <= 1}
                    onClick={() => setLibraryPage((p) => Math.max(1, p - 1))}
                    className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 disabled:opacity-40"
                    aria-label="上一页"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  {Array.from({ length: totalLibraryPages }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setLibraryPage(pageNum)}
                      className={`h-7 min-w-7 rounded px-2 text-xs font-medium ${
                        pageNum === safeLibraryPage
                          ? 'bg-blue-500 text-white'
                          : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={safeLibraryPage >= totalLibraryPages}
                    onClick={() => setLibraryPage((p) => Math.min(totalLibraryPages, p + 1))}
                    className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 disabled:opacity-40"
                    aria-label="下一页"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <label className="flex items-center gap-1.5">
                  <span>前往</span>
                  <input
                    value={jumpPageInput}
                    onChange={(event) => setJumpPageInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        const target = Number(jumpPageInput);
                        if (Number.isFinite(target) && target >= 1) {
                          setLibraryPage(Math.min(totalLibraryPages, Math.floor(target)));
                        }
                      }
                    }}
                    className="w-12 rounded border border-slate-200 px-1.5 py-1 text-center text-xs outline-none focus:border-blue-500"
                  />
                  <span>页</span>
                </label>
              </div>
            </section>
          )}
        </main>

        {/* Bottom Footer */}
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-5 py-3">
          {tab !== 'library' && canUseCatalog ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setWiringModalOpen(true)}
                className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100"
              >
                接线图
              </button>
              <button
                type="button"
                onClick={() => setPackagingModalOpen(true)}
                className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-100"
              >
                包装方式
              </button>
              <button
                type="button"
                onClick={() => setNotesModalTab('process')}
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-100"
              >
                工艺说明
              </button>
              {draft.packagingGraphic && (
                <span className="text-[11px] text-emerald-600">包装：{draft.packagingGraphic.name}</span>
              )}
              {(draft.processNotes?.length ?? 0) > 0 && (
                <span className="text-[11px] text-slate-500">已附加 {draft.processNotes?.length} 项说明</span>
              )}
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2.5">
            {tab === 'library' ? (
              <>
                <button
                  type="button"
                  onClick={() => switchModeTab('internal')}
                  className="rounded-md border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  上一步
                </button>
                <button
                  type="button"
                  disabled={!selectedTemplateId}
                  onClick={() => void handleLoadTemplate()}
                  className="rounded-md bg-blue-500 px-5 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-45"
                >
                  确定
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  取消
                </button>
                {canUseCatalog && (
                  <button
                    type="button"
                    disabled={validation.errors.length > 0}
                    onClick={handleGenerate}
                    className="rounded-md bg-blue-500 px-5 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-45"
                  >
                    {tab === 'external' ? '绘制到画板' : '确定'}
                  </button>
                )}
              </>
            )}
          </div>
        </footer>
      </div>

      {/* Resource Picker Modal (for clicking slots or left/right terminals) */}
      {activeSlot && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="选择公共资源">
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-900">
                {activeSlot.kind === 'left-connector'
                  ? '选择左连接器/端子'
                  : activeSlot.kind === 'right-connector'
                    ? '选择右连接器/端子'
                    : activeSlot.kind === 'ferrite'
                      ? `选择磁环 ${activeSlot.index + 1}`
                      : '选择线尾卡位'}
              </h3>
              <button type="button" onClick={() => setActiveSlot(null)} aria-label="关闭资源选择">
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <DrawingResourceSelect
                title={activeSlot.kind === 'left-connector' ? '左连接器/模型' : '连接器/辅材目录'}
                resources={filteredCatalog}
                filters={filters}
                selectedId={
                  activeSlot.kind === 'left-connector'
                    ? draft.leftConnector?.id
                    : activeSlot.kind === 'right-connector'
                      ? draft.rightConnector?.id
                      : activeSlot.kind === 'ferrite'
                        ? draft.ferriteResources?.[activeSlot.index]?.id
                        : draft.tailClampResource?.id
                }
                loading={loading}
                error={error}
                onFiltersChange={setFilters}
                onSelect={handleSelectSlotResource}
                onRetry={retryResources}
              />
            </div>
          </div>
        </div>
      )}

      {/* Wiring Diagram Settings Modal */}
      {wiringModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="接线图设置">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-slate-900">接线图与批量接线</h3>
              <button type="button" onClick={() => setWiringModalOpen(false)} aria-label="关闭接线图设置">
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </header>
            <div className="space-y-3 overflow-y-auto p-5">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.includeWiringTable !== false}
                  onChange={(event) => setDraft({ ...draft, includeWiringTable: event.target.checked })}
                />
                绘制到画板时同时生成接线表
              </label>
              <DrawingWireBatchEditor
                allowColor={coreColorOptions.length === 0}
                onApply={(batch) => setDraft({ ...draft, wires: applyDrawingWireBatch(draft.wires, batch) })}
              />
              <div className="overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">P1 PIN</th>
                      <th className="px-3 py-2 text-left">颜色</th>
                      <th className="px-3 py-2 text-left">线号</th>
                      <th className="px-3 py-2 text-left">P2 PIN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {draft.wires.map((wire) => (
                      <tr key={wire.pin}>
                        <td className="px-3 py-1.5">{wire.pin}</td>
                        <td className="px-3 py-1.5">{getDrawingWireColorName(wire.color)}</td>
                        <td className="px-3 py-1.5">{wire.wireNo}</td>
                        <td className="px-3 py-1.5">{tailStyle === 'single-tinned' ? '自由端' : wire.targetPin}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <footer className="flex justify-end border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                onClick={() => setWiringModalOpen(false)}
                className="rounded-md bg-blue-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
              >
                完成
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Process Notes Modal (Images 6 & 7) */}
      {notesModalTab && (
        <DrawingProcessNotesModal
          initialTab={notesModalTab}
          selectedNotes={draft.processNotes ?? []}
          phrases={phrases}
          onClose={() => setNotesModalTab(null)}
          onConfirm={(notes) => {
            setDraft({ ...draft, processNotes: notes });
            setNotesModalTab(null);
          }}
        />
      )}

      {/* Packaging Modal (Image 8) */}
      {packagingModalOpen && (
        <DrawingComponentLibraryModal
          mode="packaging"
          initialSelectedId={draft.packagingGraphic?.id}
          onClose={() => setPackagingModalOpen(false)}
          onConfirm={(graphic) => {
            setDraft({ ...draft, packagingGraphic: { id: graphic.id, name: graphic.name } });
            setPackagingModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function TemplateTableRow({
  template,
  selected,
  onSelect,
}: {
  template: DrawingTemplateSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <tr
      onClick={onSelect}
      aria-selected={selected}
      className={`cursor-pointer transition ${
        selected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
      }`}
    >
      <td className="px-4 py-3 text-center">
        <button
          type="button"
          onClick={onSelect}
          aria-label={template.name}
          className={`inline-block overflow-hidden rounded border bg-white p-1 ${
            selected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200'
          }`}
        >
          <TemplatePreviewThumb templateId={template.id} name={template.name} />
        </button>
      </td>
      <td className="px-4 py-3 text-center text-slate-600">{template.category}</td>
      <td className="px-4 py-3 text-center text-slate-800">{template.name}</td>
    </tr>
  );
}

function TemplatePreviewThumb({ templateId, name }: { templateId: string; name: string }) {
  const src = useMemo(() => {
    const doc = loadStaticDrawingTemplate(templateId);
    if (!doc) return '';
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serializeDrawingSvg(doc))}`;
  }, [templateId]);

  if (!src) {
    return <div className="flex h-20 w-32 items-center justify-center bg-slate-50 text-[10px] text-slate-400">示例图</div>;
  }
  return <img src={src} alt={`${name} 示例图`} className="h-20 w-32 object-contain" />;
}

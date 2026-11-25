import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Cable,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { useUserStore } from '@/stores/userStore';
import { useHarnessStore } from '@/stores/harnessStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { getCatalogConnectors, getCatalogWires, requireCatalogSnapshot } from '@/lib/catalogRuntime';
import { generateId } from '@/lib/commands';
import {
  createDefaultWireEndTreatment,
  getConnectorHeight,
  getConnectorNodeWidth,
  getMaterialNodeHeight,
  lengthMmToCanvasWidth,
  resolveColor,
} from '@/lib/canvasMaterials';
import { syncConnectorLabels } from '@/lib/connectorDesignation';
import { syncTwoDImages } from '@/lib/autoAssociateTwoDImages';
import { DocumentWriteError } from '@/lib/documentWriteError';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import type { CatalogWire } from '@/types/catalog';
import type {
  CanvasWireMaterial,
  Connector,
  ConnectorInstance,
  HarnessConfig,
  MaterialCircuit,
} from '@/types/harness';

interface ProjectWizardProps {
  onComplete: () => void;
  onCancel: () => void;
}

type WizardStep = 1 | 2 | 3 | 4;

const MAX_PROJECT_NAME_LENGTH = 200;

const TEMPLATES = [
  {
    id: 'blank',
    name: '空白项目',
    description: '从零开始创建您的线束设计',
    icon: <Sparkles className="w-6 h-6" />,
  },
  {
    id: 'simple-2p',
    name: '简单双端线束',
    description: '两个连接器之间的点对点连接',
    icon: <Cable className="w-6 h-6" />,
  },
  {
    id: 't-branch',
    name: 'T型分支线束',
    description: '一个主节点分出两个分支',
    icon: <Layers className="w-6 h-6" />,
  },
  {
    id: 'star-4',
    name: '星型四端线束',
    description: '中心主节点扇出连接四个外围节点',
    icon: <Settings className="w-6 h-6" />,
  },
];

const CIRCUIT_COLORS = ['red', 'black', 'blue', 'green', 'yellow', 'white'];
const DEFAULT_WIRE_LENGTH_MM = 300;
const CANVAS_START_X = 80;
const CANVAS_START_Y = 80;
const WIRE_ROW_STEP = 34;
const T_BRANCH_GAP_Y = 80;
const STAR_BRANCH_GAP_Y = 64;

function estimateMergedPanelWidth(connectorCount: number): number {
  // Mirrors WireMaterialNode's panelWidth formula conservatively so expanded tables stay clear of connectors.
  return Math.max(300, 160 + connectorCount * 80 + 64 + 60);
}

function computeHorizontalLayout(leftConnectorWidth: number, wireWidth: number, connectorCount: number) {
  const panelWidth = estimateMergedPanelWidth(connectorCount);
  const gapWidth = Math.max(wireWidth + 180, panelWidth + 80);
  const leftX = CANVAS_START_X;
  const rightX = leftX + leftConnectorWidth + gapWidth;
  const wireX = leftX + leftConnectorWidth + Math.round((gapWidth - wireWidth) / 2);
  return { leftX, rightX, wireX };
}

function makeConnector(
  connectorId: string,
  position: { x: number; y: number },
  label: string,
  connectors: Connector[],
): ConnectorInstance {
  const conn = connectors.find((c) => c.id === connectorId);
  if (!conn) throw new Error(`Connector part not found: ${connectorId}`);
  return {
    id: generateId(),
    position,
    connector: { ...conn },
    label,
    jumpers: [],
  };
}

function findMatchingElectronicCatalogWire(
  catalogWires: CatalogWire[],
  color: string,
): CatalogWire | undefined {
  const targetColorName = resolveColor(color).name;
  const matchesColor = (wire: CatalogWire) =>
    wire.spec.kind === 'electronic'
    && (wire.spec.color === color || resolveColor(wire.spec.color).name === targetColorName);

  return (
    catalogWires.find((wire) => wire.spec.kind === 'electronic' && wire.spec.awg === 26 && matchesColor(wire))
    ?? catalogWires.find(matchesColor)
  );
}

function makeElectronicMaterial(
  name: string,
  position: { x: number; y: number },
  circuit: MaterialCircuit,
  catalogWires: CatalogWire[],
): CanvasWireMaterial {
  const matchingWire = findMatchingElectronicCatalogWire(catalogWires, circuit.color);
  const catalogSpec = matchingWire?.spec.kind === 'electronic' ? matchingWire.spec : undefined;
  const resolvedColor = catalogSpec ? catalogSpec.color : circuit.color;

  return {
    id: generateId(),
    ...(matchingWire ? { resourceItemId: matchingWire.resourceItemId } : {}),
    ...(matchingWire?.image ? { resourceImageUrl: matchingWire.image } : {}),
    name,
    position,
    width: lengthMmToCanvasWidth(DEFAULT_WIRE_LENGTH_MM),
    spec: {
      kind: 'electronic',
      color: resolvedColor,
      lengthMm: DEFAULT_WIRE_LENGTH_MM,
      awg: catalogSpec?.awg ?? 26,
      ulNumber: catalogSpec?.ulNumber ?? '1007',
      endTreatment: createDefaultWireEndTreatment(),
    },
    circuits: [{ ...circuit, color: resolvedColor }],
    expandedByDefault: true,
  };
}

function makeCircuit(
  startConnectorId: string,
  startSide: 'left' | 'right',
  startPin: number,
  endConnectorId: string,
  endSide: 'left' | 'right',
  endPin: number,
  color: string,
  signalName: string,
): MaterialCircuit {
  return {
    id: generateId(),
    start: { connectorId: startConnectorId, connectorSide: startSide, pin: startPin },
    end: { connectorId: endConnectorId, connectorSide: endSide, pin: endPin },
    color,
    signalName,
  };
}

function createConfigFromTemplate(
  templateId: string,
  projectName: string,
  connectorAId: string,
  connectorBId: string,
  pinCount: number,
  catalog?: { connectors: Connector[]; wires?: CatalogWire[] },
): HarnessConfig {
  const now = Date.now();
  const finalizeConfig = (config: HarnessConfig): HarnessConfig => {
    const labeled = syncConnectorLabels(config);
    return {
      ...labeled,
      twoDImages: syncTwoDImages(labeled),
    };
  };

  if (templateId === 'blank') {
    return finalizeConfig({
      schemaVersion: 3,
      id: generateId(),
      name: projectName,
      createdAt: now,
      updatedAt: now,
      connectors: [],
      materials: [],
      protectiveSleeves: [],
      models: [],
      quantity: 1,
      leadTime: 'standard',
    });
  }

  const snapshot = catalog ?? requireCatalogSnapshot();
  const catalogConnectors = snapshot.connectors;
  const catalogWires = snapshot.wires ?? [];
  const wireWidth = lengthMmToCanvasWidth(DEFAULT_WIRE_LENGTH_MM);
  const wireHeight = getMaterialNodeHeight('electronic');

  if (templateId === 'simple-2p') {
    const connA = makeConnector(connectorAId, { x: 0, y: 0 }, 'A端', catalogConnectors);
    const connB = makeConnector(connectorBId, { x: 0, y: 0 }, 'B端', catalogConnectors);
    const effectivePins = Math.max(1, Math.min(pinCount, connA.connector.pinCount, connB.connector.pinCount));

    const connAHeight = getConnectorHeight(connA);
    const connBHeight = getConnectorHeight(connB);
    const wiresHeight = (effectivePins - 1) * WIRE_ROW_STEP + wireHeight;
    const totalHeight = Math.max(connAHeight, connBHeight, wiresHeight);
    const { leftX, rightX, wireX } = computeHorizontalLayout(getConnectorNodeWidth(connA), wireWidth, 2);

    connA.position = { x: leftX, y: CANVAS_START_Y + Math.round((totalHeight - connAHeight) / 2) };
    connB.position = { x: rightX, y: CANVAS_START_Y + Math.round((totalHeight - connBHeight) / 2) };
    const wiresTop = CANVAS_START_Y + Math.round((totalHeight - wiresHeight) / 2);

    const materials: CanvasWireMaterial[] = [];
    for (let i = 1; i <= effectivePins; i++) {
      const color = CIRCUIT_COLORS[(i - 1) % CIRCUIT_COLORS.length];
      const circuit = makeCircuit(
        connA.id, 'right', i,
        connB.id, 'left', i,
        color,
        `SIG${i}`,
      );
      materials.push(
        makeElectronicMaterial(
          `主线材 ${i}`,
          { x: wireX, y: wiresTop + (i - 1) * WIRE_ROW_STEP },
          circuit,
          catalogWires,
        ),
      );
    }

    return finalizeConfig({
      schemaVersion: 3,
      id: generateId(),
      name: projectName,
      createdAt: now,
      updatedAt: now,
      connectors: [connA, connB],
      materials,
      protectiveSleeves: [],
      models: [],
      quantity: 1,
      leadTime: 'standard',
    });
  }

  if (templateId === 't-branch') {
    const connA = makeConnector(connectorAId, { x: 0, y: 0 }, '主端', catalogConnectors);
    const connB = makeConnector(connectorBId, { x: 0, y: 0 }, '分支B', catalogConnectors);
    const connC = makeConnector(connectorBId, { x: 0, y: 0 }, '分支C', catalogConnectors);
    const effectivePins = Math.max(1, Math.min(pinCount, connA.connector.pinCount, connB.connector.pinCount));

    const connAHeight = getConnectorHeight(connA);
    const branchHeight = getConnectorHeight(connB);
    const wiresHeight = (effectivePins - 1) * WIRE_ROW_STEP + wireHeight;
    const slotHeight = Math.max(branchHeight, wiresHeight);
    const branchesTotalHeight = slotHeight * 2 + T_BRANCH_GAP_Y;
    const totalHeight = Math.max(connAHeight, branchesTotalHeight);
    const { leftX, rightX, wireX } = computeHorizontalLayout(getConnectorNodeWidth(connA), wireWidth, 3);

    connA.position = { x: leftX, y: CANVAS_START_Y + Math.round((totalHeight - connAHeight) / 2) };
    const branchesTop = CANVAS_START_Y + Math.round((totalHeight - branchesTotalHeight) / 2);

    const branchEntries = [
      { connector: connB, prefix: 'A-B' },
      { connector: connC, prefix: 'A-C' },
    ];
    const materials: CanvasWireMaterial[] = [];

    branchEntries.forEach(({ connector, prefix }, branchIdx) => {
      const slotTop = branchesTop + branchIdx * (slotHeight + T_BRANCH_GAP_Y);
      connector.position = { x: rightX, y: slotTop + Math.round((slotHeight - branchHeight) / 2) };
      const branchWiresTop = slotTop + Math.round((slotHeight - wiresHeight) / 2);

      for (let i = 1; i <= effectivePins; i++) {
        const color = CIRCUIT_COLORS[(i - 1) % CIRCUIT_COLORS.length];
        const circuit = makeCircuit(
          connA.id, 'right', i,
          connector.id, 'left', i,
          color,
          `SIG${i}`,
        );
        materials.push(
          makeElectronicMaterial(
            `${prefix} #${i}`,
            { x: wireX, y: branchWiresTop + (i - 1) * WIRE_ROW_STEP },
            circuit,
            catalogWires,
          ),
        );
      }
    });

    return finalizeConfig({
      schemaVersion: 3,
      id: generateId(),
      name: projectName,
      createdAt: now,
      updatedAt: now,
      connectors: [connA, connB, connC],
      materials,
      protectiveSleeves: [],
      models: [],
      quantity: 1,
      leadTime: 'standard',
    });
  }

  // star-4: left center hub (P1) fanning out to 4 right branches (P2..P5)
  const center = makeConnector(connectorAId, { x: 0, y: 0 }, '中心', catalogConnectors);
  const arms = Array.from({ length: 4 }, (_, armIndex) =>
    makeConnector(connectorBId, { x: 0, y: 0 }, `${String.fromCharCode(65 + armIndex)}端`, catalogConnectors),
  );
  const effectivePins = Math.max(1, Math.min(pinCount, center.connector.pinCount, arms[0].connector.pinCount));

  const centerHeight = getConnectorHeight(center);
  const armHeight = getConnectorHeight(arms[0]);
  const wiresHeight = (effectivePins - 1) * WIRE_ROW_STEP + wireHeight;
  const slotHeight = Math.max(armHeight, wiresHeight);
  const armsTotalHeight = slotHeight * 4 + STAR_BRANCH_GAP_Y * 3;
  const totalHeight = Math.max(centerHeight, armsTotalHeight);
  const { leftX, rightX, wireX } = computeHorizontalLayout(getConnectorNodeWidth(center), wireWidth, 5);

  center.position = { x: leftX, y: CANVAS_START_Y + Math.round((totalHeight - centerHeight) / 2) };
  const armsTop = CANVAS_START_Y + Math.round((totalHeight - armsTotalHeight) / 2);
  const useDedicatedPins = center.connector.pinCount >= 4 * effectivePins;

  const materials: CanvasWireMaterial[] = [];
  arms.forEach((arm, armIndex) => {
    const slotTop = armsTop + armIndex * (slotHeight + STAR_BRANCH_GAP_Y);
    arm.position = { x: rightX, y: slotTop + Math.round((slotHeight - armHeight) / 2) };
    const armWiresTop = slotTop + Math.round((slotHeight - wiresHeight) / 2);

    for (let i = 1; i <= effectivePins; i++) {
      const centerPin = useDedicatedPins ? armIndex * effectivePins + i : i;
      const color = CIRCUIT_COLORS[(centerPin - 1) % CIRCUIT_COLORS.length];
      const circuit = makeCircuit(
        center.id, 'right', centerPin,
        arm.id, 'left', i,
        color,
        `SIG${centerPin}`,
      );
      materials.push(
        makeElectronicMaterial(
          `中心-${String.fromCharCode(65 + armIndex)} #${i}`,
          { x: wireX, y: armWiresTop + (i - 1) * WIRE_ROW_STEP },
          circuit,
          catalogWires,
        ),
      );
    }
  });

  return finalizeConfig({
    schemaVersion: 3,
    id: generateId(),
    name: projectName,
    createdAt: now,
    updatedAt: now,
    connectors: [center, ...arms],
    materials,
    protectiveSleeves: [],
    models: [],
    quantity: 1,
    leadTime: 'standard',
  });
}

function pickDefaultConnectorB(connectors: Connector[], connectorAId: string): string {
  const primary = connectors.find((c) => c.id === connectorAId);
  if (!primary) return connectors[0]?.id ?? '';
  const samePinDistinct = connectors.find((c) => c.id !== primary.id && c.pinCount === primary.pinCount);
  if (samePinDistinct) return samePinDistinct.id;
  const distinct = connectors.find((c) => c.id !== primary.id);
  return distinct?.id ?? primary.id;
}

function getTemplateConnectorLabels(templateId: string) {
  if (templateId === 't-branch') {
    return {
      primaryLabel: '主端连接器',
      secondaryLabel: '分支连接器（2 端）',
      pinLabel: (n: number) => `每路分支接线数: ${n}（共 ${n * 2} 条电子线）`,
      summaryPinLabel: '分支接线数',
      summaryPinValue: (n: number) => `每路 ${n} 条（共 ${n * 2} 条电子线）`,
    };
  }
  if (templateId === 'star-4') {
    return {
      primaryLabel: '中心主连接器',
      secondaryLabel: '外围分支连接器（4 端）',
      pinLabel: (n: number) => `每路分支接线数: ${n}（共 ${n * 4} 条电子线）`,
      summaryPinLabel: '分支接线数',
      summaryPinValue: (n: number) => `每路 ${n} 条（共 ${n * 4} 条电子线）`,
    };
  }
  return {
    primaryLabel: '起始连接器',
    secondaryLabel: '目标连接器',
    pinLabel: (n: number) => `接线数量 / PIN数: ${n}`,
    summaryPinLabel: '接线数量',
    summaryPinValue: (n: number) => `${n} 条电子线`,
  };
}

export function ProjectWizard({ onComplete, onCancel }: ProjectWizardProps) {
  const connectors = useCatalogStore((state) => getCatalogConnectors(state.snapshot));
  const wires = useCatalogStore((state) => getCatalogWires(state.snapshot));
  const catalogStatus = useCatalogStore((state) => state.status);
  const catalogError = useCatalogStore((state) => state.error);

  const [step, setStep] = useState<WizardStep>(1);
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [connectorA, setConnectorA] = useState('');
  const [connectorB, setConnectorB] = useState('');
  const [pinCount, setPinCount] = useState(2);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<{ message: string; uncertain: boolean } | null>(null);
  const submitting = useRef(false);

  const activeConnectorA = connectors.some((c) => c.id === connectorA)
    ? connectorA
    : (connectors[0]?.id ?? '');
  const activeConnectorB = connectors.some((c) => c.id === connectorB)
    ? connectorB
    : pickDefaultConnectorB(connectors, activeConnectorA);
  const selectedConnA = connectors.find((c) => c.id === activeConnectorA);
  const selectedConnB = connectors.find((c) => c.id === activeConnectorB);
  const maxSelectablePins = Math.max(1, Math.min(selectedConnA?.pinCount || 2, selectedConnB?.pinCount || 2));
  const effectivePinCount = Math.min(Math.max(1, pinCount), maxSelectablePins);
  const connectorLabels = getTemplateConnectorLabels(selectedTemplate);

  const { currentUser } = useUserStore();
  const { createProject } = useProjectStore();
  const { replaceDocument } = useHarnessStore();

  useEffect(() => {
    void useCatalogStore.getState().initialize().catch(() => {});
  }, []);

  const name = projectName.trim();
  const nameTooLong = [...name].length > MAX_PROJECT_NAME_LENGTH;
  const nameIsValid = name.length > 0 && !nameTooLong;
  const canNext = step === 1
    ? nameIsValid
    : step === 3 && selectedTemplate !== 'blank'
      ? Boolean(activeConnectorA && activeConnectorB && connectors.length > 0)
      : true;

  const handleComplete = async () => {
    if (!currentUser || !nameIsValid || submitting.current || createError?.uncertain) return;
    submitting.current = true;
    setCreating(true);
    setCreateError(null);

    let config: HarnessConfig | undefined;
    let created: Awaited<ReturnType<typeof createProject>>;
    try {
      config = createConfigFromTemplate(
        selectedTemplate,
        name,
        activeConnectorA,
        activeConnectorB,
        effectivePinCount,
        selectedTemplate === 'blank' ? undefined : { connectors, wires },
      );
      created = await createProject(currentUser.id, name, projectDesc, config);
    } catch (error) {
      const uncertain = error instanceof DocumentWriteError && error.code === 'network';
      setCreateError({
        uncertain,
        message: uncertain
          ? '暂时无法确认创建结果。请先返回项目列表核对，再决定是否重新创建。'
          : `创建失败。${error instanceof DocumentWriteError && error.code === 'invalid'
            ? error.message
            : getUserErrorMessage(error, '请检查项目信息后重试。')}`,
      });
      created = null;
    }

    if (!config || !created || useUserStore.getState().currentUser?.id !== created.project.userId) {
      submitting.current = false;
      setCreating(false);
      return;
    }
    replaceDocument({ ...config, id: created.project.id, name: created.project.name }, { markSaved: true });
    onComplete();
  };

  const closeWizard = () => {
    if (submitting.current) return;
    if (createError?.uncertain && currentUser) {
      void useProjectStore.getState().loadProjects(currentUser.id, { force: true });
    }
    onCancel();
  };

  const stepTitles = ['项目信息', '选择模板', '连接器配置', '确认创建'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[90vh] w-[600px] max-w-[95vw] flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-100 px-6 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">新建项目向导</h2>
            <button onClick={closeWizard} disabled={creating} className="cursor-pointer text-slate-400 hover:text-slate-600 disabled:opacity-50">
              ✕
            </button>
          </div>
          <div className="flex items-center gap-2">
            {([1, 2, 3, 4] as WizardStep[]).map((s) => (
              <div key={s} className="flex flex-1 items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                    s === step
                      ? 'bg-blue-600 text-white'
                      : s < step
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {s < step ? <Check className="h-4 w-4" /> : s}
                </div>
                <span
                  className={`hidden text-xs font-medium sm:block ${
                    s === step ? 'text-blue-600' : s < step ? 'text-blue-500' : 'text-slate-400'
                  }`}
                >
                  {stepTitles[s - 1]}
                </span>
                {s < 4 && <div className="mx-1 h-px flex-1 bg-slate-200" />}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  项目名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="如：无人机电源线束"
                  aria-describedby="project-name-limit"
                  aria-invalid={nameTooLong}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p id="project-name-limit" className={`mt-1 text-xs ${nameTooLong ? 'text-red-700' : 'text-slate-500'}`}>
                  {nameTooLong ? '项目名称过长，' : ''}最多 {MAX_PROJECT_NAME_LENGTH} 个字符。
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">项目描述</label>
                <textarea
                  value={projectDesc}
                  onChange={(e) => setProjectDesc(e.target.value)}
                  placeholder="简要描述项目用途..."
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 gap-3">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplate(t.id)}
                  className={`cursor-pointer rounded-xl border-2 p-4 text-left transition-all ${
                    selectedTemplate === t.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className={`mb-2 ${selectedTemplate === t.id ? 'text-blue-600' : 'text-slate-400'}`}>
                    {t.icon}
                  </div>
                  <div className="mb-1 text-sm font-semibold text-slate-800">{t.name}</div>
                  <div className="text-xs text-slate-500">{t.description}</div>
                </button>
              ))}
            </div>
          )}

          {step === 3 && selectedTemplate !== 'blank' && (
            <div className="space-y-4">
              {connectors.length === 0 && catalogStatus === 'loading' ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <Loader2 className="mb-3 h-8 w-8 animate-spin text-blue-600" />
                  <p className="text-sm">正在加载连接器物料库...</p>
                </div>
              ) : connectors.length === 0 && catalogStatus === 'error' ? (
                <div className="py-10 text-center text-slate-600">
                  <AlertCircle className="mx-auto mb-2 h-8 w-8 text-amber-500" />
                  <p className="text-sm">{catalogError || '物料暂时无法加载，请联系管理员处理。'}</p>
                  <button
                    type="button"
                    onClick={() => void useCatalogStore.getState().reload().catch(() => {})}
                    className="mt-3 cursor-pointer rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100"
                  >
                    重新加载目录
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label htmlFor="wizard-connector-a" className="mb-1 block text-sm font-medium text-slate-700">
                      {connectorLabels.primaryLabel}
                    </label>
                    <select
                      id="wizard-connector-a"
                      value={activeConnectorA}
                      onChange={(e) => setConnectorA(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {connectors.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.pinCount}P) - {c.supplierNo || '未配置供应商'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="wizard-connector-b" className="mb-1 block text-sm font-medium text-slate-700">
                      {connectorLabels.secondaryLabel}
                    </label>
                    <select
                      id="wizard-connector-b"
                      value={activeConnectorB}
                      onChange={(e) => setConnectorB(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {connectors.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.pinCount}P) - {c.supplierNo || '未配置供应商'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="wizard-pin-count" className="mb-1 block text-sm font-medium text-slate-700">
                      {connectorLabels.pinLabel(effectivePinCount)}
                    </label>
                    <input
                      id="wizard-pin-count"
                      type="range"
                      min={1}
                      max={maxSelectablePins}
                      value={effectivePinCount}
                      onChange={(e) => setPinCount(Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="mt-1 flex justify-between text-xs text-slate-400">
                      <span>1</span>
                      <span>{maxSelectablePins}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 3 && selectedTemplate === 'blank' && (
            <div className="py-8 text-center text-slate-500">
              <Sparkles className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="text-sm">空白项目无需预设连接器</p>
              <p className="mt-1 text-xs text-slate-400">进入设计器后手动添加</p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="space-y-3 rounded-xl bg-slate-50 p-4">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">项目名称</span>
                  <span className="text-sm font-medium text-slate-800">{name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">项目描述</span>
                  <span className="text-sm text-slate-800">{projectDesc || '无'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">模板</span>
                  <span className="text-sm font-medium text-slate-800">
                    {TEMPLATES.find((t) => t.id === selectedTemplate)?.name}
                  </span>
                </div>
                {selectedTemplate !== 'blank' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">{connectorLabels.primaryLabel}</span>
                      <span className="text-sm text-slate-800">
                        {selectedConnA ? `${selectedConnA.name} (${selectedConnA.pinCount}P)` : '未选择'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">{connectorLabels.secondaryLabel}</span>
                      <span className="text-sm text-slate-800">
                        {selectedConnB ? `${selectedConnB.name} (${selectedConnB.pinCount}P)` : '未选择'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">{connectorLabels.summaryPinLabel}</span>
                      <span className="text-sm text-slate-800">{connectorLabels.summaryPinValue(effectivePinCount)}</span>
                    </div>
                  </>
                )}
              </div>
              <p className="text-center text-xs text-slate-400">创建后可在设计器中进一步编辑</p>
              {createError && (
                <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {createError.message}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <button
            onClick={step === 1 ? closeWizard : () => {
              if (submitting.current || createError?.uncertain) return;
              setCreateError(null);
              setStep((s) => (s - 1) as WizardStep);
            }}
            disabled={creating || createError?.uncertain}
            className="cursor-pointer rounded-lg px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            {step === 1 ? '取消' : (
              <span className="flex items-center gap-1"><ChevronLeft className="h-4 w-4" /> 上一步</span>
            )}
          </button>
          {step < 4 ? (
            <button
              onClick={() => setStep((s) => (s + 1) as WizardStep)}
              disabled={!canNext}
              className="flex cursor-pointer items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-slate-300"
            >
              下一步 <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={createError?.uncertain ? closeWizard : () => void handleComplete()}
              disabled={creating}
              className="flex cursor-pointer items-center gap-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:bg-slate-400"
            >
              {creating ? <><Loader2 className="h-4 w-4 animate-spin" /> 创建中…</>
                : createError?.uncertain ? '返回项目列表' : <><Check className="h-4 w-4" /> 创建项目</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

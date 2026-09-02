import { useEffect, useState } from 'react';
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
import { getCatalogConnectors, requireCatalogSnapshot } from '@/lib/catalogRuntime';
import { generateId } from '@/lib/commands';
import { createDefaultWireEndTreatment, lengthMmToCanvasWidth } from '@/lib/canvasMaterials';
import { syncTwoDImages } from '@/lib/autoAssociateTwoDImages';
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
    description: '中心节点连接四个外围节点',
    icon: <Settings className="w-6 h-6" />,
  },
];

const CIRCUIT_COLORS = ['red', 'black', 'blue', 'green', 'yellow', 'white'];

function makeConnector(
  connectorId: string,
  position: { x: number; y: number },
  label: string,
  connectors: Connector[] = requireCatalogSnapshot().connectors,
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

function makeMaterial(
  name: string,
  position: { x: number; y: number },
  circuits: MaterialCircuit[],
): CanvasWireMaterial {
  const lengthMm = 300;
  return {
    id: generateId(),
    name,
    position,
    width: lengthMmToCanvasWidth(lengthMm),
    spec: {
      kind: 'electronic',
      color: circuits[0]?.color ?? 'red',
      lengthMm,
      awg: 26,
      ulNumber: '1007',
      endTreatment: createDefaultWireEndTreatment(),
    },
    circuits,
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
): HarnessConfig {
  const now = Date.now();
  const withAutoImages = (config: HarnessConfig): HarnessConfig => ({
    ...config,
    twoDImages: syncTwoDImages(config),
  });

  if (templateId === 'blank') {
    return withAutoImages({
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

  if (templateId === 'simple-2p') {
    const connA = makeConnector(connectorAId, { x: 100, y: 200 }, 'A端');
    const connB = makeConnector(connectorBId, { x: 500, y: 200 }, 'B端');
    const maxPins = Math.min(pinCount, connA.connector.pinCount, connB.connector.pinCount);
    const circuits: MaterialCircuit[] = [];
    for (let i = 1; i <= maxPins; i++) {
      circuits.push(
        makeCircuit(
          connA.id, 'right', i,
          connB.id, 'left', i,
          CIRCUIT_COLORS[i - 1] ?? 'red',
          `SIG${i}`,
        ),
      );
    }
    const material = makeMaterial('主线材', { x: 270, y: 220 }, circuits);
    return withAutoImages({
      schemaVersion: 3,
      id: generateId(),
      name: projectName,
      createdAt: now,
      updatedAt: now,
      connectors: [connA, connB],
      materials: [material],
      protectiveSleeves: [],
      models: [],
      quantity: 1,
      leadTime: 'standard',
    });
  }

  if (templateId === 't-branch') {
    const connA = makeConnector(connectorAId, { x: 100, y: 200 }, 'A端');
    const connB = makeConnector(connectorBId, { x: 500, y: 100 }, 'B端');
    const connC = makeConnector(connectorBId, { x: 500, y: 300 }, 'C端');

    const maxPins = Math.min(pinCount, connA.connector.pinCount, connB.connector.pinCount);
    const circuitsAB: MaterialCircuit[] = [];
    for (let i = 1; i <= Math.min(maxPins, 2); i++) {
      circuitsAB.push(
        makeCircuit(connA.id, 'right', i, connB.id, 'left', i, CIRCUIT_COLORS[i - 1], i === 1 ? 'VCC' : 'GND'),
      );
    }
    const materialAB = makeMaterial('A-B线材', { x: 270, y: 120 }, circuitsAB);

    const circuitsAC: MaterialCircuit[] = [
      makeCircuit(connA.id, 'right', 1, connC.id, 'left', 1, 'blue', 'SDA'),
    ];
    const materialAC = makeMaterial('A-C线材', { x: 270, y: 320 }, circuitsAC);

    return withAutoImages({
      schemaVersion: 3,
      id: generateId(),
      name: projectName,
      createdAt: now,
      updatedAt: now,
      connectors: [connA, connB, connC],
      materials: [materialAB, materialAC],
      protectiveSleeves: [],
      models: [],
      quantity: 1,
      leadTime: 'standard',
    });
  }

  // star-4
  const center = makeConnector(connectorAId, { x: 300, y: 200 }, '中心');
  const connectors: ConnectorInstance[] = [center];
  const materials: CanvasWireMaterial[] = [];

  for (let arm = 0; arm < 4; arm++) {
    const angle = (arm * Math.PI) / 2;
    const x = 300 + Math.cos(angle) * 200;
    const y = 200 + Math.sin(angle) * 150;
    const armConnector = makeConnector(connectorBId, { x, y }, `${String.fromCharCode(65 + arm)}端`);
    connectors.push(armConnector);

    const circuit = makeCircuit(
      center.id, 'right', 1,
      armConnector.id, 'left', 1,
      CIRCUIT_COLORS[arm],
      `SIG${arm + 1}`,
    );
    const material = makeMaterial(`中心-${String.fromCharCode(65 + arm)}`, { x: 320, y: 200 + arm * 30 }, [circuit]);
    materials.push(material);
  }

  return withAutoImages({
    schemaVersion: 3,
    id: generateId(),
    name: projectName,
    createdAt: now,
    updatedAt: now,
    connectors,
    materials,
    protectiveSleeves: [],
    models: [],
    quantity: 1,
    leadTime: 'standard',
  });
}

export function ProjectWizard({ onComplete, onCancel }: ProjectWizardProps) {
  const connectors = useCatalogStore((state) => getCatalogConnectors(state.snapshot));
  const catalogStatus = useCatalogStore((state) => state.status);
  const catalogError = useCatalogStore((state) => state.error);

  const [step, setStep] = useState<WizardStep>(1);
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [connectorA, setConnectorA] = useState('');
  const [connectorB, setConnectorB] = useState('');
  const [pinCount, setPinCount] = useState(2);

  const activeConnectorA = connectorA || connectors[0]?.id || '';
  const activeConnectorB = connectorB || (connectors[4]?.id ?? connectors[1]?.id ?? connectors[0]?.id ?? '');

  const { currentUser } = useUserStore();
  const { createProject } = useProjectStore();
  const { replaceDocument } = useHarnessStore();

  useEffect(() => {
    void useCatalogStore.getState().initialize().catch(() => {});
  }, []);

  const canNext = step === 1
    ? projectName.trim().length > 0
    : step === 3 && selectedTemplate !== 'blank'
      ? Boolean(activeConnectorA && activeConnectorB && connectors.length > 0)
      : true;

  const handleComplete = async () => {
    if (!currentUser) return;
    const config = createConfigFromTemplate(selectedTemplate, projectName, activeConnectorA, activeConnectorB, pinCount);
    const project = await createProject(currentUser.id, projectName, projectDesc, config);
    replaceDocument({ ...config, id: project.id, name: project.name }, { markSaved: true });
    onComplete();
  };

  const stepTitles = ['项目信息', '选择模板', '连接器配置', '确认创建'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[90vh] w-[600px] max-w-[95vw] flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-100 px-6 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">新建项目向导</h2>
            <button onClick={onCancel} className="cursor-pointer text-slate-400 hover:text-slate-600">
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
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
                  <p className="text-sm">连接器目录加载失败：{catalogError || '请稍后重试'}</p>
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
                    <label className="mb-1 block text-sm font-medium text-slate-700">起始连接器</label>
                    <select
                      value={activeConnectorA}
                      onChange={(e) => setConnectorA(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {connectors.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.pinCount}P) - {c.manufacturer}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">目标连接器</label>
                    <select
                      value={activeConnectorB}
                      onChange={(e) => setConnectorB(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {connectors.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.pinCount}P) - {c.manufacturer}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                       接线数量 / PIN数: {pinCount}
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={Math.min(
                        connectors.find((c) => c.id === activeConnectorA)?.pinCount || 2,
                        connectors.find((c) => c.id === activeConnectorB)?.pinCount || 2,
                      )}
                      value={pinCount}
                      onChange={(e) => setPinCount(Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="mt-1 flex justify-between text-xs text-slate-400">
                      <span>1</span>
                      <span>
                        {Math.min(
                          connectors.find((c) => c.id === activeConnectorA)?.pinCount || 2,
                          connectors.find((c) => c.id === activeConnectorB)?.pinCount || 2,
                        )}
                      </span>
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
                  <span className="text-sm font-medium text-slate-800">{projectName}</span>
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
                      <span className="text-sm text-slate-500">起始连接器</span>
                      <span className="text-sm text-slate-800">
                        {connectors.find((c) => c.id === connectorA)?.name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">目标连接器</span>
                      <span className="text-sm text-slate-800">
                        {connectors.find((c) => c.id === connectorB)?.name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">接线数量</span>
                      <span className="text-sm text-slate-800">{pinCount}</span>
                    </div>
                  </>
                )}
              </div>
              <p className="text-center text-xs text-slate-400">创建后可在设计器中进一步编辑</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <button
            onClick={step === 1 ? onCancel : () => setStep((s) => (s - 1) as WizardStep)}
            className="cursor-pointer rounded-lg px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100"
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
              onClick={() => void handleComplete()}
              className="flex cursor-pointer items-center gap-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <Check className="h-4 w-4" /> 创建项目
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { ChevronRight, ChevronLeft, Check, Cable, Settings, Layers, Sparkles } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { useUserStore } from '@/stores/userStore';
import { useHarnessStore } from '@/stores/harnessStore';
import { CONNECTORS } from '@/lib/data';
import type {
  CanvasWireMaterial,
  Connection,
  HarnessConfig,
  HarnessNode,
  MaterialAttachment,
  Wire,
} from '@/types/harness';

interface ProjectWizardProps {
  onComplete: () => void;
  onCancel: () => void;
}

type WizardStep = 1 | 2 | 3 | 4;

const generateId = (): string =>
  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

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

function createConfigFromTemplate(
  templateId: string,
  projectName: string,
  connectorAId: string,
  connectorBId: string,
  pinCount: number
): HarnessConfig {
  const now = Date.now();
  const connA = CONNECTORS.find((c) => c.id === connectorAId) || CONNECTORS[0];
  const connB = CONNECTORS.find((c) => c.id === connectorBId) || CONNECTORS[4];

  if (templateId === 'blank') {
    return {
      id: generateId(),
      name: projectName,
      createdAt: now,
      updatedAt: now,
      nodes: [],
      connections: [],
      wires: [],
      canvasMaterials: [],
      materialAttachments: [],
      protectiveSleeves: [],
      quantity: 1,
      leadTime: 'standard',
    };
  }

  if (templateId === 'simple-2p') {
    const nodeAId = generateId();
    const nodeBId = generateId();
    const connectionId = generateId();
    const materialId = generateId();
    const wires: Wire[] = [];
    const wireIds: string[] = [];

    for (let i = 1; i <= Math.min(pinCount, connA.pinCount, connB.pinCount); i++) {
      const wId = generateId();
      wireIds.push(wId);
      wires.push({
        id: wId,
        name: `W${i}`,
        wireGauge: 26,
        wireType: 'silicone',
        wireColor: ['red', 'black', 'blue', 'green', 'yellow', 'white'][i - 1] || 'red',
        lengthMm: 300,
        fromConnectorId: nodeAId,
        fromPin: i,
        toConnectorId: nodeBId,
        toPin: i,
        signalName: `SIG${i}`,
      });
    }

    const material: CanvasWireMaterial = {
      id: materialId,
      name: '新线材',
      connectionId,
      position: { x: 270, y: 251 },
      width: 260,
      expandedByDefault: true,
      spec: {
        kind: 'electronic',
        color: wires[0]?.wireColor ?? 'red',
        lengthMm: wires[0]?.lengthMm ?? 300,
        awg: wires[0]?.wireGauge ?? 26,
        ulNumber: '1007',
        endTreatment: { stripped: false },
      },
    };
    const materialAttachments: MaterialAttachment[] = [
      {
        id: generateId(),
        materialId,
        endpoint: 'start',
        connectorNodeId: nodeAId,
        connectorHandle: 'right-pin-1',
      },
      {
        id: generateId(),
        materialId,
        endpoint: 'end',
        connectorNodeId: nodeBId,
        connectorHandle: 'left-pin-1',
      },
    ];

    return {
      id: generateId(),
      name: projectName,
      createdAt: now,
      updatedAt: now,
      nodes: [
        { id: nodeAId, type: 'connector', position: { x: 100, y: 200 }, connector: connA, label: 'A端' },
        { id: nodeBId, type: 'connector', position: { x: 500, y: 200 }, connector: connB, label: 'B端' },
      ],
      connections: [
        { id: connectionId, name: '主线缆束', fromNodeId: nodeAId, toNodeId: nodeBId, wireIds },
      ],
      wires,
      canvasMaterials: [material],
      materialAttachments,
      protectiveSleeves: [],
      quantity: 1,
      leadTime: 'standard',
    };
  }

  if (templateId === 't-branch') {
    const nodeAId = generateId();
    const nodeBId = generateId();
    const nodeCId = generateId();
    const wiresAB: Wire[] = [];
    const wiresAC: Wire[] = [];
    const wireIdsAB: string[] = [];
    const wireIdsAC: string[] = [];

    const pc = Math.min(pinCount, connA.pinCount, connB.pinCount);
    for (let i = 1; i <= pc; i++) {
      const wId = generateId();
      wireIdsAB.push(wId);
      wiresAB.push({
        id: wId,
        name: `W${i}`,
        wireGauge: 26,
        wireType: 'silicone',
        wireColor: ['red', 'black'][i - 1] || 'red',
        lengthMm: 300,
        fromConnectorId: nodeAId,
        fromPin: i,
        toConnectorId: nodeBId,
        toPin: i,
        signalName: i === 1 ? 'VCC' : 'GND',
      });
    }

    const wId3 = generateId();
    wireIdsAC.push(wId3);
    wiresAC.push({
      id: wId3,
      name: `W${pc + 1}`,
      wireGauge: 26,
      wireType: 'silicone',
      wireColor: 'blue',
      lengthMm: 300,
      fromConnectorId: nodeAId,
      fromPin: 1,
      toConnectorId: nodeCId,
      toPin: 1,
      signalName: 'SDA',
    });

    return {
      id: generateId(),
      name: projectName,
      createdAt: now,
      updatedAt: now,
      nodes: [
        { id: nodeAId, type: 'connector', position: { x: 100, y: 200 }, connector: connA, label: 'A端' },
        { id: nodeBId, type: 'connector', position: { x: 500, y: 100 }, connector: connB, label: 'B端' },
        { id: nodeCId, type: 'connector', position: { x: 500, y: 300 }, connector: connB, label: 'C端' },
      ],
      connections: [
        { id: generateId(), name: 'A-B 主线缆束', fromNodeId: nodeAId, toNodeId: nodeBId, wireIds: wireIdsAB },
        { id: generateId(), name: 'A-C 分支线缆', fromNodeId: nodeAId, toNodeId: nodeCId, wireIds: wireIdsAC },
      ],
      wires: [...wiresAB, ...wiresAC],
      quantity: 1,
      leadTime: 'standard',
    };
  }

  // star-4
  const centerId = generateId();
  const nodes: HarnessNode[] = [
    { id: centerId, type: 'connector', position: { x: 300, y: 200 }, connector: connA, label: '中心' },
  ];
  const connections: Connection[] = [];
  const allWires: Wire[] = [];

  for (let arm = 0; arm < 4; arm++) {
    const armId = generateId();
    const angle = (arm * Math.PI) / 2;
    const x = 300 + Math.cos(angle) * 200;
    const y = 200 + Math.sin(angle) * 150;
    nodes.push({ id: armId, type: 'connector', position: { x, y }, connector: connB, label: `${String.fromCharCode(65 + arm)}端` });

    const wId = generateId();
    allWires.push({
      id: wId,
      name: `W${arm + 1}`,
      wireGauge: 26,
      wireType: 'silicone',
      wireColor: ['red', 'black', 'blue', 'green'][arm],
      lengthMm: 300,
      fromConnectorId: centerId,
      fromPin: 1,
      toConnectorId: armId,
      toPin: 1,
      signalName: `SIG${arm + 1}`,
    });
    connections.push({ id: generateId(), name: `中心-${String.fromCharCode(65 + arm)}`, fromNodeId: centerId, toNodeId: armId, wireIds: [wId] });
  }

  return {
    id: generateId(),
    name: projectName,
    createdAt: now,
    updatedAt: now,
    nodes,
    connections,
    wires: allWires,
    quantity: 1,
    leadTime: 'standard',
  };
}

export function ProjectWizard({ onComplete, onCancel }: ProjectWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [connectorA, setConnectorA] = useState(CONNECTORS[0].id);
  const [connectorB, setConnectorB] = useState(CONNECTORS[4].id);
  const [pinCount, setPinCount] = useState(2);

  const { currentUser } = useUserStore();
  const { createProject } = useProjectStore();
  const { replaceDocument } = useHarnessStore();

  const canNext =
    step === 1
      ? projectName.trim().length > 0
      : step === 2
      ? true
      : step === 3
      ? true
      : true;

  const handleComplete = () => {
    if (!currentUser) return;
    const config = createConfigFromTemplate(selectedTemplate, projectName, connectorA, connectorB, pinCount);
    const project = createProject(currentUser.id, projectName, projectDesc, config);
    replaceDocument({ ...config, id: project.harnessConfigId }, { markSaved: true });
    onComplete();
  };

  const stepTitles = ['项目信息', '选择模板', '连接器配置', '确认创建'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-[600px] max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-800">新建项目向导</h2>
            <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 cursor-pointer">
              ✕
            </button>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {([1, 2, 3, 4] as WizardStep[]).map((s) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                    s === step
                      ? 'bg-blue-600 text-white'
                      : s < step
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {s < step ? <Check className="w-4 h-4" /> : s}
                </div>
                <span
                  className={`text-xs font-medium hidden sm:block ${
                    s === step ? 'text-blue-600' : s < step ? 'text-blue-500' : 'text-slate-400'
                  }`}
                >
                  {stepTitles[s - 1]}
                </span>
                {s < 4 && <div className="flex-1 h-px bg-slate-200 mx-1" />}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  项目名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="如：无人机电源线束"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">项目描述</label>
                <textarea
                  value={projectDesc}
                  onChange={(e) => setProjectDesc(e.target.value)}
                  placeholder="简要描述项目用途..."
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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
                  className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                    selectedTemplate === t.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className={`mb-2 ${selectedTemplate === t.id ? 'text-blue-600' : 'text-slate-400'}`}>
                    {t.icon}
                  </div>
                  <div className="text-sm font-semibold text-slate-800 mb-1">{t.name}</div>
                  <div className="text-xs text-slate-500">{t.description}</div>
                </button>
              ))}
            </div>
          )}

          {step === 3 && selectedTemplate !== 'blank' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">起始连接器</label>
                <select
                  value={connectorA}
                  onChange={(e) => setConnectorA(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CONNECTORS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.pinCount}P) - {c.manufacturer}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">目标连接器</label>
                <select
                  value={connectorB}
                  onChange={(e) => setConnectorB(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CONNECTORS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.pinCount}P) - {c.manufacturer}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  导线数量 / PIN数: {pinCount}
                </label>
                <input
                  type="range"
                  min={1}
                  max={Math.min(
                    CONNECTORS.find((c) => c.id === connectorA)?.pinCount || 2,
                    CONNECTORS.find((c) => c.id === connectorB)?.pinCount || 2
                  )}
                  value={pinCount}
                  onChange={(e) => setPinCount(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>1</span>
                  <span>
                    {Math.min(
                      CONNECTORS.find((c) => c.id === connectorA)?.pinCount || 2,
                      CONNECTORS.find((c) => c.id === connectorB)?.pinCount || 2
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}

          {step === 3 && selectedTemplate === 'blank' && (
            <div className="text-center py-8 text-slate-500">
              <Sparkles className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="text-sm">空白项目无需预设连接器</p>
              <p className="text-xs text-slate-400 mt-1">进入设计器后手动添加</p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
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
                        {CONNECTORS.find((c) => c.id === connectorA)?.name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">目标连接器</span>
                      <span className="text-sm text-slate-800">
                        {CONNECTORS.find((c) => c.id === connectorB)?.name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">导线数量</span>
                      <span className="text-sm text-slate-800">{pinCount}</span>
                    </div>
                  </>
                )}
              </div>
              <p className="text-xs text-slate-400 text-center">创建后可在设计器中进一步编辑</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={step === 1 ? onCancel : () => setStep((s) => (s - 1) as WizardStep)}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            {step === 1 ? '取消' : (
              <span className="flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> 上一步</span>
            )}
          </button>
          {step < 4 ? (
            <button
              onClick={() => setStep((s) => (s + 1) as WizardStep)}
              disabled={!canNext}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1 cursor-pointer"
            >
              下一步 <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleComplete}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Check className="w-4 h-4" /> 创建项目
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

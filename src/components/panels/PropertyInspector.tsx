import { useState, type ReactNode } from 'react';
import { Check, Search } from 'lucide-react';
import { changeConnectorPart, getActiveConnectorSide } from '@/lib/commands';
import {
  getCanvasModelDisplayName,
  getProtectiveSleeveDisplayName,
  getWireEndTreatmentSummary,
  getMaterialCenterY,
  resolveColor,
} from '@/lib/canvasMaterials';
import { useHarnessStore } from '@/stores/harnessStore';
import { PartPickerDialog } from '@/components/shared/PartPickerDialog';
import type { Connector, HarnessConfig } from '@/types/harness';

export function PropertyInspector() {
  const { selection } = useHarnessStore();

  if (selection.kind === 'connector') {
    return <ConnectorEditor connectorId={selection.id} />;
  }
  if (selection.kind === 'material') {
    return <MaterialEditor materialId={selection.id} />;
  }
  if (selection.kind === 'sleeve') {
    return <SleeveEditor sleeveId={selection.id} />;
  }
  if (selection.kind === 'model') {
    return <ModelEditor modelId={selection.id} />;
  }
  return null;
}

function ConnectorEditor({ connectorId }: { connectorId: string }) {
  const { config, updateConnector, setSelection } = useHarnessStore();
  const instance = config.connectors.find((connector) => connector.id === connectorId);
  const [label, setLabel] = useState(instance?.label ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!instance) {
    return <div className="text-sm text-slate-400">连接器不存在</div>;
  }

  const activeSide = getActiveConnectorSide(config, connectorId);

  const handleApply = () => {
    updateConnector(connectorId, { label });
    setError(null);
  };

  const handlePartChange = (connector: Connector) => {
    const result = changeConnectorPart(config, connectorId, connector);
    useHarnessStore.getState().replaceDocument(result.config);
    setSelection({ kind: 'connector', id: connectorId });
    setError(result.warnings.length > 0 ? result.warnings.join('；') : null);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">连接器属性</h3>

      <FormField label="标签">
        <div className="flex gap-1">
          <input
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={handleApply}
            className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
          >
            <Check className="h-3 w-3" />
          </button>
        </div>
      </FormField>

      <FormField label="连接器型号">
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex w-full items-center justify-center gap-1 rounded border border-blue-200 px-2 py-1.5 text-xs text-blue-600 transition-colors hover:bg-blue-50"
          >
            <Search className="h-3 w-3" />
            浏览全部物料
          </button>
        </div>
      </FormField>

      <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
        <p>{instance.connector.manufacturer}</p>
        <p>{instance.connector.pinCount}P{instance.connector.pitch ? ` · ${instance.connector.pitch}mm` : ''}</p>
        <p>{instance.connector.type}</p>
      </div>

      {activeSide && (
        <p className="text-[10px] text-amber-600">
          有效侧已锁定：{activeSide === 'left' ? '左侧' : '右侧'}
        </p>
      )}

      {instance.jumpers.length > 0 && (
        <div className="rounded border border-orange-200 bg-orange-50 p-2">
          <p className="text-xs font-medium text-orange-700">短接 ({instance.jumpers.length})</p>
          {instance.jumpers.map((jumper) => (
            <p key={jumper.id} className="text-[10px] text-orange-600">
              {jumper.side === 'left' ? '左侧' : '右侧'} Pin {jumper.pins.join(', ')}
            </p>
          ))}
        </div>
      )}

      {error && (
        <div role="status" className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          <p className="font-medium">换型后已自动移除越界 PIN 引用</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {pickerOpen && (
        <PartPickerDialog
          isOpen
          onClose={() => setPickerOpen(false)}
          onSelect={handlePartChange}
          currentConnectorId={instance.connector.id}
        />
      )}
    </div>
  );
}

function getLinkedModels(config: HarnessConfig, materialId: string) {
  const material = config.materials.find((m) => m.id === materialId);
  if (!material) return [];

  const leftX = material.position.x;
  const rightX = material.position.x + material.width;
  const wireY = material.position.y + getMaterialCenterY(material.spec.kind);

  return config.models.filter((model) => {
    const modelCenterX = model.position.x + model.width / 2;
    const modelCenterY = model.position.y + model.height / 2;

    const isYClose = Math.abs(modelCenterY - wireY) < (model.height / 2 + 20);
    if (!isYClose) return false;

    const isLeftClose = Math.abs(modelCenterX - leftX) < (model.width / 2 + 20);
    const isRightClose = Math.abs(modelCenterX - rightX) < (model.width / 2 + 20);

    return isLeftClose || isRightClose;
  });
}

function getLinkedMaterialAndConnector(config: HarnessConfig, modelId: string) {
  const model = config.models.find((m) => m.id === modelId);
  if (!model) return null;

  const modelCenterX = model.position.x + model.width / 2;
  const modelCenterY = model.position.y + model.height / 2;

  for (const material of config.materials) {
    const wireY = material.position.y + getMaterialCenterY(material.spec.kind);
    const isYClose = Math.abs(modelCenterY - wireY) < (model.height / 2 + 20);
    if (!isYClose) continue;

    const leftX = material.position.x;
    const rightX = material.position.x + material.width;

    const isLeftClose = Math.abs(modelCenterX - leftX) < (model.width / 2 + 20);
    const isRightClose = Math.abs(modelCenterX - rightX) < (model.width / 2 + 20);

    if (isLeftClose || isRightClose) {
      return material;
    }
  }
  return null;
}

function MaterialEditor({ materialId }: { materialId: string }) {
  const { config } = useHarnessStore();
  const material = config.materials.find((item) => item.id === materialId);

  if (!material) {
    return <div className="text-sm text-slate-400">线材不存在</div>;
  }

  const spec = material.spec;
  const circuitCount = material.circuits.length;
  const linkedModels = getLinkedModels(config, materialId);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">线材属性</h3>

      <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
        <p>{spec.kind === 'electronic' ? '电子线' : '护套线'}</p>
        <p>线号：{spec.awg} AWG</p>
        <p>长度：{spec.lengthMm} mm</p>
        <p>端部工艺：{getWireEndTreatmentSummary(spec.endTreatment)}</p>
        {spec.kind === 'electronic' && <p>UL：{spec.ulNumber}</p>}
        {spec.kind === 'jacketed' && (
          <>
            <p>外被：{spec.jacketMaterial} / {spec.jacketColor === 'black' ? '黑色' : '绿色'}</p>
            <p>芯数：{spec.coreCount} 芯</p>
            <p>带屏蔽：{spec.shielded ? '是' : '否'}</p>
            <p>芯线颜色：{spec.coreColors.map((color) => resolveColor(color).name).join('、')}</p>
            {spec.ulNumber && <p>UL：{spec.ulNumber}</p>}
          </>
        )}
      </div>

      {linkedModels.length > 0 && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-2 text-xs text-slate-600 space-y-1">
          <p className="font-semibold text-indigo-700">端部关联外模 ({linkedModels.length})</p>
          {linkedModels.map((m) => (
            <div key={m.id} className="flex justify-between items-center text-[10px] text-slate-500">
              <span>{getCanvasModelDisplayName(m)}</span>
              <span className="font-mono text-slate-400">{Math.round(m.width)}x{Math.round(m.height)} px</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">接线明细</span>
        <span className="font-semibold text-blue-600">{circuitCount} 条</span>
      </div>

      <p className="text-[10px] text-slate-400">
        在画布上点击线材端点和连接器 PIN 点即可建立连接。号码管可沿连线拖动，默认贴着连接器。
      </p>
    </div>
  );
}

function ModelEditor({ modelId }: { modelId: string }) {
  const { config } = useHarnessStore();
  const model = config.models.find((item) => item.id === modelId);

  if (!model) {
    return <div className="text-sm text-slate-400">外模不存在</div>;
  }

  const linkedMaterial = getLinkedMaterialAndConnector(config, modelId);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">外模属性</h3>

      <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
        <p>类型：{getCanvasModelDisplayName(model)}</p>
        <p>宽度：{Math.round(model.width)} px</p>
        <p>高度：{Math.round(model.height)} px</p>
      </div>

      {linkedMaterial && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-2 text-xs text-slate-600 space-y-1">
          <p className="font-semibold text-slate-700">包覆线材参数</p>
          <p>类型：{linkedMaterial.spec.kind === 'electronic' ? '电子线' : '护套线'}</p>
          <p>线号：{linkedMaterial.spec.awg} AWG</p>
          <p>长度：{linkedMaterial.spec.lengthMm} mm</p>
          <p>工艺：{getWireEndTreatmentSummary(linkedMaterial.spec.endTreatment)}</p>
        </div>
      )}
    </div>
  );
}

function SleeveEditor({ sleeveId }: { sleeveId: string }) {
  const { config, updateProtectiveSleeve } = useHarnessStore();
  const sleeve = config.protectiveSleeves.find((item) => item.id === sleeveId);

  if (!sleeve) {
    return <div className="text-sm text-slate-400">保护套不存在</div>;
  }

  const fixing = sleeve.corrugatedFixing;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">保护套属性</h3>

      <FormField label="显示名称">
        <input
          type="text"
          value={getProtectiveSleeveDisplayName(sleeve)}
          readOnly
          className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-500"
        />
      </FormField>

      <FormField label="长度 (mm)">
        <input
          type="number"
          min={1}
          value={sleeve.lengthMm}
          onChange={(event) => {
            const lengthMm = Number(event.target.value);
            if (Number.isFinite(lengthMm) && lengthMm > 0) {
              updateProtectiveSleeve(sleeveId, { lengthMm });
            }
          }}
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </FormField>

      {sleeve.type === 'corrugated' && fixing && (
        <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          <p>左端热缩：{fixing.startHeatShrink ? `是，距离 ${fixing.startDistanceMm}mm` : '否'}</p>
          <p>右端热缩：{fixing.endHeatShrink ? `是，距离 ${fixing.endDistanceMm}mm` : '否'}</p>
        </div>
      )}

      {sleeve.remark && (
        <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          备注：{sleeve.remark}
        </div>
      )}
    </div>
  );
}

function FormField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

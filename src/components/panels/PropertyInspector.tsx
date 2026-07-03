import { useState, type ReactNode } from 'react';
import { Check, Search } from 'lucide-react';
import { CONNECTORS } from '@/lib/data';
import { changeConnectorPart, getActiveConnectorSide } from '@/lib/commands';
import { getCanvasModelDisplayName, getProtectiveSleeveDisplayName } from '@/lib/canvasMaterials';
import { useHarnessStore } from '@/stores/harnessStore';
import type { Connector } from '@/types/harness';
import { PartPickerDialog } from '@/components/shared/PartPickerDialog';

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
    const result = changeConnectorPart(config, connectorId, connector.id);
    useHarnessStore.getState().replaceDocument(result.config);
    setSelection({ kind: 'connector', id: connectorId });
    setError(result.warnings.length > 0 ? result.warnings.join('; ') : null);
  };

  return (
    <div className="space-y-2">
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
            className="flex cursor-pointer items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
          >
            <Check className="h-3 w-3" />
          </button>
        </div>
      </FormField>

      <FormField label="连接器型号">
        <div className="space-y-1.5">
          <select
            value={instance.connector?.id ?? ''}
            onChange={(event) => {
              const part = CONNECTORS.find((connector) => connector.id === event.target.value);
              if (part) handlePartChange(part);
            }}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {CONNECTORS.map((connector) => (
              <option key={connector.id} value={connector.id}>
                {connector.name} ({connector.pinCount}P)
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex w-full cursor-pointer items-center justify-center gap-1 rounded border border-blue-200 px-2 py-1.5 text-xs text-blue-600 transition-colors hover:bg-blue-50"
          >
            <Search className="h-3 w-3" />
            浏览全部物料...
          </button>
        </div>
      </FormField>

      {instance.connector && (
        <p className="text-[10px] text-slate-400">
          {instance.connector.manufacturer} · {instance.connector.pinCount}P
          {instance.connector.pitch ? ` · ${instance.connector.pitch}mm` : ''} · {instance.connector.type}
        </p>
      )}

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

      {error && <p className="text-xs text-red-500">{error}</p>}

      <PartPickerDialog
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePartChange}
        currentConnectorId={instance.connector?.id}
      />
    </div>
  );
}

function MaterialEditor({ materialId }: { materialId: string }) {
  const { config } = useHarnessStore();
  const material = config.materials.find((item) => item.id === materialId);

  if (!material) {
    return <div className="text-sm text-slate-400">线材不存在</div>;
  }

  const spec = material.spec;
  const circuitCount = material.circuits.length;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700">线材属性</h3>

      <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
        <p>{spec.kind === 'electronic' ? '电子线' : '护套线'}</p>
        <p>线规: {spec.awg} AWG</p>
        <p>长度: {spec.lengthMm} mm</p>
        {spec.kind === 'electronic' && <p>UL: {spec.ulNumber}</p>}
        {spec.kind === 'jacketed' && (
          <>
            <p>芯数: {spec.coreCount}</p>
            <p>材质: {spec.jacketMaterial}</p>
            {spec.ulNumber && <p>UL: {spec.ulNumber}</p>}
          </>
        )}
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">接线明细</span>
        <span className="font-semibold text-blue-600">{circuitCount} 条</span>
      </div>

      <p className="text-[10px] text-slate-400">
        在画布上点击线材端点和连接器 PIN 点即可建立接线。
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

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700">外模属性</h3>

      <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
        <p>类型: {getCanvasModelDisplayName(model)}</p>
        <p>宽度: {Math.round(model.width)} px</p>
        <p>高度: {Math.round(model.height)} px</p>
      </div>

      <p className="text-[10px] text-slate-400">
        外模显示在线材和连接器之间，并遮住包覆区域内的连接线。
      </p>
    </div>
  );
}

function SleeveEditor({ sleeveId }: { sleeveId: string }) {
  const { config, updateProtectiveSleeve } = useHarnessStore();
  const sleeve = config.protectiveSleeves.find((item) => item.id === sleeveId);

  if (!sleeve) {
    return <div className="text-sm text-slate-400">保护套不存在</div>;
  }

  return (
    <div className="space-y-2">
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
          min={10}
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

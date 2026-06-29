import { useCallback, useState, type ReactNode } from 'react';
import { Check, Search, Undo2, X } from 'lucide-react';
import { CONNECTORS, WIRE_COLORS, WIRE_GAUGES, WIRE_TYPES } from '@/lib/data';
import { changeConnectorPart } from '@/lib/commands';
import { useHarnessStore } from '@/stores/harnessStore';
import type { Connector } from '@/types/harness';
import { PartPickerDialog } from '@/components/shared/PartPickerDialog';

interface NodeDraft {
  label: string;
  connectorId: string;
}

interface ConnectionDraft {
  name: string;
}

interface WireDraft {
  name: string;
  signalName: string;
  fromPin: number;
  toPin: number;
  wireGauge: number;
  wireType: string;
  wireColor: string;
  lengthMm: number;
  shielded: boolean;
}

type DraftKind = 'node' | 'connection' | 'wire';

interface DraftState {
  kind: DraftKind;
  originalId: string;
  data: NodeDraft | ConnectionDraft | WireDraft;
}

interface FieldError {
  field: string;
  message: string;
}

function validateNodeDraft(draft: NodeDraft): FieldError[] {
  const errors: FieldError[] = [];

  if (!draft.label.trim()) {
    errors.push({ field: 'label', message: '标签不能为空' });
  }

  if (!draft.connectorId) {
    errors.push({ field: 'connectorId', message: '请选择连接器型号' });
  }

  return errors;
}

function validateConnectionDraft(draft: ConnectionDraft): FieldError[] {
  return draft.name.trim() ? [] : [{ field: 'name', message: '连接名称不能为空' }];
}

function validateWireDraft(draft: WireDraft, fromPinCount: number, toPinCount: number): FieldError[] {
  const errors: FieldError[] = [];

  if (!draft.name.trim()) errors.push({ field: 'name', message: '名称不能为空' });
  if (draft.fromPin < 1 || draft.fromPin > fromPinCount) {
    errors.push({ field: 'fromPin', message: `起端 PIN 需在 1-${fromPinCount} 之间` });
  }
  if (draft.toPin < 1 || draft.toPin > toPinCount) {
    errors.push({ field: 'toPin', message: `终端 PIN 需在 1-${toPinCount} 之间` });
  }
  if (!Number.isFinite(draft.lengthMm) || draft.lengthMm <= 0) {
    errors.push({ field: 'lengthMm', message: '长度必须是大于 0 的有效数字' });
  }
  if (!Number.isFinite(draft.fromPin)) {
    errors.push({ field: 'fromPin', message: '请输入有效的起端 PIN' });
  }
  if (!Number.isFinite(draft.toPin)) {
    errors.push({ field: 'toPin', message: '请输入有效的终端 PIN' });
  }

  return errors;
}

export function PropertyInspector() {
  const { config, selection, updateConnection, updateNode, updateWire } = useHarnessStore();

  const buildDraft = useCallback((): DraftState | null => {
    if (selection.kind === 'node') {
      const node = config.nodes.find((item) => item.id === selection.id);
      if (!node) return null;

      return {
        kind: 'node',
        originalId: node.id,
        data: {
          label: node.label,
          connectorId: node.connector?.id ?? '',
        },
      };
    }

    if (selection.kind === 'connection') {
      const connection = config.connections.find((item) => item.id === selection.id);
      if (!connection) return null;

      return {
        kind: 'connection',
        originalId: connection.id,
        data: { name: connection.name },
      };
    }

    if (selection.kind === 'wire') {
      const wire = config.wires.find((item) => item.id === selection.id);
      if (!wire) return null;

      return {
        kind: 'wire',
        originalId: wire.id,
        data: {
          name: wire.name,
          signalName: wire.signalName ?? '',
          fromPin: wire.fromPin,
          toPin: wire.toPin,
          wireGauge: wire.wireGauge,
          wireType: wire.wireType,
          wireColor: wire.wireColor,
          lengthMm: wire.lengthMm,
          shielded: wire.shielded ?? false,
        },
      };
    }

    return null;
  }, [config.connections, config.nodes, config.wires, selection]);

  const [draft, setDraft] = useState<DraftState | null>(() => buildDraft());
  const [errors, setErrors] = useState<FieldError[]>([]);

  const handleApply = useCallback(() => {
    if (!draft) return;

    const validationErrors =
      draft.kind === 'node'
        ? validateNodeDraft(draft.data as NodeDraft)
        : draft.kind === 'connection'
          ? validateConnectionDraft(draft.data as ConnectionDraft)
          : (() => {
              const wire = config.wires.find((item) => item.id === draft.originalId);
              const fromNode = config.nodes.find((item) => item.id === wire?.fromConnectorId);
              const toNode = config.nodes.find((item) => item.id === wire?.toConnectorId);
              return validateWireDraft(
                draft.data as WireDraft,
                fromNode?.connector?.pinCount ?? 64,
                toNode?.connector?.pinCount ?? 64,
              );
            })();

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (draft.kind === 'node') {
      const nextDraft = draft.data as NodeDraft;
      const currentNode = config.nodes.find((item) => item.id === draft.originalId);
      if (!currentNode) return;

      if (currentNode.connector?.id !== nextDraft.connectorId) {
        const result = changeConnectorPart(config, draft.originalId, nextDraft.connectorId);
        if (result.warnings.length > 0) {
          setErrors(result.warnings.map((warning, index) => ({
            field: `connector-warning-${index}`,
            message: `无法切换连接器：${warning}`,
          })));
          return;
        }

        const updatedNode = result.config.nodes.find((item) => item.id === draft.originalId);
        updateNode(draft.originalId, {
          label: nextDraft.label,
          connector: updatedNode?.connector,
        });
      } else {
        updateNode(draft.originalId, { label: nextDraft.label });
      }
    } else if (draft.kind === 'connection') {
      updateConnection(draft.originalId, { name: (draft.data as ConnectionDraft).name });
    } else {
      const nextDraft = draft.data as WireDraft;
      updateWire(draft.originalId, {
        name: nextDraft.name,
        signalName: nextDraft.signalName || undefined,
        fromPin: nextDraft.fromPin,
        toPin: nextDraft.toPin,
        wireGauge: nextDraft.wireGauge,
        wireType: nextDraft.wireType,
        wireColor: nextDraft.wireColor,
        lengthMm: nextDraft.lengthMm,
        shielded: nextDraft.shielded || undefined,
      });
    }

    setErrors([]);
  }, [config, draft, updateConnection, updateNode, updateWire]);

  const handleCancel = useCallback(() => {
    setDraft(buildDraft());
    setErrors([]);
  }, [buildDraft]);

  const fieldError = (field: string) => errors.find((item) => item.field === field)?.message;

  if (!draft) {
    return (
      <div className="p-4 text-center text-sm text-slate-400">
        <p>选择一个节点、连接或导线以编辑其属性</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">
          {draft.kind === 'node' && '节点属性'}
          {draft.kind === 'connection' && '连接属性'}
          {draft.kind === 'wire' && '导线属性'}
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={handleApply}
            className="flex cursor-pointer items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
            title="应用修改"
          >
            <Check className="h-3 w-3" />
            应用
          </button>
          <button
            onClick={handleCancel}
            className="flex cursor-pointer items-center gap-1 rounded bg-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-300"
            title="取消编辑"
          >
            <X className="h-3 w-3" />
            取消
          </button>
        </div>
      </div>

      {draft.kind === 'node' && (
        <NodeEditor
          draft={draft.data as NodeDraft}
          onChange={(patch) => setDraft({ ...draft, data: { ...draft.data, ...patch } })}
          fieldError={fieldError}
        />
      )}

      {draft.kind === 'connection' && (
        <ConnectionEditor
          draft={draft.data as ConnectionDraft}
          onChange={(patch) => setDraft({ ...draft, data: { ...draft.data, ...patch } })}
          fieldError={fieldError}
        />
      )}

      {draft.kind === 'wire' && (
        <WireEditor
          draft={draft.data as WireDraft}
          onChange={(patch) => setDraft({ ...draft, data: { ...draft.data, ...patch } })}
          fieldError={fieldError}
        />
      )}

      {errors.length > 0 && (
        <div className="space-y-1 rounded border border-red-200 bg-red-50 p-2">
          {errors.map((error, index) => (
            <p key={`${error.field}-${index}`} className="text-xs text-red-600">
              {error.message}
            </p>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 text-xs text-amber-600">
        <Undo2 className="h-3 w-3" />
        <span>当前是草稿编辑状态，点击“应用”后才会写入设计。</span>
      </div>
    </div>
  );
}

function NodeEditor({
  draft,
  fieldError,
  onChange,
}: {
  draft: NodeDraft;
  fieldError: (field: string) => string | undefined;
  onChange: (patch: Partial<NodeDraft>) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedConnector = CONNECTORS.find((item) => item.id === draft.connectorId);

  const handleConnectorSelect = (connector: Connector) => {
    onChange({ connectorId: connector.id });
  };

  return (
    <div className="space-y-2">
      <FormField label="标签" error={fieldError('label')}>
        <input
          type="text"
          value={draft.label}
          onChange={(event) => onChange({ label: event.target.value })}
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </FormField>

      <FormField label="连接器型号" error={fieldError('connectorId')}>
        <div className="space-y-1.5">
          <select
            value={draft.connectorId}
            onChange={(event) => onChange({ connectorId: event.target.value })}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="" disabled>快速选择...</option>
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

          {selectedConnector && (
            <p className="text-[10px] text-slate-400">
              {selectedConnector.manufacturer} · {selectedConnector.pinCount}P
              {selectedConnector.pitch ? ` · ${selectedConnector.pitch}mm` : ''} · {selectedConnector.type}
            </p>
          )}
        </div>
      </FormField>

      <PartPickerDialog
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleConnectorSelect}
        currentConnectorId={draft.connectorId}
      />
    </div>
  );
}

function ConnectionEditor({
  draft,
  fieldError,
  onChange,
}: {
  draft: ConnectionDraft;
  fieldError: (field: string) => string | undefined;
  onChange: (patch: Partial<ConnectionDraft>) => void;
}) {
  return (
    <div className="space-y-2">
      <FormField label="连接名称" error={fieldError('name')}>
        <input
          type="text"
          value={draft.name}
          onChange={(event) => onChange({ name: event.target.value })}
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </FormField>
    </div>
  );
}

function WireEditor({
  draft,
  fieldError,
  onChange,
}: {
  draft: WireDraft;
  fieldError: (field: string) => string | undefined;
  onChange: (patch: Partial<WireDraft>) => void;
}) {
  const clampNumber = (value: string, fallback: number) => {
    const nextValue = Number(value);
    return Number.isFinite(nextValue) ? nextValue : fallback;
  };

  return (
    <div className="space-y-2">
      <FormField label="导线名称" error={fieldError('name')}>
        <input
          type="text"
          value={draft.name}
          onChange={(event) => onChange({ name: event.target.value })}
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </FormField>

      <FormField label="信号名">
        <input
          type="text"
          value={draft.signalName}
          onChange={(event) => onChange({ signalName: event.target.value })}
          placeholder="如 VCC, GND, SDA..."
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </FormField>

      <div className="grid grid-cols-2 gap-2">
        <FormField label="起端 PIN" error={fieldError('fromPin')}>
          <input
            type="number"
            min={1}
            value={draft.fromPin}
            onChange={(event) => onChange({ fromPin: clampNumber(event.target.value, draft.fromPin) })}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </FormField>

        <FormField label="终端 PIN" error={fieldError('toPin')}>
          <input
            type="number"
            min={1}
            value={draft.toPin}
            onChange={(event) => onChange({ toPin: clampNumber(event.target.value, draft.toPin) })}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </FormField>
      </div>

      <FormField label="线规 (AWG)">
        <select
          value={draft.wireGauge}
          onChange={(event) => onChange({ wireGauge: Number(event.target.value) })}
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {WIRE_GAUGES.map((gauge) => (
            <option key={gauge.awg} value={gauge.awg}>
              {gauge.awg} AWG (最大 {gauge.maxCurrent}A)
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="线材类型">
        <select
          value={draft.wireType}
          onChange={(event) => onChange({ wireType: event.target.value })}
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {WIRE_TYPES.map((wireType) => (
            <option key={wireType.id} value={wireType.id}>
              {wireType.name} - {wireType.description}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="线色">
        <div className="flex flex-wrap gap-1.5">
          {WIRE_COLORS.map((color) => (
            <button
              key={color.id}
              type="button"
              onClick={() => onChange({ wireColor: color.id })}
              className={`h-7 w-7 cursor-pointer rounded-full border-2 transition-transform ${
                draft.wireColor === color.id ? 'scale-110 border-slate-800' : 'border-slate-300'
              }`}
              style={{ backgroundColor: color.hex }}
              title={color.name}
              aria-label={`选择颜色 ${color.name}`}
            />
          ))}
        </div>
        <p className="mt-0.5 text-[10px] text-slate-400">
          {WIRE_COLORS.find((color) => color.id === draft.wireColor)?.name || draft.wireColor}
        </p>
      </FormField>

      <FormField label="长度 (mm)" error={fieldError('lengthMm')}>
        <input
          type="number"
          min={10}
          max={50000}
          value={draft.lengthMm}
          onChange={(event) => onChange({ lengthMm: clampNumber(event.target.value, draft.lengthMm) })}
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </FormField>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.shielded}
          onChange={(event) => onChange({ shielded: event.target.checked })}
          className="rounded"
        />
        <span className="text-slate-600">屏蔽线</span>
      </label>
    </div>
  );
}

function FormField({
  children,
  error,
  label,
}: {
  children: ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {children}
      {error && <p className="mt-0.5 text-[10px] text-red-500">{error}</p>}
    </div>
  );
}

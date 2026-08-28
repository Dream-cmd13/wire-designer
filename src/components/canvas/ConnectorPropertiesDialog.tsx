import { useEffect, useState } from 'react';
import { Check, Plug, RefreshCw, X } from 'lucide-react';
import { getActiveConnectorSide } from '@/lib/commands';
import { useHarnessStore } from '@/stores/harnessStore';

interface ConnectorPropertiesDialogProps {
  connectorId: string;
  isOpen: boolean;
  onClose: () => void;
  onChangePart?: () => void;
}

export function ConnectorPropertiesDialog({
  connectorId,
  isOpen,
  onClose,
  onChangePart,
}: ConnectorPropertiesDialogProps) {
  const config = useHarnessStore((s) => s.config);
  const updateConnector = useHarnessStore((s) => s.updateConnector);
  const instance = config.connectors.find((c) => c.id === connectorId);

  const [label, setLabel] = useState(instance?.label ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (instance) {
      setLabel(instance.label);
    }
  }, [instance?.id, instance?.label]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!isOpen || !instance) return null;

  const activeSide = getActiveConnectorSide(config, connectorId);

  const handleStartChangePart = () => {
    const trimmed = label.trim();
    if (trimmed && trimmed !== instance.label) {
      updateConnector(connectorId, { label: trimmed });
    }
    onClose();
    onChangePart?.();
  };

  const handleSubmit = () => {
    const trimmed = label.trim();
    if (!trimmed) {
      setValidationError('连接器标签/位号不能为空');
      return;
    }
    updateConnector(connectorId, { label: trimmed });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-[500px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
              <Plug className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">连接器属性</h2>
              <p className="text-xs text-slate-500">
                当前物料：{instance.connector.model || instance.connector.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5">
          {/* Label Input */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">
              连接器标签 / 位号
            </label>
            <input
              type="text"
              autoFocus
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                setValidationError(null);
              }}
              placeholder="例如：J1、CN1"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            {validationError && (
              <p className="mt-1 text-xs text-red-600">{validationError}</p>
            )}
          </div>

          {/* Part Specifications */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">连接器型号与规格</span>
              <button
                type="button"
                onClick={handleStartChangePart}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
                更换连接器型号
              </button>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">型号/名称:</span>
                <span className="font-medium text-slate-800">
                  {instance.connector.model || instance.connector.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">制造厂家:</span>
                <span className="text-slate-700">{instance.connector.manufacturer || '通用'}</span>
              </div>
              {instance.connector.series && (
                <div className="flex justify-between">
                  <span className="text-slate-400">所属系列:</span>
                  <span className="text-slate-700">{instance.connector.series}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">引脚规格:</span>
                <span className="text-slate-700">
                  {instance.connector.pinCount} Pin
                  {instance.connector.pitch ? ` · 间距 ${instance.connector.pitch}mm` : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">类型 / 屏蔽:</span>
                <span className="text-slate-700">
                  {instance.connector.type === 'male' ? '公头' : instance.connector.type === 'female' ? '母头' : (instance.connector.type || '未指定')}
                  {instance.connector.shielded !== undefined ? (instance.connector.shielded ? ' · 已屏蔽' : ' · 未屏蔽') : ''}
                </span>
              </div>
              {(instance.connector.ratedVoltageV !== undefined || instance.connector.ratedCurrentA !== undefined) && (
                <div className="flex justify-between">
                  <span className="text-slate-400">额定电气:</span>
                  <span className="text-slate-700">
                    {instance.connector.ratedVoltageV ? `${instance.connector.ratedVoltageV}V` : ''}
                    {instance.connector.ratedVoltageV && instance.connector.ratedCurrentA ? ' / ' : ''}
                    {instance.connector.ratedCurrentA ? `${instance.connector.ratedCurrentA}A` : ''}
                  </span>
                </div>
              )}
              {instance.connector.temperatureRangeC && (
                <div className="flex justify-between">
                  <span className="text-slate-400">温度范围:</span>
                  <span className="text-slate-700">
                    {instance.connector.temperatureRangeC.min !== undefined && instance.connector.temperatureRangeC.max !== undefined
                      ? `${instance.connector.temperatureRangeC.min} ~ ${instance.connector.temperatureRangeC.max} ℃`
                      : instance.connector.temperatureRangeC.max !== undefined
                        ? `≤ ${instance.connector.temperatureRangeC.max} ℃`
                        : `≥ ${instance.connector.temperatureRangeC.min} ℃`}
                  </span>
                </div>
              )}
              {(instance.connector.ingressProtection || instance.connector.flammabilityRating) && (
                <div className="flex justify-between">
                  <span className="text-slate-400">防护/阻燃:</span>
                  <span className="text-slate-700">
                    {[instance.connector.ingressProtection, instance.connector.flammabilityRating].filter(Boolean).join(' · ')}
                  </span>
                </div>
              )}
              {instance.connector.matingCyclesMin !== undefined && (
                <div className="flex justify-between">
                  <span className="text-slate-400">插拔寿命:</span>
                  <span className="text-slate-700">≥ {instance.connector.matingCyclesMin} 次</span>
                </div>
              )}
            </div>
          </div>

          {/* Active side status */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs">
            <span className="text-slate-500">有效连接侧：</span>
            <span className="font-medium text-slate-700">
              {activeSide ? (activeSide === 'left' ? '左侧连接' : '右侧连接') : '两侧均可用（未锁定）'}
            </span>
          </div>

          {/* Jumpers info */}
          {instance.jumpers && instance.jumpers.length > 0 && (
            <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-2.5 text-xs text-orange-800">
              <p className="font-semibold text-orange-700 mb-1">
                短接配置 ({instance.jumpers.length})
              </p>
              <div className="space-y-0.5">
                {instance.jumpers.map((jumper) => (
                  <div key={jumper.id} className="text-[11px] text-orange-700">
                    • {jumper.side === 'left' ? '左侧' : '右侧'} Pin {jumper.pins.join(' - Pin ')}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-200"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Check className="h-4 w-4" />
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

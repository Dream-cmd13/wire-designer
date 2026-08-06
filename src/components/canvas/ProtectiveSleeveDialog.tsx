import { useEffect, useMemo, useState } from 'react';
import { Check, Layers3, X } from 'lucide-react';
import { CORRUGATED_MATERIAL_LABELS } from '@/lib/canvasMaterials';
import { useCatalogStore } from '@/stores/catalogStore';
import { getCatalogProtectionOptions } from '@/lib/catalogRuntime';
import type { CorrugatedMaterial, ProtectiveSleeveType } from '@/types/harness';

interface CorrugatedFixingValue {
  startHeatShrink: boolean;
  endHeatShrink: boolean;
  startDistanceMm: number;
  endDistanceMm: number;
}

interface ProtectiveSleeveDialogProps {
  isOpen: boolean;
  initialType?: ProtectiveSleeveType;
  initialLengthMm?: number;
  initialCorrugatedMaterial?: CorrugatedMaterial;
  initialMaterialIds?: string[];
  initialRemark?: string;
  initialCorrugatedFixing?: CorrugatedFixingValue;
  materialOptions: Array<{ id: string; name: string; description: string }>;
  editing: boolean;
  onCancel: () => void;
  onConfirm: (
    type: ProtectiveSleeveType,
    lengthMm: number,
    corrugatedMaterial: CorrugatedMaterial | undefined,
    materialIds: string[],
    remark: string,
    corrugatedFixing: CorrugatedFixingValue | undefined,
  ) => void;
}

const defaultFixing = (): CorrugatedFixingValue => ({
  startHeatShrink: false,
  endHeatShrink: false,
  startDistanceMm: 0,
  endDistanceMm: 0,
});

export function ProtectiveSleeveDialog({
  isOpen,
  initialType = 'heat-shrink',
  initialLengthMm = 100,
  initialCorrugatedMaterial = 'PP',
  initialMaterialIds = [],
  initialRemark = '',
  initialCorrugatedFixing,
  materialOptions,
  editing,
  onCancel,
  onConfirm,
}: ProtectiveSleeveDialogProps) {
  const protectionOptions = useCatalogStore((state) => getCatalogProtectionOptions(state.snapshot));
  const sleeveOptions = useMemo(() => protectionOptions, [protectionOptions]);
  const corrugatedMaterials = useMemo(() => {
    const option = sleeveOptions.find((item) => item.id === 'corrugated');
    return Object.keys(option?.materialMultipliers ?? {}) as CorrugatedMaterial[];
  }, [sleeveOptions]);
  const [type, setType] = useState<ProtectiveSleeveType>(initialType);
  const [lengthMm, setLengthMm] = useState(initialLengthMm);
  const [corrugatedMaterial, setCorrugatedMaterial] = useState<CorrugatedMaterial>(initialCorrugatedMaterial);
  const [materialIds, setMaterialIds] = useState(initialMaterialIds);
  const [remark, setRemark] = useState(initialRemark);
  const [corrugatedFixing, setCorrugatedFixing] = useState<CorrugatedFixingValue>(initialCorrugatedFixing ?? defaultFixing());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onCancel]);

  const allowMultiSelect = type === 'corrugated';
  const selectedCountHint = useMemo(() => (
    allowMultiSelect ? `${materialIds.length} 条` : materialIds[0] ? '1 条' : '0 条'
  ), [allowMultiSelect, materialIds]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!Number.isFinite(lengthMm) || lengthMm <= 0) {
      setError('长度必须是大于 0 的数字');
      return;
    }
    if (type === 'corrugated') {
      if (
        !Number.isFinite(corrugatedFixing.startDistanceMm)
        || corrugatedFixing.startDistanceMm < 0
        || !Number.isFinite(corrugatedFixing.endDistanceMm)
        || corrugatedFixing.endDistanceMm < 0
      ) {
        setError('波纹管两端热缩距离不能小于 0');
        return;
      }
    }

    onConfirm(
      type,
      lengthMm,
      type === 'corrugated' ? corrugatedMaterial : undefined,
      allowMultiSelect ? materialIds : materialIds.slice(0, 1),
      remark.trim(),
      type === 'corrugated' ? corrugatedFixing : undefined,
    );
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-[620px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-cyan-50 p-2 text-cyan-700">
              <Layers3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {editing ? '编辑保护套' : '添加保护套'}
              </h2>
              <p className="text-xs text-slate-500">支持备注、覆盖线材和波纹管两端热缩固定</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(90vh-132px)] space-y-5 overflow-y-auto px-5 py-5">
          <div>
            <span className="mb-2 block text-xs font-medium text-slate-600">保护套类型</span>
            <div className="grid grid-cols-2 gap-2">
              {sleeveOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    const item = option.id as ProtectiveSleeveType;
                    setType(item);
                    if (item !== 'corrugated' && materialIds.length > 1) {
                      setMaterialIds(materialIds.slice(0, 1));
                    }
                  }}
                  className={`flex items-center justify-between rounded-xl border px-3 py-3 text-left text-sm transition ${
                    type === option.id
                      ? 'border-cyan-500 bg-cyan-50 font-medium text-cyan-800'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {option.name}
                  {type === option.id && <Check className="h-4 w-4" />}
                </button>
              ))}
            </div>
          </div>

          {type === 'corrugated' && (
            <>
              <div>
                <span className="mb-2 block text-xs font-medium text-slate-600">波纹管材质</span>
                <div className="grid grid-cols-3 gap-2">
                  {corrugatedMaterials.map((mat) => (
                    <button
                      key={mat}
                      type="button"
                      onClick={() => setCorrugatedMaterial(mat)}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                        corrugatedMaterial === mat
                          ? 'border-cyan-500 bg-cyan-50 font-medium text-cyan-800'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {CORRUGATED_MATERIAL_LABELS[mat] ?? mat}
                      {corrugatedMaterial === mat && <Check className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 text-sm font-semibold text-slate-700">波纹管两端热缩固定</div>
                <div className="grid gap-4 md:grid-cols-2">
                  {([
                    ['startHeatShrink', 'startDistanceMm', '左端'],
                    ['endHeatShrink', 'endDistanceMm', '右端'],
                  ] as const).map(([heatShrinkKey, distanceKey, label]) => (
                    <div key={label} className="rounded-xl border border-slate-200 bg-white p-3">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={corrugatedFixing[heatShrinkKey]}
                          onChange={(event) => setCorrugatedFixing((current) => ({
                            ...current,
                            [heatShrinkKey]: event.target.checked,
                          }))}
                        />
                        {label}加热缩管固定
                      </label>
                      <div className="mt-3">
                        <span className="mb-1.5 block text-xs font-medium text-slate-600">热缩管与波纹管距离 (mm)</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={Number.isNaN(corrugatedFixing[distanceKey]) ? '' : corrugatedFixing[distanceKey]}
                          onChange={(event) => setCorrugatedFixing((current) => ({
                            ...current,
                            [distanceKey]: event.target.value === '' ? Number.NaN : Number(event.target.value),
                          }))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-slate-500">距离为 0 时表示热缩管直接贴在波纹管开口处。</p>
              </div>
            </>
          )}

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">长度 (mm)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={Number.isNaN(lengthMm) ? '' : lengthMm}
              onChange={(event) => {
                setLengthMm(event.target.value === '' ? Number.NaN : Number(event.target.value));
                setError(null);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            />
          </label>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">
                覆盖线材{allowMultiSelect ? '（当前类型可多选）' : '（当前类型单选）'}
              </span>
              <span className="text-[10px] text-slate-400">已选 {selectedCountHint}</span>
            </div>
            {materialOptions.length > 0 ? (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {materialOptions.map((material) => {
                  const checked = materialIds.includes(material.id);
                  return (
                    <label
                      key={material.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                        checked ? 'bg-cyan-50 text-cyan-800' : 'hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type={allowMultiSelect ? 'checkbox' : 'radio'}
                        name="sleeve-material"
                        checked={checked}
                        onChange={() => setMaterialIds((current) => {
                          if (allowMultiSelect) {
                            return checked
                              ? current.filter((id) => id !== material.id)
                              : [...current, material.id];
                          }
                          return [material.id];
                        })}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{material.name}</span>
                        <span className="block truncate text-[10px] text-slate-400">{material.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-center text-xs text-slate-400">
                当前没有可选线材，保护套将作为未绑定对象添加。
              </div>
            )}
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">备注</span>
            <textarea
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              rows={3}
              placeholder="例如：波纹管开口处用热缩管固定"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            />
          </label>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-200">
            取消
          </button>
          <button type="button" onClick={handleConfirm} className="flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-800">
            <Check className="h-4 w-4" />
            确认
          </button>
        </div>
      </div>
    </div>
  );
}

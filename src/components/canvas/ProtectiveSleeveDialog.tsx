import { useEffect, useState } from 'react';
import { Check, Layers3, X } from 'lucide-react';
import { CORRUGATED_MATERIAL_LABELS, PROTECTIVE_SLEEVE_LABELS } from '@/lib/canvasMaterials';
import type { CorrugatedMaterial, ProtectiveSleeveType } from '@/types/harness';

interface ProtectiveSleeveDialogProps {
  isOpen: boolean;
  initialType?: ProtectiveSleeveType;
  initialLengthMm?: number;
  initialCorrugatedMaterial?: CorrugatedMaterial;
  initialMaterialIds?: string[];
  materialOptions: Array<{ id: string; name: string; description: string }>;
  editing: boolean;
  onCancel: () => void;
  onConfirm: (
    type: ProtectiveSleeveType,
    lengthMm: number,
    corrugatedMaterial: CorrugatedMaterial | undefined,
    materialIds: string[],
  ) => void;
}

const sleeveTypes = Object.keys(PROTECTIVE_SLEEVE_LABELS) as ProtectiveSleeveType[];

export function ProtectiveSleeveDialog({
  isOpen,
  initialType = 'heat-shrink',
  initialLengthMm = 100,
  initialCorrugatedMaterial = 'PP',
  initialMaterialIds = [],
  materialOptions,
  editing,
  onCancel,
  onConfirm,
}: ProtectiveSleeveDialogProps) {
  const [type, setType] = useState<ProtectiveSleeveType>(initialType);
  const [lengthMm, setLengthMm] = useState(initialLengthMm);
  const [corrugatedMaterial, setCorrugatedMaterial] = useState<CorrugatedMaterial>(initialCorrugatedMaterial);
  const [materialIds, setMaterialIds] = useState(initialMaterialIds);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!Number.isFinite(lengthMm) || lengthMm <= 0) {
      setError('长度必须是大于 0 的数字');
      return;
    }
    onConfirm(
      type,
      lengthMm,
      type === 'corrugated' ? corrugatedMaterial : undefined,
      materialIds,
    );
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-cyan-50 p-2 text-cyan-700">
              <Layers3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {editing ? '编辑保护套' : '添加保护套'}
              </h2>
              <p className="text-xs text-slate-500">选择保护套类型并填写实际长度</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div>
            <span className="mb-2 block text-xs font-medium text-slate-600">保护套类型</span>
            <div className="grid grid-cols-2 gap-2">
              {sleeveTypes.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setType(item)}
                  className={`flex items-center justify-between rounded-xl border px-3 py-3 text-left text-sm transition ${
                    type === item
                      ? 'border-cyan-500 bg-cyan-50 font-medium text-cyan-800'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {PROTECTIVE_SLEEVE_LABELS[item]}
                  {type === item && <Check className="h-4 w-4" />}
                </button>
              ))}
            </div>
          </div>

          {type === 'corrugated' && (
            <div>
              <span className="mb-2 block text-xs font-medium text-slate-600">波纹管材质</span>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(CORRUGATED_MATERIAL_LABELS) as import('@/types/harness').CorrugatedMaterial[]).map((mat) => (
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
                    {CORRUGATED_MATERIAL_LABELS[mat]}
                    {corrugatedMaterial === mat && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">长度（mm）</span>
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
              <span className="text-xs font-medium text-slate-600">覆盖线材（可多选）</span>
              <span className="text-[10px] text-slate-400">已选 {materialIds.length} 条</span>
            </div>
            {materialOptions.length > 0 ? (
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
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
                        type="checkbox"
                        checked={checked}
                        onChange={() => setMaterialIds((current) =>
                          checked
                            ? current.filter((id) => id !== material.id)
                            : [...current, material.id],
                        )}
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
                当前没有可选择的线材；保护套将作为未绑定对象添加。
              </div>
            )}
          </div>

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
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

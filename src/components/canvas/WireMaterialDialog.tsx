import { useEffect, useState } from 'react';
import { Cable, Check, X } from 'lucide-react';
import { WIRE_COLORS } from '@/lib/data';
import {
  calculateCableOd,
  CORE_COLOR_OPTIONS,
  createDefaultWireEndTreatment,
  createDefaultWireSpec,
  getCoreColors,
  JACKET_CORE_COUNTS,
  JACKET_UL_NUMBERS,
  lengthMmToCanvasWidth,
} from '@/lib/canvasMaterials';
import type {
  CanvasWireMaterial,
  CanvasWireSpec,
  JacketCoreCount,
  JacketUlNumber,
  WireEndProcessing,
  WireEndTreatment,
} from '@/types/harness';

interface WireMaterialDialogProps {
  material: CanvasWireMaterial | null;
  onCancel: () => void;
  onConfirm: (updates: Pick<CanvasWireMaterial, 'spec' | 'width'>) => void;
}

const fieldClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

function defaultJacketedSpec(): CanvasWireSpec {
  const coreCount: JacketCoreCount = 2;
  return {
    kind: 'jacketed',
    jacketMaterial: 'PVC',
    jacketColor: 'black',
    awg: 26,
    coreCount,
    shielded: false,
    odMm: calculateCableOd(26, coreCount, false),
    coreColors: getCoreColors(coreCount),
    endTreatment: createDefaultWireEndTreatment(),
    lengthMm: 300,
  };
}

function validateEnd(end: WireEndProcessing, label: string): string | null {
  if (!end.stripped) return null;
  if (!Number.isFinite(end.stripLengthMm) || (end.stripLengthMm ?? 0) <= 0) {
    return `${label}剥皮长度必须大于 0`;
  }
  if (end.termination !== 'tinned' && end.termination !== 'terminal') {
    return `${label}剥皮后请选择沾锡或打端子`;
  }
  return null;
}

function validateSpec(spec: CanvasWireSpec): string | null {
  if (!Number.isFinite(spec.awg) || spec.awg <= 0) return 'AWG 必须大于 0';
  if (!Number.isFinite(spec.lengthMm) || spec.lengthMm <= 0) return '长度必须大于 0';
  if (spec.kind === 'jacketed' && spec.coreColors.length !== spec.coreCount) {
    return '芯线颜色数量必须和芯数一致';
  }

  return (
    validateEnd(spec.endTreatment.start, '左端')
    ?? validateEnd(spec.endTreatment.end, '右端')
  );
}

export function WireMaterialDialog({ material, onCancel, onConfirm }: WireMaterialDialogProps) {
  const [spec, setSpec] = useState<CanvasWireSpec>(material?.spec ?? createDefaultWireSpec());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!material) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [material, onCancel]);

  if (!material) return null;

  const setEndTreatment = (endTreatment: WireEndTreatment) => {
    setSpec((current) => ({ ...current, endTreatment }));
  };

  const handleSubmit = () => {
    const validationError = validateSpec(spec);
    if (validationError) {
      setError(validationError);
      return;
    }
    onConfirm({ spec, width: lengthMmToCanvasWidth(spec.lengthMm) });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="max-h-[90vh] w-full max-w-[760px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
              <Cable className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">配置线材</h2>
              <p className="text-xs text-slate-500">先选线材类型，再设置规格和端部工艺</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(90vh-132px)] space-y-5 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <TypeButton
              active={spec.kind === 'electronic'}
              label="电子线"
              onClick={() => setSpec(createDefaultWireSpec())}
            />
            <TypeButton
              active={spec.kind === 'jacketed'}
              label="护套线"
              onClick={() => setSpec(defaultJacketedSpec())}
            />
          </div>

          {spec.kind === 'electronic' ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="颜色">
                <select
                  value={spec.color}
                  onChange={(event) => setSpec({ ...spec, color: event.target.value })}
                  className={fieldClass}
                >
                  {WIRE_COLORS.map((color) => (
                    <option key={color.id} value={color.id}>{color.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="长度 (mm)">
                <NumberInput value={spec.lengthMm} onChange={(lengthMm) => setSpec({ ...spec, lengthMm })} />
              </Field>
              <Field label="线号 (AWG)">
                <NumberInput value={spec.awg} onChange={(awg) => setSpec({ ...spec, awg })} />
              </Field>
              <Field label="UL 号">
                <select value={spec.ulNumber} disabled className={`${fieldClass} disabled:bg-slate-50`}>
                  <option value="1007">1007</option>
                </select>
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Field label="外被材质">
                <select
                  value={spec.jacketMaterial}
                  onChange={(event) => setSpec({ ...spec, jacketMaterial: event.target.value as 'PVC' | 'PUR' })}
                  className={fieldClass}
                >
                  <option value="PVC">PVC</option>
                  <option value="PUR">PUR</option>
                </select>
              </Field>
              <Field label="外被颜色">
                <select
                  value={spec.jacketColor}
                  onChange={(event) => setSpec({ ...spec, jacketColor: event.target.value as 'black' | 'green' })}
                  className={fieldClass}
                >
                  <option value="black">黑色</option>
                  <option value="green">绿色</option>
                </select>
              </Field>
              <Field label="长度 (mm)">
                <NumberInput value={spec.lengthMm} onChange={(lengthMm) => setSpec({ ...spec, lengthMm })} />
              </Field>
              <Field label="线号 (AWG)">
                <NumberInput
                  value={spec.awg}
                  onChange={(awg) => {
                    setSpec({
                      ...spec,
                      awg,
                      odMm: calculateCableOd(awg, spec.coreCount, spec.shielded),
                    });
                  }}
                />
              </Field>
              <Field label="芯数">
                <select
                  value={spec.coreCount}
                  onChange={(event) => {
                    const coreCount = Number(event.target.value) as JacketCoreCount;
                    const nextColors = spec.coreColors.slice(0, coreCount);
                    while (nextColors.length < coreCount) {
                      nextColors.push(getCoreColors(coreCount)[nextColors.length] ?? CORE_COLOR_OPTIONS[0]);
                    }
                    setSpec({
                      ...spec,
                      coreCount,
                      coreColors: nextColors,
                      odMm: calculateCableOd(spec.awg, coreCount, spec.shielded),
                    });
                  }}
                  className={fieldClass}
                >
                  {JACKET_CORE_COUNTS.map((count) => (
                    <option key={count} value={count}>{count} 芯</option>
                  ))}
                </select>
              </Field>
              <Field label="是否带屏蔽">
                <label className="flex h-[38px] items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={spec.shielded}
                    onChange={(event) => {
                      const shielded = event.target.checked;
                      setSpec({
                        ...spec,
                        shielded,
                        odMm: calculateCableOd(spec.awg, spec.coreCount, shielded),
                      });
                    }}
                  />
                  带屏蔽
                </label>
              </Field>
              <Field label="UL 号（可选）">
                <select
                  value={spec.ulNumber ?? ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSpec({
                      ...spec,
                      ulNumber: value ? (value as JacketUlNumber) : undefined,
                    });
                  }}
                  className={fieldClass}
                >
                  <option value="">无</option>
                  {JACKET_UL_NUMBERS.map((ul) => (
                    <option key={ul} value={ul}>{ul}</option>
                  ))}
                </select>
              </Field>
              <Field label="自动计算 OD (mm)">
                <div className="flex h-[38px] items-center rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700">
                  {spec.odMm.toFixed(2)}
                </div>
              </Field>
              <div className="col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-slate-600">芯线颜色</span>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-3">
                  {spec.coreColors.map((color, index) => (
                    <label key={`${index + 1}`} className="block">
                      <span className="mb-1 block text-[11px] font-medium text-slate-500">芯线 {index + 1}</span>
                      <select
                        value={color}
                        onChange={(event) => {
                          const nextCoreColors = [...spec.coreColors];
                          nextCoreColors[index] = event.target.value;
                          setSpec({ ...spec, coreColors: nextCoreColors });
                        }}
                        className={fieldClass}
                      >
                        {CORE_COLOR_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          <EndTreatmentFields value={spec.endTreatment} onChange={setEndTreatment} />

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
          <button type="button" onClick={handleSubmit} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Check className="h-4 w-4" />
            确认
          </button>
        </div>
      </div>
    </div>
  );
}

function TypeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${
        active ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({ value, onChange, min = 0 }: { value: number; onChange: (value: number) => void; min?: number }) {
  return (
    <input
      type="number"
      min={min}
      step="any"
      value={Number.isNaN(value) ? '' : value}
      onChange={(event) => onChange(event.target.value === '' ? Number.NaN : Number(event.target.value))}
      className={fieldClass}
    />
  );
}

function EndTreatmentFields({
  value,
  onChange,
}: {
  value: WireEndTreatment;
  onChange: (value: WireEndTreatment) => void;
}) {
  const currentMode =
    value.start.stripped && value.end.stripped
      ? 'both'
      : value.start.stripped
        ? 'start'
        : value.end.stripped
          ? 'end'
          : 'none';

  const setMode = (mode: 'none' | 'start' | 'end' | 'both') => {
    const strippedEnd = (previous?: WireEndProcessing): WireEndProcessing => ({
      stripped: true,
      stripLengthMm: previous?.stripLengthMm ?? 3,
      termination: previous?.termination === 'terminal' ? 'terminal' : 'tinned',
      ...(previous?.termination === 'terminal'
        ? { terminalModel: previous.terminalModel ?? 'cold-press-terminal' }
        : {}),
    });

    onChange({
      start: mode === 'start' || mode === 'both' ? strippedEnd(value.start) : { stripped: false, termination: 'none' },
      end: mode === 'end' || mode === 'both' ? strippedEnd(value.end) : { stripped: false, termination: 'none' },
    });
  };

  const updateEnd = (key: 'start' | 'end', patch: Partial<WireEndProcessing>) => {
    const current = value[key];
    onChange({
      ...value,
      [key]: {
        ...current,
        ...patch,
      },
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 p-4 space-y-4">
      <div className="mb-1">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-600">剥皮方式</span>
          <select
            value={currentMode}
            onChange={(event) => setMode(event.target.value as 'none' | 'start' | 'end' | 'both')}
            className={fieldClass}
          >
            <option value="none">不剥皮</option>
            <option value="start">左端剥皮</option>
            <option value="end">右端剥皮</option>
            <option value="both">两端剥皮</option>
          </select>
        </label>
      </div>

      {(value.start.stripped || value.end.stripped) && (
        <div className="grid gap-4 md:grid-cols-2">
          {(['start', 'end'] as const).map((key) => {
            const end = value[key];
            if (!end.stripped) {
              return (
                <div key={key} className="rounded-xl border border-dashed border-slate-200 p-4 flex items-center justify-center text-xs text-slate-400 bg-slate-50/50">
                  {key === 'start' ? '左端' : '右端'}不剥皮
                </div>
              );
            }

            return (
              <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 text-xs font-bold text-slate-700 tracking-wide uppercase">{key === 'start' ? '左端工艺' : '右端工艺'}</div>
                <div className="space-y-4">
                  <Field label="剥皮长度 (mm)">
                    <NumberInput
                      min={1}
                      value={end.stripLengthMm ?? 3}
                      onChange={(stripLengthMm) => updateEnd(key, { stripLengthMm })}
                    />
                  </Field>
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-slate-600">后处理（二选一）</div>
                    <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/50 p-1">
                      <TypeButton
                        active={end.termination === 'tinned'}
                        label="沾锡"
                        onClick={() => updateEnd(key, { termination: 'tinned', terminalModel: undefined })}
                      />
                      <TypeButton
                        active={end.termination === 'terminal'}
                        label="打端子"
                        onClick={() => updateEnd(key, { termination: 'terminal', terminalModel: 'cold-press-terminal' })}
                      />
                    </div>
                  </div>
                  {end.termination === 'terminal' && (
                    <Field label="端子型号">
                      <select value={end.terminalModel ?? 'cold-press-terminal'} disabled className={`${fieldClass} disabled:bg-slate-100 disabled:text-slate-500`}>
                        <option value="cold-press-terminal">冷压端子</option>
                      </select>
                    </Field>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


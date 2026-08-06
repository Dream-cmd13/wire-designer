import { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Search, Wand2, X } from 'lucide-react';
import {
  createDefaultDrawingWireRows,
  createDrawingConnectorResources,
  validateDrawingWizardDraft,
} from '@/lib/drawingWizard';
import { CORE_COLOR_OPTIONS, resolveColor } from '@/lib/canvasMaterials';
import { useCatalogStore } from '@/stores/catalogStore';
import { getCatalogConnectors, getCatalogWireColors } from '@/lib/catalogRuntime';
import type {
  DrawingConnectorResource,
  DrawingWireRowDraft,
  DrawingWizardDraft,
  DrawingWizardTopology,
} from '@/types/harness';

interface DrawingWizardDialogProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (draft: DrawingWizardDraft) => void;
}

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

function resourceSummary(resource: DrawingConnectorResource | undefined) {
  if (!resource) return '未选择';
  const pitch = resource.pitchMm ? ` / ${resource.pitchMm}mm` : '';
  return `${resource.name} / ${resource.pinCount}PIN / ${resource.rowCount ?? 1}排${pitch}`;
}

function filterResources(resources: DrawingConnectorResource[], query: string) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return resources.slice(0, 20);
  return resources
    .filter((resource) => `${resource.name} ${resource.category} ${resource.series}`.toLowerCase().includes(keyword))
    .slice(0, 30);
}

function ResourcePicker({
  label,
  resources,
  value,
  query,
  onQueryChange,
  onChange,
}: {
  label: string;
  resources: DrawingConnectorResource[];
  value?: DrawingConnectorResource;
  query: string;
  onQueryChange: (value: string) => void;
  onChange: (resource: DrawingConnectorResource) => void;
}) {
  const filtered = filterResources(resources, query);

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <label className="text-xs font-semibold text-slate-700">{label}</label>
      <div className="mt-2 flex items-center gap-2 rounded-md border border-slate-300 px-2">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
          placeholder="搜索型号、系列、PIN 数"
        />
      </div>
      <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
        {filtered.map((resource) => (
          <button
            type="button"
            key={`${label}-${resource.id}-${resource.side}`}
            onClick={() => onChange(resource)}
            className={`w-full cursor-pointer rounded-md border px-2 py-2 text-left text-xs transition-colors ${
              value?.id === resource.id
                ? 'border-blue-300 bg-blue-50 text-blue-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="font-medium">{resource.name}</div>
            <div className="mt-0.5 text-slate-500">
              {resource.pinCount}PIN · {resource.rowCount ?? 1}排 · {resource.pitchMm ?? '-'}mm
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function updateRows(
  rows: DrawingWireRowDraft[],
  patch: Partial<Pick<DrawingWireRowDraft, 'lengthMm' | 'signalName' | 'color' | 'connectionNo'>>,
  index?: number,
) {
  if (index === undefined) {
    return rows.map((row) => ({ ...row, ...patch }));
  }
  return rows.map((row) => (row.index === index ? { ...row, ...patch } : row));
}

export function DrawingWizardDialog({ open, onClose, onGenerate }: DrawingWizardDialogProps) {
  const connectors = useCatalogStore((state) => getCatalogConnectors(state.snapshot));
  const wireColors = useCatalogStore((state) => getCatalogWireColors(state.snapshot));
  const electronicColors = useMemo(() => wireColors.map((color) => color.id), [wireColors]);
  const singleResources = useMemo(() => createDrawingConnectorResources('none', connectors), [connectors]);
  const leftResources = useMemo(() => createDrawingConnectorResources('left', connectors), [connectors]);
  const rightResources = useMemo(() => createDrawingConnectorResources('right', connectors), [connectors]);
  const defaultResource = singleResources.find((resource) => resource.id === 'a1008h-2x20p') ?? singleResources[0];
  const [step, setStep] = useState(0);
  const [singleQuery, setSingleQuery] = useState('A1008H');
  const [leftQuery, setLeftQuery] = useState('A1008H');
  const [rightQuery, setRightQuery] = useState('A1008H');
  const [draft, setDraft] = useState<DrawingWizardDraft>(() => ({
    topology: {
      harnessType: 'internal',
      topology: 'double-end',
      wireKind: 'jacketed',
    },
    leftResource: leftResources.find((resource) => resource.id === defaultResource.id),
    rightResource: rightResources.find((resource) => resource.id === defaultResource.id),
    singleResource: defaultResource,
    attributes: {
      drawingWireNo: 'WH-A1008H-40P',
      totalLengthMm: 320,
      lengthToleranceMm: 10,
      heatShrinkId: 'HS-01',
    },
    wires: createDefaultDrawingWireRows(defaultResource?.pinCount ?? 1, 320),
  }));

  if (!open) return null;

  const isSingle = draft.topology.topology === 'single-end';
  const pinCount = isSingle
    ? draft.singleResource?.pinCount ?? 1
    : Math.min(draft.leftResource?.pinCount ?? 1, draft.rightResource?.pinCount ?? 1);
  const validation = validateDrawingWizardDraft(draft);
  const steps = ['拓扑', '资源', '属性', '预览'];

  const setTopology = (patch: Partial<DrawingWizardTopology>) => {
    setDraft((current) => {
      const nextTopology = { ...current.topology, ...patch };
      const nextIsSingle = nextTopology.topology === 'single-end';
      const nextPinCount = nextIsSingle
        ? current.singleResource?.pinCount ?? 1
        : Math.min(current.leftResource?.pinCount ?? 1, current.rightResource?.pinCount ?? 1);
      return {
        ...current,
        topology: nextTopology,
        wires: createDefaultDrawingWireRows(nextPinCount, current.attributes.totalLengthMm ?? 300),
      };
    });
  };

  const setResource = (key: 'singleResource' | 'leftResource' | 'rightResource', resource: DrawingConnectorResource) => {
    setDraft((current) => {
      const next = { ...current, [key]: resource };
      const nextIsSingle = next.topology.topology === 'single-end';
      const nextPinCount = nextIsSingle
        ? next.singleResource?.pinCount ?? 1
        : Math.min(next.leftResource?.pinCount ?? 1, next.rightResource?.pinCount ?? 1);
      return {
        ...next,
        wires: createDefaultDrawingWireRows(nextPinCount, next.attributes.totalLengthMm ?? 300),
      };
    });
  };

  const canContinue =
    step === 0
    || (step === 1 && (isSingle ? Boolean(draft.singleResource) : Boolean(draft.leftResource && draft.rightResource)))
    || step > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-blue-600" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">制造图绘图向导</h2>
              <p className="text-xs text-slate-500">从业务参数生成 HarnessConfig 与 A4 制造图对象</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex border-b border-slate-200 px-5 py-3">
          {steps.map((name, index) => (
            <button
              type="button"
              key={name}
              onClick={() => setStep(index)}
              className={`mr-2 rounded-full px-3 py-1 text-xs font-medium ${
                step === index ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {index + 1}. {name}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {step === 0 && (
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="类型">
                <select
                  className={inputClass}
                  value={draft.topology.harnessType}
                  onChange={(event) => setTopology({ harnessType: event.target.value as DrawingWizardTopology['harnessType'] })}
                >
                  <option value="internal">内线</option>
                  <option value="external">外线</option>
                </select>
              </Field>
              <Field label="子类型">
                <select
                  className={inputClass}
                  value={draft.topology.topology}
                  onChange={(event) => setTopology({ topology: event.target.value as DrawingWizardTopology['topology'] })}
                >
                  <option value="single-end">单头</option>
                  <option value="double-end">双头</option>
                </select>
              </Field>
              <Field label="线材类型">
                <select
                  className={inputClass}
                  value={draft.topology.wireKind}
                  onChange={(event) => setTopology({ wireKind: event.target.value as DrawingWizardTopology['wireKind'] })}
                >
                  <option value="electronic">普通线</option>
                  <option value="jacketed">屏蔽线/多芯线</option>
                </select>
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className={`grid gap-4 ${isSingle ? 'md:grid-cols-1' : 'md:grid-cols-2'}`}>
              {isSingle ? (
                <ResourcePicker
                  label="选择连接器/模型"
                  resources={singleResources}
                  value={draft.singleResource}
                  query={singleQuery}
                  onQueryChange={setSingleQuery}
                  onChange={(resource) => setResource('singleResource', resource)}
                />
              ) : (
                <>
                  <ResourcePicker
                    label="选择左连接器/模型"
                    resources={leftResources}
                    value={draft.leftResource}
                    query={leftQuery}
                    onQueryChange={setLeftQuery}
                    onChange={(resource) => setResource('leftResource', resource)}
                  />
                  <ResourcePicker
                    label="选择右连接器/模型"
                    resources={rightResources}
                    value={draft.rightResource}
                    query={rightQuery}
                    onQueryChange={setRightQuery}
                    onChange={(resource) => setResource('rightResource', resource)}
                  />
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <Field label="图纸线号">
                  <input
                    className={inputClass}
                    value={draft.attributes.drawingWireNo ?? ''}
                    onChange={(event) => setDraft({ ...draft, attributes: { ...draft.attributes, drawingWireNo: event.target.value } })}
                  />
                </Field>
                <Field label="总长度 (mm)">
                  <input
                    className={inputClass}
                    type="number"
                    value={draft.attributes.totalLengthMm ?? ''}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setDraft({
                        ...draft,
                        attributes: { ...draft.attributes, totalLengthMm: value },
                        wires: updateRows(draft.wires, { lengthMm: value }),
                      });
                    }}
                  />
                </Field>
                <Field label="长度公差 (mm)">
                  <input
                    className={inputClass}
                    type="number"
                    value={draft.attributes.lengthToleranceMm ?? ''}
                    onChange={(event) => setDraft({
                      ...draft,
                      attributes: { ...draft.attributes, lengthToleranceMm: Number(event.target.value) },
                    })}
                  />
                </Field>
                <Field label="热缩套管">
                  <input
                    className={inputClass}
                    value={draft.attributes.heatShrinkId ?? ''}
                    onChange={(event) => setDraft({
                      ...draft,
                      attributes: { ...draft.attributes, heatShrinkId: event.target.value },
                    })}
                    placeholder="可选"
                  />
                </Field>
              </div>

              {isSingle && draft.topology.wireKind === 'electronic' && (
                <div className="grid gap-4 rounded-md border border-slate-200 p-3 md:grid-cols-3">
                  <Field label="尾部剥皮上锡 (mm)">
                    <input
                      className={inputClass}
                      type="number"
                      value={draft.attributes.tailTreatment?.stripTinLengthMm ?? ''}
                      onChange={(event) => setDraft({
                        ...draft,
                        attributes: {
                          ...draft.attributes,
                          tailTreatment: {
                            ...draft.attributes.tailTreatment,
                            stripTinLengthMm: Number(event.target.value),
                          },
                        },
                      })}
                    />
                  </Field>
                  <Field label="尾部公差 (mm)">
                    <input
                      className={inputClass}
                      type="number"
                      value={draft.attributes.tailTreatment?.toleranceMm ?? ''}
                      onChange={(event) => setDraft({
                        ...draft,
                        attributes: {
                          ...draft.attributes,
                          tailTreatment: {
                            ...draft.attributes.tailTreatment,
                            toleranceMm: Number(event.target.value),
                          },
                        },
                      })}
                    />
                  </Field>
                  <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.attributes.tailTreatment?.halfStrip)}
                      onChange={(event) => setDraft({
                        ...draft,
                        attributes: {
                          ...draft.attributes,
                          tailTreatment: {
                            ...draft.attributes.tailTreatment,
                            halfStrip: event.target.checked,
                          },
                        },
                      })}
                    />
                    半剥
                  </label>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDraft({
                    ...draft,
                    wires: draft.wires.map((row) => ({
                      ...row,
                      signalName: `WIRE-${String(row.index).padStart(2, '0')}`,
                      connectionNo: String(row.index),
                    })),
                  })}
                  className="cursor-pointer rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  自动线号/接线号
                </button>
                <button
                  type="button"
                  onClick={() => setDraft({
                    ...draft,
                    wires: createDefaultDrawingWireRows(pinCount, draft.attributes.totalLengthMm ?? 300),
                  })}
                  className="cursor-pointer rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  按 PIN 重置 {pinCount} 条
                </button>
              </div>

              <div className="max-h-72 overflow-auto rounded-md border border-slate-200">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="w-14 px-3 py-2">PIN</th>
                      <th className="px-3 py-2">颜色</th>
                      <th className="px-3 py-2">长度</th>
                      <th className="px-3 py-2">线号</th>
                      <th className="px-3 py-2">接线号</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.wires.map((wire) => (
                      <tr key={wire.index} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-700">{wire.index}</td>
                        <td className="px-3 py-2">
                          <select
                            className="w-40 rounded border border-slate-300 px-2 py-1"
                            value={wire.color}
                            onChange={(event) => setDraft({
                              ...draft,
                              wires: updateRows(draft.wires, { color: event.target.value }, wire.index),
                            })}
                          >
                            {(draft.topology.wireKind === 'jacketed' ? CORE_COLOR_OPTIONS : electronicColors).map((color) => {
                              const resolved = resolveColor(color);
                              return (
                                <option key={color} value={color}>
                                  {resolved.name}
                                </option>
                              );
                            })}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-24 rounded border border-slate-300 px-2 py-1"
                            type="number"
                            value={wire.lengthMm ?? ''}
                            onChange={(event) => setDraft({
                              ...draft,
                              wires: updateRows(draft.wires, { lengthMm: Number(event.target.value) }, wire.index),
                            })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-32 rounded border border-slate-300 px-2 py-1"
                            value={wire.signalName ?? ''}
                            onChange={(event) => setDraft({
                              ...draft,
                              wires: updateRows(draft.wires, { signalName: event.target.value }, wire.index),
                            })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-24 rounded border border-slate-300 px-2 py-1"
                            value={wire.connectionNo}
                            onChange={(event) => setDraft({
                              ...draft,
                              wires: updateRows(draft.wires, { connectionNo: event.target.value }, wire.index),
                            })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-4 md:grid-cols-[1fr_320px]">
              <div className="rounded-md border border-slate-200 p-4 text-sm text-slate-700">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">生成摘要</h3>
                <div className="grid gap-2">
                  <p>拓扑：{isSingle ? '单头' : '双头'} · {draft.topology.wireKind === 'jacketed' ? '屏蔽线/多芯线' : '普通线'}</p>
                  <p>连接器：{isSingle ? resourceSummary(draft.singleResource) : `${resourceSummary(draft.leftResource)} → ${resourceSummary(draft.rightResource)}`}</p>
                  <p>总长：{draft.attributes.totalLengthMm ?? '-'}±{draft.attributes.lengthToleranceMm ?? 0}mm</p>
                  <p>线材行：{draft.wires.length} 条，已填线号 {draft.wires.filter((wire) => wire.signalName?.trim()).length}/{draft.wires.length}</p>
                </div>
              </div>
              <div className="rounded-md border border-slate-200 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">校验</h3>
                {validation.errors.length === 0 && validation.warnings.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-emerald-700">
                    <Check className="h-4 w-4" />
                    可以生成制造图。
                  </div>
                ) : (
                  <div className="space-y-2 text-xs">
                    {validation.errors.map((error) => (
                      <p key={error} className="rounded bg-red-50 px-2 py-1 text-red-700">{error}</p>
                    ))}
                    {validation.warnings.map((warning) => (
                      <p key={warning} className="rounded bg-amber-50 px-2 py-1 text-amber-700">{warning}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((value) => Math.max(0, value - 1))}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            上一步
          </button>
          {step < steps.length - 1 ? (
            <button
              type="button"
              disabled={!canContinue}
              onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}
              className="flex cursor-pointer items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              下一步
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              disabled={validation.errors.length > 0}
              onClick={() => onGenerate(draft)}
              className="flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Check className="h-3.5 w-3.5" />
              生成制造图
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

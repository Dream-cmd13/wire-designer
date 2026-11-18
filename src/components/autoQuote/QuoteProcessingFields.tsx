import { getQuoteProcessing } from '@/lib/quoteProcessing';
import type { HarnessConfig } from '@/types/harness';

type ProcessingCounts = Pick<NonNullable<HarnessConfig['quotation']>, 'weldingPoints' | 'strippingPoints' | 'crimpingPoints'>;

export function QuoteProcessingFields({ config, onChange }: {
  config: HarnessConfig | null;
  onChange: (counts: ProcessingCounts) => void;
}) {
  if (!config || !config.materials.length || !config.connectors.length) return null;
  const defaults = getQuoteProcessing(config);
  return <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-xs">
    <p className="font-semibold text-slate-800">实际加工点数（整条线束合计）</p>
    <p className="text-slate-500">{defaults.requiresActualCounts
      ? '当前为混合规格，请按实际接线填写点数；空芯和未连接针位不计焊接。'
      : '留空按全部芯线加工计费，也可填写实际点数。'}一根芯线分接两个针位计 2 个焊点；焊接点数包含实际连接的屏蔽焊点；剥皮点数仅计芯线，包含沾锡端。压端子单独记录次数，暂不计费。</p>
    <div className="grid grid-cols-2 gap-3">
      {([['weldingPoints', '实际焊接点数'], ['strippingPoints', '芯线剥皮点数']] as const).map(([field, label]) => <label key={field} className="space-y-1">
        <span>{label}</span>
        <input type="number" min={0} max={1000} step={1}
          required={defaults.requiresActualCounts}
          value={config.quotation?.[field] ?? ''}
          placeholder={defaults.requiresActualCounts ? '请填写' : `默认 ${defaults[field]}`}
          onChange={event => onChange({ [field]: event.target.value === '' ? undefined : Number(event.target.value) })}
          className="block w-full rounded border border-slate-300 p-2" />
      </label>)}
      <label className="space-y-1">
        <span>压端子次数（暂不计费）</span>
        <input type="number" min={0} max={1000} step={1}
          value={config.quotation?.crimpingPoints ?? ''} placeholder="默认 0"
          onChange={event => onChange({ crimpingPoints: event.target.value === '' ? undefined : Number(event.target.value) })}
          className="block w-full rounded border border-slate-300 p-2" />
      </label>
    </div>
  </div>;
}

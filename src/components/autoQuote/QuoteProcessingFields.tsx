import { getQuoteProcessing } from '@/lib/quoteProcessing';
import type { HarnessConfig } from '@/types/harness';

type ProcessingCounts = Pick<NonNullable<HarnessConfig['quotation']>, 'weldingPoints' | 'strippingPoints' | 'crimpingPoints'>;

export function QuoteProcessingFields({ config, onChange }: {
  config: HarnessConfig | null;
  onChange?: (counts: ProcessingCounts) => void;
}) {
  if (!config || !config.materials.length || !config.connectors.length) return null;
  const defaults = getQuoteProcessing(config);
  if (!defaults.estimated) return <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-xs">
    <p className="font-semibold text-slate-800">自动加工点数（整条线束合计）</p>
    <p className="text-slate-500">按当前图纸接线自动计算，空芯和未连接针位不计焊接。一芯分接两针计 2 个焊点，该芯该端剥皮计 1 次；多芯接同针分别计焊接，跳线不重复计已有连接。压端子暂不计费。</p>
    <dl className="grid grid-cols-3 gap-3">
      {([['weldingPoints', '焊接点数'], ['strippingPoints', '芯线剥皮点数'], ['crimpingPoints', '压端子次数']] as const).map(([field, label]) =>
        <div key={field}><dt className="text-slate-500">{label}</dt><dd className="mt-1 text-lg font-semibold text-slate-800"><output aria-label={`自动${label}`}>{defaults[field]}</output></dd></div>)}
    </dl>
    {defaults.shieldWeldingPoints > 0 && <p className="text-slate-500">已按屏蔽线与已接屏蔽连接器的组合计入 {defaults.shieldWeldingPoints} 个屏蔽焊点。</p>}
    {defaults.weldingPoints === 0 && <p className="text-amber-700">当前没有已连接针位，报价按已配置物料和工艺计算；补充接线后自动更新。</p>}
  </div>;
  return <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-xs">
    <p className="font-semibold text-slate-800">加工点数估算（可选调整）</p>
    <p className="text-slate-500">此页未配置接线图，每端按芯数与针数的较小值估算，屏蔽线接屏蔽头时加一个屏蔽焊点。留空即可自动报价，分接等特殊接法可调整点数；项目图纸报价按实际接线自动计算。压端子暂不计费。</p>
    <div className="grid grid-cols-2 gap-3">
      {([['weldingPoints', '实际焊接点数'], ['strippingPoints', '芯线剥皮点数']] as const).map(([field, label]) => <label key={field} className="space-y-1">
        <span>{label}</span>
        <input type="number" min={0} max={1000} step={1}
          value={config.quotation?.[field] ?? ''}
          placeholder={`自动估算 ${defaults[field]}`}
          onChange={event => onChange?.({ [field]: event.target.value === '' ? undefined : Number(event.target.value) })}
          className="block w-full rounded border border-slate-300 p-2" />
      </label>)}
      <label className="space-y-1">
        <span>压端子次数（暂不计费）</span>
        <input type="number" min={0} max={1000} step={1}
          value={config.quotation?.crimpingPoints ?? ''} placeholder="默认 0"
          onChange={event => onChange?.({ crimpingPoints: event.target.value === '' ? undefined : Number(event.target.value) })}
          className="block w-full rounded border border-slate-300 p-2" />
      </label>
    </div>
  </div>;
}

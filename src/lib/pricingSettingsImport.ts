import type { PricingSettings } from '@/types/pricingSettings';

export function parsePricingSettingsImport(text: string, current: PricingSettings): PricingSettings {
  const input = JSON.parse(text);
  const rates = ['materialLossRate', 'processingLossRate', 'marginRate', 'freightRate'];
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(k => ![...rates, 'laborRates', 'version'].includes(k))) throw new Error('参数字段无效');
  const valid = (v: unknown) => typeof v === 'string' && /^[0-9]{1,9}(\.[0-9]{1,6})?$/.test(v);
  if (rates.some(k => !valid(input[k]) || Number(input[k]) >= 1)) throw new Error('费率必须为 0 到 1 之间的小数，最多六位小数');
  const labor = input.laborRates;
  const names = Object.keys(current.laborRates);
  if (!labor || typeof labor !== 'object' || Array.isArray(labor)
    || Object.keys(labor).length !== names.length || names.some(k => !valid(labor[k]))) throw new Error('加工单价字段或精度无效');
  return { ...input, version: current.version };
}

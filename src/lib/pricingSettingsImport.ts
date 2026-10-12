import type { PricingSettings } from '@/types/pricingSettings';
import { FINISHING_LABOR_NAMES, FINISHING_LENGTHS_MM, STANDARD_LABOR_NAMES } from './finishingLaborRates';

export function validatePricingSettings(value: unknown): value is Omit<PricingSettings, 'version'> {
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!object(value)) return false;
  const input = value;
  const rates = ['materialLossRate', 'processingLossRate', 'marginRate', 'freightRate'];
  if (Object.keys(input).some(k => ![...rates, 'laborRates', 'finishingLaborRates', 'version'].includes(k))) return false;
  const valid = (v: unknown) => typeof v === 'string' && /^[0-9]{1,9}(\.[0-9]{1,6})?$/.test(v);
  if (rates.some(k => !valid(input[k]) || Number(input[k]) >= 1)) return false;
  const validRates = (v: unknown, names: readonly string[]) => object(v)
    && Object.keys(v).length === names.length && names.every(k => valid(v[k]));
  const tiers = input.finishingLaborRates;
  return validRates(input.laborRates, STANDARD_LABOR_NAMES) && object(tiers)
    && Object.keys(tiers).length === FINISHING_LENGTHS_MM.length
    && FINISHING_LENGTHS_MM.every(length => validRates(tiers[length], FINISHING_LABOR_NAMES));
}

export function parsePricingSettingsImport(text: string, current: PricingSettings): PricingSettings {
  const input: unknown = JSON.parse(text);
  if (!validatePricingSettings(input)) throw new Error('参数字段、范围或精度无效');
  return { ...input, version: current.version };
}

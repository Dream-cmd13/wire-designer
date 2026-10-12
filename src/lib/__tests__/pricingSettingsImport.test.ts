import { describe, expect, it } from 'vitest';
import { parsePricingSettingsImport } from '../pricingSettingsImport';
import { DEFAULT_PRICING_SETTINGS } from '../../../server/pricing';

describe('pricing parameter import', () => {
  it('round-trips editable length tier prices', () => {
    const imported = { ...DEFAULT_PRICING_SETTINGS, finishingLaborRates: {
      '500': { 电测: '0.05', 外观: '0.05', 包装人工: '0.05' },
      '1000': { 电测: '0.10', 外观: '0.20', 包装人工: '0.10' },
      '2000': { 电测: '0.10', 外观: '0.20', 包装人工: '0.20' },
      '3000': { 电测: '0.10', 外观: '0.20', 包装人工: '0.20' },
      '5000': { 电测: '0.18', 外观: '0.25', 包装人工: '0.40' },
    } };
    expect(parsePricingSettingsImport(JSON.stringify(imported), DEFAULT_PRICING_SETTINGS)).toEqual(imported);
  });
  it('imports valid parameters without trusting the file version', () => {
    const imported = { ...DEFAULT_PRICING_SETTINGS, version: 999, marginRate: '0.3' };
    expect(parsePricingSettingsImport(JSON.stringify(imported), DEFAULT_PRICING_SETTINGS)).toEqual({ ...imported, version: DEFAULT_PRICING_SETTINGS.version });
  });
  it('rejects unknown fields, missing labor rates, negative and imprecise values', () => {
    for (const change of [{ extra: '1' }, { marginRate: '1' }, { freightRate: '-0.1' }, { materialLossRate: '0.1234567' }, { laborRates: {} }]) {
      expect(() => parsePricingSettingsImport(JSON.stringify({ ...DEFAULT_PRICING_SETTINGS, ...change }), DEFAULT_PRICING_SETTINGS)).toThrow();
    }
  });
  it.each([null, {}, [], { ...DEFAULT_PRICING_SETTINGS.finishingLaborRates, '6000': {} },
    { ...DEFAULT_PRICING_SETTINGS.finishingLaborRates, '500': null },
    ...['-1', '0.1234567', '', 'NaN', 0.1, null].map(rate => ({
      ...DEFAULT_PRICING_SETTINGS.finishingLaborRates,
      '500': { ...DEFAULT_PRICING_SETTINGS.finishingLaborRates['500'], 电测: rate },
    })),
  ])('rejects incomplete or invalid tier configuration %j', (finishingLaborRates) => {
    expect(() => parsePricingSettingsImport(JSON.stringify({ ...DEFAULT_PRICING_SETTINGS, finishingLaborRates }), DEFAULT_PRICING_SETTINGS)).toThrow();
  });
});

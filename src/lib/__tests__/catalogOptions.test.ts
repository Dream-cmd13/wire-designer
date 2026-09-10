import { describe, expect, it } from 'vitest';
import {
  LEAD_TIME_OPTIONS,
  PRICING_RULES,
  PROTECTION_OPTIONS,
  QUANTITY_DISCOUNT_RULES,
  WIRE_COLORS,
  staticCatalogOptions,
} from '@/data/catalogOptions';

describe('static catalog options', () => {
  it('keeps display options without demo prices or discounts', () => {
    expect(WIRE_COLORS).toHaveLength(14);
    expect(LEAD_TIME_OPTIONS).toEqual([
      { id: 'rush', name: '加急', days: '10个工作日', multiplier: 1 },
      { id: 'standard', name: '标准', days: '20-30个工作日', multiplier: 1 },
      { id: 'economy', name: '经济', days: '30-50个工作日', multiplier: 1 },
    ]);
    expect(PROTECTION_OPTIONS).toEqual([{ id: 'none', name: '无', price: 0, materialMultipliers: {} }]);
    expect(PRICING_RULES).toEqual([]);
    expect(QUANTITY_DISCOUNT_RULES).toEqual([]);
  });

  it('returns fresh arrays and nested option data for each snapshot', () => {
    const first = staticCatalogOptions();
    const second = staticCatalogOptions();

    expect(first.wireColors).not.toBe(second.wireColors);
    expect(first.protectionOptions[0]).not.toBe(second.protectionOptions[0]);
    expect(first.protectionOptions[0].materialMultipliers)
      .not.toBe(second.protectionOptions[0].materialMultipliers);
  });
});

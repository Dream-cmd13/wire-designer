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
  it('preserves the database-backed business baseline', () => {
    expect(WIRE_COLORS).toHaveLength(14);
    expect(LEAD_TIME_OPTIONS).toEqual([
      { id: 'rush', name: '加急', days: '10个工作日', multiplier: 1.3 },
      { id: 'standard', name: '标准', days: '20-30个工作日', multiplier: 1 },
      { id: 'economy', name: '经济', days: '30-50个工作日', multiplier: 0.9 },
    ]);
    expect(PROTECTION_OPTIONS).toHaveLength(8);
    expect(PRICING_RULES).toHaveLength(15);
    expect(QUANTITY_DISCOUNT_RULES.map((rule) => rule.minimumQuantity))
      .toEqual([1, 5, 10, 20, 50, 100]);
  });

  it('returns fresh arrays and nested option data for each snapshot', () => {
    const first = staticCatalogOptions();
    const second = staticCatalogOptions();

    expect(first.wireColors).not.toBe(second.wireColors);
    expect(first.protectionOptions[7]).not.toBe(second.protectionOptions[7]);
    expect(first.protectionOptions[7].materialMultipliers)
      .not.toBe(second.protectionOptions[7].materialMultipliers);
  });
});

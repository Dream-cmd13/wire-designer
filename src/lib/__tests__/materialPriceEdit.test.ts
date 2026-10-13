import { describe, expect, it } from 'vitest';
import { createPriceDrafts, buildPriceEdits, formatMaterialPrice } from '@/lib/materialPriceEdit';
import type { QuoteMaterial } from '@/lib/quoteMaterials';
const wire: QuoteMaterial = { kind: 'wire', resourceId: 'w', name: '线材', specification: '[]', lengthMm: 1000, unit: '元/条', quantity: 1 };
const existing = { ...wire, taxIncludedPrice: '1.123456', updatedAt: '2026-10-12T00:00:00Z' };
describe('manual material price drafts', () => {
  it('displays six-decimal and zero prices without rounding away changes', () => {
    expect(formatMaterialPrice('0.000001')).toBe('0.000001');
    expect(formatMaterialPrice('1.123456')).toBe('1.123456');
    expect(formatMaterialPrice('0')).toBe('0.00');
    expect(formatMaterialPrice('2.500000')).toBe('2.50');
  });
  it('keeps exact precision and all existing wire tiers', () => {
    const rows = createPriceDrafts([wire], [existing, { ...existing, lengthMm: 500, taxIncludedPrice: '0' }]);
    expect(rows.map(r => r.length)).toEqual(['500', '1000']);
    expect(rows.map(r => r.price)).toEqual(['0', '1.123456']);
    expect(buildPriceEdits(rows)).toEqual([]);
    expect(buildPriceEdits([{ ...rows[1], price: '2.123456' }])[0].expectedUpdatedAt).toBe(existing.updatedAt);
  });
  it('leaves missing prices blank and permits explicit zero', () => {
    const rows = createPriceDrafts([wire], []);
    expect(rows[0].price).toBe('');
    expect(buildPriceEdits(rows)).toEqual([]);
    expect(buildPriceEdits([{ ...rows[0], price: '0' }])[0]).toMatchObject({ taxIncludedPrice: '0', expectedUpdatedAt: null });
  });
  it('rejects clearing saved prices, negative prices, overprecision and invalid or duplicate lengths', () => {
    const row = createPriceDrafts([wire], [existing])[0];
    for (const price of ['', '-1', '1.1234567', '1e2']) expect(() => buildPriceEdits([{ ...row, price }])).toThrow();
    for (const length of ['0', '1.5', '1001']) expect(() => buildPriceEdits([{ ...row, length, price: '2' }])).toThrow();
    const blank = createPriceDrafts([wire], [])[0];
    expect(() => buildPriceEdits([{ ...blank, price: '1' }, { ...blank, price: '2' }])).toThrow('重复');
  });
  it('treats inner and outer mold prices independently', () => {
    const outer: QuoteMaterial = { ...wire, kind: 'outer-mold', lengthMm: 0, unit: '元/个' };
    const rows = createPriceDrafts([outer, { ...outer, kind: 'inner-mold' }], []);
    expect(buildPriceEdits(rows.map((r, i) => ({ ...r, price: String(i) }))).map(r => r.kind)).toEqual(['outer-mold', 'inner-mold']);
  });
});

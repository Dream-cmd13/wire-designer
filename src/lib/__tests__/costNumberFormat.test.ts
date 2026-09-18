import { describe, expect, it } from 'vitest';
import { formatCostNumber } from '../costNumberFormat';

describe('Excel cost number display', () => {
  it('renders General and unformatted small or large numbers without exponents', () => {
    expect(formatCostNumber(0.0000833333333333333, 'General')).toBe('0.000083');
    expect(formatCostNumber(1e-8, 'General')).toBe('<0.000001');
    expect(formatCostNumber(1e-8)).toBe('<0.000001');
    expect(formatCostNumber(1e21, 'General')).toBe('1000000000000000000000');
    expect(formatCostNumber(-1e-8, 'General')).toBe('>-0.000001');
    expect(formatCostNumber(0, 'General')).toBe('0');
    expect(formatCostNumber(0.00000049, 'General')).toBe('<0.000001');
    expect(formatCostNumber(0.0000005, 'General')).toBe('0.000001');
    expect(formatCostNumber(-0.0000005, 'General')).toBe('-0.000001');
    expect(formatCostNumber(1.23, 'General')).toBe('1.23');
  });
  it('removes Excel alignment padding while retaining fractional zeroes', () => {
    expect(formatCostNumber(1.2, '0.00_ ')).toBe('1.20');
    expect(formatCostNumber(1.2, '#,##0.000000_ ')).toBe('1.200000');
  });
  it('preserves explicit two and six decimal formats including trailing zeroes', () => {
    expect(formatCostNumber(1.2, '0.00')).toBe('1.20');
    expect(formatCostNumber(1.2, '0.000000')).toBe('1.200000');
    expect(formatCostNumber(0.0000666666666667, '0.000000')).toBe('0.000067');
  });

  it('uses Excel optional digits, grouping, and zero formats', () => {
    expect(formatCostNumber(1234.5, '#,##0.00####')).toBe('1,234.50');
    expect(formatCostNumber(0, '0.000000')).toBe('0.000000');
    expect(formatCostNumber(null, '0.00', '原表未提供')).toBe('原表未提供');
  });

  it('limits General and unformatted values to six fractional digits', () => {
    expect(formatCostNumber(1.23456789)).toBe('1.234568');
    expect(formatCostNumber(1.2, 'General')).toBe('1.2');
  });
});

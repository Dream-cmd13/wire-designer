import { describe, expect, it } from 'vitest';
import {
  calculateDefaultWireTolerance,
  normalizeToleranceSign,
  resolveWireDimension,
} from '../wireTolerance';

describe('wireTolerance', () => {
  describe('calculateDefaultWireTolerance', () => {
    it('returns ±10 for lengths <= 100mm', () => {
      expect(calculateDefaultWireTolerance(50)).toEqual({ upper: '+10', lower: '-10' });
      expect(calculateDefaultWireTolerance(100)).toEqual({ upper: '+10', lower: '-10' });
    });

    it('returns ±20 for lengths > 100mm and <= 1000mm', () => {
      expect(calculateDefaultWireTolerance(101)).toEqual({ upper: '+20', lower: '-20' });
      expect(calculateDefaultWireTolerance(500)).toEqual({ upper: '+20', lower: '-20' });
      expect(calculateDefaultWireTolerance(1000)).toEqual({ upper: '+20', lower: '-20' });
    });

    it('returns ±2% for lengths > 1000mm', () => {
      expect(calculateDefaultWireTolerance(1001)).toEqual({ upper: '+2%', lower: '-2%' });
      expect(calculateDefaultWireTolerance(1500)).toEqual({ upper: '+2%', lower: '-2%' });
      expect(calculateDefaultWireTolerance(3000)).toEqual({ upper: '+2%', lower: '-2%' });
    });
  });

  describe('normalizeToleranceSign', () => {
    it('adds prefix sign if missing', () => {
      expect(normalizeToleranceSign('10', '+')).toBe('+10');
      expect(normalizeToleranceSign('5', '-')).toBe('-5');
      expect(normalizeToleranceSign('2%', '+')).toBe('+2%');
      expect(normalizeToleranceSign(15, '+')).toBe('+15');
    });

    it('preserves existing prefix signs', () => {
      expect(normalizeToleranceSign('+10', '+')).toBe('+10');
      expect(normalizeToleranceSign('-5', '-')).toBe('-5');
      expect(normalizeToleranceSign('±10', '+')).toBe('±10');
    });

    it('handles empty or zero values', () => {
      expect(normalizeToleranceSign('', '+')).toBe('+0');
      expect(normalizeToleranceSign(undefined, '-')).toBe('-0');
    });
  });

  describe('resolveWireDimension', () => {
    it('resolves default tolerances automatically when no override is set', () => {
      const res50 = resolveWireDimension(50);
      expect(res50).toEqual({
        length: 50,
        lengthDisplay: '50',
        upper: '+10',
        lower: '-10',
        isCustom: false,
      });

      const res500 = resolveWireDimension(500);
      expect(res500).toEqual({
        length: 500,
        lengthDisplay: '500',
        upper: '+20',
        lower: '-20',
        isCustom: false,
      });

      const res2000 = resolveWireDimension(2000);
      expect(res2000).toEqual({
        length: 2000,
        lengthDisplay: '2000',
        upper: '+2%',
        lower: '-2%',
        isCustom: false,
      });
    });

    it('applies custom user overrides when isCustom is true', () => {
      const customRes = resolveWireDimension(500, {
        isCustom: true,
        displayLength: 500,
        upperTolerance: '+10',
        lowerTolerance: '-5',
      });
      expect(customRes).toEqual({
        length: 500,
        lengthDisplay: '500',
        upper: '+10',
        lower: '-5',
        isCustom: true,
      });
    });

    it('falls back to default rules when custom flag is false despite values', () => {
      const res = resolveWireDimension(500, {
        isCustom: false,
        upperTolerance: '+99',
        lowerTolerance: '-99',
      });
      expect(res.upper).toBe('+20');
      expect(res.lower).toBe('-20');
      expect(res.isCustom).toBe(false);
    });
  });
});

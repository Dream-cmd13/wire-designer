import { describe, expect, it } from 'vitest';
import {
  buildOvermoldBomEntries,
  formatOvermoldForm,
  formatOvermoldFullSpec,
  formatOvermoldOuterLabel,
  getAvailableInnerMold,
} from '@/lib/overmoldSpec';
import type { OvermoldSpec } from '@/types/harness';

describe('overmoldSpec pure functions', () => {
  describe('formatOvermoldOuterLabel', () => {
    it('combines 黑色PVC with 45P', () => {
      expect(formatOvermoldOuterLabel({ outerMaterial: '黑色PVC', outerHardness: '45P' })).toBe('黑色PVC 45P');
    });

    it('returns material directly when no hardness is present', () => {
      expect(formatOvermoldOuterLabel({ outerMaterial: '黑色TPE' })).toBe('黑色TPE');
    });

    it('does not duplicate hardness if already in material name', () => {
      expect(formatOvermoldOuterLabel({ outerMaterial: '黑色PVC 45P', outerHardness: '45P' })).toBe('黑色PVC 45P');
    });

    it('handles empty or undefined input', () => {
      expect(formatOvermoldOuterLabel()).toBe('');
      expect(formatOvermoldOuterLabel({ outerMaterial: '' })).toBe('');
    });
  });

  describe('formatOvermoldForm', () => {
    it('translates straight to 直头', () => {
      expect(formatOvermoldForm('straight')).toBe('直头');
    });

    it('translates bent to 弯头', () => {
      expect(formatOvermoldForm('bent')).toBe('弯头');
    });

    it('preserves Chinese terms', () => {
      expect(formatOvermoldForm('直头')).toBe('直头');
      expect(formatOvermoldForm('弯头')).toBe('弯头');
    });

    it('returns empty string for missing form', () => {
      expect(formatOvermoldForm(undefined)).toBe('');
    });
  });

  describe('formatOvermoldFullSpec', () => {
    it('formats PVC straight overmold correctly', () => {
      const spec: OvermoldSpec = {
        id: 'pvc-straight',
        name: 'PVC 直头外模',
        outerMaterial: '黑色PVC',
        outerHardness: '45P',
        outerForm: 'straight',
      };
      expect(formatOvermoldFullSpec(spec)).toBe('黑色PVC 45P · 直头');
    });

    it('formats TPE bent overmold correctly', () => {
      const spec: OvermoldSpec = {
        id: 'tpe-bent',
        name: 'TPE 弯头外模',
        outerMaterial: '黑色TPE',
        outerForm: 'bent',
      };
      expect(formatOvermoldFullSpec(spec)).toBe('黑色TPE · 弯头');
    });
  });

  describe('getAvailableInnerMold', () => {
    it('returns null if inner mold metadata is missing or inconsistent', () => {
      expect(getAvailableInnerMold()).toBeNull();
      expect(getAvailableInnerMold({
        id: 'o1',
        name: 'test',
        outerMaterial: '黑色TPE',
        outerForm: 'straight',
      })).toBeNull();
      expect(getAvailableInnerMold({
        id: 'o1',
        name: 'test',
        outerMaterial: '黑色TPE',
        outerForm: 'straight',
        innerMaterial: '低密度透明PE',
        innerForm: 'bent',
      })).toBeNull();
    });

    it('returns declared PE and matching form when complete metadata is present', () => {
      const result = getAvailableInnerMold({
        id: 'pvc-45p-pe',
        name: 'PVC 45P PE',
        outerMaterial: '黑色PVC',
        outerHardness: '45P',
        outerForm: 'bent',
        innerMaterial: '低密度透明PE',
        innerForm: 'bent',
      });
      expect(result).toEqual({
        material: '低密度透明PE',
        form: 'bent',
        formLabel: '弯头',
      });
    });

    it('returns straight inner mold metadata', () => {
      const result = getAvailableInnerMold({
        id: 'pvc-45p-pe',
        name: 'PVC 45P PE',
        outerMaterial: '黑色PVC',
        outerHardness: '45P',
        outerForm: 'straight',
        innerMaterial: '低密度透明PE',
        innerForm: 'straight',
      });
      expect(result).toEqual({
        material: '低密度透明PE',
        form: 'straight',
        formLabel: '直头',
      });
    });
  });

  describe('buildOvermoldBomEntries', () => {
    it('groups inner molds by material and form across different outer materials', () => {
      const overmolds: OvermoldSpec[] = [
        {
          id: 'pvc-straight',
          name: 'PVC直头',
          outerMaterial: '黑色PVC',
          outerHardness: '45P',
          outerForm: 'straight',
          innerMaterial: '低密度透明PE',
          innerForm: 'straight',
        },
        {
          id: 'tpe-straight',
          name: 'TPE直头',
          outerMaterial: '黑色TPE',
          outerForm: 'straight',
          innerMaterial: '低密度透明PE',
          innerForm: 'straight',
        },
      ];
      const entries = buildOvermoldBomEntries([
        {
          id: 'model-1', kind: 'outer-box', position: { x: 0, y: 0 }, width: 80, height: 60,
          overmoldSpecId: 'pvc-straight', includeInnerMold: true,
        },
        {
          id: 'model-2', kind: 'outer-box', position: { x: 100, y: 0 }, width: 80, height: 60,
          overmoldSpecId: 'tpe-straight', includeInnerMold: true,
        },
      ], overmolds);

      expect(entries).toEqual([
        { kind: 'outer', specification: '黑色PVC 45P · 直头', quantity: 1 },
        { kind: 'outer', specification: '黑色TPE · 直头', quantity: 1 },
        { kind: 'inner', specification: '低密度透明PE · 直头', quantity: 2 },
      ]);
    });
  });
});

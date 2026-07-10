import { describe, expect, it } from 'vitest';
import { isProductImageEligibleJacketedWire } from '@/lib/autoAssociateTwoDImages';

describe('product image wire matching', () => {
  it('matches any AWG four-core PVC jacketed wire', () => {
    expect(isProductImageEligibleJacketedWire({
      kind: 'jacketed',
      jacketMaterial: 'PVC',
      jacketColor: 'black',
      awg: 24,
      coreCount: 4,
      shielded: false,
      odMm: 6,
      coreColors: ['red', 'black', 'white', 'green'],
      lengthMm: 500,
      endTreatment: {
        start: { stripped: false, termination: 'none' },
        end: { stripped: false, termination: 'none' },
      },
    })).toBe(true);
  });

  it('does not match a non-PVC or non-four-core cable', () => {
    expect(isProductImageEligibleJacketedWire({
      kind: 'jacketed', jacketMaterial: 'PUR', jacketColor: 'black', awg: 24,
      coreCount: 4, shielded: false, odMm: 6, coreColors: [], lengthMm: 500,
      endTreatment: { start: { stripped: false, termination: 'none' }, end: { stripped: false, termination: 'none' } },
    })).toBe(false);
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCostWorkbook, resolvePriceDerivation } from './import-cost-analyses.mjs';

describe('resolvePriceDerivation', () => {
  it('substitutes referenced cells and preserves trailing constants', () => {
    const result = resolvePriceDerivation(
      'K23/0.7+7',
      15.7989,
      19.1982,
      '含税总成本',
      {
        K23: { v: 8.53876744583333 },
      },
    );

    expect(result).toEqual({
      formula: '公式: K23/0.7+7 (目标毛利率 30%)',
      expression: '8.5388 ÷ 0.7 + 7',
    });
  });

  it('substitutes multiple referenced cells in a formula', () => {
    const result = resolvePriceDerivation(
      'K21/0.7+K20',
      10.7908,
      14.0124,
      '含税总成本',
      {
        K20: { v: 2.646 },
        K21: { v: 7.95646744583333 },
      },
    );

    expect(result.expression).toBe('7.9565 ÷ 0.7 + 2.646');
  });

  it('keeps range references untouched instead of corrupting SUM ranges', () => {
    const result = resolvePriceDerivation(
      'SUM(I5:I16)/0.7',
      15.7989,
      19.1982,
      '含税总成本',
      {
        I16: { v: 0.0006 },
        I5: { v: 10.5085 },
      },
    );

    expect(result.expression).toBe('SUM(I5:I16) ÷ 0.7');
  });

  const workbookPath = 'excel/成本分析-WL-B21-499,500.xlsx';
  it.skipIf(!existsSync(workbookPath))(
    'uses the source sheet values when parsing the affected workbooks',
    () => {
      const analyses = parseCostWorkbook(workbookPath);
      const byPlatform = new Map(analyses.map((item) => [item.platformNo, item]));

      expect(byPlatform.get('WL-B21-499-A耐高温').calculationSteps).toContainEqual(
        expect.objectContaining({
          stepKey: 'sales_price',
          expression: '8.5388 ÷ 0.7 + 7',
          result: 19.1982,
        }),
      );
      expect(byPlatform.get('WL-B21-500-A耐高温').calculationSteps).toContainEqual(
        expect.objectContaining({
          stepKey: 'sales_price',
          expression: '7.9565 ÷ 0.7 + 2.646',
          result: 14.0124,
        }),
      );
    },
  );
});

describe('tax embedded in total cost cell', () => {
  const workbookPath = 'excel/WL-B21-592 593 成本分析.xlsx';
  it.skipIf(!existsSync(workbookPath))(
    'splits a tax-inclusive total cell into base total and tax cost',
    () => {
      const byPlatform = new Map(
        parseCostWorkbook(workbookPath).map((item) => [item.platformNo, item]),
      );
      const item = byPlatform.get('WL-B21-592');

      expect(item.totalCost).toBe(18.0055);
      expect(item.taxCost).toBe(18.5457);
      expect(item.formulaConfig.totalCostFormula).toBe('SUM(I11:I14)');
      expect(item.formulaConfig.taxCostFormula).toBe('SUM(I11:I14)*1.03');
      expect(item.calculationSteps).toContainEqual(
        expect.objectContaining({
          stepKey: 'total_cost',
          expression: '13.801 + 0.414 + 3.61 + 0.1805',
          result: 18.0055,
        }),
      );
      expect(item.calculationSteps).toContainEqual(
        expect.objectContaining({
          stepKey: 'tax_cost',
          expression: '18.0055 × 1.03',
          result: 18.5457,
        }),
      );
    },
  );

  const plainPath = 'excel/WL-B21-534-成本分析.xlsx';
  it.skipIf(!existsSync(plainPath))(
    'keeps tax equal to the base total when the sheet has no tax cell',
    () => {
      const byPlatform = new Map(
        parseCostWorkbook(plainPath).map((item) => [item.platformNo, item]),
      );
      const item = byPlatform.get('WL-B21-534');

      expect(item.formulaConfig.taxCostFormula).toBe('');
      expect(item.taxCost).toBe(item.totalCost);
      expect(item.calculationSteps).toContainEqual(
        expect.objectContaining({
          stepKey: 'total_cost',
          expression: '28.039 + 0.8412 + 5.42 + 0.271',
          result: 34.5712,
        }),
      );
    },
  );
});

describe('generated cost analysis seed', () => {
  it('stores the corrected substitution expressions for both affected harnesses', () => {
    const seed = readFileSync(
      'supabase/sql/40_seed/06_finished_harness_cost_analyses.sql',
      'utf8',
    );

    expect(seed).toContain('"expression":"8.5388 ÷ 0.7 + 7"');
    expect(seed).toContain('"expression":"7.9565 ÷ 0.7 + 2.646"');
    expect(seed).not.toContain('"expression":"15.7989 ÷ 0.7","result":19.1982');
  });
});

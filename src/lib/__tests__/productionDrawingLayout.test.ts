import { describe, expect, it } from 'vitest';
import { staticCatalogOptions } from '@/data/catalogOptions';
import { setCatalogSnapshot } from '@/lib/catalogRuntime';
import { countProductionBomRows, calculateProductionDrawingLayout } from '@/lib/productionDrawingLayout';
import { createDefaultConfig } from '@/stores/harnessStore';

describe('countProductionBomRows', () => {
  it('uses the same grouped inner-mold rows as the rendered BOM', () => {
    const overmolds = [
      {
        id: 'pvc-straight',
        name: 'PVC直头',
        outerMaterial: '黑色PVC' as const,
        outerHardness: '45P' as const,
        outerForm: 'straight' as const,
        innerMaterial: '低密度透明PE' as const,
        innerForm: 'straight' as const,
      },
      {
        id: 'tpe-straight',
        name: 'TPE直头',
        outerMaterial: '黑色TPE' as const,
        outerForm: 'straight' as const,
        innerMaterial: '低密度透明PE' as const,
        innerForm: 'straight' as const,
      },
    ];
    setCatalogSnapshot({
      connectors: [],
      wires: [],
      overmolds,
      ...staticCatalogOptions(),
      loadedAt: Date.now(),
    });
    const config = {
      ...createDefaultConfig(),
      models: [
        {
          id: 'model-1', kind: 'outer-box' as const, position: { x: 0, y: 0 }, width: 80, height: 60,
          overmoldSpecId: 'pvc-straight', includeInnerMold: true,
        },
        {
          id: 'model-2', kind: 'outer-box' as const, position: { x: 100, y: 0 }, width: 80, height: 60,
          overmoldSpecId: 'tpe-straight', includeInnerMold: true,
        },
      ],
    };

    expect(countProductionBomRows(config, overmolds)).toBe(3);
  });

  it('calculates bomTop and ensures layout boundaries leave vertical room', () => {
    const layoutWith5Rows = calculateProductionDrawingLayout({
      bomRowCount: 5,
      hasWiringDiagram: true,
    });

    // BOM bottom is 666.67, height is 34 + 5 * 40 = 234, bomTop is ~432.67
    expect(layoutWith5Rows.bomRect.top).toBeCloseTo(432.67, 1);
    expect(layoutWith5Rows.assemblyTop).toBe(76);
  });
});

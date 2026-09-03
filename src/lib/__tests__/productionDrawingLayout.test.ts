import { describe, expect, it } from 'vitest';
import { staticCatalogOptions } from '@/data/catalogOptions';
import { setCatalogSnapshot } from '@/lib/catalogRuntime';
import { countProductionBomRows, calculateProductionDrawingLayout, calculateCenteredGroupX, calculateEstimatedWireOffset } from '@/lib/productionDrawingLayout';
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

  it('guarantees assemblyBottom <= bomRect.top - safeGap even with 8, 10, 15 BOM rows', () => {
    for (const rowCount of [8, 10, 12, 15]) {
      const layout = calculateProductionDrawingLayout({
        bomRowCount: rowCount,
        hasWiringDiagram: true,
      });

      const maxAllowedBottom = layout.bomRect.top - layout.safeGap;
      expect(layout.assemblyBottom).toBeLessThanOrEqual(maxAllowedBottom + 0.01);
    }
  });
});

describe('calculateCenteredGroupX & calculateEstimatedWireOffset', () => {
  it('centers symmetrical groups so wire center is exactly at 600', () => {
    const groupWidth = 400;
    const wireOffsetFromGroupCenter = 0;
    const groupX = calculateCenteredGroupX({
      canvasWidth: 1200,
      groupWidth,
      wireOffsetFromGroupCenter,
    });

    expect(groupX).toBe(400); // (1200 - 400) / 2
    const wireCenterOnCanvas = groupX + (groupWidth / 2 + wireOffsetFromGroupCenter);
    expect(wireCenterOnCanvas).toBe(600);
  });

  it('centers asymmetrical groups with heavier right side so wire center is exactly 600', () => {
    // Left items: 80px, wire: 200px, right items: 300px => groupWidth: 580px
    // wireCenter inside group: 80 + 100 = 180px
    // groupCenter: 290px
    // wireOffsetFromGroupCenter: 180 - 290 = -110px
    const groupWidth = 580;
    const wireOffset = -110;
    const groupX = calculateCenteredGroupX({
      canvasWidth: 1200,
      groupWidth,
      wireOffsetFromGroupCenter: wireOffset,
    });

    // targetX = 600 - (290 - 110) = 420
    expect(groupX).toBe(420);
    const wireCenterOnCanvas = groupX + (groupWidth / 2 + wireOffset);
    expect(wireCenterOnCanvas).toBe(600);
  });

  it('centers asymmetrical groups with heavier left side so wire center is exactly 600', () => {
    // Left items: 300px, wire: 200px, right items: 80px => groupWidth: 580px
    // wireCenter inside group: 300 + 100 = 400px
    // groupCenter: 290px
    // wireOffsetFromGroupCenter: 400 - 290 = +110px
    const groupWidth = 580;
    const wireOffset = 110;
    const groupX = calculateCenteredGroupX({
      canvasWidth: 1200,
      groupWidth,
      wireOffsetFromGroupCenter: wireOffset,
    });

    // targetX = 600 - (290 + 110) = 200
    expect(groupX).toBe(200);
    const wireCenterOnCanvas = groupX + (groupWidth / 2 + wireOffset);
    expect(wireCenterOnCanvas).toBe(600);
  });

  it('calculateEstimatedWireOffset correctly calculates wire offset from left/right widths', () => {
    // Symmetrical
    expect(calculateEstimatedWireOffset({ leftWidth: 80, rightWidth: 80 })).toBe(0);
    // Right heavier
    expect(calculateEstimatedWireOffset({ leftWidth: 80, rightWidth: 300 })).toBe(-110);
    // Left heavier
    expect(calculateEstimatedWireOffset({ leftWidth: 300, rightWidth: 80 })).toBe(110);
  });
});


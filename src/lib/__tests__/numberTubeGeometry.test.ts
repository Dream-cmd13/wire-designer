import { describe, expect, it } from 'vitest';
import {
  NUMBER_TUBE_VISUAL_HEIGHT,
  getNumberTubeDimensionGeometry,
} from '@/lib/numberTubeGeometry';

describe('getNumberTubeDimensionGeometry', () => {
  it('anchors the vertical line directly to the number tube centerline', () => {
    const geometry = getNumberTubeDimensionGeometry({
      connectorAnchorX: 180,
      connectorTopY: 120,
      tubeCenterX: 240,
      tubeCenterY: 160,
    });

    expect(geometry.tubeAnchorX).toBe(240);
    expect(geometry.tubeAnchorY).toBe(160 - NUMBER_TUBE_VISUAL_HEIGHT / 2 - 1);
    expect(geometry.labelX).toBe(210);
  });

  it('keeps the horizontal dimension line above the connector top edge', () => {
    const geometry = getNumberTubeDimensionGeometry({
      connectorAnchorX: 320,
      connectorTopY: 140,
      tubeCenterX: 220,
      tubeCenterY: 170,
    });

    expect(geometry.dimensionY).toBeLessThan(140);
  });

  it('moves the horizontal line above the tube when the tube sits higher than the connector', () => {
    const geometry = getNumberTubeDimensionGeometry({
      connectorAnchorX: 60,
      connectorTopY: 140,
      tubeCenterX: 120,
      tubeCenterY: 92,
    });

    expect(geometry.dimensionY).toBeLessThan(geometry.tubeAnchorY);
  });
});

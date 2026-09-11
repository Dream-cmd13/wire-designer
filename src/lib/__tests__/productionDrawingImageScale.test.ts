import { describe, it, expect } from 'vitest';
import {
  getNaturalDimensions,
  getVisualUnscaledDimensions,
  isOrthogonalRotation,
  calculateAssemblyUnscaledBounds,
  calculateUniformAssemblyScale,
  getScaledDisplayDimensions,
  DEFAULT_NATURAL_SIZES,
} from '@/lib/productionDrawingImageScale';
import type { HarnessConfig, TwoDImage } from '@/types/harness';

describe('productionDrawingImageScale', () => {
  describe('getNaturalDimensions & getVisualUnscaledDimensions', () => {
    it('uses fallback sizes when not in naturalSizes map', () => {
      const wireImg: TwoDImage = {
        id: 'img-wire-1',
        name: 'Wire',
        dataUrl: 'data:image/png;base64,...',
        source: 'catalog',
        elementKind: 'material',
      };
      const dims = getNaturalDimensions(wireImg);
      expect(dims).toEqual(DEFAULT_NATURAL_SIZES.material);
      expect(dims).toEqual({ w: 529, h: 33 });
    });

    it('uses explicit cached naturalSizes when available', () => {
      const connImg: TwoDImage = {
        id: 'img-c1',
        name: 'Connector',
        dataUrl: '...',
        source: 'catalog',
        elementKind: 'connector',
      };
      const dims = getNaturalDimensions(connImg, { 'img-c1': { w: 47, h: 50 } });
      expect(dims).toEqual({ w: 47, h: 50 });
    });

    it('swaps width and height for orthogonal rotations (90, -90, 270)', () => {
      expect(isOrthogonalRotation(0)).toBe(false);
      expect(isOrthogonalRotation(180)).toBe(false);
      expect(isOrthogonalRotation(90)).toBe(true);
      expect(isOrthogonalRotation(-90)).toBe(true);
      expect(isOrthogonalRotation(270)).toBe(true);

      const bentConn: TwoDImage = {
        id: 'img-c-bent',
        name: 'Bent Connector',
        dataUrl: '...',
        source: 'catalog',
        elementKind: 'connector',
        rotation: -90,
      };
      const unrotated = getVisualUnscaledDimensions({ ...bentConn, rotation: 0 }, { 'img-c-bent': { w: 47, h: 50 } });
      const rotated = getVisualUnscaledDimensions(bentConn, { 'img-c-bent': { w: 47, h: 50 } });

      expect(unrotated).toEqual({ w: 47, h: 50 });
      expect(rotated).toEqual({ w: 50, h: 47 });
    });
  });

  describe('calculateAssemblyUnscaledBounds', () => {
    it('calculates unscaled bounds for straight double-end assembly', () => {
      const mockConfig = {
        name: 'Test',
        connectors: [
          {
            id: 'c-left',
            connector: { id: 'c1', name: 'C1', pinCount: 4, resourceItemId: 'r1', manufacturer: '', type: 'female' as const, pinLabels: [] },
            position: { x: 100, y: 300 },
          },
          {
            id: 'c-right',
            connector: { id: 'c2', name: 'C2', pinCount: 4, resourceItemId: 'r2', manufacturer: '', type: 'female' as const, pinLabels: [] },
            position: { x: 700, y: 300 },
          },
        ],
        materials: [
          {
            id: 'mat-1',
            name: 'Wire',
            color: '#000',
            circuits: [],
            position: { x: 300, y: 300 },
            width: 300,
            spec: { lengthMm: 1000 },
          },
        ],
        models: [
          {
            id: 'model-left',
            kind: 'outer-box' as const,
            overmoldSpecId: 'spec-1',
            includeInnerMold: false,
            position: { x: 200, y: 300 },
            width: 80,
            height: 40,
          },
          {
            id: 'model-right',
            kind: 'outer-box' as const,
            overmoldSpecId: 'spec-2',
            includeInnerMold: false,
            position: { x: 600, y: 300 },
            width: 80,
            height: 40,
          },
        ],
        protectiveSleeves: [],
      } as unknown as HarnessConfig;

      const images: TwoDImage[] = [
        {
          id: 'pin-left',
          name: 'Pin Left',
          dataUrl: '...',
          source: 'catalog',
          elementKind: 'connector',
          elementId: 'c-left',
          imageRole: 'connector-pin-map',
        },
        {
          id: 'conn-left',
          name: 'Conn Left',
          dataUrl: '...',
          source: 'catalog',
          elementKind: 'connector',
          elementId: 'c-left',
          imageRole: 'connector-after',
        },
        {
          id: 'mold-left',
          name: 'Mold Left',
          dataUrl: '...',
          source: 'catalog',
          elementKind: 'model',
          elementId: 'model-left',
          imageRole: 'primary',
        },
        {
          id: 'wire',
          name: 'Wire',
          dataUrl: '...',
          source: 'catalog',
          elementKind: 'material',
          elementId: 'mat-1',
        },
        {
          id: 'mold-right',
          name: 'Mold Right',
          dataUrl: '...',
          source: 'catalog',
          elementKind: 'model',
          elementId: 'model-right',
          imageRole: 'primary',
        },
        {
          id: 'conn-right',
          name: 'Conn Right',
          dataUrl: '...',
          source: 'catalog',
          elementKind: 'connector',
          elementId: 'c-right',
          imageRole: 'connector-after',
        },
        {
          id: 'pin-right',
          name: 'Pin Right',
          dataUrl: '...',
          source: 'catalog',
          elementKind: 'connector',
          elementId: 'c-right',
          imageRole: 'connector-pin-map',
        },
      ];

      const naturalSizes = {
        'pin-left': { w: 85, h: 85 },
        'conn-left': { w: 47, h: 50 },
        'mold-left': { w: 163, h: 86 },
        wire: { w: 529, h: 33 },
        'mold-right': { w: 163, h: 86 },
        'conn-right': { w: 47, h: 50 },
        'pin-right': { w: 85, h: 85 },
      };

      const bounds = calculateAssemblyUnscaledBounds(images, {
        connectors: mockConfig.connectors,
        materials: mockConfig.materials,
        sleeves: mockConfig.protectiveSleeves,
        models: mockConfig.models,
        config: mockConfig,
        naturalSizes,
      });

      // Left end: pin (85 + 16) + conn (47) + mold (163) = 311
      // Wire: 529
      // Right end: mold (163) + conn (47) + pin (85 + 16) = 311
      // Total: 311 + 529 + 311 = 1151
      expect(bounds.totalWidth).toBe(1151);
      expect(bounds.wireWidth).toBe(529);
      expect(bounds.maxHeight).toBe(86);
    });
  });

  describe('calculateUniformAssemblyScale', () => {
    it('scales down when total width exceeds available width', () => {
      const bounds = {
        totalWidth: 1151,
        maxHeight: 86,
        leftWidth: 311,
        wireWidth: 529,
        rightWidth: 311,
      };

      const scale = calculateUniformAssemblyScale({
        unscaledBounds: bounds,
        availableWidth: 1080,
        availableHeight: 250,
      });

      // 1080 / 1151 = 0.9383...
      expect(scale).toBeCloseTo(0.938, 2);
      expect(scale).toBeLessThanOrEqual(1.0);
    });

    it('caps at maxScale = 1.0 when plenty of space is available', () => {
      const bounds = {
        totalWidth: 500,
        maxHeight: 80,
        leftWidth: 200,
        wireWidth: 200,
        rightWidth: 100,
      };

      const scale = calculateUniformAssemblyScale({
        unscaledBounds: bounds,
        availableWidth: 1100,
        availableHeight: 300,
      });

      expect(scale).toBe(1.0);
    });

    it('scales down if height is the bottleneck', () => {
      const bounds = {
        totalWidth: 800,
        maxHeight: 200,
        leftWidth: 200,
        wireWidth: 400,
        rightWidth: 200,
      };

      const scale = calculateUniformAssemblyScale({
        unscaledBounds: bounds,
        availableWidth: 1000,
        availableHeight: 100,
      });

      // Height bottleneck: 100 / 200 = 0.5
      expect(scale).toBe(0.5);
    });
  });

  describe('getScaledDisplayDimensions & proportionality', () => {
    it('strictly preserves relative proportions between large and small components', () => {
      const modelImg: TwoDImage = {
        id: 'mold-1',
        name: 'Overmold',
        dataUrl: '...',
        source: 'catalog',
        elementKind: 'model',
      };
      const connImg: TwoDImage = {
        id: 'conn-1',
        name: 'Connector',
        dataUrl: '...',
        source: 'catalog',
        elementKind: 'connector',
      };
      const wireImg: TwoDImage = {
        id: 'wire-1',
        name: 'Wire',
        dataUrl: '...',
        source: 'catalog',
        elementKind: 'material',
      };

      const naturalSizes = {
        'mold-1': { w: 163, h: 86 },
        'conn-1': { w: 47, h: 50 },
        'wire-1': { w: 529, h: 33 },
      };

      const scale = 0.8;
      const modelScaled = getScaledDisplayDimensions(modelImg, scale, naturalSizes);
      const connScaled = getScaledDisplayDimensions(connImg, scale, naturalSizes);
      const wireScaled = getScaledDisplayDimensions(wireImg, scale, naturalSizes);

      // Model is 163 * 0.8 = 130px, conn is 47 * 0.8 = 38px
      expect(modelScaled.w).toBe(130);
      expect(modelScaled.h).toBe(69);
      expect(connScaled.w).toBe(38);
      expect(connScaled.h).toBe(40);
      expect(wireScaled.w).toBe(423);
      expect(wireScaled.h).toBe(26);

      // Overmold width is clearly ~3.4 times connector width
      expect(modelScaled.w / connScaled.w).toBeCloseTo(163 / 47, 1);
      // Overmold height (86) is clearly thicker than wire height (33)
      expect(modelScaled.h).toBeGreaterThan(wireScaled.h * 2);
    });
  });
});

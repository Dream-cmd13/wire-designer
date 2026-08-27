import { describe, expect, it } from 'vitest';
import { autoAssociateTwoDImages, isProductImageEligibleJacketedWire } from '@/lib/autoAssociateTwoDImages';
import { setCatalogSnapshot } from '@/lib/catalogRuntime';
import { staticCatalogOptions } from '@/data/catalogOptions';
import { createDefaultConfig } from '@/stores/harnessStore';

describe('product image wire matching', () => {
  it('restores the M12 before/after and pin-map association', () => {
    setCatalogSnapshot({
      connectors: [{
        id: 'm12a04-07-093', resourceItemId: 'connector-1', name: 'M12', manufacturer: 'M',
        pinCount: 4, type: 'male', pinLabels: ['1', '2', '3', '4'],
        imageVariants: { before: 'before.png', after: 'after.png', pinMap: 'pin-map.png' },
      }],
      wires: [], overmolds: [], ...staticCatalogOptions(), loadedAt: Date.now(),
    });
    const connector = {
      id: 'connector-instance', position: { x: 0, y: 0 }, label: 'P1', jumpers: [],
      connector: { id: 'm12a04-07-093', resourceItemId: 'connector-1', name: 'M12', manufacturer: 'M', pinCount: 4, type: 'male' as const, pinLabels: ['1', '2', '3', '4'] },
    };
    const config = { ...createDefaultConfig(), connectors: [connector], materials: [], models: [], protectiveSleeves: [] };

    expect(autoAssociateTwoDImages(config).map((image) => [image.name, image.imageRole, image.dataUrl])).toEqual([
      ['连接器pin位图', 'connector-pin-map', 'pin-map.png'],
      ['M12', 'connector-before', 'before.png'],
    ]);
  });

  it('refreshes catalog image URLs while preserving product-image layout', () => {
    setCatalogSnapshot({
      connectors: [{ id: 'C1', resourceItemId: 'resource-1', name: 'C1', manufacturer: 'M', pinCount: 2, type: 'male', pinLabels: [], image: 'https://new.example/c1.png' }],
      wires: [],
      overmolds: [],
      ...staticCatalogOptions(),
      loadedAt: Date.now(),
    });
    const config = {
      ...createDefaultConfig(),
      connectors: [{ id: 'instance-1', connector: { id: 'C1', resourceItemId: 'resource-1', name: 'C1', manufacturer: 'M', pinCount: 2, type: 'male' as const, pinLabels: [], image: 'https://old.example/c1.png' }, position: { x: 0, y: 0 }, label: 'P1', jumpers: [] }],
      materials: [], protectiveSleeves: [], models: [], twoDImages: [{ id: 'stable-image', name: 'C1', dataUrl: 'https://old.example/c1.png', source: 'catalog' as const, elementKind: 'connector' as const, elementId: 'instance-1', rotation: 90 as const, pos: { x: 120, y: 80 } }],
    };

    expect(autoAssociateTwoDImages(config)).toEqual([expect.objectContaining({
      id: 'stable-image', dataUrl: 'https://new.example/c1.png', rotation: 90, pos: { x: 120, y: 80 },
    })]);
  });

  it('uses only the outer mold image even when the model includes an inner mold', () => {
    setCatalogSnapshot({
      connectors: [],
      wires: [],
      overmolds: [{
        id: 'pvc-45p-pe',
        resourceItemId: 'overmold-resource',
        name: '黑色PVC 45P直头外模',
        outerMaterial: '黑色PVC',
        outerHardness: '45P',
        outerForm: 'straight',
        innerMaterial: '低密度透明PE',
        innerForm: 'straight',
        image: 'https://assets.example/shared-overmold.png',
      }],
      ...staticCatalogOptions(),
      loadedAt: Date.now(),
    });
    const config = {
      ...createDefaultConfig(),
      models: [{
        id: 'model-1',
        kind: 'outer-box' as const,
        position: { x: 0, y: 0 },
        width: 80,
        height: 60,
        overmoldSpecId: 'pvc-45p-pe',
        includeInnerMold: true,
        resourceItemId: 'overmold-resource',
      }],
    };

    expect(autoAssociateTwoDImages(config)).toEqual([
      expect.objectContaining({
        name: 'Overmold',
        elementKind: 'model',
        elementId: 'model-1',
        dataUrl: 'https://assets.example/shared-overmold.png',
      }),
    ]);
  });

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

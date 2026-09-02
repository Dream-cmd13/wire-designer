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

    expect(autoAssociateTwoDImages(config).map((image) => [image.name, image.imageRole, image.dataUrl, image.rotation])).toEqual([
      ['连接器pin位图', 'connector-pin-map', 'pin-map.png', 0],
      ['M12', 'connector-before', 'before.png', 0],
    ]);
  });

  it('rotates right-side connector to 180 degrees and bottom connector to -90 degrees', () => {
    setCatalogSnapshot({
      connectors: [{
        id: 'conn-1', resourceItemId: 'res-conn-1', name: 'CN-Right', manufacturer: 'M',
        pinCount: 2, type: 'male', pinLabels: ['1', '2'], image: 'https://assets.example/conn.png',
      }],
      wires: [], overmolds: [], ...staticCatalogOptions(), loadedAt: Date.now(),
    });
    const leftWire = {
      id: 'wire-1', name: '电子线', position: { x: 100, y: 100 }, width: 200, spec: { kind: 'electronic' as const, color: 'red', lengthMm: 100, awg: 24, ulNumber: '1007' as const, endTreatment: { start: { stripped: false, termination: 'none' as const }, end: { stripped: false, termination: 'none' as const } } },
      circuits: [{ id: 'c1', color: 'red', signalName: 'VCC', start: { connectorId: 'conn-right', connectorSide: 'left' as const, pin: 1 } }],
    };
    const rightConnector = {
      id: 'conn-right', position: { x: 400, y: 100 }, label: 'P2', jumpers: [],
      connector: { id: 'conn-1', resourceItemId: 'res-conn-1', name: 'CN-Right', manufacturer: 'M', pinCount: 2, type: 'male' as const, pinLabels: ['1', '2'], image: 'https://assets.example/conn.png' },
    };
    const bottomConnector = {
      id: 'conn-bottom', position: { x: 150, y: 300 }, label: 'P3', jumpers: [],
      connector: { id: 'conn-1', resourceItemId: 'res-conn-1', name: 'CN-Bottom', manufacturer: 'M', pinCount: 2, type: 'male' as const, pinLabels: ['1', '2'], image: 'https://assets.example/conn.png' },
    };

    const configRight = { ...createDefaultConfig(), connectors: [rightConnector], materials: [leftWire], models: [], protectiveSleeves: [] };
    const imagesRight = autoAssociateTwoDImages(configRight);
    const rightConnImage = imagesRight.find((img) => img.elementId === 'conn-right');
    expect(rightConnImage?.rotation).toBe(180);

    const configBottom = { ...createDefaultConfig(), connectors: [bottomConnector], materials: [leftWire], models: [], protectiveSleeves: [] };
    const imagesBottom = autoAssociateTwoDImages(configBottom);
    const bottomConnImage = imagesBottom.find((img) => img.elementId === 'conn-bottom');
    expect(bottomConnImage?.rotation).toBe(-90);
  });

  it('determines orientation from overmold outerForm: straight (0°/180°) vs bent (-90°)', () => {
    setCatalogSnapshot({
      connectors: [{
        id: 'm12a04-07-093', resourceItemId: 'res-m12', name: 'M12', manufacturer: 'M',
        pinCount: 4, type: 'male', pinLabels: ['1', '2', '3', '4'],
        imageVariants: { before: 'before.png', after: 'after.png', pinMap: 'pin-map.png' },
      }],
      wires: [],
      overmolds: [
        { id: 'mold-straight', resourceItemId: 'res-mold-straight', name: '直头外模', outerMaterial: '黑色PVC', outerForm: 'straight', image: 'straight.png' },
        { id: 'mold-bent', resourceItemId: 'res-mold-bent', name: '弯头外模', outerMaterial: '黑色PVC', outerForm: 'bent', image: 'bent.png' },
      ],
      ...staticCatalogOptions(),
      loadedAt: Date.now(),
    });

    const wire = {
      id: 'wire-1', name: '线材', position: { x: 300, y: 100 }, width: 200, spec: { kind: 'electronic' as const, color: 'red', lengthMm: 100, awg: 24, ulNumber: '1007' as const, endTreatment: { start: { stripped: false, termination: 'none' as const }, end: { stripped: false, termination: 'none' as const } } },
      circuits: [
        { id: 'c1', color: 'red', signalName: 'VCC', start: { connectorId: 'conn-left', connectorSide: 'left' as const, pin: 1 }, end: { connectorId: 'conn-right', connectorSide: 'left' as const, pin: 1 } },
      ],
    };

    const leftConn = {
      id: 'conn-left', position: { x: 100, y: 100 }, label: 'P1', jumpers: [],
      connector: { id: 'm12a04-07-093', resourceItemId: 'res-m12', name: 'M12', manufacturer: 'M', pinCount: 4, type: 'male' as const, pinLabels: ['1', '2', '3', '4'] },
    };
    const rightConn = {
      id: 'conn-right', position: { x: 600, y: 100 }, label: 'P2', jumpers: [],
      connector: { id: 'm12a04-07-093', resourceItemId: 'res-m12', name: 'M12', manufacturer: 'M', pinCount: 4, type: 'male' as const, pinLabels: ['1', '2', '3', '4'] },
    };

    // Scenario 1: 双直头 -> 左端 0°，右端 180°，均使用 connector-after
    const straightModelLeft = { id: 'm-left', kind: 'outer-box' as const, position: { x: 120, y: 100 }, width: 80, height: 60, overmoldSpecId: 'mold-straight', resourceItemId: 'res-mold-straight', includeInnerMold: false };
    const straightModelRight = { id: 'm-right', kind: 'outer-box' as const, position: { x: 580, y: 100 }, width: 80, height: 60, overmoldSpecId: 'mold-straight', resourceItemId: 'res-mold-straight', includeInnerMold: false };

    const configDoubleStraight = {
      ...createDefaultConfig(),
      connectors: [leftConn, rightConn],
      materials: [wire],
      models: [straightModelLeft, straightModelRight],
      protectiveSleeves: [],
    };
    const imagesDoubleStraight = autoAssociateTwoDImages(configDoubleStraight);
    const leftBody = imagesDoubleStraight.find((img) => img.elementId === 'conn-left' && img.imageRole === 'connector-after');
    const rightBody = imagesDoubleStraight.find((img) => img.elementId === 'conn-right' && img.imageRole === 'connector-after');
    expect(leftBody?.rotation).toBe(0);
    expect(leftBody?.orientation).toBe('left');
    expect(rightBody?.rotation).toBe(180);
    expect(rightBody?.orientation).toBe('right');

    // Scenario 2: 双弯头 -> 左右两端均判定为 -90° (全部下)
    const bentModelLeft = { id: 'm-left-b', kind: 'outer-box' as const, position: { x: 120, y: 100 }, width: 80, height: 60, overmoldSpecId: 'mold-bent', resourceItemId: 'res-mold-bent', includeInnerMold: false };
    const bentModelRight = { id: 'm-right-b', kind: 'outer-box' as const, position: { x: 580, y: 100 }, width: 80, height: 60, overmoldSpecId: 'mold-bent', resourceItemId: 'res-mold-bent', includeInnerMold: false };

    const configDoubleBent = {
      ...createDefaultConfig(),
      connectors: [leftConn, rightConn],
      materials: [wire],
      models: [bentModelLeft, bentModelRight],
      protectiveSleeves: [],
    };
    const imagesDoubleBent = autoAssociateTwoDImages(configDoubleBent);
    const leftBentBody = imagesDoubleBent.find((img) => img.elementId === 'conn-left' && img.imageRole === 'connector-after');
    const rightBentBody = imagesDoubleBent.find((img) => img.elementId === 'conn-right' && img.imageRole === 'connector-after');
    expect(leftBentBody?.rotation).toBe(-90);
    expect(leftBentBody?.orientation).toBe('bottom');
    expect(rightBentBody?.rotation).toBe(-90);
    expect(rightBentBody?.orientation).toBe('bottom');

    // Scenario 3: 一直一弯 -> 左端直头 0° (left)，右端弯头 -90° (bottom)
    const configMixed = {
      ...createDefaultConfig(),
      connectors: [leftConn, rightConn],
      materials: [wire],
      models: [straightModelLeft, bentModelRight],
      protectiveSleeves: [],
    };
    const imagesMixed = autoAssociateTwoDImages(configMixed);
    const leftMixedBody = imagesMixed.find((img) => img.elementId === 'conn-left' && img.imageRole === 'connector-after');
    const rightMixedBody = imagesMixed.find((img) => img.elementId === 'conn-right' && img.imageRole === 'connector-after');
    expect(leftMixedBody?.rotation).toBe(0);
    expect(leftMixedBody?.orientation).toBe('left');
    expect(rightMixedBody?.rotation).toBe(-90);
    expect(rightMixedBody?.orientation).toBe('bottom');
  });

  it('refreshes catalog image URLs while preserving product-image layout position and applying orientation rotation', () => {
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
      materials: [], protectiveSleeves: [], models: [], twoDImages: [{ id: 'stable-image', name: 'C1', dataUrl: 'https://old.example/c1.png', source: 'catalog' as const, elementKind: 'connector' as const, elementId: 'instance-1', rotation: 0 as const, pos: { x: 120, y: 80 } }],
    };

    expect(autoAssociateTwoDImages(config)).toEqual([expect.objectContaining({
      id: 'stable-image', dataUrl: 'https://new.example/c1.png', rotation: 0, pos: { x: 120, y: 80 },
    })]);
  });

  it('forces rotation refresh when overmold changes from straight to bent', () => {
    setCatalogSnapshot({
      connectors: [{
        id: 'm12a04-07-093', resourceItemId: 'res-m12', name: 'M12', manufacturer: 'M',
        pinCount: 4, type: 'male', pinLabels: ['1', '2', '3', '4'],
        imageVariants: { before: 'before.png', after: 'after.png', pinMap: 'pin-map.png' },
      }],
      wires: [],
      overmolds: [
        { id: 'mold-bent', resourceItemId: 'res-mold-bent', name: '弯头外模', outerMaterial: '黑色PVC', outerForm: 'bent', image: 'bent.png' },
      ],
      ...staticCatalogOptions(),
      loadedAt: Date.now(),
    });

    const leftConn = {
      id: 'conn-1', position: { x: 100, y: 100 }, label: 'P1', jumpers: [],
      connector: { id: 'm12a04-07-093', resourceItemId: 'res-m12', name: 'M12', manufacturer: 'M', pinCount: 4, type: 'male' as const, pinLabels: ['1', '2', '3', '4'] },
    };
    const bentModel = {
      id: 'm-1', kind: 'outer-box' as const, position: { x: 120, y: 100 }, width: 80, height: 60,
      overmoldSpecId: 'mold-bent', resourceItemId: 'res-mold-bent', includeInnerMold: false,
    };
    const config = {
      ...createDefaultConfig(),
      connectors: [leftConn],
      materials: [],
      models: [bentModel],
      protectiveSleeves: [],
      twoDImages: [{
        id: 'old-img-1', name: 'M12', dataUrl: 'after.png', source: 'catalog' as const,
        imageRole: 'connector-after' as const, elementKind: 'connector' as const, elementId: 'conn-1',
        rotation: 0 as const, pos: { x: 100, y: 100 },
      }],
    };

    const synced = autoAssociateTwoDImages(config);
    const body = synced.find((img) => img.imageRole === 'connector-after');
    expect(body?.rotation).toBe(-90);
    expect(body?.pos).toEqual({ x: 100, y: 100 });
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

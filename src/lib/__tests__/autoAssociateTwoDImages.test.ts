import { describe, expect, it } from 'vitest';
import { autoAssociateTwoDImages, isProductImageEligibleJacketedWire } from '@/lib/autoAssociateTwoDImages';
import { setCatalogSnapshot } from '@/lib/catalogRuntime';
import { staticCatalogOptions } from '@/data/catalogOptions';
import { createDefaultConfig } from '@/stores/harnessStore';

describe('product image wire matching', () => {
  it('handles complete imageVariants (before + after + pinMap) correctly for unconnected and connected states', () => {
    setCatalogSnapshot({
      connectors: [{
        id: 'conn-var-1', resourceItemId: 'res-var-1', name: 'M12-Full', manufacturer: 'M',
        pinCount: 4, type: 'male', pinLabels: ['1', '2', '3', '4'],
        image: 'fallback-should-not-be-used.png',
        imageVariants: { before: 'before.png', after: 'after.png', pinMap: 'pin-map.png' },
      }],
      wires: [], overmolds: [{ id: 'mold-1', resourceItemId: 'res-mold-1', name: '直模', outerMaterial: '黑色PVC', outerForm: 'straight', image: 'm.png' }],
      ...staticCatalogOptions(), loadedAt: Date.now(),
    });
    const connector = {
      id: 'conn-inst', position: { x: 0, y: 0 }, label: 'P1', jumpers: [],
      connector: { id: 'conn-var-1', resourceItemId: 'res-var-1', name: 'M12-Full', manufacturer: 'M', pinCount: 4, type: 'male' as const, pinLabels: ['1', '2', '3', '4'], image: 'fallback-should-not-be-used.png' },
    };

    // 1. 未连接外模 -> 使用 before + pinMap
    const configUnconnected = { ...createDefaultConfig(), connectors: [connector], materials: [], models: [], protectiveSleeves: [] };
    expect(autoAssociateTwoDImages(configUnconnected).map((image) => [image.name, image.imageRole, image.dataUrl, image.rotation, image.orientation])).toEqual([
      ['连接器pin位图', 'connector-pin-map', 'pin-map.png', 0, 'left'],
      ['M12-Full', 'connector-before', 'before.png', 0, 'left'],
    ]);

    // 2. 已连接外模 -> 使用 after + pinMap
    const model = { id: 'm-1', kind: 'outer-box' as const, position: { x: 20, y: 0 }, width: 80, height: 60, overmoldSpecId: 'mold-1', resourceItemId: 'res-mold-1', includeInnerMold: false };
    const configConnected = { ...createDefaultConfig(), connectors: [connector], materials: [], models: [model], protectiveSleeves: [] };
    const imgs = autoAssociateTwoDImages(configConnected).filter((img) => img.elementKind === 'connector');
    expect(imgs.map((image) => [image.name, image.imageRole, image.dataUrl, image.rotation, image.orientation])).toEqual([
      ['连接器pin位图', 'connector-pin-map', 'pin-map.png', 0, 'left'],
      ['M12-Full', 'connector-after', 'after.png', 0, 'left'],
    ]);
  });

  it('handles missing pinMap: keeps before/after and does NOT fallback to plain image', () => {
    setCatalogSnapshot({
      connectors: [{
        id: 'conn-var-2', resourceItemId: 'res-var-2', name: 'M12-NoPinMap', manufacturer: 'M',
        pinCount: 4, type: 'male', pinLabels: ['1', '2', '3', '4'],
        image: 'plain-image.png',
        imageVariants: { before: 'before.png', after: 'after.png' },
      }],
      wires: [], overmolds: [], ...staticCatalogOptions(), loadedAt: Date.now(),
    });
    const connector = {
      id: 'conn-inst', position: { x: 0, y: 0 }, label: 'P1', jumpers: [],
      connector: { id: 'conn-var-2', resourceItemId: 'res-var-2', name: 'M12-NoPinMap', manufacturer: 'M', pinCount: 4, type: 'male' as const, pinLabels: ['1', '2', '3', '4'], image: 'plain-image.png' },
    };
    const config = { ...createDefaultConfig(), connectors: [connector], materials: [], models: [], protectiveSleeves: [] };
    const images = autoAssociateTwoDImages(config);

    // 必须只返回 before，没有 pinMap，绝不能回退出现 plain-image.png
    expect(images.map((img) => [img.name, img.imageRole, img.dataUrl])).toEqual([
      ['M12-NoPinMap', 'connector-before', 'before.png'],
    ]);
    expect(images.some((img) => img.dataUrl === 'plain-image.png')).toBe(false);
  });

  it('handles missing before: does NOT generate body image and does NOT fallback to after or plain image', () => {
    setCatalogSnapshot({
      connectors: [{
        id: 'conn-var-3', resourceItemId: 'res-var-3', name: 'M12-NoBefore', manufacturer: 'M',
        pinCount: 4, type: 'male', pinLabels: ['1', '2', '3', '4'],
        image: 'plain-image.png',
        imageVariants: { after: 'after.png', pinMap: 'pin-map.png' },
      }],
      wires: [], overmolds: [], ...staticCatalogOptions(), loadedAt: Date.now(),
    });
    const connector = {
      id: 'conn-inst', position: { x: 0, y: 0 }, label: 'P1', jumpers: [],
      connector: { id: 'conn-var-3', resourceItemId: 'res-var-3', name: 'M12-NoBefore', manufacturer: 'M', pinCount: 4, type: 'male' as const, pinLabels: ['1', '2', '3', '4'], image: 'plain-image.png' },
    };
    const config = { ...createDefaultConfig(), connectors: [connector], materials: [], models: [], protectiveSleeves: [] };
    const images = autoAssociateTwoDImages(config);

    // 未连接外模时缺少 before，主体图为空，只返回 pinMap，绝不能回退出现 after.png 或 plain-image.png
    expect(images.map((img) => [img.name, img.imageRole, img.dataUrl])).toEqual([
      ['连接器pin位图', 'connector-pin-map', 'pin-map.png'],
    ]);
  });

  it('handles missing after: does NOT generate body image when connected and does NOT fallback to before or plain image', () => {
    setCatalogSnapshot({
      connectors: [{
        id: 'conn-var-4', resourceItemId: 'res-var-4', name: 'M12-NoAfter', manufacturer: 'M',
        pinCount: 4, type: 'male', pinLabels: ['1', '2', '3', '4'],
        image: 'plain-image.png',
        imageVariants: { before: 'before.png', pinMap: 'pin-map.png' },
      }],
      wires: [], overmolds: [{ id: 'mold-1', resourceItemId: 'res-mold-1', name: '直模', outerMaterial: '黑色PVC', outerForm: 'straight', image: 'm.png' }],
      ...staticCatalogOptions(), loadedAt: Date.now(),
    });
    const connector = {
      id: 'conn-inst', position: { x: 0, y: 0 }, label: 'P1', jumpers: [],
      connector: { id: 'conn-var-4', resourceItemId: 'res-var-4', name: 'M12-NoAfter', manufacturer: 'M', pinCount: 4, type: 'male' as const, pinLabels: ['1', '2', '3', '4'], image: 'plain-image.png' },
    };
    const model = { id: 'm-1', kind: 'outer-box' as const, position: { x: 20, y: 0 }, width: 80, height: 60, overmoldSpecId: 'mold-1', resourceItemId: 'res-mold-1', includeInnerMold: false };
    const config = { ...createDefaultConfig(), connectors: [connector], materials: [], models: [model], protectiveSleeves: [] };
    const images = autoAssociateTwoDImages(config).filter((img) => img.elementKind === 'connector');

    // 已连接外模时缺少 after，主体图为空，只返回 pinMap，绝不能回退出现 before.png 或 plain-image.png
    expect(images.map((img) => [img.name, img.imageRole, img.dataUrl])).toEqual([
      ['连接器pin位图', 'connector-pin-map', 'pin-map.png'],
    ]);
  });

  it('handles only pinMap: displays only pinMap', () => {
    setCatalogSnapshot({
      connectors: [{
        id: 'conn-only-pin', resourceItemId: 'res-only-pin', name: 'M12-OnlyPinMap', manufacturer: 'M',
        pinCount: 4, type: 'male', pinLabels: ['1', '2', '3', '4'],
        image: 'plain-image.png',
        imageVariants: { pinMap: 'pin-map.png' },
      }],
      wires: [], overmolds: [], ...staticCatalogOptions(), loadedAt: Date.now(),
    });
    const connector = {
      id: 'conn-inst', position: { x: 0, y: 0 }, label: 'P1', jumpers: [],
      connector: { id: 'conn-only-pin', resourceItemId: 'res-only-pin', name: 'M12-OnlyPinMap', manufacturer: 'M', pinCount: 4, type: 'male' as const, pinLabels: ['1', '2', '3', '4'], image: 'plain-image.png' },
    };
    const config = { ...createDefaultConfig(), connectors: [connector], materials: [], models: [], protectiveSleeves: [] };
    const images = autoAssociateTwoDImages(config);
    expect(images.map((img) => [img.name, img.imageRole, img.dataUrl])).toEqual([
      ['连接器pin位图', 'connector-pin-map', 'pin-map.png'],
    ]);
  });

  it('handles imageVariants: {} (empty object): returns empty array and does NOT fallback to image_path or connector.image', () => {
    setCatalogSnapshot({
      connectors: [{
        id: 'conn-var-5', resourceItemId: 'res-var-5', name: 'M12-EmptyVariants', manufacturer: 'M',
        pinCount: 4, type: 'male', pinLabels: ['1', '2', '3', '4'],
        image: 'plain-image.png',
        imageVariants: {},
      }],
      wires: [], overmolds: [], ...staticCatalogOptions(), loadedAt: Date.now(),
    });
    const connector = {
      id: 'conn-inst', position: { x: 0, y: 0 }, label: 'P1', jumpers: [],
      connector: { id: 'conn-var-5', resourceItemId: 'res-var-5', name: 'M12-EmptyVariants', manufacturer: 'M', pinCount: 4, type: 'male' as const, pinLabels: ['1', '2', '3', '4'], image: 'plain-image.png' },
    };
    const config = { ...createDefaultConfig(), connectors: [connector], materials: [], models: [], protectiveSleeves: [] };
    const images = autoAssociateTwoDImages(config);
    expect(images.filter((img) => img.elementKind === 'connector')).toEqual([]);
  });

  it('handles completely missing imageVariants: returns empty array and does NOT fallback to plain image', () => {
    setCatalogSnapshot({
      connectors: [{
        id: 'conn-no-var', resourceItemId: 'res-no-var', name: 'M12-NoVariants', manufacturer: 'M',
        pinCount: 4, type: 'male', pinLabels: ['1', '2', '3', '4'],
        image: 'plain-image.png',
      }],
      wires: [], overmolds: [], ...staticCatalogOptions(), loadedAt: Date.now(),
    });
    const connector = {
      id: 'conn-inst', position: { x: 0, y: 0 }, label: 'P1', jumpers: [],
      connector: { id: 'conn-no-var', resourceItemId: 'res-no-var', name: 'M12-NoVariants', manufacturer: 'M', pinCount: 4, type: 'male' as const, pinLabels: ['1', '2', '3', '4'], image: 'plain-image.png' },
    };
    const config = { ...createDefaultConfig(), connectors: [connector], materials: [], models: [], protectiveSleeves: [] };
    const images = autoAssociateTwoDImages(config);
    expect(images.filter((img) => img.elementKind === 'connector')).toEqual([]);
  });

  it('rotates right-side connector to 180 degrees and bottom connector to -90 degrees', () => {
    setCatalogSnapshot({
      connectors: [{
        id: 'conn-1', resourceItemId: 'res-conn-1', name: 'CN-Right', manufacturer: 'M',
        pinCount: 2, type: 'male', pinLabels: ['1', '2'],
        imageVariants: { before: 'https://assets.example/conn-before.png', after: 'https://assets.example/conn-after.png' },
      }],
      wires: [], overmolds: [], ...staticCatalogOptions(), loadedAt: Date.now(),
    });
    const leftWire = {
      id: 'wire-1', name: '电子线', position: { x: 100, y: 100 }, width: 200, spec: { kind: 'electronic' as const, color: 'red', lengthMm: 100, awg: 24, ulNumber: '1007' as const, endTreatment: { start: { stripped: false, termination: 'none' as const }, end: { stripped: false, termination: 'none' as const } } },
      circuits: [{ id: 'c1', color: 'red', signalName: 'VCC', start: { connectorId: 'conn-right', connectorSide: 'left' as const, pin: 1 } }],
    };
    const rightConnector = {
      id: 'conn-right', position: { x: 400, y: 100 }, label: 'P2', jumpers: [],
      connector: { id: 'conn-1', resourceItemId: 'res-conn-1', name: 'CN-Right', manufacturer: 'M', pinCount: 2, type: 'male' as const, pinLabels: ['1', '2'] },
    };
    const bottomConnector = {
      id: 'conn-bottom', position: { x: 150, y: 300 }, label: 'P3', jumpers: [],
      connector: { id: 'conn-1', resourceItemId: 'res-conn-1', name: 'CN-Bottom', manufacturer: 'M', pinCount: 2, type: 'male' as const, pinLabels: ['1', '2'] },
    };

    const configRight = { ...createDefaultConfig(), connectors: [rightConnector], materials: [leftWire], models: [], protectiveSleeves: [] };
    const imagesRight = autoAssociateTwoDImages(configRight);
    const rightConnImage = imagesRight.find((img) => img.elementId === 'conn-right');
    expect(rightConnImage?.rotation).toBe(180);
    expect(rightConnImage?.orientation).toBe('right');

    const configBottom = { ...createDefaultConfig(), connectors: [bottomConnector], materials: [leftWire], models: [], protectiveSleeves: [] };
    const imagesBottom = autoAssociateTwoDImages(configBottom);
    const bottomConnImage = imagesBottom.find((img) => img.elementId === 'conn-bottom');
    expect(bottomConnImage?.rotation).toBe(-90);
    expect(bottomConnImage?.orientation).toBe('bottom');
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
      connectors: [{
        id: 'C1', resourceItemId: 'resource-1', name: 'C1', manufacturer: 'M', pinCount: 2, type: 'male', pinLabels: [],
        imageVariants: { before: 'https://new.example/c1-before.png', after: 'https://new.example/c1-after.png', pinMap: 'https://new.example/c1-pin.png' },
      }],
      wires: [],
      overmolds: [],
      ...staticCatalogOptions(),
      loadedAt: Date.now(),
    });
    const config = {
      ...createDefaultConfig(),
      connectors: [{ id: 'instance-1', connector: { id: 'C1', resourceItemId: 'resource-1', name: 'C1', manufacturer: 'M', pinCount: 2, type: 'male' as const, pinLabels: [] }, position: { x: 0, y: 0 }, label: 'P1', jumpers: [] }],
      materials: [], protectiveSleeves: [], models: [], twoDImages: [{ id: 'stable-image', name: 'C1', dataUrl: 'https://old.example/c1-before.png', source: 'catalog' as const, elementKind: 'connector' as const, elementId: 'instance-1', imageRole: 'connector-before' as const, rotation: 0 as const, pos: { x: 120, y: 80 } }],
    };

    expect(autoAssociateTwoDImages(config)).toEqual(expect.arrayContaining([expect.objectContaining({
      id: 'stable-image', dataUrl: 'https://new.example/c1-before.png', rotation: 0, pos: { x: 120, y: 80 },
    })]));
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

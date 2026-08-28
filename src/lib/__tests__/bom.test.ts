import { describe, it, expect } from 'vitest';
import { generateBOM } from '@/lib/bom';
import type { HarnessConfig, CanvasWireMaterial, ProtectiveSleeve } from '@/types/harness';

function makeBaseConfig(): HarnessConfig {
  return {
    schemaVersion: 3,
    id: 'test',
    name: 'test',
    createdAt: 0,
    updatedAt: 0,
    connectors: [],
    materials: [],
    protectiveSleeves: [],
    models: [],
    quantity: 1,
    leadTime: 'standard',
  };
}

function makeElectronicMaterial(
  id: string,
  color: string,
  awg: number,
  lengthMm: number,
): CanvasWireMaterial {
  return {
    id,
    name: id,
    position: { x: 0, y: 0 },
    width: 200,
    spec: {
      kind: 'electronic',
      color,
      lengthMm,
      awg,
      ulNumber: '1007',
      endTreatment: {
        start: { stripped: false, termination: 'none' },
        end: { stripped: false, termination: 'none' },
      },
    },
    circuits: [],
  };
}

function makeJacketedMaterial(
  id: string,
  jacketColor: 'black' | 'green',
  shielded: boolean,
  coreCount: 1 | 2 | 3 | 4 | 5 | 6 | 8 | 12 | 17,
  odMm: number,
  ulNumber?: 'UL2464' | 'UL20276',
): CanvasWireMaterial {
  return {
    id,
    name: id,
    position: { x: 0, y: 0 },
    width: 200,
    spec: {
      kind: 'jacketed',
      jacketMaterial: 'PVC',
      jacketColor,
      awg: 26,
      coreCount,
      shielded,
      odMm,
      coreColors: ['红色', '黑色'],
      endTreatment: {
        start: { stripped: false, termination: 'none' },
        end: { stripped: false, termination: 'none' },
      },
      lengthMm: 300,
      ulNumber,
    },
    circuits: [],
  };
}

describe('BOM grouping', () => {
  it('separates electronic wires by color', () => {
    const config: HarnessConfig = {
      ...makeBaseConfig(),
      materials: [
        makeElectronicMaterial('m1', 'red', 26, 300),
        makeElectronicMaterial('m2', 'black', 26, 300),
        makeElectronicMaterial('m3', 'red', 26, 300),
      ],
    };

    const bom = generateBOM(config);
    const wireItems = bom.filter((i) => i.type === 'wire');
    // red and black should be separate lines; red has quantity 2.
    const redItem = wireItems.find((i) => i.description.includes('red'));
    const blackItem = wireItems.find((i) => i.description.includes('black'));
    expect(redItem).toBeDefined();
    expect(blackItem).toBeDefined();
    expect(redItem!.quantity).toBe(2);
    expect(blackItem!.quantity).toBe(1);
  });

  it('separates jacketed wires by shielded flag', () => {
    const config: HarnessConfig = {
      ...makeBaseConfig(),
      materials: [
        makeJacketedMaterial('m1', 'black', false, 2, 3.5),
        makeJacketedMaterial('m2', 'black', true, 2, 3.5),
      ],
    };

    const bom = generateBOM(config);
    const wireItems = bom.filter((i) => i.type === 'wire');
    expect(wireItems).toHaveLength(2);
  });

  it('separates jacketed wires by UL number', () => {
    const config: HarnessConfig = {
      ...makeBaseConfig(),
      materials: [
        makeJacketedMaterial('m1', 'black', false, 2, 3.5, 'UL2464'),
        makeJacketedMaterial('m2', 'black', false, 2, 3.5, 'UL20276'),
        makeJacketedMaterial('m3', 'black', false, 2, 3.5), // no UL
      ],
    };

    const bom = generateBOM(config);
    const wireItems = bom.filter((i) => i.type === 'wire');
    expect(wireItems).toHaveLength(3);
  });

  it('separates jacketed wires by OD', () => {
    const config: HarnessConfig = {
      ...makeBaseConfig(),
      materials: [
        makeJacketedMaterial('m1', 'black', false, 2, 3.5),
        makeJacketedMaterial('m2', 'black', false, 2, 4.0),
      ],
    };

    const bom = generateBOM(config);
    const wireItems = bom.filter((i) => i.type === 'wire');
    expect(wireItems).toHaveLength(2);
  });

  it('separates jacketed wires by jacket color', () => {
    const config: HarnessConfig = {
      ...makeBaseConfig(),
      materials: [
        makeJacketedMaterial('m1', 'black', false, 2, 3.5),
        makeJacketedMaterial('m2', 'green', false, 2, 3.5),
      ],
    };

    const bom = generateBOM(config);
    const wireItems = bom.filter((i) => i.type === 'wire');
    expect(wireItems).toHaveLength(2);
  });

  it('separates jacketed wires by resourceItemId', () => {
    const w1 = makeJacketedMaterial('m1', 'black', true, 4, 5.2);
    w1.resourceItemId = 'wire-res-1';
    const w2 = makeJacketedMaterial('m2', 'black', true, 4, 5.2);
    w2.resourceItemId = 'wire-res-2';

    const config: HarnessConfig = {
      ...makeBaseConfig(),
      materials: [w1, w2],
    };

    const bom = generateBOM(config);
    const wireItems = bom.filter((i) => i.type === 'wire');
    expect(wireItems).toHaveLength(2);
    expect(wireItems[0].resourceItemId).toBe('wire-res-1');
    expect(wireItems[1].resourceItemId).toBe('wire-res-2');
  });

  it('populates model and resourceItemId on connector BOM items', () => {
    const config: HarnessConfig = {
      ...makeBaseConfig(),
      connectors: [
        {
          id: 'c1',
          position: { x: 0, y: 0 },
          label: 'J1',
          jumpers: [],
          connector: {
            id: 'm12a04-07-093',
            name: 'M12 A-Coded 4P 公头',
            model: 'M12A04-07-093',
            resourceItemId: 'uuid-conn-1',
            manufacturer: 'Manufacturer A',
            pinCount: 4,
            type: 'male',
            pinLabels: ['1', '2', '3', '4'],
          },
        },
      ],
    };

    const bom = generateBOM(config);
    const connItems = bom.filter((i) => i.type === 'connector');
    expect(connItems).toHaveLength(1);
    expect(connItems[0].partNumber).toBe('M12A04-07-093');
    expect(connItems[0].model).toBe('M12A04-07-093');
    expect(connItems[0].resourceItemId).toBe('uuid-conn-1');
  });

  it('separates corrugated sleeves by material', () => {
    const sleeve1: ProtectiveSleeve = {
      id: 's1',
      type: 'corrugated',
      corrugatedMaterial: 'PP',
      position: { x: 0, y: 0 },
      width: 100,
      height: 36,
      lengthMm: 100,
      attachedMaterialIds: [],
    };
    const sleeve2: ProtectiveSleeve = {
      id: 's2',
      type: 'corrugated',
      corrugatedMaterial: 'PA',
      position: { x: 0, y: 0 },
      width: 100,
      height: 36,
      lengthMm: 100,
      attachedMaterialIds: [],
    };
    const config: HarnessConfig = {
      ...makeBaseConfig(),
      protectiveSleeves: [sleeve1, sleeve2],
      models: [],
    };

    const bom = generateBOM(config);
    const accessoryItems = bom.filter((i) => i.type === 'accessory');
    expect(accessoryItems).toHaveLength(2);
  });
});

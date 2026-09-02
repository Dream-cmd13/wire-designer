import { describe, expect, it } from 'vitest';
import { buildProductionBomRows } from '@/lib/productionBomRows';
import type {
  CanvasModel,
  CanvasWireMaterial,
  ConnectorInstance,
  HarnessConfig,
  OvermoldSpec,
  ProtectiveSleeve,
} from '@/types/harness';

describe('buildProductionBomRows', () => {
  it('correctly maps wires, connectors, overmolds, and sleeves to targets', () => {
    const connectors: ConnectorInstance[] = [
      {
        id: 'conn-1',
        label: 'P1',
        connector: {
          id: 'c-usb',
          name: 'Type-C 公头',
          pinCount: 16,
          manufacturer: 'Generic',
          type: 'male',
          pinLabels: [],
          resourceItemId: 'res-c-usb',
        },
        position: { x: 50, y: 100 },
        jumpers: [],
      },
      {
        id: 'conn-2',
        label: 'P2',
        connector: {
          id: 'c-usb',
          name: 'Type-C 公头',
          pinCount: 16,
          manufacturer: 'Generic',
          type: 'male',
          pinLabels: [],
          resourceItemId: 'res-c-usb',
        },
        position: { x: 400, y: 100 },
        jumpers: [],
      },
    ];

    const materials: CanvasWireMaterial[] = [
      {
        id: 'mat-1',
        name: 'USB-C Cable',
        spec: {
          kind: 'jacketed',
          awg: 28,
          coreCount: 4,
          odMm: 4.5,
          jacketColor: 'black',
          jacketMaterial: 'PVC',
          shielded: true,
          lengthMm: 1000,
          coreColors: ['red', 'black', 'green', 'white'],
          endTreatment: {
            start: { stripped: true, stripLengthMm: 5, termination: 'tinned' },
            end: { stripped: true, stripLengthMm: 5, termination: 'tinned' },
          },
        },
        circuits: [],
        position: { x: 150, y: 100 },
        width: 200,
      },
    ];

    const overmoldSpecs: OvermoldSpec[] = [
      {
        id: 'spec-c-straight',
        name: 'Type-C 黑色PVC直头',
        outerMaterial: '黑色PVC',
        outerHardness: '45P',
        outerForm: 'straight',
        innerMaterial: '低密度透明PE',
        innerForm: 'straight',
      },
    ];

    const models: CanvasModel[] = [
      {
        id: 'model-1',
        kind: 'outer-box',
        position: { x: 60, y: 90 },
        width: 60,
        height: 40,
        overmoldSpecId: 'spec-c-straight',
        includeInnerMold: true,
      },
      {
        id: 'model-2',
        kind: 'outer-box',
        position: { x: 380, y: 90 },
        width: 60,
        height: 40,
        overmoldSpecId: 'spec-c-straight',
        includeInnerMold: true,
      },
    ];

    const sleeves: ProtectiveSleeve[] = [
      {
        id: 'sleeve-1',
        type: 'heat-shrink',
        lengthMm: 30,
        position: { x: 160, y: 100 },
        width: 30,
        height: 20,
        attachedMaterialIds: ['mat-1'],
      },
    ];

    const config: HarnessConfig = {
      name: 'USB-C Cable Assembly',
      version: '1.0',
      canvas: { width: 1200, height: 800, scale: 1 },
      connectors,
      materials,
      models,
      protectiveSleeves: sleeves,
    } as unknown as HarnessConfig;

    const rows = buildProductionBomRows(config, overmoldSpecs, null);

    // 1 wire, 1 connector group (2 instances), 1 outer-mold group (2 instances), 1 inner-mold group (2 instances), 1 sleeve group
    expect(rows).toHaveLength(5);

    // Wire row
    expect(rows[0].kind).toBe('wire');
    expect(rows[0].itemNo).toBe(1);
    expect(rows[0].name).toBe('线材');
    expect(rows[0].quantity).toBe(1);
    expect(rows[0].targets).toEqual([{ kind: 'material', id: 'mat-1' }]);

    // Connector row (merged)
    expect(rows[1].kind).toBe('connector');
    expect(rows[1].itemNo).toBe(2);
    expect(rows[1].name).toBe('连接器');
    expect(rows[1].quantity).toBe(2);
    expect(rows[1].targets).toEqual([
      { kind: 'connector', id: 'conn-1' },
      { kind: 'connector', id: 'conn-2' },
    ]);

    // Outer mold row (merged)
    expect(rows[2].kind).toBe('outer-mold');
    expect(rows[2].itemNo).toBe(3);
    expect(rows[2].name).toBe('外模料');
    expect(rows[2].quantity).toBe(2);
    expect(rows[2].targets).toEqual([
      { kind: 'model', id: 'model-1' },
      { kind: 'model', id: 'model-2' },
    ]);

    // Inner mold row (merged)
    expect(rows[3].kind).toBe('inner-mold');
    expect(rows[3].itemNo).toBe(4);
    expect(rows[3].name).toBe('内模料');
    expect(rows[3].quantity).toBe(2);
    expect(rows[3].targets).toEqual([
      { kind: 'model', id: 'model-1' },
      { kind: 'model', id: 'model-2' },
    ]);

    // Sleeve row
    expect(rows[4].kind).toBe('accessory');
    expect(rows[4].itemNo).toBe(5);
    expect(rows[4].name).toBe('热缩管');
    expect(rows[4].quantity).toBe(1);
    expect(rows[4].targets).toEqual([{ kind: 'sleeve', id: 'sleeve-1' }]);
  });

  it('handles empty config gracefully', () => {
    const config: HarnessConfig = {
      name: 'Empty',
      version: '1.0',
      canvas: { width: 1200, height: 800, scale: 1 },
      connectors: [],
      materials: [],
      models: [],
      protectiveSleeves: [],
    } as unknown as HarnessConfig;

    const rows = buildProductionBomRows(config, [], null);
    expect(rows).toHaveLength(0);
  });

  it('assigns sequential item numbers up to 10+ items', () => {
    const materials: CanvasWireMaterial[] = Array.from({ length: 12 }).map((_, i) => ({
      id: `mat-${i}`,
      name: `Wire ${i}`,
      spec: {
        kind: 'electronic',
        awg: (20 + (i % 8)) as 20 | 22 | 24 | 26 | 28,
        color: `color-${i}`,
        lengthMm: 100 * (i + 1),
        ulNumber: '1007' as const,
        endTreatment: {
          start: { stripped: false, termination: 'none' as const },
          end: { stripped: false, termination: 'none' as const },
        },
      },
      circuits: [],
      position: { x: 0, y: 0 },
      width: 100,
    }));

    const config: HarnessConfig = {
      name: 'Multi-wire',
      version: '1.0',
      canvas: { width: 1200, height: 800, scale: 1 },
      connectors: [],
      materials,
      models: [],
      protectiveSleeves: [],
    } as unknown as HarnessConfig;

    const rows = buildProductionBomRows(config, [], null);
    expect(rows).toHaveLength(12);
    rows.forEach((row, idx) => {
      expect(row.itemNo).toBe(idx + 1);
    });
  });
});

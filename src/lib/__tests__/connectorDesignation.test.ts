import { describe, expect, it } from 'vitest';
import { getWiringConnectorLabels, syncConnectorLabels } from '@/lib/connectorDesignation';
import type { CanvasWireMaterial, ConnectorInstance, HarnessConfig } from '@/types/harness';

function makeConnector(id: string, name: string, x: number): ConnectorInstance {
  return {
    id,
    position: { x, y: 100 },
    label: name, // even if instance.label is set to the full name
    connector: {
      id,
      name,
      manufacturer: 'Generic',
      pinCount: 4,
      type: 'male',
      pinLabels: ['1', '2', '3', '4'],
    },
    jumpers: [],
  };
}

function makeMaterial(
  circuits: Array<Partial<CanvasWireMaterial['circuits'][number]> & { id: string; color: string }>,
): CanvasWireMaterial {
  return {
    id: 'mat-1',
    name: '4芯护套线',
    position: { x: 200, y: 100 },
    width: 200,
    spec: {
      kind: 'jacketed',
      jacketMaterial: 'PVC',
      jacketColor: 'black',
      awg: 22,
      coreCount: 4,
      shielded: false,
      odMm: 4.5,
      coreColors: ['red', 'black', 'white', 'green'],
      endTreatment: {
        start: { stripped: true, termination: 'none' },
        end: { stripped: true, termination: 'none' },
      },
      lengthMm: 500,
    },
    circuits: circuits.map((c) => ({ signalName: '', ...c })),
  };
}

describe('getWiringConnectorLabels', () => {
  it('assigns P1 to left connector and P2 to right connector when both are connected to wire material', () => {
    const conn1 = makeConnector('conn-1', 'M12成型式防水连接器 4芯 A编码 焊线式公头 非屏蔽款+11.8L双网纹螺丝', 50);
    const conn2 = makeConnector('conn-2', 'JST XH 4P', 400);

    const mat = makeMaterial([
      {
        id: 'c1',
        color: 'red',
        start: { connectorId: 'conn-1', connectorSide: 'right', pin: 1 },
        end: { connectorId: 'conn-2', connectorSide: 'left', pin: 1 },
      },
      {
        id: 'c2',
        color: 'black',
        start: { connectorId: 'conn-1', connectorSide: 'right', pin: 2 },
        end: { connectorId: 'conn-2', connectorSide: 'left', pin: 2 },
      },
    ]);

    const result = getWiringConnectorLabels([conn2, conn1], [mat]); // pass in arbitrary order
    expect(result.p1Label).toBe('P1');
    expect(result.p2Label).toBe('P2');
    expect(result.connectorDesignations.get('conn-1')).toBe('P1');
    expect(result.connectorDesignations.get('conn-2')).toBe('P2');
  });

  it('assigns P1, P2, P3 sequentially to multiple connected connectors from left to right', () => {
    const conn1 = makeConnector('conn-1', 'Conn Left', 50);
    const conn2 = makeConnector('conn-2', 'Conn Middle', 250);
    const conn3 = makeConnector('conn-3', 'Conn Right', 500);

    const mat = makeMaterial([
      {
        id: 'c1',
        color: 'red',
        start: { connectorId: 'conn-1', connectorSide: 'right', pin: 1 },
        end: { connectorId: 'conn-3', connectorSide: 'left', pin: 1 },
      },
      {
        id: 'c2',
        color: 'black',
        start: { connectorId: 'conn-2', connectorSide: 'right', pin: 1 },
        end: { connectorId: 'conn-3', connectorSide: 'left', pin: 2 },
      },
    ]);

    const result = getWiringConnectorLabels([conn3, conn1, conn2], [mat]);
    expect(result.connectorDesignations.get('conn-1')).toBe('P1');
    expect(result.connectorDesignations.get('conn-2')).toBe('P2');
    expect(result.connectorDesignations.get('conn-3')).toBe('P3');
    expect(result.orderedConnectors.map((c) => c.label)).toEqual(['P1', 'P2', 'P3']);
    expect(result.p1Label).toBe('P1');
    expect(result.p2Label).toBe('P3');
  });

  it('correctly handles 1 connector on left and 2 connectors on right', () => {
    const leftConn = makeConnector('conn-left', 'M12 A', 50);
    const rightConn1 = makeConnector('conn-r1', 'JST 1', 400);
    rightConn1.position.y = 80;
    const rightConn2 = makeConnector('conn-r2', 'JST 2', 400);
    rightConn2.position.y = 200;

    const mat = makeMaterial([
      {
        id: 'c1',
        color: 'red',
        start: { connectorId: 'conn-left', connectorSide: 'right', pin: 1 },
        end: { connectorId: 'conn-r1', connectorSide: 'left', pin: 1 },
      },
      {
        id: 'c2',
        color: 'black',
        start: { connectorId: 'conn-left', connectorSide: 'right', pin: 2 },
        end: { connectorId: 'conn-r2', connectorSide: 'left', pin: 1 },
      },
    ]);

    const result = getWiringConnectorLabels([rightConn2, leftConn, rightConn1], [mat]);
    expect(result.orderedConnectors.map((c) => c.label)).toEqual(['P1', 'P2', 'P3']);
    expect(result.connectorDesignations.get('conn-left')).toBe('P1');
    expect(result.connectorDesignations.get('conn-r1')).toBe('P2');
    expect(result.connectorDesignations.get('conn-r2')).toBe('P3');
  });

  it('assigns P1 to single connected connector, and shows name for unconnected connector', () => {
    const conn1 = makeConnector('conn-1', 'M12成型式防水连接器 4芯 A编码', 50);
    const connUnconnected = makeConnector('conn-2', 'JST XH 4P', 400);

    // Single-ended cable (only start is connected)
    const mat = makeMaterial([
      {
        id: 'c1',
        color: 'red',
        start: { connectorId: 'conn-1', connectorSide: 'right', pin: 1 },
        // end is cut
      },
    ]);

    const result = getWiringConnectorLabels([conn1, connUnconnected], [mat]);
    expect(result.connectorDesignations.get('conn-1')).toBe('P1');
    expect(result.connectorDesignations.get('conn-2')).toBe('JST XH 4P');
    expect(result.p1Label).toBe('P1');
    expect(result.p2Label).toBe('JST XH 4P');
  });

  it('shows connector name when only unconnected connectors exist', () => {
    const conn1 = makeConnector('conn-1', 'M12成型式防水连接器', 50);
    const mat = makeMaterial([]); // no circuits

    const result = getWiringConnectorLabels([conn1], [mat]);
    expect(result.connectorDesignations.get('conn-1')).toBe('M12成型式防水连接器');
    expect(result.p1Label).toBe('M12成型式防水连接器');
  });

  it('supports multiple materials when assigning connector labels', () => {
    const conn1 = makeConnector('conn-1', 'C1', 50);
    const conn2 = makeConnector('conn-2', 'C2', 200);
    const conn3 = makeConnector('conn-3', 'C3', 400);

    const mat1 = makeMaterial([
      {
        id: 'c1',
        color: 'red',
        start: { connectorId: 'conn-1', connectorSide: 'right', pin: 1 },
        end: { connectorId: 'conn-2', connectorSide: 'left', pin: 1 },
      },
    ]);
    const mat2 = {
      ...makeMaterial([
        {
          id: 'c2',
          color: 'blue',
          start: { connectorId: 'conn-2', connectorSide: 'right', pin: 2 },
          end: { connectorId: 'conn-3', connectorSide: 'left', pin: 1 },
        },
      ]),
      id: 'mat-2',
    };

    const result = getWiringConnectorLabels([conn3, conn1, conn2], [mat1, mat2]);
    expect(result.orderedConnectors.map((c) => c.label)).toEqual(['P1', 'P2', 'P3']);
    expect(result.connectorDesignations.get('conn-1')).toBe('P1');
    expect(result.connectorDesignations.get('conn-2')).toBe('P2');
    expect(result.connectorDesignations.get('conn-3')).toBe('P3');
  });
});

describe('syncConnectorLabels', () => {
  function makeBasicConfig(connectors: ConnectorInstance[], materials: CanvasWireMaterial[]): HarnessConfig {
    return {
      schemaVersion: 3,
      id: 'proj-1',
      name: '测试项目',
      connectors,
      materials,
      protectiveSleeves: [],
      models: [],
      twoDImages: [],
      quantity: 1,
      leadTime: 'standard',
      createdAt: 1000,
      updatedAt: 1000,
    };
  }

  it('assigns P1 to a single connector when connected to wire material', () => {
    const conn1 = makeConnector('conn-1', 'DT06-2S', 100);
    const mat = makeMaterial([
      {
        id: 'c1',
        color: 'red',
        start: { connectorId: 'conn-1', connectorSide: 'right', pin: 1 },
      },
    ]);
    const config = makeBasicConfig([conn1], [mat]);

    const updated = syncConnectorLabels(config);
    expect(updated.connectors[0].label).toBe('P1');
  });

  it('assigns P1, P2, P3 from left to right when multiple connectors are connected', () => {
    const connRight = makeConnector('conn-3', 'DT06-4S', 500);
    const connLeft = makeConnector('conn-1', 'DT06-2S', 100);
    const connMid = makeConnector('conn-2', 'DT06-3S', 300);

    const mat = makeMaterial([
      {
        id: 'c1',
        color: 'red',
        start: { connectorId: 'conn-1', connectorSide: 'right', pin: 1 },
        end: { connectorId: 'conn-2', connectorSide: 'left', pin: 1 },
      },
      {
        id: 'c2',
        color: 'black',
        start: { connectorId: 'conn-2', connectorSide: 'right', pin: 2 },
        end: { connectorId: 'conn-3', connectorSide: 'left', pin: 1 },
      },
    ]);

    const config = makeBasicConfig([connRight, connLeft, connMid], [mat]);
    const updated = syncConnectorLabels(config);

    const map = new Map(updated.connectors.map((c) => [c.id, c.label]));
    expect(map.get('conn-1')).toBe('P1');
    expect(map.get('conn-2')).toBe('P2');
    expect(map.get('conn-3')).toBe('P3');
  });

  it('keeps original name for unconnected connector, while numbering connected ones', () => {
    const conn1 = makeConnector('conn-1', 'DT06-2S', 100);
    const connUnconnected = makeConnector('conn-2', 'JST-4P', 250);
    const conn3 = makeConnector('conn-3', 'M12-4P', 400);

    const mat = makeMaterial([
      {
        id: 'c1',
        color: 'red',
        start: { connectorId: 'conn-1', connectorSide: 'right', pin: 1 },
        end: { connectorId: 'conn-3', connectorSide: 'left', pin: 1 },
      },
    ]);

    const config = makeBasicConfig([conn1, connUnconnected, conn3], [mat]);
    const updated = syncConnectorLabels(config);

    const map = new Map(updated.connectors.map((c) => [c.id, c.label]));
    expect(map.get('conn-1')).toBe('P1');
    expect(map.get('conn-2')).toBe('JST-4P');
    expect(map.get('conn-3')).toBe('P2');
  });

  it('restores connector name when all circuits are detached, and renumbers remaining connectors', () => {
    // conn-1 was P1, conn-2 was P2
    const conn1 = { ...makeConnector('conn-1', 'DT06-2S', 100), label: 'P1' };
    const conn2 = { ...makeConnector('conn-2', 'JST-4P', 300), label: 'P2' };

    // Now circuit only connects conn-2
    const mat = makeMaterial([
      {
        id: 'c1',
        color: 'red',
        start: { connectorId: 'conn-2', connectorSide: 'left', pin: 1 },
      },
    ]);

    const config = makeBasicConfig([conn1, conn2], [mat]);
    const updated = syncConnectorLabels(config);

    const map = new Map(updated.connectors.map((c) => [c.id, c.label]));
    expect(map.get('conn-1')).toBe('DT06-2S'); // reverted back to connector name
    expect(map.get('conn-2')).toBe('P1'); // renumbered to P1
  });

  it('returns exact same config object when no labels change', () => {
    const conn1 = { ...makeConnector('conn-1', 'DT06-2S', 100), label: 'P1' };
    const mat = makeMaterial([
      {
        id: 'c1',
        color: 'red',
        start: { connectorId: 'conn-1', connectorSide: 'right', pin: 1 },
      },
    ]);

    const config = makeBasicConfig([conn1], [mat]);
    const updated = syncConnectorLabels(config);

    expect(updated).toBe(config); // referential equality
  });
});

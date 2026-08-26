import { describe, expect, it } from 'vitest';
import { getWiringConnectorLabels } from '@/lib/connectorDesignation';
import type { CanvasWireMaterial, ConnectorInstance } from '@/types/harness';

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
});

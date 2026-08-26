import type { CanvasWireMaterial, ConnectorInstance } from '@/types/harness';

export interface WiringConnectorInfo {
  id: string;
  label: string; // 'P1', 'P2', 'P3'... or connector.name
  connector: ConnectorInstance;
  orderIndex: number;
}

export interface WiringConnectorLabelsResult {
  orderedConnectors: WiringConnectorInfo[];
  connectorDesignations: Map<string, string>;
  p1Label: string;
  p2Label: string;
  leftConn?: ConnectorInstance;
  rightConn?: ConnectorInstance;
}

/**
 * Calculates connector labels/designations for the wiring diagram:
 * - Extracts all connected connectors, sorted by X position (then Y position).
 * - Assigns 'P1', 'P2', 'P3'... ordered from left to right.
 * - If unconnected (or only connector), displays connector name.
 */
export function getWiringConnectorLabels(
  connectors: ConnectorInstance[],
  materials: CanvasWireMaterial[],
): WiringConnectorLabelsResult {
  const mat = materials[0];
  const circuits = mat?.circuits || [];

  const connectedConnIds = new Set<string>();
  circuits.forEach((c) => {
    if (c.start?.connectorId) connectedConnIds.add(c.start.connectorId);
    if (c.end?.connectorId) connectedConnIds.add(c.end.connectorId);
  });

  // Sort all connectors by X ascending, then Y ascending
  const sortedConns = [...connectors].sort((a, b) => {
    if (Math.abs(a.position.x - b.position.x) > 0.001) {
      return a.position.x - b.position.x;
    }
    return a.position.y - b.position.y;
  });

  const connectorDesignations = new Map<string, string>();
  let pIndex = 1;
  sortedConns.forEach((c) => {
    if (connectedConnIds.has(c.id)) {
      connectorDesignations.set(c.id, `P${pIndex++}`);
    } else {
      connectorDesignations.set(c.id, c.connector?.name || '连接器');
    }
  });

  // Filter to connected connectors if any exist, otherwise use all available connectors
  const targetConns = connectedConnIds.size > 0
    ? sortedConns.filter((c) => connectedConnIds.has(c.id))
    : sortedConns;

  const orderedConnectors: WiringConnectorInfo[] = targetConns.map((connector, orderIndex) => ({
    id: connector.id,
    label: connectorDesignations.get(connector.id) || `P${orderIndex + 1}`,
    connector,
    orderIndex,
  }));

  const leftConn = sortedConns[0];
  const rightConn = sortedConns.length > 1 ? sortedConns[sortedConns.length - 1] : undefined;

  const p1Label = leftConn ? (connectorDesignations.get(leftConn.id) || 'P1') : 'P1';
  const p2Label = rightConn ? (connectorDesignations.get(rightConn.id) || 'P2') : 'P2';

  return {
    orderedConnectors,
    connectorDesignations,
    p1Label,
    p2Label,
    leftConn,
    rightConn,
  };
}

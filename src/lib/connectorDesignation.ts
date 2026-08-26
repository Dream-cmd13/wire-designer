import type { CanvasWireMaterial, ConnectorInstance, HarnessConfig } from '@/types/harness';

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
 * 自动同步连接器的位号标签：
 * 1. 扫描配置中所有线材的所有回路，收集所有被引用的连接器 ID (connectedConnIds)。
 * 2. 筛选出所有已连接线材的连接器，并按 X 升序（X 相同按 Y 升序）排序。
 * 3. 依次给已连接连接器赋予位号：'P1', 'P2', 'P3'...
 * 4. 对于未连接线材的连接器：若此前被赋予了自动位号（匹配 /^P\d+$/i），则恢复为其型号名称（c.connector.name || '连接器'）；
 *    若属于用户自定义的非 P 位号名称，则予以保留。
 * 5. 若无任何变化直接返回原 config 引用，避免无意义的 re-render。
 */
export function syncConnectorLabels(config: HarnessConfig): HarnessConfig {
  const connectedConnIds = new Set<string>();
  for (const material of config.materials || []) {
    for (const circuit of material.circuits || []) {
      if (circuit.start?.connectorId) connectedConnIds.add(circuit.start.connectorId);
      if (circuit.end?.connectorId) connectedConnIds.add(circuit.end.connectorId);
    }
  }

  // 排序已连接的连接器：从左到右，从上到下
  const sortedConnected = (config.connectors || [])
    .filter((c) => connectedConnIds.has(c.id))
    .sort((a, b) => {
      if (Math.abs(a.position.x - b.position.x) > 0.001) {
        return a.position.x - b.position.x;
      }
      return a.position.y - b.position.y;
    });

  const designationMap = new Map<string, string>();
  sortedConnected.forEach((conn, index) => {
    designationMap.set(conn.id, `P${index + 1}`);
  });

  let hasChange = false;
  const nextConnectors = (config.connectors || []).map((c) => {
    let targetLabel: string;
    if (designationMap.has(c.id)) {
      targetLabel = designationMap.get(c.id)!;
    } else {
      // 未连线：若带有自动生成的 P 位号，则重置为型号名称
      if (/^P\d+$/i.test(c.label)) {
        targetLabel = c.connector?.name || '连接器';
      } else {
        targetLabel = c.label || c.connector?.name || '连接器';
      }
    }

    if (targetLabel !== c.label) {
      hasChange = true;
      return { ...c, label: targetLabel };
    }
    return c;
  });

  if (!hasChange) return config;

  return {
    ...config,
    connectors: nextConnectors,
  };
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
  const connectedConnIds = new Set<string>();
  materials.forEach((mat) => {
    (mat?.circuits || []).forEach((c) => {
      if (c.start?.connectorId) connectedConnIds.add(c.start.connectorId);
      if (c.end?.connectorId) connectedConnIds.add(c.end.connectorId);
    });
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

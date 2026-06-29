// ============================================================
// Atomic Domain Commands
// Pure functions that operate on HarnessConfig immutably.
// Each command validates input, produces a new config,
// ensures no dangling references, and returns the result.
// ============================================================

import type { HarnessConfig, HarnessNode, Connection, Wire, Selection } from '@/types/harness';
import { CONNECTORS } from '@/lib/data';

// ============================================================
// ID Generator
// ============================================================

let _idGenerator: (() => string) | null = null;

export function setIdGenerator(fn: () => string): void {
  _idGenerator = fn;
}

function generateId(): string {
  if (_idGenerator) return _idGenerator();
  // Fallback: crypto.randomUUID if available, otherwise Math.random
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// ============================================================
// Command Input Types
// ============================================================

export interface AddConnectorNodeInput {
  position?: { x: number; y: number };
  connectorId?: string;
  label?: string;
}

export interface CreateConnectionInput {
  fromNodeId: string;
  toNodeId: string;
  name?: string;
  createDefaultWire?: boolean;
}

export interface WireDraft {
  name?: string;
  wireGauge?: number;
  wireType?: string;
  wireColor?: string;
  lengthMm?: number;
  fromPin?: number;
  toPin?: number;
  signalName?: string;
  shielded?: boolean;
}

export type RemovePolicy = 'cascade' | 'abort';

// ============================================================
// Node Commands
// ============================================================

/** Add a new connector node to the design */
export function addConnectorNode(
  config: HarnessConfig,
  input: AddConnectorNodeInput = {}
): HarnessConfig {
  const connector = input.connectorId
    ? CONNECTORS.find((c) => c.id === input.connectorId) || CONNECTORS[0]
    : CONNECTORS[0];

  if (!connector) {
    throw new Error('No connector available in catalog');
  }

  const id = generateId();
  const newNode: HarnessNode = {
    id,
    type: 'connector',
    position: input.position || { x: 200 + Math.random() * 100, y: 200 + Math.random() * 100 },
    connector: { ...connector },
    label: input.label || connector.name || `连接器${config.nodes.length + 1}`,
  };

  return {
    ...config,
    nodes: [...config.nodes, newNode],
    updatedAt: Date.now(),
  };
}

/** Update node properties */
export function updateNodeProperties(
  config: HarnessConfig,
  nodeId: string,
  patch: Partial<Pick<HarnessNode, 'label' | 'position'>>
): HarnessConfig {
  const nodeIndex = config.nodes.findIndex((n) => n.id === nodeId);
  if (nodeIndex === -1) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  const newNodes = [...config.nodes];
  newNodes[nodeIndex] = { ...newNodes[nodeIndex], ...patch };

  return {
    ...config,
    nodes: newNodes,
    updatedAt: Date.now(),
  };
}

/** Change a node's connector part, with pin migration */
export function changeConnectorPart(
  config: HarnessConfig,
  nodeId: string,
  newPartId: string
): { config: HarnessConfig; affectedWires: Wire[]; warnings: string[] } {
  const node = config.nodes.find((n) => n.id === nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  const newConnector = CONNECTORS.find((c) => c.id === newPartId);
  if (!newConnector) {
    throw new Error(`Connector not found: ${newPartId}`);
  }

  const oldPinCount = node.connector?.pinCount || 0;
  const newPinCount = newConnector.pinCount;
  const affectedWires = config.wires.filter(
    (w) => w.fromConnectorId === nodeId || w.toConnectorId === nodeId
  );
  const warnings: string[] = [];

  // Check for wires that would have out-of-range pins
  for (const wire of affectedWires) {
    if (wire.fromConnectorId === nodeId && wire.fromPin > newPinCount) {
      warnings.push(
        `Wire "${wire.name}" from pin ${wire.fromPin} will be out of range (new connector has ${newPinCount} pins)`
      );
    }
    if (wire.toConnectorId === nodeId && wire.toPin > newPinCount) {
      warnings.push(
        `Wire "${wire.name}" to pin ${wire.toPin} will be out of range (new connector has ${newPinCount} pins)`
      );
    }
  }

  // If pin count decreased but no wires are affected, allow the change
  if (warnings.length > 0) {
    // Don't apply the change if there are warnings — caller must handle migration
    return { config, affectedWires, warnings };
  }

  const newNode: HarnessNode = {
    ...node,
    connector: {
      ...newConnector,
      // Preserve any overrides from old connector's pin labels for still-valid pins
      pinLabels: newConnector.pinLabels.map((label, i) =>
        i < oldPinCount && node.connector?.pinLabels[i] !== newConnector.pinLabels[i]
          ? node.connector?.pinLabels[i] || label
          : label
      ),
    },
  };

  return {
    config: {
      ...config,
      nodes: config.nodes.map((n) => (n.id === nodeId ? newNode : n)),
      updatedAt: Date.now(),
    },
    affectedWires: [],
    warnings: [],
  };
}

// ============================================================
// Connection Commands
// ============================================================

/** Create a new connection between two nodes */
export function createConnection(
  config: HarnessConfig,
  input: CreateConnectionInput
): { config: HarnessConfig; connectionId: string; wireId?: string } {
  const fromNode = config.nodes.find((n) => n.id === input.fromNodeId);
  const toNode = config.nodes.find((n) => n.id === input.toNodeId);

  if (!fromNode || !toNode) {
    throw new Error('Source or target node not found');
  }

  const connectionId = generateId();
  const newConnection: Connection = {
    id: connectionId,
    name: input.name || '新线缆束',
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    wireIds: [],
  };

  let wireId: string | undefined;
  let newWires = [...config.wires];

  if (input.createDefaultWire !== false) {
    wireId = generateId();
    const defaultWire: Wire = {
      id: wireId,
      name: 'W1',
      wireGauge: 26,
      wireType: 'silicone',
      wireColor: 'red',
      lengthMm: 300,
      fromConnectorId: input.fromNodeId,
      fromPin: 1,
      toConnectorId: input.toNodeId,
      toPin: 1,
    };
    newConnection.wireIds = [wireId];
    newWires = [...newWires, defaultWire];
  }

  return {
    config: {
      ...config,
      connections: [...config.connections, newConnection],
      wires: newWires,
      updatedAt: Date.now(),
    },
    connectionId,
    wireId,
  };
}

/** Update connection metadata */
export function updateConnectionInfo(
  config: HarnessConfig,
  connectionId: string,
  patch: Partial<Pick<Connection, 'name' | 'fromNodeId' | 'toNodeId'>>
): HarnessConfig {
  const connIndex = config.connections.findIndex((c) => c.id === connectionId);
  if (connIndex === -1) {
    throw new Error(`Connection not found: ${connectionId}`);
  }

  // If changing endpoints, validate new nodes exist
  if (patch.fromNodeId && !config.nodes.find((n) => n.id === patch.fromNodeId)) {
    throw new Error(`From node not found: ${patch.fromNodeId}`);
  }
  if (patch.toNodeId && !config.nodes.find((n) => n.id === patch.toNodeId)) {
    throw new Error(`To node not found: ${patch.toNodeId}`);
  }

  const newConnections = [...config.connections];
  newConnections[connIndex] = { ...newConnections[connIndex], ...patch };

  return {
    ...config,
    connections: newConnections,
    updatedAt: Date.now(),
  };
}

// ============================================================
// Wire Commands
// ============================================================

/** Add a wire to an existing connection */
export function addWireToConnection(
  config: HarnessConfig,
  connectionId: string,
  draft: WireDraft = {}
): HarnessConfig {
  const conn = config.connections.find((c) => c.id === connectionId);
  if (!conn) {
    throw new Error(`Connection not found: ${connectionId}`);
  }

  const wireId = generateId();
  const wireCount = config.wires.filter((w) => conn.wireIds.includes(w.id)).length;

  const newWire: Wire = {
    id: wireId,
    name: draft.name || `W${wireCount + 1}`,
    wireGauge: draft.wireGauge || 26,
    wireType: draft.wireType || 'silicone',
    wireColor: draft.wireColor || 'red',
    lengthMm: draft.lengthMm || 300,
    fromConnectorId: conn.fromNodeId,
    fromPin: draft.fromPin || 1,
    toConnectorId: conn.toNodeId,
    toPin: draft.toPin || 1,
    signalName: draft.signalName,
    shielded: draft.shielded,
  };

  return {
    ...config,
    wires: [...config.wires, newWire],
    connections: config.connections.map((c) =>
      c.id === connectionId
        ? { ...c, wireIds: [...c.wireIds, wireId] }
        : c
    ),
    updatedAt: Date.now(),
  };
}

/** Update a wire's properties */
export function updateWireProperties(
  config: HarnessConfig,
  wireId: string,
  patch: Partial<Omit<Wire, 'id'>>
): HarnessConfig {
  const wireIndex = config.wires.findIndex((w) => w.id === wireId);
  if (wireIndex === -1) {
    throw new Error(`Wire not found: ${wireId}`);
  }

  const oldWire = config.wires[wireIndex];

  // Validate pin range if changing pins or endpoints
  if (patch.fromConnectorId || (patch.fromPin !== undefined)) {
    const nodeId = patch.fromConnectorId || oldWire.fromConnectorId;
    const node = config.nodes.find((n) => n.id === nodeId);
    if (node?.connector && patch.fromPin && patch.fromPin > node.connector.pinCount) {
      throw new Error(`Pin ${patch.fromPin} exceeds connector pin count ${node.connector.pinCount}`);
    }
  }
  if (patch.toConnectorId || (patch.toPin !== undefined)) {
    const nodeId = patch.toConnectorId || oldWire.toConnectorId;
    const node = config.nodes.find((n) => n.id === nodeId);
    if (node?.connector && patch.toPin && patch.toPin > node.connector.pinCount) {
      throw new Error(`Pin ${patch.toPin} exceeds connector pin count ${node.connector.pinCount}`);
    }
  }

  const newWires = [...config.wires];
  newWires[wireIndex] = { ...oldWire, ...patch };

  return {
    ...config,
    wires: newWires,
    updatedAt: Date.now(),
  };
}

/** Remove a wire and clean up connection references */
export function removeWire(
  config: HarnessConfig,
  wireId: string
): HarnessConfig {
  const wire = config.wires.find((w) => w.id === wireId);
  if (!wire) {
    throw new Error(`Wire not found: ${wireId}`);
  }

  return {
    ...config,
    wires: config.wires.filter((w) => w.id !== wireId),
    connections: config.connections.map((c) => ({
      ...c,
      wireIds: c.wireIds.filter((wid) => wid !== wireId),
    })),
    updatedAt: Date.now(),
  };
}

// ============================================================
// Remove Commands (with policy)
// ============================================================

/** Remove a connection and optionally cascade to its wires */
export function removeConnection(
  config: HarnessConfig,
  connectionId: string,
  policy: RemovePolicy = 'cascade'
): HarnessConfig {
  const conn = config.connections.find((c) => c.id === connectionId);
  if (!conn) {
    throw new Error(`Connection not found: ${connectionId}`);
  }

  if (policy === 'abort' && conn.wireIds.length > 0) {
    throw new Error(`Connection has ${conn.wireIds.length} wires. Use cascade policy to remove them.`);
  }

  return {
    ...config,
    connections: config.connections.filter((c) => c.id !== connectionId),
    wires: policy === 'cascade'
      ? config.wires.filter((w) => !conn.wireIds.includes(w.id))
      : config.wires,
    updatedAt: Date.now(),
  };
}

/** Remove a node and cascade to its connections and wires */
export function removeNode(
  config: HarnessConfig,
  nodeId: string,
  policy: RemovePolicy = 'cascade'
): HarnessConfig {
  const node = config.nodes.find((n) => n.id === nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  const affectedConnections = config.connections.filter(
    (c) => c.fromNodeId === nodeId || c.toNodeId === nodeId
  );
  const affectedWireIds = new Set(affectedConnections.flatMap((c) => c.wireIds));

  if (policy === 'abort' && affectedConnections.length > 0) {
    throw new Error(
      `Node has ${affectedConnections.length} connections. Use cascade policy to remove them.`
    );
  }

  return {
    ...config,
    nodes: config.nodes.filter((n) => n.id !== nodeId),
    connections: config.connections.filter(
      (c) => c.fromNodeId !== nodeId && c.toNodeId !== nodeId
    ),
    wires: policy === 'cascade'
      ? config.wires.filter((w) => !affectedWireIds.has(w.id))
      : config.wires,
    updatedAt: Date.now(),
  };
}

// ============================================================
// Utility Commands
// ============================================================

/** Get the selection that should result after removing an entity */
export function selectionAfterRemove(
  currentSelection: Selection,
  removedKind: 'node' | 'connection' | 'wire',
  removedId: string
): Selection {
  if (
    currentSelection.kind === removedKind &&
    currentSelection.id === removedId
  ) {
    return { kind: 'none' };
  }
  return currentSelection;
}

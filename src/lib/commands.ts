// ============================================================
// Atomic Domain Commands (v3)
// Pure functions that operate on HarnessConfig immutably.
//
// Business objects: Connector, Wire Material, Protective Sleeve.
// PIN / color / signal definitions live on MaterialCircuit.
// There is no Wire / Connection / WireBundle domain object.
// ============================================================

import type {
  CanvasWireMaterial,
  ConnectorInstance,
  ConnectorJumper,
  ConnectorSide,
  HarnessConfig,
  MaterialCircuit,
  MaterialEndpoint,
  ProtectiveSleeve,
} from '@/types/harness';
import { CONNECTORS } from '@/lib/data';
import { createDefaultWireSpec, lengthMmToCanvasWidth } from '@/lib/canvasMaterials';

// ============================================================
// ID Generator
// ============================================================

let _idGenerator: (() => string) | null = null;

export function setIdGenerator(fn: () => string): void {
  _idGenerator = fn;
}

export function generateId(): string {
  if (_idGenerator) return _idGenerator();
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// ============================================================
// Connector Commands
// ============================================================

export interface AddConnectorInput {
  position?: { x: number; y: number };
  connectorId?: string;
  label?: string;
}

/** Add a new connector instance to the design. */
export function addConnector(
  config: HarnessConfig,
  input: AddConnectorInput = {},
): HarnessConfig {
  const connector = input.connectorId
    ? CONNECTORS.find((c) => c.id === input.connectorId) || CONNECTORS[0]
    : CONNECTORS[0];

  if (!connector) {
    throw new Error('No connector available in catalog');
  }

  const id = generateId();
  const newInstance: ConnectorInstance = {
    id,
    position: input.position || { x: 200 + Math.random() * 100, y: 200 + Math.random() * 100 },
    connector: { ...connector },
    label: input.label || connector.name || `连接器${config.connectors.length + 1}`,
    jumpers: [],
  };

  return {
    ...config,
    connectors: [...config.connectors, newInstance],
    updatedAt: Date.now(),
  };
}

/** Update connector instance label or position. */
export function updateConnector(
  config: HarnessConfig,
  connectorId: string,
  patch: Partial<Pick<ConnectorInstance, 'label' | 'position'>>,
): HarnessConfig {
  return {
    ...config,
    connectors: config.connectors.map((c) =>
      c.id === connectorId ? { ...c, ...patch } : c,
    ),
    updatedAt: Date.now(),
  };
}

/**
 * Change a connector's catalog part. Out-of-range pins in circuits and
 * jumpers are pruned (not silently retained). A circuit that loses its
 * only pin ref is removed. A jumper with fewer than 2 pins is removed.
 */
export function changeConnectorPart(
  config: HarnessConfig,
  connectorId: string,
  newPartId: string,
): { config: HarnessConfig; warnings: string[] } {
  const instance = config.connectors.find((c) => c.id === connectorId);
  if (!instance) {
    throw new Error(`Connector not found: ${connectorId}`);
  }

  const newConnector = CONNECTORS.find((c) => c.id === newPartId);
  if (!newConnector) {
    throw new Error(`Connector part not found: ${newPartId}`);
  }

  const newPinCount = newConnector.pinCount;
  const warnings: string[] = [];

  // Prune circuits that reference out-of-range pins on this connector.
  const materials = config.materials.map((material) => {
    const nextCircuits: MaterialCircuit[] = [];
    for (const circuit of material.circuits) {
      const pruned = { ...circuit };
      if (pruned.start?.connectorId === connectorId && pruned.start.pin > newPinCount) {
        warnings.push(`线材"${material.name}"的接线 Pin${pruned.start.pin} 超出新连接器范围，已移除`);
        pruned.start = undefined;
      }
      if (pruned.end?.connectorId === connectorId && pruned.end.pin > newPinCount) {
        warnings.push(`线材"${material.name}"的接线 Pin${pruned.end.pin} 超出新连接器范围，已移除`);
        pruned.end = undefined;
      }
      // Keep circuit only if at least one side remains.
      if (pruned.start || pruned.end) {
        nextCircuits.push(pruned);
      }
    }
    return { ...material, circuits: nextCircuits };
  });

  // Prune jumpers with out-of-range pins.
  const connectors = config.connectors.map((c) => {
    if (c.id !== connectorId) return c;
    const validJumpers = c.jumpers
      .map((j) => ({ ...j, pins: j.pins.filter((p) => p <= newPinCount) }))
      .filter((j) => j.pins.length >= 2);
    return {
      ...c,
      connector: {
        ...newConnector,
        pinLabels: newConnector.pinLabels,
      },
      jumpers: validJumpers,
    };
  });

  return {
    config: {
      ...config,
      connectors,
      materials,
      updatedAt: Date.now(),
    },
    warnings,
  };
}

/**
 * Remove a connector. Materials are preserved — only the pin refs on
 * the affected side of each circuit are cleared. Circuits that lose all
 * refs are removed. Jumpers on this connector are removed.
 */
export function removeConnector(
  config: HarnessConfig,
  connectorId: string,
): HarnessConfig {
  const materials = config.materials.map((material) => {
    const nextCircuits = material.circuits
      .map((circuit) => {
        const next = { ...circuit };
        if (next.start?.connectorId === connectorId) next.start = undefined;
        if (next.end?.connectorId === connectorId) next.end = undefined;
        return next;
      })
      .filter((c) => c.start || c.end);
    return { ...material, circuits: nextCircuits };
  });

  return {
    ...config,
    connectors: config.connectors.filter((c) => c.id !== connectorId),
    materials,
    updatedAt: Date.now(),
  };
}

// ============================================================
// Material Commands
// ============================================================

export interface AddMaterialInput {
  position?: { x: number; y: number };
  spec?: CanvasWireMaterial['spec'];
  name?: string;
}

/** Add a new wire material to the canvas. */
export function addMaterial(
  config: HarnessConfig,
  input: AddMaterialInput = {},
): { config: HarnessConfig; materialId: string } {
  const materialId = generateId();
  const spec = input.spec ?? createDefaultWireSpec();
  const material: CanvasWireMaterial = {
    id: materialId,
    name: input.name ?? '新线材',
    position: input.position ?? { x: 300, y: 300 },
    width: lengthMmToCanvasWidth(spec.lengthMm),
    spec,
    circuits: [],
    expandedByDefault: true,
  };

  return {
    config: {
      ...config,
      materials: [...config.materials, material],
      updatedAt: Date.now(),
    },
    materialId,
  };
}

/** Update material properties (name, position, width, spec). */
export function updateMaterial(
  config: HarnessConfig,
  materialId: string,
  patch: Partial<Pick<CanvasWireMaterial, 'name' | 'position' | 'width' | 'spec' | 'expandedByDefault'>>,
): HarnessConfig {
  return {
    ...config,
    materials: config.materials.map((m) =>
      m.id === materialId ? { ...m, ...patch } : m,
    ),
    updatedAt: Date.now(),
  };
}

/**
 * Remove a material. Protective sleeves attached to it have their
 * `attachedMaterialId` cleared (the sleeve body is preserved).
 */
export function removeMaterial(
  config: HarnessConfig,
  materialId: string,
): HarnessConfig {
  return {
    ...config,
    materials: config.materials.filter((m) => m.id !== materialId),
    protectiveSleeves: config.protectiveSleeves.map((s) =>
      s.attachedMaterialId === materialId
        ? { ...s, attachedMaterialId: undefined }
        : s,
    ),
    updatedAt: Date.now(),
  };
}

// ============================================================
// Material Endpoint Attach / Detach
// ============================================================

export interface AttachEndpointInput {
  materialId: string;
  endpoint: MaterialEndpoint;
  connectorId: string;
  connectorSide: ConnectorSide;
  pin: number;
  /** If provided, try to complete this specific circuit's empty slot. */
  circuitId?: string;
}

function defaultCircuitColor(spec: CanvasWireMaterial['spec']): string {
  return spec.kind === 'electronic' ? spec.color : spec.coreColors[0] ?? 'red';
}

/**
 * Attach a material endpoint to a connector pin.
 *
 * Rules:
 * - Reject exact duplicates (same material + endpoint + connector + side + pin).
 * - Reject if connectorSide conflicts with the connector's active side.
 * - If a circuit exists with the target endpoint slot empty AND the other side
 *   already set, complete that circuit.
 * - Otherwise create a new circuit with only this endpoint set.
 * - Never creates a new material.
 */
export function attachMaterialEndpoint(
  config: HarnessConfig,
  input: AttachEndpointInput,
): HarnessConfig {
  const { materialId, endpoint, connectorId, connectorSide, pin, circuitId } = input;

  const material = config.materials.find((m) => m.id === materialId);
  if (!material) {
    throw new Error(`Material not found: ${materialId}`);
  }

  const connector = config.connectors.find((c) => c.id === connectorId);
  if (!connector) {
    throw new Error(`Connector not found: ${connectorId}`);
  }

  if (pin < 1 || pin > connector.connector.pinCount) {
    throw new Error(`Pin ${pin} out of range (1-${connector.connector.pinCount})`);
  }

  // Check active side conflict.
  const activeSide = getActiveConnectorSide(config, connectorId);
  if (activeSide !== undefined && activeSide !== connectorSide) {
    throw new Error(
      `连接器的有效侧已锁定为${activeSide === 'left' ? '左' : '右'}侧，无法连接到另一侧`,
    );
  }

  // Reject exact duplicate.
  const dupExists = material.circuits.some((c) => {
    const ref = c[endpoint];
    return (
      ref?.connectorId === connectorId &&
      ref?.connectorSide === connectorSide &&
      ref?.pin === pin
    );
  });
  if (dupExists) {
    return config; // no-op for exact duplicate
  }

  const pinRef = { connectorId, connectorSide, pin };

  // Try to complete an existing single-end circuit.
  let completed = false;
  let nextCircuits = material.circuits.map((circuit) => {
    if (completed) return circuit;

    // If a specific circuitId was requested, only consider that one.
    if (circuitId && circuit.id !== circuitId) return circuit;

    // This circuit must have the target endpoint slot empty.
    if (circuit[endpoint] !== undefined) return circuit;

    // Prefer a circuit whose other endpoint is already set (completing a pair).
    const otherSide = endpoint === 'start' ? 'end' : 'start';
    if (circuit[otherSide] !== undefined || circuitId) {
      completed = true;
      return { ...circuit, [endpoint]: pinRef };
    }
    return circuit;
  });

  if (!completed) {
    // No circuit to complete — create a new single-end circuit.
    const newCircuit: MaterialCircuit = {
      id: generateId(),
      [endpoint]: pinRef,
      color: defaultCircuitColor(material.spec),
      signalName: '',
    } as MaterialCircuit;
    nextCircuits = [...nextCircuits, newCircuit];
  }

  return {
    ...config,
    materials: config.materials.map((m) =>
      m.id === materialId ? { ...m, circuits: nextCircuits } : m,
    ),
    updatedAt: Date.now(),
  };
}

/**
 * Detach one side of a circuit. If both sides become empty the circuit
 * is removed entirely.
 */
export function detachMaterialEndpoint(
  config: HarnessConfig,
  materialId: string,
  circuitId: string,
  side: MaterialEndpoint,
): HarnessConfig {
  const material = config.materials.find((m) => m.id === materialId);
  if (!material) return config;

  const nextCircuits = material.circuits
    .map((circuit) => {
      if (circuit.id !== circuitId) return circuit;
      return { ...circuit, [side]: undefined };
    })
    .filter((c) => c.start || c.end);

  return {
    ...config,
    materials: config.materials.map((m) =>
      m.id === materialId ? { ...m, circuits: nextCircuits } : m,
    ),
    updatedAt: Date.now(),
  };
}

/** Remove an entire circuit from a material (does not remove the material). */
export function removeMaterialCircuit(
  config: HarnessConfig,
  materialId: string,
  circuitId: string,
): HarnessConfig {
  return {
    ...config,
    materials: config.materials.map((m) =>
      m.id === materialId
        ? { ...m, circuits: m.circuits.filter((c) => c.id !== circuitId) }
        : m,
    ),
    updatedAt: Date.now(),
  };
}

/** Update a circuit's color or signal name. */
export function updateMaterialCircuit(
  config: HarnessConfig,
  materialId: string,
  circuitId: string,
  patch: Partial<Pick<MaterialCircuit, 'color' | 'signalName'>>,
): HarnessConfig {
  return {
    ...config,
    materials: config.materials.map((m) =>
      m.id === materialId
        ? {
            ...m,
            circuits: m.circuits.map((c) =>
              c.id === circuitId ? { ...c, ...patch } : c,
            ),
          }
        : m,
    ),
    updatedAt: Date.now(),
  };
}

// ============================================================
// Connector Jumper (短接) Commands
// ============================================================

/**
 * Create a jumper between two pins on the same side of a connector.
 * If a jumper already exists on that side that contains one of the pins,
 * the other pin is merged into it instead of creating a new jumper.
 */
export function addConnectorJumper(
  config: HarnessConfig,
  connectorId: string,
  side: ConnectorSide,
  pin1: number,
  pin2: number,
): HarnessConfig {
  if (pin1 === pin2) {
    throw new Error('Cannot short a pin to itself');
  }

  const connector = config.connectors.find((c) => c.id === connectorId);
  if (!connector) {
    throw new Error(`Connector not found: ${connectorId}`);
  }

  const maxPin = connector.connector.pinCount;
  if (pin1 < 1 || pin1 > maxPin || pin2 < 1 || pin2 > maxPin) {
    throw new Error(`Pin out of range (1-${maxPin})`);
  }

  // Reject if side conflicts with active side (from material circuits).
  const activeSide = getActiveConnectorSide(config, connectorId);
  if (activeSide !== undefined && activeSide !== side) {
    throw new Error(
      `连接器的有效侧已锁定为${activeSide === 'left' ? '左' : '右'}侧，无法在另一侧建立短接`,
    );
  }

  // Check if either pin already belongs to a jumper on this side.
  const existingJumper = connector.jumpers.find(
    (j) => j.side === side && (j.pins.includes(pin1) || j.pins.includes(pin2)),
  );

  let nextJumpers: ConnectorJumper[];
  if (existingJumper) {
    // Merge pins into the existing jumper.
    const pinSet = new Set([...existingJumper.pins, pin1, pin2]);
    nextJumpers = connector.jumpers.map((j) =>
      j.id === existingJumper.id
        ? { ...j, pins: [...pinSet].sort((a, b) => a - b) }
        : j,
    );
  } else {
    const newJumper: ConnectorJumper = {
      id: generateId(),
      side,
      pins: [Math.min(pin1, pin2), Math.max(pin1, pin2)],
    };
    nextJumpers = [...connector.jumpers, newJumper];
  }

  return {
    ...config,
    connectors: config.connectors.map((c) =>
      c.id === connectorId ? { ...c, jumpers: nextJumpers } : c,
    ),
    updatedAt: Date.now(),
  };
}

/** Add a pin to an existing jumper. */
export function extendConnectorJumper(
  config: HarnessConfig,
  connectorId: string,
  jumperId: string,
  pin: number,
): HarnessConfig {
  return {
    ...config,
    connectors: config.connectors.map((c) => {
      if (c.id !== connectorId) return c;
      return {
        ...c,
        jumpers: c.jumpers.map((j) =>
          j.id === jumperId && !j.pins.includes(pin)
            ? { ...j, pins: [...j.pins, pin].sort((a, b) => a - b) }
            : j,
        ),
      };
    }),
    updatedAt: Date.now(),
  };
}

/** Remove an entire jumper. */
export function removeConnectorJumper(
  config: HarnessConfig,
  connectorId: string,
  jumperId: string,
): HarnessConfig {
  return {
    ...config,
    connectors: config.connectors.map((c) =>
      c.id === connectorId
        ? { ...c, jumpers: c.jumpers.filter((j) => j.id !== jumperId) }
        : c,
    ),
    updatedAt: Date.now(),
  };
}

// ============================================================
// Protective Sleeve Commands
// ============================================================

export function addProtectiveSleeve(
  config: HarnessConfig,
  sleeve: ProtectiveSleeve,
): HarnessConfig {
  return {
    ...config,
    protectiveSleeves: [...config.protectiveSleeves, sleeve],
    updatedAt: Date.now(),
  };
}

export function updateProtectiveSleeve(
  config: HarnessConfig,
  sleeveId: string,
  patch: Partial<ProtectiveSleeve>,
): HarnessConfig {
  return {
    ...config,
    protectiveSleeves: config.protectiveSleeves.map((s) =>
      s.id === sleeveId ? { ...s, ...patch } : s,
    ),
    updatedAt: Date.now(),
  };
}

export function removeProtectiveSleeve(
  config: HarnessConfig,
  sleeveId: string,
): HarnessConfig {
  return {
    ...config,
    protectiveSleeves: config.protectiveSleeves.filter((s) => s.id !== sleeveId),
    updatedAt: Date.now(),
  };
}

// ============================================================
// Derived State Helpers
// ============================================================

/**
 * Derive the active (locked) side of a connector.
 * Returns 'left', 'right', or undefined if no connection has been made.
 * Both material circuits and jumpers lock the side.
 */
export function getActiveConnectorSide(
  config: HarnessConfig,
  connectorId: string,
): ConnectorSide | undefined {
  // Check material circuits first.
  for (const material of config.materials) {
    for (const circuit of material.circuits) {
      if (circuit.start?.connectorId === connectorId) {
        return circuit.start.connectorSide;
      }
      if (circuit.end?.connectorId === connectorId) {
        return circuit.end.connectorSide;
      }
    }
  }

  // Check jumpers.
  const connector = config.connectors.find((c) => c.id === connectorId);
  if (connector && connector.jumpers.length > 0) {
    return connector.jumpers[0].side;
  }

  return undefined;
}

/**
 * Get all pin bindings on a connector, grouped by side+pin.
 * Returns a map from "side-pin" → array of { materialId, circuitId, endpoint, color }.
 */
export interface PinBinding {
  materialId: string;
  circuitId: string;
  endpoint: MaterialEndpoint;
  color: string;
}

export function getConnectorPinBindings(
  config: HarnessConfig,
  connectorId: string,
): Map<string, PinBinding[]> {
  const map = new Map<string, PinBinding[]>();
  for (const material of config.materials) {
    for (const circuit of material.circuits) {
      for (const endpoint of ['start', 'end'] as MaterialEndpoint[]) {
        const ref = circuit[endpoint];
        if (ref?.connectorId === connectorId) {
          const key = `${ref.connectorSide}-pin-${ref.pin}`;
          const list = map.get(key) ?? [];
          list.push({
            materialId: material.id,
            circuitId: circuit.id,
            endpoint,
            color: circuit.color,
          });
          map.set(key, list);
        }
      }
    }
  }
  return map;
}

/** Get the set of pins that are part of a jumper on a given side. */
export function getJumperPinSet(
  connector: ConnectorInstance,
  side: ConnectorSide,
): Set<number> {
  const pins = new Set<number>();
  for (const jumper of connector.jumpers) {
    if (jumper.side === side) {
      for (const pin of jumper.pins) {
        pins.add(pin);
      }
    }
  }
  return pins;
}

/** Count connected pins on a connector (from material circuits). */
export function getConnectedPinCount(
  config: HarnessConfig,
  connectorId: string,
): number {
  const pins = new Set<string>();
  for (const material of config.materials) {
    for (const circuit of material.circuits) {
      if (circuit.start?.connectorId === connectorId) {
        pins.add(`${circuit.start.connectorSide}-${circuit.start.pin}`);
      }
      if (circuit.end?.connectorId === connectorId) {
        pins.add(`${circuit.end.connectorSide}-${circuit.end.pin}`);
      }
    }
  }
  return pins.size;
}

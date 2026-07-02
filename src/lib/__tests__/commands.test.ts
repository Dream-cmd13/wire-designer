import { describe, it, expect } from 'vitest';
import {
  attachMaterialEndpoint,
  detachMaterialEndpoint,
  addConnectorJumper,
  changeConnectorPart,
  getActiveConnectorSide,
  type AttachEndpointInput,
} from '@/lib/commands';
import { CONNECTORS } from '@/lib/data';
import type { HarnessConfig, ConnectorInstance, CanvasWireMaterial } from '@/types/harness';

/** Build a minimal v3 config with two connectors and one empty material. */
function makeTestConfig(): HarnessConfig {
  const connA = CONNECTORS[0]; // JST XH 2P
  const connB = CONNECTORS[2] ?? CONNECTORS[0]; // JST XH 4P (or fallback)

  const connectorA: ConnectorInstance = {
    id: 'conn-a',
    position: { x: 100, y: 200 },
    connector: { ...connA },
    label: 'A端',
    jumpers: [],
  };
  const connectorB: ConnectorInstance = {
    id: 'conn-b',
    position: { x: 500, y: 200 },
    connector: { ...connB },
    label: 'B端',
    jumpers: [],
  };

  const material: CanvasWireMaterial = {
    id: 'mat-1',
    name: 'W1',
    position: { x: 300, y: 220 },
    width: 200,
    spec: {
      kind: 'electronic',
      color: 'red',
      lengthMm: 300,
      awg: 26,
      ulNumber: '1007',
      endTreatment: { stripped: false },
    },
    circuits: [],
  };

  return {
    schemaVersion: 3,
    id: 'test-config',
    name: '测试配置',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    connectors: [connectorA, connectorB],
    materials: [material],
    protectiveSleeves: [],
    quantity: 1,
    leadTime: 'standard',
  };
}

describe('attachMaterialEndpoint', () => {
  it('attaches a single end (start) and creates a circuit', () => {
    const config = makeTestConfig();

    const input: AttachEndpointInput = {
      materialId: 'mat-1',
      endpoint: 'start',
      connectorId: 'conn-a',
      connectorSide: 'right',
      pin: 1,
    };
    const result = attachMaterialEndpoint(config, input);

    const material = result.materials.find((m) => m.id === 'mat-1')!;
    expect(material.circuits).toHaveLength(1);
    expect(material.circuits[0].start).toEqual({
      connectorId: 'conn-a',
      connectorSide: 'right',
      pin: 1,
    });
    expect(material.circuits[0].end).toBeUndefined();
  });

  it('attaches the other end to complete a circuit', () => {
    let config = makeTestConfig();

    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1',
      endpoint: 'start',
      connectorId: 'conn-a',
      connectorSide: 'right',
      pin: 1,
    });

    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1',
      endpoint: 'end',
      connectorId: 'conn-b',
      connectorSide: 'left',
      pin: 1,
    });

    const material = config.materials.find((m) => m.id === 'mat-1')!;
    expect(material.circuits).toHaveLength(1);
    expect(material.circuits[0].start).toBeDefined();
    expect(material.circuits[0].end).toBeDefined();
  });

  it('rejects exact duplicate (same material + endpoint + connector + side + pin)', () => {
    let config = makeTestConfig();

    const input: AttachEndpointInput = {
      materialId: 'mat-1',
      endpoint: 'start',
      connectorId: 'conn-a',
      connectorSide: 'right',
      pin: 1,
    };
    config = attachMaterialEndpoint(config, input);
    const countAfterFirst = config.materials[0].circuits.length;

    config = attachMaterialEndpoint(config, input);
    expect(config.materials[0].circuits.length).toBe(countAfterFirst);
  });

  it('locks the connector side after first connection', () => {
    let config = makeTestConfig();

    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1',
      endpoint: 'start',
      connectorId: 'conn-a',
      connectorSide: 'right',
      pin: 1,
    });

    expect(getActiveConnectorSide(config, 'conn-a')).toBe('right');

    expect(() =>
      attachMaterialEndpoint(config, {
        materialId: 'mat-1',
        endpoint: 'start',
        connectorId: 'conn-a',
        connectorSide: 'left',
        pin: 1,
      }),
    ).toThrow();
  });

  it('allows multiple circuits on the same side of the same connector', () => {
    let config = makeTestConfig();

    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1',
      endpoint: 'start',
      connectorId: 'conn-a',
      connectorSide: 'right',
      pin: 1,
    });

    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1',
      endpoint: 'start',
      connectorId: 'conn-a',
      connectorSide: 'right',
      pin: 2,
    });

    expect(config.materials[0].circuits).toHaveLength(2);
  });
});

describe('addConnectorJumper', () => {
  it('creates a jumper between two different pins', () => {
    const config = makeTestConfig();
    const result = addConnectorJumper(config, 'conn-a', 'right', 1, 2);

    const connector = result.connectors.find((c) => c.id === 'conn-a')!;
    expect(connector.jumpers).toHaveLength(1);
    expect(connector.jumpers[0].pins).toContain(1);
    expect(connector.jumpers[0].pins).toContain(2);
  });

  it('rejects self-short (same pin)', () => {
    const config = makeTestConfig();
    expect(() => addConnectorJumper(config, 'conn-a', 'right', 1, 1)).toThrow();
  });

  it('merges overlapping networks into one', () => {
    let config = makeTestConfig();
    // conn-b is a 4-pin connector — use it for multi-pin jumper tests.

    // Create [1,2]
    config = addConnectorJumper(config, 'conn-b', 'right', 1, 2);
    // Create [3,4]
    config = addConnectorJumper(config, 'conn-b', 'right', 3, 4);

    expect(config.connectors[1].jumpers).toHaveLength(2);

    // Now short 2-3 → should merge both into [1,2,3,4].
    config = addConnectorJumper(config, 'conn-b', 'right', 2, 3);

    const connector = config.connectors.find((c) => c.id === 'conn-b')!;
    expect(connector.jumpers).toHaveLength(1);
    expect(connector.jumpers[0].pins).toEqual([1, 2, 3, 4]);
  });
});

describe('changeConnectorPart', () => {
  it('prunes out-of-range pins in circuits when pin count decreases', () => {
    let config = makeTestConfig();
    // conn-b is 4-pin. Attach a circuit to pin 4.
    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1',
      endpoint: 'start',
      connectorId: 'conn-b',
      connectorSide: 'right',
      pin: 4,
    });

    expect(config.materials[0].circuits.length).toBe(1);

    // Change to a 2-pin connector.
    const twoPin = CONNECTORS.find((c) => c.pinCount === 2);
    if (!twoPin) return;

    const result = changeConnectorPart(config, 'conn-b', twoPin.id);
    // Circuit referencing pin 4 should be removed.
    expect(result.config.materials[0].circuits).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('detachMaterialEndpoint', () => {
  it('removes one side of a circuit, keeping the other', () => {
    let config = makeTestConfig();

    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1', endpoint: 'start', connectorId: 'conn-a', connectorSide: 'right', pin: 1,
    });
    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1', endpoint: 'end', connectorId: 'conn-b', connectorSide: 'left', pin: 1,
    });

    const circuitId = config.materials[0].circuits[0].id;
    config = detachMaterialEndpoint(config, 'mat-1', circuitId, 'start');

    const circuit = config.materials[0].circuits.find((c) => c.id === circuitId)!;
    expect(circuit.start).toBeUndefined();
    expect(circuit.end).toBeDefined();
  });

  it('removes the circuit entirely when both sides become empty', () => {
    let config = makeTestConfig();

    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1', endpoint: 'start', connectorId: 'conn-a', connectorSide: 'right', pin: 1,
    });

    const circuitId = config.materials[0].circuits[0].id;
    config = detachMaterialEndpoint(config, 'mat-1', circuitId, 'start');

    expect(config.materials[0].circuits.find((c) => c.id === circuitId)).toBeUndefined();
  });
});

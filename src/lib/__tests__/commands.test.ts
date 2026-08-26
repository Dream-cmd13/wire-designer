import { describe, it, expect } from 'vitest';
import {
  attachMaterialEndpoint,
  detachMaterialEndpoint,
  reassignMaterialEndpoint,
  addConnectorJumper,
  changeConnectorPart,
  getActiveConnectorSide,
  removeConnector,
  updateMaterialCircuit,
  type AttachEndpointInput,
} from '@/lib/commands';
import { TEST_CONNECTORS } from './fixtures/catalogFixture';
import type { HarnessConfig, ConnectorInstance, CanvasWireMaterial } from '@/types/harness';

/** Build a minimal v3 config with two connectors and one empty material. */
function makeTestConfig(): HarnessConfig {
  const connA = TEST_CONNECTORS[0];
  const connB = TEST_CONNECTORS[2];

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
      endTreatment: {
        start: { stripped: false, termination: 'none' },
        end: { stripped: false, termination: 'none' },
      },
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
    models: [],
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

  it('creates independent binary jumpers (no merging)', () => {
    let config = makeTestConfig();
    // conn-b is a 4-pin connector.

    // 1→2 (first arc)
    config = addConnectorJumper(config, 'conn-b', 'right', 1, 2);
    // 2→3 (second arc, independent)
    config = addConnectorJumper(config, 'conn-b', 'right', 2, 3);
    // 1→4 (third arc, independent)
    config = addConnectorJumper(config, 'conn-b', 'right', 1, 4);

    const connector = config.connectors.find((c) => c.id === 'conn-b')!;
    // Three separate jumpers, each with exactly 2 pins.
    expect(connector.jumpers).toHaveLength(3);
    expect(connector.jumpers.every((j) => j.pins.length === 2)).toBe(true);
  });

  it('rejects exact duplicate shorts (same two pins, same side)', () => {
    let config = makeTestConfig();
    config = addConnectorJumper(config, 'conn-b', 'right', 1, 2);
    const countAfterFirst = config.connectors[1].jumpers.length;

    // Same pair in same order.
    config = addConnectorJumper(config, 'conn-b', 'right', 1, 2);
    expect(config.connectors[1].jumpers.length).toBe(countAfterFirst);

    // Same pair in reverse order — still a duplicate.
    config = addConnectorJumper(config, 'conn-b', 'right', 2, 1);
    expect(config.connectors[1].jumpers.length).toBe(countAfterFirst);
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
    const twoPin = TEST_CONNECTORS.find((c) => c.pinCount === 2);
    if (!twoPin) return;

    const result = changeConnectorPart(config, 'conn-b', twoPin);
    // Circuit referencing pin 4 should have its endpoint cleared.
    expect(result.config.materials[0].circuits[0]?.start).toBeUndefined();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('removeConnector', () => {
  it('preserves editable placeholder circuits after disconnecting an electronic wire', () => {
    let config = makeTestConfig();

    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1',
      endpoint: 'start',
      connectorId: 'conn-a',
      connectorSide: 'right',
      pin: 1,
    });

    const result = removeConnector(config, 'conn-a');

    expect(result.connectors.map((connector) => connector.id)).toEqual(['conn-b']);
    expect(result.materials[0].circuits).toHaveLength(1);
    expect(result.materials[0].circuits[0].start).toBeUndefined();
    expect(result.materials[0].circuits[0].end).toBeUndefined();
    expect(result.materials[0].circuits[0].color).toBe('red');
  });

  it('keeps all jacketed-core rows aligned after disconnecting a connector', () => {
    const config: HarnessConfig = {
      ...makeTestConfig(),
      materials: [{
        id: 'mat-jacketed',
        name: 'WJ1',
        position: { x: 300, y: 220 },
        width: 180,
        spec: {
          kind: 'jacketed',
          jacketMaterial: 'PVC',
          jacketColor: 'black',
          awg: 24,
          coreCount: 3,
          shielded: false,
          odMm: 4.2,
          coreColors: ['红色', '黑色', '白色'],
          endTreatment: {
            start: { stripped: false, termination: 'none' },
            end: { stripped: false, termination: 'none' },
          },
          lengthMm: 300,
        },
        circuits: [
          {
            id: 'c-1',
            start: { connectorId: 'conn-a', connectorSide: 'right', pin: 1 },
            color: '红色',
            signalName: '',
            coreIndex: 0,
          },
          {
            id: 'c-2',
            start: { connectorId: 'conn-a', connectorSide: 'right', pin: 2 },
            color: '黑色',
            signalName: '',
            coreIndex: 1,
          },
          {
            id: 'c-3',
            color: '白色',
            signalName: '',
            coreIndex: 2,
          },
        ],
      }],
    };

    const result = removeConnector(config, 'conn-a');

    expect(result.materials[0].circuits).toHaveLength(3);
    expect(result.materials[0].circuits.map((circuit) => circuit.start)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(result.materials[0].circuits.map((circuit) => circuit.coreIndex)).toEqual([0, 1, 2]);
    expect(result.materials[0].circuits.map((circuit) => circuit.color)).toEqual(['红色', '黑色', '白色']);
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

  it('keeps both endpoints undefined when both sides become empty', () => {
    let config = makeTestConfig();

    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1', endpoint: 'start', connectorId: 'conn-a', connectorSide: 'right', pin: 1,
    });

    const circuitId = config.materials[0].circuits[0].id;
    config = detachMaterialEndpoint(config, 'mat-1', circuitId, 'start');

    const circuit = config.materials[0].circuits.find((c) => c.id === circuitId)!;
    expect(circuit.start).toBeUndefined();
    expect(circuit.end).toBeUndefined();
  });
});

describe('reassignMaterialEndpoint', () => {
  it('atomically moves an endpoint to a new pin, preserving circuit id/color/sig', () => {
    let config = makeTestConfig();
    // conn-b is 4-pin. Create a two-end circuit A.p1 -> B.p1.
    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1', endpoint: 'start', connectorId: 'conn-a', connectorSide: 'right', pin: 1,
    });
    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1', endpoint: 'end', connectorId: 'conn-b', connectorSide: 'left', pin: 1,
    });

    const circuit = config.materials[0].circuits[0];
    const circuitId = circuit.id;
    // Mutate color/sig so we can verify preservation.
    config = {
      ...config,
      materials: config.materials.map((m) =>
        m.id === 'mat-1'
          ? {
              ...m,
              circuits: m.circuits.map((c) =>
                c.id === circuitId ? { ...c, color: 'blue', signalName: 'VCC' } : c,
              ),
            }
          : m,
      ),
    };

    // Reassign the end endpoint from B.p1 to B.p2.
    config = reassignMaterialEndpoint(config, {
      materialId: 'mat-1',
      circuitId,
      endpoint: 'end',
      connectorId: 'conn-b',
      connectorSide: 'left',
      pin: 2,
    });

    const updated = config.materials[0].circuits.find((c) => c.id === circuitId)!;
    expect(updated.end).toEqual({ connectorId: 'conn-b', connectorSide: 'left', pin: 2 });
    // Preserved fields
    expect(updated.id).toBe(circuitId);
    expect(updated.color).toBe('blue');
    expect(updated.signalName).toBe('VCC');
    expect(updated.start).toEqual({ connectorId: 'conn-a', connectorSide: 'right', pin: 1 });
  });

  it('returns original config unchanged when target pin is out of range', () => {
    let config = makeTestConfig();
    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1', endpoint: 'start', connectorId: 'conn-b', connectorSide: 'right', pin: 1,
    });
    const circuitId = config.materials[0].circuits[0].id;
    const original = config;

    // conn-b has 4 pins — pin 99 is invalid.
    const result = reassignMaterialEndpoint(config, {
      materialId: 'mat-1',
      circuitId,
      endpoint: 'start',
      connectorId: 'conn-b',
      connectorSide: 'right',
      pin: 99,
    });

    expect(result).toBe(original);
    // Endpoint unchanged
    expect(result.materials[0].circuits[0].start).toEqual({
      connectorId: 'conn-b', connectorSide: 'right', pin: 1,
    });
  });

  it('returns original config unchanged when another circuit still locks the side', () => {
    let config = makeTestConfig();
    // Lock conn-b's active side to 'right' with TWO circuits.
    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1', endpoint: 'start', connectorId: 'conn-b', connectorSide: 'right', pin: 1,
    });
    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1', endpoint: 'end', connectorId: 'conn-b', connectorSide: 'right', pin: 2,
    });
    // conn-b is 4-pin, so pin 1 and 2 are valid.
    const circuitId = config.materials[0].circuits[0].id;
    const original = config;

    // Attempt to reassign the first circuit's start to the left side.
    // The second circuit still locks conn-b to 'right', so this must fail.
    const result = reassignMaterialEndpoint(config, {
      materialId: 'mat-1',
      circuitId,
      endpoint: 'start',
      connectorId: 'conn-b',
      connectorSide: 'left',
      pin: 1,
    });

    expect(result).toBe(original);
  });

  it('returns original config unchanged when the new target duplicates the other side (self-loop)', () => {
    let config = makeTestConfig();
    // Two-end circuit: start on conn-a right p1, end on conn-b left p1.
    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1', endpoint: 'start', connectorId: 'conn-a', connectorSide: 'right', pin: 1,
    });
    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1', endpoint: 'end', connectorId: 'conn-b', connectorSide: 'left', pin: 1,
    });
    const circuitId = config.materials[0].circuits[0].id;
    const original = config;

    // Try to reassign 'start' to the exact same target as 'end'.
    const result = reassignMaterialEndpoint(config, {
      materialId: 'mat-1',
      circuitId,
      endpoint: 'start',
      connectorId: 'conn-b',
      connectorSide: 'left',
      pin: 1,
    });

    expect(result).toBe(original);
  });
});

describe('updateMaterialCircuit', () => {
  it('keeps electronic material spec color in sync across all circuits', () => {
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

    const targetCircuitId = config.materials[0].circuits[1].id;
    const result = updateMaterialCircuit(config, 'mat-1', targetCircuitId, { color: 'blue' });

    expect(result.materials[0].spec.kind).toBe('electronic');
    if (result.materials[0].spec.kind !== 'electronic') return;

    expect(result.materials[0].spec.color).toBe('blue');
    expect(result.materials[0].circuits).toHaveLength(2);
    expect(result.materials[0].circuits.every((circuit) => circuit.color === 'blue')).toBe(true);
  });
});

describe('multi-pin and duplicate pin support', () => {
  it('allows duplicate pin connections on different circuits of a jacketed material', () => {
    let config = makeTestConfig();
    config = {
      ...config,
      materials: [{
        id: 'mat-jacketed',
        name: 'WJ1',
        position: { x: 300, y: 220 },
        width: 180,
        spec: {
          kind: 'jacketed',
          jacketMaterial: 'PVC',
          jacketColor: 'black',
          awg: 24,
          coreCount: 3,
          shielded: false,
          odMm: 4.2,
          coreColors: ['红色', '黑色', '白色'],
          endTreatment: {
            start: { stripped: false, termination: 'none' },
            end: { stripped: false, termination: 'none' },
          },
          lengthMm: 300,
        },
        circuits: [
          { id: 'c-1', color: '红色', signalName: '', coreIndex: 0 },
          { id: 'c-2', color: '黑色', signalName: '', coreIndex: 1 },
          { id: 'c-3', color: '白色', signalName: '', coreIndex: 2 },
        ],
      }],
    };

    config = attachMaterialEndpoint(config, {
      materialId: 'mat-jacketed',
      endpoint: 'start',
      connectorId: 'conn-a',
      connectorSide: 'right',
      pin: 1,
      circuitId: 'c-1',
    });

    config = attachMaterialEndpoint(config, {
      materialId: 'mat-jacketed',
      endpoint: 'start',
      connectorId: 'conn-a',
      connectorSide: 'right',
      pin: 1,
      circuitId: 'c-2',
    });

    expect(config.materials[0].circuits[0].start).toEqual({
      connectorId: 'conn-a',
      connectorSide: 'right',
      pin: 1,
    });
    expect(config.materials[0].circuits[1].start).toEqual({
      connectorId: 'conn-a',
      connectorSide: 'right',
      pin: 1,
    });
  });

  it('atomically creates jumpers when reassigning to multiple pins', () => {
    let config = makeTestConfig();
    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1',
      endpoint: 'start',
      connectorId: 'conn-b',
      connectorSide: 'left',
      pin: 1,
    });

    const circuitId = config.materials[0].circuits[0].id;

    // Reassign endpoint to Pin 1 and Pin 2 (shorted together)
    config = reassignMaterialEndpoint(config, {
      materialId: 'mat-1',
      circuitId,
      endpoint: 'start',
      connectorId: 'conn-b',
      connectorSide: 'left',
      pin: 1,
      pins: [1, 2],
    });

    const connector = config.connectors.find((c) => c.id === 'conn-b')!;
    expect(connector.jumpers).toHaveLength(1);
    expect(connector.jumpers[0].pins).toEqual([1, 2]);
    expect(connector.jumpers[0].side).toBe('left');
  });

  it('removes jumper network when detaching an endpoint', () => {
    let config = makeTestConfig();
    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1',
      endpoint: 'start',
      connectorId: 'conn-b',
      connectorSide: 'left',
      pin: 1,
    });

    const circuitId = config.materials[0].circuits[0].id;

    // Setup a jumper network by reassigning to Pin 1, 2, 3
    config = reassignMaterialEndpoint(config, {
      materialId: 'mat-1',
      circuitId,
      endpoint: 'start',
      connectorId: 'conn-b',
      connectorSide: 'left',
      pin: 1,
      pins: [1, 2, 3],
    });

    let connector = config.connectors.find((c) => c.id === 'conn-b')!;
    expect(connector.jumpers).toHaveLength(2); // 1-2, 1-3

    // Detach endpoint
    config = detachMaterialEndpoint(config, 'mat-1', circuitId, 'start');

    connector = config.connectors.find((c) => c.id === 'conn-b')!;
    expect(connector.jumpers).toHaveLength(0); // Jumpers should be cleaned up
  });

  it('automatically sets connector label to P1 when wire is attached, and P2 for next connector', () => {
    let config = makeTestConfig();
    // Initially unconnected connectors have their default labels
    const connA = config.connectors.find((c) => c.id === 'conn-a')!;
    const connB = config.connectors.find((c) => c.id === 'conn-b')!;
    expect(connA.label).not.toBe('P1');
    expect(connB.label).not.toBe('P2');

    // Attach conn-a (position.x is 50)
    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1',
      endpoint: 'start',
      connectorId: 'conn-a',
      connectorSide: 'right',
      pin: 1,
    });
    expect(config.connectors.find((c) => c.id === 'conn-a')!.label).toBe('P1');

    // Attach conn-b (position.x is 400)
    config = attachMaterialEndpoint(config, {
      materialId: 'mat-1',
      endpoint: 'end',
      connectorId: 'conn-b',
      connectorSide: 'left',
      pin: 1,
    });
    expect(config.connectors.find((c) => c.id === 'conn-a')!.label).toBe('P1');
    expect(config.connectors.find((c) => c.id === 'conn-b')!.label).toBe('P2');

    // Detach conn-a: conn-b becomes P1, conn-a reverts
    const circuitId = config.materials[0].circuits[0].id;
    config = detachMaterialEndpoint(config, 'mat-1', circuitId, 'start');
    expect(config.connectors.find((c) => c.id === 'conn-a')!.label).not.toBe('P1');
    expect(config.connectors.find((c) => c.id === 'conn-b')!.label).toBe('P1');
  });
});


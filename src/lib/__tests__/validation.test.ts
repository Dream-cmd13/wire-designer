import { describe, it, expect } from 'vitest';
import { validateHarness } from '@/lib/validation';
import type { HarnessConfig, CanvasWireMaterial, ConnectorInstance, MaterialCircuit } from '@/types/harness';
import { CONNECTORS } from '@/lib/data';

function makeBaseConfig(): HarnessConfig {
  const connA: ConnectorInstance = {
    id: 'conn-a',
    position: { x: 0, y: 0 },
    connector: { ...CONNECTORS[0] },
    label: 'A',
    jumpers: [],
  };
  const material: CanvasWireMaterial = {
    id: 'mat-1',
    name: 'W1',
    position: { x: 0, y: 0 },
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
    id: 'test',
    name: 'test',
    createdAt: 0,
    updatedAt: 0,
    connectors: [connA],
    materials: [material],
    protectiveSleeves: [],
    models: [],
    quantity: 1,
    leadTime: 'standard',
  };
}

describe('validateHarness unique IDs', () => {
  it('detects duplicate circuit IDs within a material', () => {
    const config = makeBaseConfig();
    const dupCircuit: MaterialCircuit = {
      id: 'dup-id',
      start: { connectorId: 'conn-a', connectorSide: 'right', pin: 1 },
      color: 'red',
      signalName: '',
    };
    const dupCircuit2: MaterialCircuit = {
      id: 'dup-id',
      start: { connectorId: 'conn-a', connectorSide: 'right', pin: 2 },
      color: 'black',
      signalName: '',
    };
    config.materials[0].circuits = [dupCircuit, dupCircuit2];

    const issues = validateHarness(config);
    const dupIssues = issues.filter((i) => i.code === 'DUPLICATE_CIRCUIT_ID');
    expect(dupIssues.length).toBeGreaterThan(0);
  });

  it('detects duplicate circuit IDs across different materials', () => {
    const config = makeBaseConfig();
    const mat2: CanvasWireMaterial = {
      ...config.materials[0],
      id: 'mat-2',
      name: 'W2',
    };
    config.materials = [config.materials[0], mat2];

    const circuit1: MaterialCircuit = {
      id: 'shared-circuit-id',
      start: { connectorId: 'conn-a', connectorSide: 'right', pin: 1 },
      color: 'red',
      signalName: '',
    };
    const circuit2: MaterialCircuit = {
      id: 'shared-circuit-id',
      start: { connectorId: 'conn-a', connectorSide: 'right', pin: 2 },
      color: 'black',
      signalName: '',
    };
    config.materials[0].circuits = [circuit1];
    config.materials[1].circuits = [circuit2];

    const issues = validateHarness(config);
    const dupIssues = issues.filter((i) => i.code === 'DUPLICATE_CIRCUIT_ID');
    expect(dupIssues.length).toBeGreaterThan(0);
  });

  it('detects duplicate jumper IDs within a connector', () => {
    const config = makeBaseConfig();
    // Use a 4-pin connector so jumpers are valid.
    config.connectors[0].connector = { ...CONNECTORS[2] }; // JST XH 4P
    config.connectors[0].jumpers = [
      { id: 'dup-jumper', side: 'right', pins: [1, 2] },
      { id: 'dup-jumper', side: 'right', pins: [3, 4] },
    ];

    const issues = validateHarness(config);
    const dupIssues = issues.filter((i) => i.code === 'DUPLICATE_JUMPER_ID');
    expect(dupIssues.length).toBeGreaterThan(0);
  });

  it('detects duplicate jumper IDs across different connectors', () => {
    const config = makeBaseConfig();
    const connB: ConnectorInstance = {
      id: 'conn-b',
      position: { x: 200, y: 0 },
      connector: { ...CONNECTORS[2] },
      label: 'B',
      jumpers: [],
    };
    config.connectors = [config.connectors[0], connB];
    config.connectors[0].connector = { ...CONNECTORS[2] };
    config.connectors[0].jumpers = [{ id: 'shared-jumper', side: 'right', pins: [1, 2] }];
    config.connectors[1].jumpers = [{ id: 'shared-jumper', side: 'right', pins: [3, 4] }];

    const issues = validateHarness(config);
    const dupIssues = issues.filter((i) => i.code === 'DUPLICATE_JUMPER_ID');
    expect(dupIssues.length).toBeGreaterThan(0);
  });

  it('passes cleanly when all IDs are unique', () => {
    const config = makeBaseConfig();
    config.materials[0].circuits = [
      {
        id: 'circuit-1',
        start: { connectorId: 'conn-a', connectorSide: 'right', pin: 1 },
        color: 'red',
        signalName: 'VCC',
      },
    ];

    const issues = validateHarness(config);
    const dupIssues = issues.filter(
      (i) => i.code === 'DUPLICATE_ID' || i.code === 'DUPLICATE_CIRCUIT_ID' || i.code === 'DUPLICATE_JUMPER_ID',
    );
    expect(dupIssues).toHaveLength(0);
  });
});

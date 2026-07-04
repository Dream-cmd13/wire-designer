import { describe, it, expect } from 'vitest';
import { normalizeHarnessConfig, createFallbackConfig } from '@/lib/normalizeHarnessConfig';
import { parseHarnessConfig } from '@/lib/harnessConfigSchema';
import type { HarnessConfig } from '@/types/harness';

describe('normalizeHarnessConfig', () => {
  it('returns a valid v3 config for v3 input', () => {
    const v3: HarnessConfig = {
      schemaVersion: 3,
      id: 'test-id',
      name: '测试项目',
      createdAt: 1000,
      updatedAt: 2000,
      connectors: [],
      materials: [],
      protectiveSleeves: [],
      models: [],
      quantity: 5,
      leadTime: 'rush',
    };

    const result = normalizeHarnessConfig(v3);
    expect(result.schemaVersion).toBe(3);
    expect(result.id).toBe('test-id');
    expect(result.name).toBe('测试项目');
    expect(result.quantity).toBe(5);
    expect(result.leadTime).toBe('rush');
  });

  it('discards non-v3 input and returns a fresh default', () => {
    const legacy = {
      id: 'old',
      name: '旧项目',
      nodes: [],
      wires: [],
      connections: [],
      // No schemaVersion
    };

    const result = normalizeHarnessConfig(legacy);
    expect(result.schemaVersion).toBe(3);
    expect(result.connectors).toEqual([]);
    expect(result.materials).toEqual([]);
    // The fallback has a fresh ID, not the old one.
    expect(result.id).not.toBe('old');
  });

  it('returns fallback for null/undefined input', () => {
    expect(normalizeHarnessConfig(null).schemaVersion).toBe(3);
    expect(normalizeHarnessConfig(undefined).schemaVersion).toBe(3);
    expect(normalizeHarnessConfig('string').schemaVersion).toBe(3);
  });

  it('rejects a partial v3 shape instead of trusting missing arrays', () => {
    const partial = {
      schemaVersion: 3,
      id: 'partial',
      name: '部分配置',
    };

    const result = normalizeHarnessConfig(partial);
    expect(result.connectors).toEqual([]);
    expect(result.materials).toEqual([]);
    expect(result.protectiveSleeves).toEqual([]);
    expect(result.id).not.toBe('partial');
  });

  it('normalizes invalid quantity to 1', () => {
    const bad = {
      schemaVersion: 3,
      id: 'bad',
      name: 'bad',
      quantity: -5,
    };

    const result = normalizeHarnessConfig(bad);
    expect(result.quantity).toBe(1);
  });

  it('normalizes invalid leadTime to standard', () => {
    const bad = {
      schemaVersion: 3,
      id: 'bad',
      name: 'bad',
      leadTime: 'invalid',
    };

    const result = normalizeHarnessConfig(bad);
    expect(result.leadTime).toBe('standard');
  });

  it('normalizes optional material accessory arrays on an otherwise valid document', () => {
    const input = {
      schemaVersion: 3,
      id: 'normalized',
      name: 'normalized',
      createdAt: 100,
      updatedAt: 200,
      materials: [{
        id: 'material-1',
        name: 'W1',
        position: { x: 0, y: 0 },
        width: 100,
        spec: {
          kind: 'electronic',
          color: 'red',
          lengthMm: 100,
          awg: 26,
          ulNumber: '1007',
          endTreatment: { stripped: false },
        },
        circuits: [],
      }],
      protectiveSleeves: [{
        id: 'sleeve-1',
        type: 'heat-shrink',
        position: { x: 0, y: 0 },
        width: 60,
        height: 36,
        lengthMm: 100,
        attachedMaterialIds: ['material-1'],
      }],
      connectors: [],
      models: [],
      quantity: 1,
      leadTime: 'standard',
    };

    const result = normalizeHarnessConfig(input);

    expect(result.materials[0].labels).toEqual([]);
    expect(result.materials[0].numberTubes).toEqual([]);
    expect(result.protectiveSleeves[0].attachedMaterialIds).toEqual(['material-1']);
    expect(result.protectiveSleeves[0].height).toBe(36);
  });

  it('rejects nested material data with a missing spec', () => {
    const input = {
      schemaVersion: 3,
      id: 'broken',
      name: 'broken',
      createdAt: 100,
      updatedAt: 200,
      connectors: [],
      materials: [{
        id: 'material-1',
        name: 'W1',
        position: { x: 0, y: 0 },
        width: 100,
        circuits: [],
      }],
      protectiveSleeves: [],
      models: [],
      quantity: 1,
      leadTime: 'standard',
    };

    const parsed = parseHarnessConfig(input);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.issues.some((issue) => issue.includes('materials[0].spec'))).toBe(true);
    }
  });

  it('rejects nested connector pin references with invalid PIN values', () => {
    const input: HarnessConfig = {
      schemaVersion: 3,
      id: 'broken-pin',
      name: 'broken-pin',
      createdAt: 100,
      updatedAt: 200,
      connectors: [],
      materials: [{
        id: 'material-1',
        name: 'W1',
        position: { x: 0, y: 0 },
        width: 100,
        spec: {
          kind: 'electronic',
          color: 'red',
          lengthMm: 100,
          awg: 26,
          ulNumber: '1007',
          endTreatment: { stripped: false },
        },
        circuits: [{
          id: 'circuit-1',
          color: 'red',
          signalName: 'VCC',
          start: { connectorId: 'missing', connectorSide: 'left', pin: 0 },
        }],
      }],
      protectiveSleeves: [],
      models: [],
      quantity: 1,
      leadTime: 'standard',
    };

    const parsed = parseHarnessConfig(input);
    expect(parsed.success).toBe(false);
  });
});

describe('createFallbackConfig', () => {
  it('creates a valid v3 config with empty arrays', () => {
    const config = createFallbackConfig();
    expect(config.schemaVersion).toBe(3);
    expect(config.connectors).toEqual([]);
    expect(config.materials).toEqual([]);
    expect(config.protectiveSleeves).toEqual([]);
    expect(config.quantity).toBe(1);
    expect(config.leadTime).toBe('standard');
    expect(config.id).toBeDefined();
    expect(config.name).toBe('未命名线束');
  });
});

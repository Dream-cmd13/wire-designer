import { describe, it, expect } from 'vitest';
import { normalizeHarnessConfig, createFallbackConfig } from '@/lib/normalizeHarnessConfig';
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

  it('normalizes missing arrays to empty arrays', () => {
    const partial = {
      schemaVersion: 3,
      id: 'partial',
      name: '部分配置',
      // Missing connectors, materials, protectiveSleeves
    };

    const result = normalizeHarnessConfig(partial);
    expect(result.connectors).toEqual([]);
    expect(result.materials).toEqual([]);
    expect(result.protectiveSleeves).toEqual([]);
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

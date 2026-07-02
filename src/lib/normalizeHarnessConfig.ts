// ============================================================
// Config Normalization
//
// Per project guidance: "无需考虑历史数据，无需考虑以前在该系统
// 建立的 project，只要确保之后新建的是正常的即可。"
//
// This module does NOT migrate legacy v1/v2 data. It only:
//   1. Validates that a persisted shape is a well-formed v3 config.
//   2. Normalizes missing arrays to empty arrays.
//   3. Returns a fresh default config for anything invalid (non-v3
//      data is discarded, not converted).
// ============================================================

import { generateId } from '@/lib/commands';
import type { HarnessConfig } from '@/types/harness';

const V3 = 3 as const;

/** Create a fresh empty v3 config. */
export function createFallbackConfig(): HarnessConfig {
  const now = Date.now();
  return {
    schemaVersion: V3,
    id: generateId(),
    name: '未命名线束',
    createdAt: now,
    updatedAt: now,
    connectors: [],
    materials: [],
    protectiveSleeves: [],
    quantity: 1,
    leadTime: 'standard',
  };
}

/**
 * Normalize any persisted shape into a valid v3 config.
 *
 * - If input is already a valid v3 config, fill in any missing arrays
 *   and return it.
 * - If input is missing/invalid/legacy (not schemaVersion 3), discard
 *   it and return a fresh default config. No backup is performed
 *   because the project is pre-release and legacy data is not needed.
 *
 * Never throws.
 */
export function normalizeHarnessConfig(input: unknown): HarnessConfig {
  if (!input || typeof input !== 'object') {
    return createFallbackConfig();
  }

  const raw = input as Partial<HarnessConfig>;

  // Must be v3. Legacy schemas (no schemaVersion, or v1/v2) are discarded.
  if (raw.schemaVersion !== V3) {
    return createFallbackConfig();
  }

  // Must have the three core arrays (or absence is fine — normalized to []).
  return {
    schemaVersion: V3,
    id: raw.id ?? generateId(),
    name: typeof raw.name === 'string' ? raw.name : '未命名线束',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    connectors: Array.isArray(raw.connectors) ? raw.connectors : [],
    materials: Array.isArray(raw.materials) ? raw.materials : [],
    protectiveSleeves: Array.isArray(raw.protectiveSleeves) ? raw.protectiveSleeves : [],
    quantity: typeof raw.quantity === 'number' && raw.quantity > 0 ? raw.quantity : 1,
    leadTime: raw.leadTime === 'rush' || raw.leadTime === 'standard' || raw.leadTime === 'economy'
      ? raw.leadTime
      : 'standard',
  };
}

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
import { parseHarnessConfig } from '@/lib/harnessConfigSchema';
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
    models: [],
    quantity: 1,
    leadTime: 'standard',
    twoDImages: [],
  };
}

/**
 * Normalize any persisted shape into a valid v3 config.
 *
 * - If input is a deeply valid v3 config, return a normalized copy.
 * - If input is missing, structurally invalid, or legacy, return a fresh
 *   fallback. Callers that need to report errors or preserve the raw input
 *   must use `parseHarnessConfig` before falling back.
 *
 * Never throws.
 */
export function normalizeHarnessConfig(input: unknown): HarnessConfig {
  const result = parseHarnessConfig(input);
  return result.success ? result.data : createFallbackConfig();
}

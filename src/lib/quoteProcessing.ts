import type { HarnessConfig } from '@/types/harness';

/** Counts cover the whole harness; welding includes any actual shield joints. */
export function getQuoteProcessing(config: HarnessConfig) {
  const spec = config.materials[0]?.spec;
  const cores = spec?.kind === 'jacketed' ? spec.coreCount : 1;
  const shield = spec?.kind === 'jacketed' && spec.shielded;
  const tinningEnds = config.quotation?.endpointBType === 'strip-tin' ? 1 : 0;
  return {
    requiresActualCounts: spec?.kind === 'jacketed' && config.connectors.some(({ connector }) =>
      connector.pinCount !== cores || connector.shielded !== shield),
    weldingPoints: (cores + (shield ? 1 : 0)) * config.connectors.length,
    strippingPoints: cores * (config.connectors.length + tinningEnds),
  };
}

export function isQuotePointCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1000;
}

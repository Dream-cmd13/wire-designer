import type { WireDimensionOverride } from '@/types/harness';

export interface WireToleranceResult {
  length: number;
  lengthDisplay: string;
  upper: string;
  lower: string;
  isCustom: boolean;
}

/**
 * Calculates the default dimension tolerances based on wire length:
 * - <= 100mm: ±10 (+10 / -10)
 * - > 100mm and <= 1000mm: ±20 (+20 / -20)
 * - > 1000mm: ±2% (+2% / -2%)
 */
export function calculateDefaultWireTolerance(lengthMm: number): { upper: string; lower: string } {
  const safeLength = Number.isFinite(lengthMm) ? Math.max(0, lengthMm) : 0;
  if (safeLength <= 100) {
    return { upper: '+10', lower: '-10' };
  } else if (safeLength <= 1000) {
    return { upper: '+20', lower: '-20' };
  } else {
    return { upper: '+2%', lower: '-2%' };
  }
}

/**
 * Normalizes tolerance string or number with an explicit sign prefix.
 * e.g. "10" with '+' -> "+10", "-5" with '-' -> "-5", "2%" with '+' -> "+2%"
 */
export function normalizeToleranceSign(val: string | number | undefined, defaultSign: '+' | '-'): string {
  if (val === undefined || val === null) {
    return `${defaultSign}0`;
  }
  const str = String(val).trim();
  if (!str) {
    return `${defaultSign}0`;
  }
  if (str.startsWith('+') || str.startsWith('-') || str.startsWith('±')) {
    return str;
  }
  return `${defaultSign}${str}`;
}

/**
 * Resolves the final displayed dimension length and stacked tolerances,
 * using user overrides when custom, or calculating defaults automatically.
 */
export function resolveWireDimension(
  specLengthMm: number,
  override?: WireDimensionOverride,
): WireToleranceResult {
  const effectiveLength =
    override?.displayLength !== undefined && Number.isFinite(override.displayLength)
      ? override.displayLength
      : specLengthMm;

  const defaultTol = calculateDefaultWireTolerance(effectiveLength);

  const isCustom = !!override?.isCustom;

  const upper =
    isCustom && override?.upperTolerance !== undefined && override.upperTolerance.trim() !== ''
      ? normalizeToleranceSign(override.upperTolerance, '+')
      : defaultTol.upper;

  const lower =
    isCustom && override?.lowerTolerance !== undefined && override.lowerTolerance.trim() !== ''
      ? normalizeToleranceSign(override.lowerTolerance, '-')
      : defaultTol.lower;

  return {
    length: effectiveLength,
    lengthDisplay: String(effectiveLength),
    upper,
    lower,
    isCustom,
  };
}

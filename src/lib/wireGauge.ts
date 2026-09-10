export interface WireGauge {
  awg?: number;
  conductorAreaMm2?: number;
}

export function formatWireGauge(spec: WireGauge): string {
  return spec.conductorAreaMm2 !== undefined ? `${spec.conductorAreaMm2}mm²` : `${spec.awg}AWG`;
}

export function isValidWireGauge(spec: WireGauge): boolean {
  const positive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  return spec.conductorAreaMm2 !== undefined
    ? positive(spec.conductorAreaMm2) && spec.awg === undefined
    : positive(spec.awg);
}

// Geometry only: convert area to an equivalent diameter without changing the stored specification.
export function geometryAwg(spec: WireGauge): number {
  if (spec.conductorAreaMm2 !== undefined) {
    const diameter = Math.sqrt(4 * spec.conductorAreaMm2 / Math.PI);
    return 36 - 39 * Math.log(diameter / 0.127) / Math.log(92);
  }
  return spec.awg!;
}

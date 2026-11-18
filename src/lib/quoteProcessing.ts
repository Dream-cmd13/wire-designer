import type { HarnessConfig, MaterialEndpoint } from '@/types/harness';

/** Shared by the preview and server; never infer unused canvas cores from nominal specifications. */
export function getQuoteProcessing(config: HarnessConfig) {
  const wire = config.materials[0];
  const spec = wire?.spec;
  const cores = spec?.kind === 'jacketed' ? spec.coreCount : 1;
  const shield = spec?.kind === 'jacketed' && spec.shielded;
  const estimated = config.quotation?.processingBasis === 'specification';
  const tinningEnds = config.quotation?.endpointBType === 'strip-tin' ? 1 : 0;
  if (estimated) {
    const connectedCores = config.connectors.reduce((sum, { connector }) => sum + Math.min(cores, connector.pinCount), 0);
    const shieldJoints = shield ? config.connectors.filter(c => c.connector.shielded).length : 0;
    return {
      estimated, issues: [] as string[],
      weldingPoints: config.quotation?.weldingPoints ?? connectedCores + shieldJoints,
      strippingPoints: config.quotation?.strippingPoints ?? connectedCores + cores * tinningEnds,
      crimpingPoints: config.quotation?.crimpingPoints ?? 0,
      outerStrippingPoints: config.connectors.length + tinningEnds,
      tinningPoints: (cores + (shield ? 1 : 0)) * tinningEnds,
      shieldWeldingPoints: shieldJoints,
    };
  }

  const issues: string[] = [];
  const jumperPins = new Set<string>();
  const connectedPins = new Set<string>();
  const coreJoints = new Set<string>();
  const coreEnds = new Set<string>();
  const workedEnds = new Set<MaterialEndpoint>();
  const shieldJoints = new Set<string>();
  const crimpedCores = new Set<string>();
  const tinnedEnds = new Set<MaterialEndpoint>();
  const validPin = (pin: number, count: number) => Number.isSafeInteger(pin) && pin >= 1 && pin <= count;

  // Jumpers encode splits. Add only pins not already counted by core connections.
  for (const connector of config.connectors) {
    for (const jumper of connector.jumpers ?? []) {
      if (!['left', 'right'].includes(jumper.side) || jumper.pins.some(pin => !validPin(pin, connector.connector.pinCount))) {
        issues.push('短接针位超出连接器范围');
        continue;
      }
      for (const pin of jumper.pins) jumperPins.add(`${connector.id}:${jumper.side}:${pin}`);
    }
  }
  for (const circuit of wire?.circuits ?? []) {
    if (circuit.coreIndex !== undefined && (!Number.isSafeInteger(circuit.coreIndex) || circuit.coreIndex < 0 || circuit.coreIndex >= cores)) {
      issues.push('接线芯序超出线材范围');
      continue;
    }
    for (const endpoint of ['start', 'end'] as const) {
      const ref = circuit[endpoint];
      if (!ref) continue;
      const connector = config.connectors.find(c => c.id === ref.connectorId);
      if (!connector || !['left', 'right'].includes(ref.connectorSide) || !validPin(ref.pin, connector.connector.pinCount)) {
        issues.push('接线针位超出连接器范围');
        continue;
      }
      const pinKey = `${connector.id}:${ref.connectorSide}:${ref.pin}`;
      const coreEnd = `${circuit.coreIndex ?? circuit.id}:${endpoint}`;
      connectedPins.add(pinKey);
      coreJoints.add(`${coreEnd}:${pinKey}`);
      coreEnds.add(coreEnd);
      workedEnds.add(endpoint);
      if (spec?.endTreatment[endpoint].termination === 'terminal') crimpedCores.add(coreEnd);
      if (shield && connector.connector.shielded) shieldJoints.add(`${connector.id}:${ref.connectorSide}`);
    }
  }
  const freeBEnd = workedEnds.has('end') && !workedEnds.has('start') ? 'start' : 'end';
  for (const endpoint of ['start', 'end'] as const) {
    const treatment = spec?.endTreatment[endpoint];
    // Explicit free-end treatment applies to all cores; connected ends use the drawn cores.
    if (!workedEnds.has(endpoint) && treatment && (treatment.stripped || treatment.termination !== 'none')) {
      for (let core = 0; core < cores; core++) {
        coreEnds.add(`${core}:${endpoint}`);
        if (treatment.termination === 'terminal') crimpedCores.add(`${core}:${endpoint}`);
      }
      workedEnds.add(endpoint);
      if (treatment.termination === 'tinned') tinnedEnds.add(endpoint);
    }
  }
  if (tinningEnds) {
    for (let core = 0; core < cores; core++) coreEnds.add(`${core}:${freeBEnd}`);
    workedEnds.add(freeBEnd);
    tinnedEnds.add(freeBEnd);
  }
  return {
    estimated, issues,
    weldingPoints: coreJoints.size + [...jumperPins].filter(pin => !connectedPins.has(pin)).length + shieldJoints.size,
    strippingPoints: coreEnds.size,
    crimpingPoints: crimpedCores.size,
    outerStrippingPoints: workedEnds.size,
    tinningPoints: (cores + (shield ? 1 : 0)) * tinnedEnds.size,
    shieldWeldingPoints: shieldJoints.size,
  };
}

export function isQuotePointCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1000;
}

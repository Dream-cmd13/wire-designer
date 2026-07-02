import type { HarnessConfig, BOMItem, CanvasWireMaterial } from '@/types/harness';
import {
  calculateProtectiveSleevePrice,
  getProtectiveSleeveDisplayName,
} from './canvasMaterials';
import { BASE_PRICES } from './data';

function getMaterialDescription(material: CanvasWireMaterial): string {
  const spec = material.spec;
  if (spec.kind === 'electronic') {
    return `${spec.awg}AWG 电子线 ${spec.color} ${spec.lengthMm}mm`;
  }
  const ul = spec.ulNumber ? ` ${spec.ulNumber}` : '';
  return `${spec.jacketMaterial}护套线${ul} ${spec.coreCount}芯 ${spec.awg}AWG ${spec.lengthMm}mm`;
}

/**
 * Build a grouping key that captures EVERY distinguishing spec field.
 * Two materials with the same key are truly identical and can share a
 * BOM line. Fields omitted from the description (jacket color, shielded,
 * OD, core colors, end treatment, UL) are all included here.
 */
function getMaterialGroupKey(material: CanvasWireMaterial): string {
  const spec = material.spec;
  if (spec.kind === 'electronic') {
    const endKey = spec.endTreatment.stripped
      ? spec.endTreatment.method === 'tinned'
        ? `tinned:${spec.endTreatment.lengthMm}`
        : 'terminal'
      : 'unstripped';
    return `elec|${spec.awg}|${spec.color}|${spec.lengthMm}|${spec.ulNumber}|${endKey}`;
  }
  const endKey = spec.endTreatment.stripped
    ? spec.endTreatment.method === 'tinned'
      ? `tinned:${spec.endTreatment.lengthMm}`
      : 'terminal'
    : 'unstripped';
  return `jack|${spec.jacketMaterial}|${spec.jacketColor}|${spec.awg}|${spec.coreCount}|${spec.shielded}|${spec.odMm}|${spec.lengthMm}|${spec.ulNumber ?? 'none'}|${spec.coreColors.join(',')}|${endKey}`;
}

function getMaterialUnitPrice(material: CanvasWireMaterial): number {
  const spec = material.spec;
  const lengthM = spec.lengthMm / 1000;
  if (spec.kind === 'electronic') {
    return BASE_PRICES.wirePerMeter(spec.awg, 'ul1007') * lengthM;
  }
  // Jacketed: price by outer cable, cores don't multiply cost
  return BASE_PRICES.wirePerMeter(spec.awg, 'ul1007') * lengthM * spec.coreCount * 0.6;
}

/**
 * Generate a Bill of Materials (BOM) from a harness configuration.
 *
 * - Connectors: deduplicate by connector id.
 * - Materials: group by spec (kind + awg + length + color / coreCount + material).
 * - Protective sleeves: group by type + material + length.
 */
export function generateBOM(config: HarnessConfig): BOMItem[] {
  const items: BOMItem[] = [];

  // --- Connectors ---
  const connectorMap = new Map<string, { count: number; manufacturer: string; description: string; pinCount: number }>();

  for (const instance of config.connectors) {
    if (instance.connector) {
      const key = instance.connector.id;
      const existing = connectorMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        connectorMap.set(key, {
          count: 1,
          manufacturer: instance.connector.manufacturer,
          description: `${instance.connector.name} (${instance.connector.pinCount}P)`,
          pinCount: instance.connector.pinCount,
        });
      }
    }
  }

  for (const [connectorId, info] of connectorMap) {
    const unitPrice = BASE_PRICES.connector(info.pinCount);
    items.push({
      type: 'connector',
      partNumber: connectorId,
      manufacturer: info.manufacturer,
      description: info.description,
      quantity: info.count,
      unitPrice,
      totalPrice: unitPrice * info.count,
    });
  }

  // --- Materials (wire / cable) ---
  // Group by a key that captures EVERY distinguishing spec field so
  // different jacket colors, shielding, OD, end treatment, etc. are
  // never merged into one BOM line.
  const materialMap = new Map<string, { count: number; description: string; unitPrice: number }>();

  for (const material of config.materials) {
    const key = getMaterialGroupKey(material);
    const existing = materialMap.get(key);
    const unitPrice = getMaterialUnitPrice(material);
    if (existing) {
      existing.count += 1;
    } else {
      materialMap.set(key, {
        count: 1,
        description: getMaterialDescription(material),
        unitPrice,
      });
    }
  }

  for (const [, info] of materialMap) {
    items.push({
      type: 'wire',
      description: info.description,
      quantity: info.count,
      unitPrice: info.unitPrice,
      totalPrice: info.unitPrice * info.count,
    });
  }

  // --- Protective sleeves: group by type + material + length ---
  const sleeveMap = new Map<string, { count: number; description: string; unitPrice: number }>();

  for (const sleeve of config.protectiveSleeves) {
    const key = `${sleeve.type}-${sleeve.corrugatedMaterial ?? 'none'}-${sleeve.lengthMm}`;
    const existing = sleeveMap.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }

    const unitPrice = calculateProtectiveSleevePrice(sleeve);
    sleeveMap.set(key, {
      count: 1,
      description: `${getProtectiveSleeveDisplayName(sleeve)} ${sleeve.lengthMm}mm`,
      unitPrice,
    });
  }

  for (const [, info] of sleeveMap) {
    items.push({
      type: 'accessory',
      description: info.description,
      quantity: info.count,
      unitPrice: info.unitPrice,
      totalPrice: info.unitPrice * info.count,
    });
  }

  return items;
}

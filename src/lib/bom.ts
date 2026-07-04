import type { BOMItem, CanvasWireMaterial, HarnessConfig } from '@/types/harness';
import {
  calculateProtectiveSleevePrice,
  getProtectiveSleeveDisplayName,
  getWireEndTreatmentSummary,
} from './canvasMaterials';
import { BASE_PRICES } from './data';

function getMaterialDescription(material: CanvasWireMaterial): string {
  const spec = material.spec;
  if (spec.kind === 'electronic') {
    return `${spec.awg}AWG 电子线 ${spec.color} ${spec.lengthMm}mm ${getWireEndTreatmentSummary(spec.endTreatment)}`;
  }
  const ul = spec.ulNumber ? ` ${spec.ulNumber}` : '';
  return `${spec.jacketMaterial}护套线${ul} ${spec.coreCount}芯 ${spec.awg}AWG ${spec.lengthMm}mm ${getWireEndTreatmentSummary(spec.endTreatment)}`;
}

function getEndTreatmentKey(material: CanvasWireMaterial) {
  const formatEnd = (key: 'start' | 'end') => {
    const end = material.spec.endTreatment[key];
    if (!end.stripped) return `${key}:none`;
    return `${key}:${end.stripLengthMm}:${end.termination}:${end.terminalModel ?? 'none'}`;
  };

  return `${formatEnd('start')}|${formatEnd('end')}`;
}

/**
 * Build a grouping key that captures every distinguishing spec field.
 * Two materials with the same key are truly identical and can share one BOM line.
 */
function getMaterialGroupKey(material: CanvasWireMaterial): string {
  const spec = material.spec;
  if (spec.kind === 'electronic') {
    return `elec|${spec.awg}|${spec.color}|${spec.lengthMm}|${spec.ulNumber}|${getEndTreatmentKey(material)}`;
  }

  return `jack|${spec.jacketMaterial}|${spec.jacketColor}|${spec.awg}|${spec.coreCount}|${spec.shielded}|${spec.odMm}|${spec.lengthMm}|${spec.ulNumber ?? 'none'}|${spec.coreColors.join(',')}|${getEndTreatmentKey(material)}`;
}

function getMaterialUnitPrice(material: CanvasWireMaterial): number {
  const spec = material.spec;
  const lengthM = spec.lengthMm / 1000;
  if (spec.kind === 'electronic') {
    return BASE_PRICES.wirePerMeter(spec.awg, 'ul1007') * lengthM;
  }
  return BASE_PRICES.wirePerMeter(spec.awg, 'ul1007') * lengthM * spec.coreCount * 0.6;
}

export function generateBOM(config: HarnessConfig): BOMItem[] {
  const items: BOMItem[] = [];

  const connectorMap = new Map<string, { count: number; manufacturer: string; description: string; pinCount: number }>();
  for (const instance of config.connectors) {
    const connector = instance.connector;
    if (!connector) continue;
    const key = connector.id;
    const existing = connectorMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      connectorMap.set(key, {
        count: 1,
        manufacturer: connector.manufacturer,
        description: `${connector.name} (${connector.pinCount}P)`,
        pinCount: connector.pinCount,
      });
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

  const sleeveMap = new Map<string, { count: number; description: string; unitPrice: number }>();
  for (const sleeve of config.protectiveSleeves) {
    const key = [
      sleeve.type,
      sleeve.corrugatedMaterial ?? 'none',
      sleeve.lengthMm,
      sleeve.corrugatedFixing?.startHeatShrink ?? false,
      sleeve.corrugatedFixing?.endHeatShrink ?? false,
      sleeve.corrugatedFixing?.startDistanceMm ?? 0,
      sleeve.corrugatedFixing?.endDistanceMm ?? 0,
      sleeve.remark ?? '',
    ].join('|');

    const existing = sleeveMap.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }

    const unitPrice = calculateProtectiveSleevePrice(sleeve);
    sleeveMap.set(key, {
      count: 1,
      description: `${getProtectiveSleeveDisplayName(sleeve)} ${sleeve.lengthMm}mm${sleeve.remark ? ` (${sleeve.remark})` : ''}`,
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

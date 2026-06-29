import type { HarnessConfig, BOMItem } from '@/types/harness';
import { BASE_PRICES } from './data';

/**
 * Generate a Bill of Materials (BOM) from a harness configuration.
 *
 * - Deduplicates connectors by model (connector id).
 * - Groups wires by gauge + type + color + length.
 * - Calculates quantities and unit prices for each line item.
 */
export function generateBOM(config: HarnessConfig): BOMItem[] {
  const items: BOMItem[] = [];

  // --- Connectors: deduplicate by connector id ---
  const connectorMap = new Map<string, { count: number; manufacturer: string; description: string; pinCount: number }>();

  for (const node of config.nodes) {
    if (node.connector) {
      const key = node.connector.id;
      const existing = connectorMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        connectorMap.set(key, {
          count: 1,
          manufacturer: node.connector.manufacturer,
          description: `${node.connector.name} (${node.connector.pinCount}P)`,
          pinCount: node.connector.pinCount,
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

  // --- Wires: group by gauge + type + color + length ---
  const wireMap = new Map<string, { count: number; description: string; unitPrice: number }>();

  for (const wire of config.wires) {
    const lengthM = wire.lengthMm / 1000;
    const key = `${wire.wireGauge}-${wire.wireType}-${wire.wireColor}-${wire.lengthMm}`;
    const existing = wireMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      const unitPrice = BASE_PRICES.wirePerMeter(wire.wireGauge, wire.wireType) * lengthM;
      wireMap.set(key, {
        count: 1,
        description: `${wire.wireGauge}AWG ${wire.wireType} ${wire.wireColor} ${wire.lengthMm}mm`,
        unitPrice,
      });
    }
  }

  for (const [, info] of wireMap) {
    items.push({
      type: 'wire',
      description: info.description,
      quantity: info.count,
      unitPrice: info.unitPrice,
      totalPrice: info.unitPrice * info.count,
    });
  }

  // --- Bundles (if any) ---
  if (config.bundles) {
    for (const bundle of config.bundles) {
      items.push({
        type: 'cable',
        partNumber: bundle.id,
        description: `${bundle.name} (${bundle.wireCount}芯, ${bundle.category === 'cable' ? '线缆' : '线束'}${bundle.shielded ? ', 屏蔽' : ''})`,
        quantity: 1,
      });
    }
  }

  // --- Protection accessory ---
  if (config.protection && config.protection !== 'none') {
    items.push({
      type: 'accessory',
      description: `保护套: ${config.protection}`,
      quantity: config.connections.length,
    });
  }

  return items;
}

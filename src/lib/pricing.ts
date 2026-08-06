import type { HarnessConfig, PriceBreakdown, CanvasWireMaterial } from '@/types/harness';
import { calculateProtectiveSleevePrice } from './canvasMaterials';
import { getCatalogSnapshot } from '@/lib/catalogRuntime';
import type { CatalogSnapshot } from '@/types/catalog';

function ruleValue(catalog: CatalogSnapshot, ruleCode: string, ruleKey: string, fallback = 0): number {
  return catalog.pricingRules.find((rule) => rule.ruleCode === ruleCode && rule.ruleKey === ruleKey)?.numericValue ?? fallback;
}

function wirePerMeter(catalog: CatalogSnapshot, awg: number, type: string): number {
  const gauge = ruleValue(catalog, 'wire_per_meter', `awg_${awg}`);
  const typeMultiplier = ruleValue(catalog, 'wire_type_multiplier', type, 1);
  return gauge * typeMultiplier;
}

function getMaterialCost(material: CanvasWireMaterial, catalog: CatalogSnapshot): { wireCost: number; laborCost: number } {
  const spec = material.spec;
  const lengthM = spec.lengthMm / 1000;
  const wirePricePerM = wirePerMeter(catalog, spec.awg, 'ul1007');
  const multiplier = spec.kind === 'jacketed' ? spec.coreCount * ruleValue(catalog, 'jacketed', 'core_factor') : 1;
  const wireCost = wirePricePerM * lengthM * multiplier;
  const laborCost = ruleValue(catalog, 'labor', 'per_meter') * lengthM;
  return { wireCost, laborCost };
}

/**
 * Calculate the price of a wire harness configuration.
 * Reads wire costs from `materials` (not a separate wires list).
 */
export function calculatePrice(config: HarnessConfig, catalog: CatalogSnapshot | null = getCatalogSnapshot()): PriceBreakdown {
  if (!catalog) {
    return {
      connectors: 0, wires: 0, labor: 0, protection: 0,
      leadTimeMultiplier: 1, quantityDiscount: 1, unitPrice: 0, totalPrice: 0,
    };
  }
  let connectorsCost = 0;
  let wiresCost = 0;
  let laborCost = 0;

  // Connector costs
  for (const instance of config.connectors) {
    if (instance.connector) {
      connectorsCost += ruleValue(catalog, 'connector', 'base')
        + instance.connector.pinCount * ruleValue(catalog, 'connector', 'per_pin');
    }
  }

  // Material costs: each material is one physical cable
  for (const material of config.materials) {
    const { wireCost, laborCost: materialLabor } = getMaterialCost(material, catalog);
    wiresCost += wireCost;
    laborCost += materialLabor;
  }

  // Labor: crimping per connector
  laborCost += config.connectors.length * ruleValue(catalog, 'labor', 'per_connector');

  // Protection costs
  const protectionCost = config.protectiveSleeves.reduce(
    (sum, sleeve) => sum + calculateProtectiveSleevePrice(sleeve, catalog),
    0,
  );

  // Lead time multiplier
  const leadTime = catalog.leadTimeOptions.find((l) => l.id === config.leadTime);
  const leadTimeMultiplier = leadTime?.multiplier || 1;

  // Quantity discount
  const quantity = config.quantity;
  const quantityDiscount = [...catalog.quantityDiscountRules]
    .sort((a, b) => b.minimumQuantity - a.minimumQuantity)
    .find((rule) => quantity >= rule.minimumQuantity)?.multiplier ?? 1;

  const subtotal = (connectorsCost + wiresCost + laborCost + protectionCost) * leadTimeMultiplier;
  const unitPrice = subtotal * quantityDiscount;
  const totalPrice = unitPrice * quantity;

  return {
    connectors: connectorsCost,
    wires: wiresCost,
    labor: laborCost,
    protection: protectionCost,
    leadTimeMultiplier,
    quantityDiscount,
    unitPrice,
    totalPrice,
  };
}

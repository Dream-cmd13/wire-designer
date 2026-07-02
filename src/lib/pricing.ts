import type { HarnessConfig, PriceBreakdown, CanvasWireMaterial } from '@/types/harness';
import { calculateProtectiveSleevePrice } from './canvasMaterials';
import { BASE_PRICES, LEAD_TIME_OPTIONS } from './data';

function getMaterialCost(material: CanvasWireMaterial): { wireCost: number; laborCost: number } {
  const spec = material.spec;
  const lengthM = spec.lengthMm / 1000;
  const wirePricePerM = BASE_PRICES.wirePerMeter(spec.awg, 'ul1007');
  const multiplier = spec.kind === 'jacketed' ? spec.coreCount * 0.6 : 1;
  const wireCost = wirePricePerM * lengthM * multiplier;
  const laborCost = BASE_PRICES.laborPerMeter * lengthM;
  return { wireCost, laborCost };
}

/**
 * Calculate the price of a wire harness configuration.
 * Reads wire costs from `materials` (not a separate wires list).
 */
export function calculatePrice(config: HarnessConfig): PriceBreakdown {
  let connectorsCost = 0;
  let wiresCost = 0;
  let laborCost = 0;

  // Connector costs
  for (const instance of config.connectors) {
    if (instance.connector) {
      connectorsCost += BASE_PRICES.connector(instance.connector.pinCount);
    }
  }

  // Material costs: each material is one physical cable
  for (const material of config.materials) {
    const { wireCost, laborCost: materialLabor } = getMaterialCost(material);
    wiresCost += wireCost;
    laborCost += materialLabor;
  }

  // Labor: crimping per connector
  laborCost += config.connectors.length * BASE_PRICES.laborPerConnector;

  // Protection costs
  const protectionCost = config.protectiveSleeves.reduce(
    (sum, sleeve) => sum + calculateProtectiveSleevePrice(sleeve),
    0,
  );

  // Lead time multiplier
  const leadTime = LEAD_TIME_OPTIONS.find((l) => l.id === config.leadTime);
  const leadTimeMultiplier = leadTime?.multiplier || 1;

  // Quantity discount
  const quantity = config.quantity;
  let quantityDiscount = 1;
  if (quantity >= 100) quantityDiscount = 0.7;
  else if (quantity >= 50) quantityDiscount = 0.8;
  else if (quantity >= 20) quantityDiscount = 0.85;
  else if (quantity >= 10) quantityDiscount = 0.9;
  else if (quantity >= 5) quantityDiscount = 0.95;

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

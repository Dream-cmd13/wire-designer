import type { HarnessConfig, PriceBreakdown } from '@/types/harness';
import { BASE_PRICES, LEAD_TIME_OPTIONS, PROTECTION_OPTIONS } from './data';

/**
 * Calculate the price of a wire harness configuration.
 * Now iterates over the wires list to compute per-wire costs,
 * since each wire has its own gauge, type, color, and length.
 */
export function calculatePrice(config: HarnessConfig): PriceBreakdown {
  let connectorsCost = 0;
  let wiresCost = 0;
  let laborCost = 0;

  // Connector costs: sum up all connector nodes
  for (const node of config.nodes) {
    if (node.connector) {
      connectorsCost += BASE_PRICES.connector(node.connector.pinCount);
    }
  }

  // Wire costs: iterate over the flat wires list
  for (const wire of config.wires) {
    const lengthM = wire.lengthMm / 1000;
    const wirePricePerM = BASE_PRICES.wirePerMeter(wire.wireGauge, wire.wireType);
    wiresCost += wirePricePerM * lengthM;
    laborCost += BASE_PRICES.laborPerMeter * lengthM;
  }

  // Labor: crimping labor per connector
  laborCost += config.nodes.filter((n) => n.type === 'connector').length * BASE_PRICES.laborPerConnector;

  // Protection cost per connection
  const protection = PROTECTION_OPTIONS.find((p) => p.id === config.protection);
  const protectionCost = protection ? protection.price * config.connections.length : 0;

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

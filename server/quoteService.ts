import { parseCatalogItemRow } from '@/lib/catalogItem';
import { applyCatalogWireSpec } from '@/lib/wireCatalog';
import { canViewPricing } from '@/lib/permissions';
import type { HarnessConfig } from '@/types/harness';
import type { CatalogSnapshot } from '@/types/catalog';
import type { MaterialPrice } from '@/repositories/priceRepository';
import type { PricingSettings } from '@/types/pricingSettings';
import { calculatePrice } from './pricing';

export function catalogFromRows(rows: unknown[]): CatalogSnapshot {
  const items = rows.map(parseCatalogItemRow);
  return {
    connectors: items.filter(i => i.kind === 'connector').map(i => ({
      id: i.code, resourceItemId: i.id, name: i.name, model: i.model,
      ...i.spec, type: i.spec.connectorType,
    })),
    wires: items.filter(i => i.kind === 'wire').map(i => ({
      id: i.code, resourceItemId: i.id, name: i.name,
      spec: i.spec.kind === 'electronic' ? { ...i.spec, color: i.spec.conductorColor } : { ...i.spec },
    })),
    overmolds: items.filter(i => i.kind === 'overmold').map(i => ({
      id: i.code, resourceItemId: i.id, name: i.name, ...i.spec,
    })),
    wireColors: [], leadTimeOptions: [], protectionOptions: [], pricingRules: [], quantityDiscountRules: [], loadedAt: Date.now(),
  };
}

// Only identity, quantity, length and processing choices come from the caller.
export function canonicalizeQuote(config: HarnessConfig, catalog: CatalogSnapshot): HarnessConfig {
  if (!config || !Array.isArray(config.connectors) || !Array.isArray(config.materials)
    || !Array.isArray(config.models) || config.connectors.length > 2 || config.materials.length !== 1
    || config.models.length > 2 || config.protectiveSleeves?.length) {
    throw new Error('配置超出自动报价支持范围');
  }
  const connectors = config.connectors.map(instance => {
    const connector = catalog.connectors.find(c => c.resourceItemId === instance.connector?.resourceItemId);
    if (!connector) throw new Error('连接器不在物料目录中');
    return { ...instance, connector };
  });
  const materials = config.materials.map(material => {
    const wire = catalog.wires.find(w => w.resourceItemId === material.resourceItemId);
    if (!wire || !material.spec) throw new Error('线材不在物料目录中');
    return { ...material, name: wire.name, spec: applyCatalogWireSpec(material.spec, wire.spec) };
  });
  const wireSpec = materials[0].spec;
  if (wireSpec.kind !== 'jacketed' || connectors.some(({ connector }) =>
    connector.pinCount !== wireSpec.coreCount || typeof connector.shielded !== 'boolean'
    || connector.shielded !== wireSpec.shielded)) {
    throw new Error('连接器和线材的芯数、屏蔽属性必须一致');
  }
  for (const model of config.models) {
    if (model.kind !== 'outer-box' || (model.includeInnerMold !== undefined && typeof model.includeInnerMold !== 'boolean')) throw new Error('不支持此成型配置');
    if (!catalog.overmolds.some(m => m.id === model.overmoldSpecId)) throw new Error('外模不在物料目录中');
  }
  return { ...config, connectors, materials };
}

export function quoteForRole(config: HarnessConfig, catalog: CatalogSnapshot, prices: MaterialPrice[], settings: PricingSettings, role: unknown) {
  if (role !== 'sales' && !canViewPricing(role)) throw new Error('报价权限未就绪');
  const result = calculatePrice(canonicalizeQuote(config, catalog), prices, catalog, settings);
  if (result.status !== 'ready') return canViewPricing(role) ? result : {
    status: result.status, issues: [result.status === 'manual' ? '需工程师人工核价' : '当前配置无法报价，请检查信息或联系工程师'],
  };
  return {
    status: 'ready', settingsVersion: settings.version, calculatedAt: new Date().toISOString(),
    price: {
      unitPrice: result.price.unitPrice, totalPrice: result.price.totalPrice,
      ...(canViewPricing(role) ? { breakdown: result.price } : {}),
    },
  };
}

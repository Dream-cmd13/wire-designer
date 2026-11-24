import { materialPriceTierKey, type QuoteMaterial } from '@/lib/quoteMaterials';
import { applyCatalogWireSpec } from '@/lib/wireCatalog';
import type { MaterialPrice } from '@/repositories/priceRepository';
import type { CatalogWire } from '@/types/catalog';
import type { Connector, OvermoldSpec } from '@/types/harness';

export const BASE_WIRE_SPEC = {
  kind: 'electronic' as const,
  awg: 24,
  color: '黑色',
  ulNumber: '1007' as const,
  lengthMm: 1000,
  endTreatment: {
    start: { stripped: false, termination: 'none' as const },
    end: { stripped: false, termination: 'none' as const },
  },
};

export interface MaterialPriceIndex {
  connMap: Map<string, MaterialPrice>;
  moldMap: Map<string, MaterialPrice>;
  wireTiersMap: Map<string, MaterialPrice[]>;
}

export interface MoldRow {
  candidate: QuoteMaterial;
  parent: OvermoldSpec;
}

export function formatWireTierLength(lengthMm: number): string {
  if (!Number.isFinite(lengthMm) || lengthMm <= 0) return '-';
  if (lengthMm >= 1000) {
    const m = lengthMm / 1000;
    return `${Number(m.toFixed(2))}m`;
  }
  if (lengthMm % 100 === 0) {
    return `${Number((lengthMm / 1000).toFixed(2))}m`;
  }
  return `${lengthMm}mm`;
}

/**
 * 构建连接器、模具与线材分档的精确价格索引。
 */
export function buildMaterialPriceIndex(prices: readonly MaterialPrice[]): MaterialPriceIndex {
  const connMap = new Map<string, MaterialPrice>();
  const moldMap = new Map<string, MaterialPrice>();
  const wireTiersMap = new Map<string, MaterialPrice[]>();

  for (const price of prices) {
    const tierKey = materialPriceTierKey(price);
    if (price.kind === 'connector') {
      connMap.set(tierKey, price);
    } else if (price.kind === 'outer-mold' || price.kind === 'inner-mold') {
      moldMap.set(tierKey, price);
    } else if (price.kind === 'wire') {
      const list = wireTiersMap.get(tierKey) ?? [];
      list.push(price);
      wireTiersMap.set(tierKey, list);
    }
  }

  for (const list of wireTiersMap.values()) {
    list.sort((a, b) => a.lengthMm - b.lengthMm);
  }

  return { connMap, moldMap, wireTiersMap };
}

/**
 * 按连接器资源 ID 与规格精准查找单价记录。
 */
export function getConnectorPriceFromIndex(
  index: MaterialPriceIndex,
  connector: Connector,
): MaterialPrice | undefined {
  const resId = connector.resourceItemId || connector.id;
  const spec = JSON.stringify([connector.model || '', connector.series || '', connector.pinCount, connector.type]);
  const tierKey = JSON.stringify(['connector', resId, spec, '元/个']);
  return index.connMap.get(tierKey);
}

/**
 * 按线缆资源 ID 与工程规格精准查找全部长度档位价格。
 */
export function getWirePricesFromIndex(
  index: MaterialPriceIndex,
  wire: CatalogWire,
): MaterialPrice[] {
  const resId = wire.resourceItemId || wire.id;
  const s = applyCatalogWireSpec(BASE_WIRE_SPEC, wire.spec);
  const specification =
    s.kind === 'jacketed'
      ? [
          s.kind,
          s.awg ?? null,
          s.coreCount,
          s.shielded,
          s.jacketMaterial,
          s.jacketColor,
          s.odMm,
          s.ulNumber || '',
          s.coreColors,
          ...(s.conductorAreaMm2 === undefined ? [] : [s.conductorAreaMm2]),
        ]
      : [s.kind, s.awg, s.color, s.ulNumber];
  const tierKey = JSON.stringify(['wire', resId, JSON.stringify(specification), '元/条']);
  return index.wireTiersMap.get(tierKey) ?? [];
}

import type { HarnessConfig } from '@/types/harness';
import type { CatalogSnapshot } from '@/types/catalog';
import type { MaterialPrice } from '@/repositories/priceRepository';
import { applyCatalogWireSpec } from './wireCatalog';
import { resolveColor } from './canvasMaterials';

export interface QuoteMaterial {
  kind: 'connector' | 'wire' | 'outer-mold';
  resourceId: string;
  name: string;
  specification: string;
  lengthMm: number;
  unit: '元/个' | '元/条';
  quantity: number;
}

export function materialPriceKey(row: Omit<QuoteMaterial, 'name' | 'quantity'>): string {
  return JSON.stringify([row.kind, row.resourceId, row.specification, row.lengthMm, row.unit]);
}

/** Price-tier identity, intentionally excluding length so the quote can choose the next tier. */
export function materialPriceTierKey(row: Omit<QuoteMaterial, 'name' | 'quantity'>): string {
  return JSON.stringify([row.kind, row.resourceId, row.specification, row.unit]);
}

/** Business-facing text is independent of the internal exact-match key. */
export function formatMaterialSpecification(row: Omit<QuoteMaterial, 'quantity'>, includeLength = true): string {
  const fields: unknown[] = JSON.parse(row.specification);
  let tokens: unknown[];
  if (row.kind === 'connector') {
    const [model, series, pins, gender] = fields;
    tokens = [model, series, `${pins}Pin`, gender === 'male' ? '公头' : gender === 'female' ? '母头' : '插座'];
  } else if (row.kind === 'outer-mold') {
    tokens = [fields[0], fields[1], fields[2] === 'straight' ? '直头' : '弯头'];
  } else if (fields[0] === 'jacketed') {
    const [, awg, cores, shielded, jacket, color, od, ul, colors, area] = fields;
    tokens = [ul, jacket, `${cores}芯`, area == null ? `${awg}AWG` : `${area}mm²`, shielded ? '屏蔽' : '非屏蔽',
      color === 'black' ? '黑色' : '绿色', `OD${od}mm`,
      ...(colors as string[]).map((value) => resolveColor(value).name)];
  } else {
    tokens = [`UL${fields[3]}`, '电子线', `${fields[1]}AWG`, resolveColor(String(fields[2])).name];
  }
  if (row.kind === 'wire' && includeLength) tokens.push(`${row.lengthMm / 1000}m`);
  return tokens.filter((token) => token !== '' && token !== undefined).join(' ');
}

export function getPriceImportCandidates(config: HarnessConfig, catalog: CatalogSnapshot | null): QuoteMaterial[] {
  const current = getQuoteMaterials(config, catalog);
  if (!catalog) return current;
  const baseSpec = config.materials[0]?.spec ?? {
    kind: 'electronic' as const, awg: 24, color: '黑色', ulNumber: '1007' as const, lengthMm: 1000,
    endTreatment: { start: { stripped: false, termination: 'none' as const }, end: { stripped: false, termination: 'none' as const } },
  };
  const catalogConfig: HarnessConfig = { ...config,
    connectors: (catalog.connectors ?? []).map((connector) => ({ id: connector.id, connector, label: connector.name, position: { x: 0, y: 0 }, jumpers: [] })),
    materials: (catalog.wires ?? []).map((wire) => ({ id: wire.id, resourceItemId: wire.resourceItemId, name: wire.name,
      position: { x: 0, y: 0 }, width: 1, circuits: [], spec: applyCatalogWireSpec(baseSpec, wire.spec) })),
    models: catalog.overmolds.map((mold) => ({ id: mold.id, kind: 'outer-box', position: { x: 0, y: 0 }, width: 1, height: 1,
      overmoldSpecId: mold.id, includeInnerMold: false })),
  };
  return [...current, ...getQuoteMaterials(catalogConfig, catalog)];
}

// Processing and drawing attributes must not affect purchase prices.
export function getQuoteMaterials(config: HarnessConfig, catalog: CatalogSnapshot | null): QuoteMaterial[] {
  const rows: QuoteMaterial[] = config.connectors.map(({ connector: c }) => ({
    kind: 'connector', resourceId: c.resourceItemId || c.id, name: c.name,
    specification: JSON.stringify([c.model || '', c.series || '', c.pinCount, c.type]),
    lengthMm: 0, unit: '元/个', quantity: 1,
  }));
  for (const material of config.materials) {
    const s = material.spec;
    const specification = s.kind === 'jacketed'
      ? [s.kind, s.awg ?? null, s.coreCount, s.shielded, s.jacketMaterial, s.jacketColor, s.odMm, s.ulNumber || '', s.coreColors, ...(s.conductorAreaMm2 === undefined ? [] : [s.conductorAreaMm2])]
      : [s.kind, s.awg, s.color, s.ulNumber];
    rows.push({ kind: 'wire', resourceId: material.resourceItemId || '', name: material.name,
      specification: JSON.stringify(specification), lengthMm: s.lengthMm, unit: '元/条', quantity: 1 });
  }
  for (const model of config.models) {
    const spec = catalog?.overmolds.find((entry) => entry.id === model.overmoldSpecId);
    rows.push({ kind: 'outer-mold', resourceId: spec?.resourceItemId || model.resourceItemId || model.overmoldSpecId,
      name: spec?.name || model.overmoldSpecId,
      specification: spec ? JSON.stringify([spec.outerMaterial, spec.outerHardness || '', spec.outerForm]) : '',
      lengthMm: 0, unit: '元/个', quantity: 1 });
  }
  const grouped = new Map<string, QuoteMaterial>();
  for (const row of rows) {
    const key = materialPriceKey(row);
    const previous = grouped.get(key);
    if (previous) previous.quantity += row.quantity;
    else grouped.set(key, { ...row });
  }
  return [...grouped.values()];
}

/**
 * 从 Catalog 全量元器件生成标准报价物料候选（不依赖任何特定项目工程）。
 * 线材默认采用 1000mm (1米) 作为初始基准档位。
 */
export function getCatalogPriceCandidates(catalog: CatalogSnapshot | null): QuoteMaterial[] {
  if (!catalog) return [];
  const rows: QuoteMaterial[] = [];

  for (const c of catalog.connectors ?? []) {
    rows.push({
      kind: 'connector',
      resourceId: c.resourceItemId || c.id,
      name: c.name,
      specification: JSON.stringify([c.model || '', c.series || '', c.pinCount, c.type]),
      lengthMm: 0,
      unit: '元/个',
      quantity: 1,
    });
  }

  const baseSpec = {
    kind: 'electronic' as const,
    awg: 24,
    color: '黑色',
    ulNumber: '1007' as const,
    lengthMm: 1000,
    endTreatment: { start: { stripped: false, termination: 'none' as const }, end: { stripped: false, termination: 'none' as const } },
  };

  for (const wire of catalog.wires ?? []) {
    const s = applyCatalogWireSpec(baseSpec, wire.spec);
    const specification = s.kind === 'jacketed'
      ? [s.kind, s.awg ?? null, s.coreCount, s.shielded, s.jacketMaterial, s.jacketColor, s.odMm, s.ulNumber || '', s.coreColors, ...(s.conductorAreaMm2 === undefined ? [] : [s.conductorAreaMm2])]
      : [s.kind, s.awg, s.color, s.ulNumber];
    rows.push({
      kind: 'wire',
      resourceId: wire.resourceItemId || wire.id,
      name: wire.name,
      specification: JSON.stringify(specification),
      lengthMm: 1000,
      unit: '元/条',
      quantity: 1,
    });
  }

  for (const mold of catalog.overmolds ?? []) {
    rows.push({
      kind: 'outer-mold',
      resourceId: mold.resourceItemId || mold.id,
      name: mold.name,
      specification: JSON.stringify([mold.outerMaterial, mold.outerHardness || '', mold.outerForm]),
      lengthMm: 0,
      unit: '元/个',
      quantity: 1,
    });
  }

  return rows;
}

/**
 * 构造用于价格模板导出的全量物料列表：
 * 保证当前 Catalog 中的每个物料都至少存在一行（方便批量补价）；
 * 同时若价格库已维护了多个线长档位，将保留所有有效档位行。
 */
export function buildCatalogPriceTemplateRows(
  catalog: CatalogSnapshot | null,
  sharedPrices: MaterialPrice[],
): QuoteMaterial[] {
  const candidates = getCatalogPriceCandidates(catalog);
  if (!candidates.length) return [];

  const rows: QuoteMaterial[] = [];

  for (const candidate of candidates) {
    const tierKey = materialPriceTierKey(candidate);
    const matchedPrices = sharedPrices.filter((p) => materialPriceTierKey(p) === tierKey);

    if (matchedPrices.length > 0) {
      for (const p of matchedPrices) {
        rows.push({
          kind: candidate.kind,
          resourceId: candidate.resourceId,
          name: candidate.name,
          specification: candidate.specification,
          lengthMm: p.lengthMm,
          unit: candidate.unit,
          quantity: 1,
        });
      }
    } else {
      rows.push(candidate);
    }
  }

  const uniqueMap = new Map<string, QuoteMaterial>();
  for (const r of rows) {
    uniqueMap.set(materialPriceKey(r), r);
  }
  return [...uniqueMap.values()];
}

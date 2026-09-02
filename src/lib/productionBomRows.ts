import type {
  CanvasWireMaterial,
  ConnectorInstance,
  HarnessConfig,
  OvermoldSpec,
  ProtectiveSleeve,
} from '@/types/harness';
import type { CatalogSnapshot } from '@/types/catalog';
import { getCatalogSnapshot } from '@/lib/catalogRuntime';
import { formatWireBomSpecification } from '@/lib/bom';
import {
  getProtectiveSleeveDisplayName,
} from '@/lib/canvasMaterials';
import {
  formatOvermoldFullSpec,
  getAvailableInnerMold,
} from '@/lib/overmoldSpec';

export type BomTargetKind = 'material' | 'connector' | 'model' | 'sleeve';

export interface BomTargetRef {
  kind: BomTargetKind;
  id: string;
}

export type ProductionBomRowKind = 'wire' | 'connector' | 'outer-mold' | 'inner-mold' | 'accessory';

export interface ProductionBomRow {
  key: string;
  itemNo: number;
  kind: ProductionBomRowKind;
  name: string;
  specification: string;
  unit: string;
  quantity: number;
  targets: BomTargetRef[];
}

function getEndTreatmentKey(material: CanvasWireMaterial): string {
  const formatEnd = (key: 'start' | 'end') => {
    const end = material.spec.endTreatment[key];
    if (!end.stripped) return `${key}:none`;
    return `${key}:${end.stripLengthMm}:${end.termination}:${end.terminalModel ?? 'none'}`;
  };

  return `${formatEnd('start')}|${formatEnd('end')}`;
}

export function getWireGroupingKey(material: CanvasWireMaterial): string {
  const spec = material.spec;
  const resourceKey = material.resourceItemId ?? 'custom';
  if (spec.kind === 'electronic') {
    return `wire|${resourceKey}|${spec.awg}|${spec.color}|${spec.lengthMm}|${spec.ulNumber}|${getEndTreatmentKey(material)}`;
  }

  return `wire|${resourceKey}|${spec.jacketMaterial}|${spec.jacketColor}|${spec.awg}|${spec.coreCount}|${spec.shielded}|${spec.odMm}|${spec.outerDiameterToleranceMm ?? 'default'}|${spec.lengthMm}|${spec.ulNumber ?? 'none'}|${spec.coreColors.join(',')}|${getEndTreatmentKey(material)}`;
}

export function getSleeveGroupingKey(sleeve: ProtectiveSleeve): string {
  return [
    'sleeve',
    sleeve.type,
    sleeve.corrugatedMaterial ?? 'none',
    sleeve.lengthMm,
    sleeve.corrugatedFixing?.startHeatShrink ?? false,
    sleeve.corrugatedFixing?.endHeatShrink ?? false,
    sleeve.corrugatedFixing?.startDistanceMm ?? 0,
    sleeve.corrugatedFixing?.endDistanceMm ?? 0,
    sleeve.remark ?? '',
  ].join('|');
}

export function getSleeveCategoryName(sleeve: ProtectiveSleeve): string {
  if (sleeve.type === 'corrugated') return '波纹管';
  if (sleeve.type === 'braided') return '编织网管';
  if (sleeve.type === 'heat-shrink') return '热缩管';
  if (sleeve.type === 'acetate-cloth') return '醋酸布胶带';
  if (sleeve.type === 'fleece') return '绒布胶带';
  return '保护套管';
}

/**
 * Builds the canonical ProductionBomRow list shared between BOMTable,
 * ItemCalloutLayer, and layout calculations.
 */
export function buildProductionBomRows(
  config: HarnessConfig,
  overmolds: readonly OvermoldSpec[] = [],
  catalogSnapshot: CatalogSnapshot | null = getCatalogSnapshot(),
): ProductionBomRow[] {
  const rows: ProductionBomRow[] = [];

  // 1. Wires
  const wireGroups = new Map<
    string,
    {
      sample: CanvasWireMaterial;
      count: number;
      targets: BomTargetRef[];
    }
  >();

  for (const material of config.materials || []) {
    const key = getWireGroupingKey(material);
    const existing = wireGroups.get(key);
    if (existing) {
      existing.count += 1;
      existing.targets.push({ kind: 'material', id: material.id });
    } else {
      wireGroups.set(key, {
        sample: material,
        count: 1,
        targets: [{ kind: 'material', id: material.id }],
      });
    }
  }

  for (const [key, info] of wireGroups) {
    const specStr = formatWireBomSpecification(info.sample, catalogSnapshot);
    rows.push({
      key,
      itemNo: 0,
      kind: 'wire',
      name: '线材',
      specification: specStr,
      unit: 'PCS',
      quantity: info.count,
      targets: info.targets,
    });
  }

  // 2. Connectors
  const connGroups = new Map<
    string,
    {
      connector: ConnectorInstance['connector'];
      count: number;
      targets: BomTargetRef[];
    }
  >();

  for (const instance of config.connectors || []) {
    const conn = instance.connector;
    if (!conn) continue;
    const key = `conn|${conn.resourceItemId || conn.id}`;
    const existing = connGroups.get(key);
    if (existing) {
      existing.count += 1;
      existing.targets.push({ kind: 'connector', id: instance.id });
    } else {
      connGroups.set(key, {
        connector: conn,
        count: 1,
        targets: [{ kind: 'connector', id: instance.id }],
      });
    }
  }

  for (const [key, info] of connGroups) {
    const specCode = info.connector.model || info.connector.name || info.connector.id;
    rows.push({
      key,
      itemNo: 0,
      kind: 'connector',
      name: '连接器',
      specification: specCode,
      unit: 'PCS',
      quantity: info.count,
      targets: info.targets,
    });
  }

  // 3. Overmolds
  if (config.models && config.models.length > 0) {
    const specsById = new Map(overmolds.map((s) => [s.id, s]));
    const outerGroups = new Map<
      string,
      {
        specification: string;
        count: number;
        targets: BomTargetRef[];
      }
    >();
    const innerGroups = new Map<
      string,
      {
        specification: string;
        count: number;
        targets: BomTargetRef[];
      }
    >();

    for (const model of config.models) {
      const spec = specsById.get(model.overmoldSpecId);
      const outerSpecification = spec ? formatOvermoldFullSpec(spec) : model.overmoldSpecId;
      const outerKey = `outer-mold|${model.overmoldSpecId}`;
      const existingOuter = outerGroups.get(outerKey);
      if (existingOuter) {
        existingOuter.count += 1;
        existingOuter.targets.push({ kind: 'model', id: model.id });
      } else {
        outerGroups.set(outerKey, {
          specification: outerSpecification,
          count: 1,
          targets: [{ kind: 'model', id: model.id }],
        });
      }

      if (!model.includeInnerMold || !spec) continue;
      const innerMold = getAvailableInnerMold(spec);
      if (!innerMold) continue;
      const innerSpecification = `${innerMold.material} · ${innerMold.formLabel}`;
      const innerKey = `inner-mold|${innerSpecification}`;
      const existingInner = innerGroups.get(innerKey);
      if (existingInner) {
        existingInner.count += 1;
        existingInner.targets.push({ kind: 'model', id: model.id });
      } else {
        innerGroups.set(innerKey, {
          specification: innerSpecification,
          count: 1,
          targets: [{ kind: 'model', id: model.id }],
        });
      }
    }

    for (const [key, info] of outerGroups) {
      rows.push({
        key,
        itemNo: 0,
        kind: 'outer-mold',
        name: '外模料',
        specification: info.specification,
        unit: 'PCS',
        quantity: info.count,
        targets: info.targets,
      });
    }

    for (const [key, info] of innerGroups) {
      rows.push({
        key,
        itemNo: 0,
        kind: 'inner-mold',
        name: '内模料',
        specification: info.specification,
        unit: 'PCS',
        quantity: info.count,
        targets: info.targets,
      });
    }
  }

  // 4. Sleeves / Accessories
  const sleeveGroups = new Map<
    string,
    {
      sample: ProtectiveSleeve;
      count: number;
      targets: BomTargetRef[];
    }
  >();

  for (const sleeve of config.protectiveSleeves || []) {
    const key = getSleeveGroupingKey(sleeve);
    const existing = sleeveGroups.get(key);
    if (existing) {
      existing.count += 1;
      existing.targets.push({ kind: 'sleeve', id: sleeve.id });
    } else {
      sleeveGroups.set(key, {
        sample: sleeve,
        count: 1,
        targets: [{ kind: 'sleeve', id: sleeve.id }],
      });
    }
  }

  for (const [key, info] of sleeveGroups) {
    const specStr = `${getProtectiveSleeveDisplayName(info.sample)} ${info.sample.lengthMm}mm${info.sample.remark ? ` (${info.sample.remark})` : ''}`;
    rows.push({
      key,
      itemNo: 0,
      kind: 'accessory',
      name: getSleeveCategoryName(info.sample),
      specification: specStr,
      unit: 'PCS',
      quantity: info.count,
      targets: info.targets,
    });
  }

  // Assign sequential item numbers (1, 2, 3...)
  rows.forEach((row, idx) => {
    row.itemNo = idx + 1;
  });

  return rows;
}

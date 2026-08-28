import { parseCatalogWireSpec } from '@/lib/wireCatalog';
import type {
  OvermoldForm,
  OvermoldHardness,
  OvermoldInnerMaterial,
  OvermoldOuterMaterial,
  TemperatureRangeC,
} from '@/types/harness';
import type { CatalogWireEngineeringSpec } from '@/types/catalog';

export const CATALOG_ITEM_COLUMNS = 'id,kind,code,name,model,manufacturer,resource_group,description,image_path,image_variants,sort_order,spec';

export type CatalogItemKind =
  | 'connector'
  | 'wire'
  | 'protective_sleeve'
  | 'overmold'
  | 'model'
  | 'accessory'
  | 'packaging';

export interface CatalogItemSpecByKind {
  connector: {
    connectorType: 'male' | 'female' | 'receptacle';
    series?: string;
    pinCount: number;
    rowCount?: number;
    pitchMm?: number;
    pinLabels: string[];
    housingMaterial?: string;
    contactMaterial?: string;
    nutMaterial?: string;
    shielded?: boolean;
    ratedVoltageV?: number;
    ratedCurrentA?: number;
    temperatureRangeC?: TemperatureRangeC;
    ingressProtection?: string;
    flammabilityRating?: string;
    matingCyclesMin?: number;
  };
  wire:
    | ({
        kind: 'electronic';
        awg: number;
        ulNumber: '1007';
        conductorColor: string;
      } & CatalogWireEngineeringSpec)
    | ({
        kind: 'jacketed';
        awg: number;
        ulNumber?: 'UL2464' | 'UL20276';
        jacketMaterial: 'PVC' | 'PUR';
        jacketColor: 'black' | 'green';
        coreCount: number;
        shielded: boolean;
        coreColors: string[];
      } & CatalogWireEngineeringSpec);
  protective_sleeve: {
    sleeveType: string;
    material?: string;
    color?: string;
    shrinkRatio?: number;
    nominalLengthM?: number;
    suppliedInnerDiameterMm?: number;
    recoveredInnerDiameterMm?: number;
    recoveredWallThicknessMm?: number;
  };
  overmold: {
    outerMaterial: OvermoldOuterMaterial;
    outerHardness?: OvermoldHardness;
    outerForm: OvermoldForm;
    innerMaterial?: OvermoldInnerMaterial;
    innerForm?: OvermoldForm;
  };
  model: { modelKind: string };
  accessory: { specification: string; unit: string };
  packaging: { specification: string; unit: string };
}

type CatalogItemBase = {
  id: string;
  code: string;
  name: string;
  model: string;
  manufacturer: string;
  resource_group: string;
  description: string;
  image_path: string | null;
  image_variants: Record<string, string>;
  sort_order: number;
};

export type CatalogItemRow = {
  [K in CatalogItemKind]: CatalogItemBase & { kind: K; spec: CatalogItemSpecByKind[K] };
}[CatalogItemKind];

export type CatalogItemInsert = Omit<CatalogItemRow, 'id'>;

type UnknownRow = Record<string, unknown>;

export class CatalogItemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogItemError';
  }
}

function object(value: unknown, field: string): UnknownRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CatalogItemError(`目录字段 ${field} 无效。`);
  }
  return value as UnknownRow;
}

function imageVariants(value: unknown): Record<string, string> {
  if (value === undefined || value === null) return {};
  const source = object(value, 'image_variants');
  const result: Record<string, string> = {};
  for (const [key, path] of Object.entries(source)) {
    if (typeof path !== 'string' || !path.trim()) {
      throw new CatalogItemError(`目录字段 image_variants.${key} 无效。`);
    }
    result[key] = path;
  }
  return result;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CatalogItemError(`目录字段 ${field} 无效。`);
  }
  return value;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new CatalogItemError(`目录字段 ${field} 无效。`);
  return value;
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredText(value, field);
}

function positiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new CatalogItemError(`目录字段 ${field} 无效。`);
  }
  return value;
}

function optionalPositiveNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return positiveNumber(value, field);
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new CatalogItemError(`目录字段 ${field} 无效。`);
  return value;
}

function optionalPositiveInteger(value: unknown, field: string): number | undefined {
  const parsed = optionalPositiveNumber(value, field);
  if (parsed !== undefined && !Number.isInteger(parsed)) {
    throw new CatalogItemError(`目录字段 ${field} 无效。`);
  }
  return parsed;
}

function temperatureRange(value: unknown, field: string): TemperatureRangeC | undefined {
  if (value === undefined || value === null) return undefined;
  const source = object(value, field);
  const readBound = (bound: unknown, boundField: string): number | undefined => {
    if (bound === undefined || bound === null) return undefined;
    if (typeof bound !== 'number' || !Number.isFinite(bound)) {
      throw new CatalogItemError(`目录字段 ${boundField} 无效。`);
    }
    return bound;
  };
  const min = readBound(source.min, `${field}.min`);
  const max = readBound(source.max, `${field}.max`);
  if (min === undefined && max === undefined) {
    throw new CatalogItemError(`目录字段 ${field} 无效。`);
  }
  if (min !== undefined && max !== undefined && min > max) {
    throw new CatalogItemError(`目录字段 ${field} 无效。`);
  }
  return {
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
  };
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new CatalogItemError(`目录字段 ${field} 无效。`);
  }
  return [...value];
}

function parseSpec(kind: CatalogItemKind, value: unknown): CatalogItemSpecByKind[CatalogItemKind] {
  const spec = object(value, 'spec');

  if (kind === 'connector') {
    const connectorType = spec.connectorType;
    if (connectorType !== 'male' && connectorType !== 'female' && connectorType !== 'receptacle') {
      throw new CatalogItemError('目录字段 spec.connectorType 无效。');
    }
    const pinCount = optionalPositiveInteger(spec.pinCount, 'spec.pinCount');
    if (pinCount === undefined) throw new CatalogItemError('目录字段 spec.pinCount 无效。');
    const pinLabels = stringArray(spec.pinLabels, 'spec.pinLabels');
    if (pinLabels.length !== pinCount) throw new CatalogItemError('目录字段 spec.pinLabels 数量无效。');
    const shielded = optionalBoolean(spec.shielded, 'spec.shielded');
    const ratedVoltageV = optionalPositiveNumber(spec.ratedVoltageV, 'spec.ratedVoltageV');
    const ratedCurrentA = optionalPositiveNumber(spec.ratedCurrentA, 'spec.ratedCurrentA');
    const temperatureRangeC = temperatureRange(spec.temperatureRangeC, 'spec.temperatureRangeC');
    const ingressProtection = optionalText(spec.ingressProtection, 'spec.ingressProtection');
    const flammabilityRating = optionalText(spec.flammabilityRating, 'spec.flammabilityRating');
    const matingCyclesMin = optionalPositiveInteger(spec.matingCyclesMin, 'spec.matingCyclesMin');
    return {
      connectorType,
      series: optionalText(spec.series, 'spec.series'),
      pinCount,
      rowCount: optionalPositiveInteger(spec.rowCount, 'spec.rowCount'),
      pitchMm: optionalPositiveNumber(spec.pitchMm, 'spec.pitchMm'),
      pinLabels,
      housingMaterial: optionalText(spec.housingMaterial, 'spec.housingMaterial'),
      contactMaterial: optionalText(spec.contactMaterial, 'spec.contactMaterial'),
      nutMaterial: optionalText(spec.nutMaterial, 'spec.nutMaterial'),
      ...(shielded === undefined ? {} : { shielded }),
      ...(ratedVoltageV === undefined ? {} : { ratedVoltageV }),
      ...(ratedCurrentA === undefined ? {} : { ratedCurrentA }),
      ...(temperatureRangeC === undefined ? {} : { temperatureRangeC }),
      ...(ingressProtection === undefined ? {} : { ingressProtection }),
      ...(flammabilityRating === undefined ? {} : { flammabilityRating }),
      ...(matingCyclesMin === undefined ? {} : { matingCyclesMin }),
    };
  }

  if (kind === 'wire') {
    try {
      const parsed = parseCatalogWireSpec({
        wire_kind: spec.kind,
        awg: spec.awg,
        ul_number: spec.ulNumber ?? null,
        conductor_color: spec.kind === 'electronic' ? spec.conductorColor : null,
        jacket_material: spec.kind === 'jacketed' ? spec.jacketMaterial : null,
        jacket_color: spec.kind === 'jacketed' ? spec.jacketColor : null,
        core_count: spec.kind === 'jacketed' ? spec.coreCount : null,
        is_shielded: spec.kind === 'jacketed' ? spec.shielded : false,
        core_colors: spec.kind === 'jacketed' ? spec.coreColors : [],
        rated_voltage_v: spec.ratedVoltageV,
        temperature_range_c: spec.temperatureRangeC,
        flame_test: spec.flameTest,
        rohs_compliant: spec.rohsCompliant,
        conductor_material: spec.conductorMaterial,
        conductor_structure: spec.conductorStructure,
        insulation_material: spec.insulationMaterial,
        insulation_diameter_mm: spec.insulationDiameterMm,
        insulation_diameter_tolerance_mm: spec.insulationDiameterToleranceMm,
        braid_structure: spec.braidStructure,
        braid_structure_description: spec.braidStructureDescription,
        shield_coverage_ratio: spec.shieldCoverageRatio,
        shield_coverage_description: spec.shieldCoverageDescription,
        jacket_hardness_p: spec.jacketHardnessP,
        outer_diameter_mm: spec.outerDiameterMm,
        outer_diameter_tolerance_mm: spec.outerDiameterToleranceMm,
        tensile_strength_psi: spec.tensileStrengthPsi,
        elongation_percent: spec.elongationPercent,
        conductor_resistance_ohm_per_km_at_20c: spec.conductorResistanceOhmPerKmAt20C,
        insulation_resistance_mohm_km: spec.insulationResistanceMOhmKm,
        core_color_description: spec.coreColorDescription,
      });
      return parsed.kind === 'electronic'
        ? {
            kind: parsed.kind,
            awg: parsed.awg,
            ulNumber: parsed.ulNumber,
            conductorColor: parsed.color,
            ...engineeringFields(parsed),
          }
        : {
            kind: parsed.kind,
            awg: parsed.awg,
            ...(parsed.ulNumber ? { ulNumber: parsed.ulNumber } : {}),
            jacketMaterial: parsed.jacketMaterial,
            jacketColor: parsed.jacketColor,
            coreCount: parsed.coreCount,
            shielded: parsed.shielded,
            coreColors: [...parsed.coreColors],
            ...engineeringFields(parsed),
          };
    } catch {
      throw new CatalogItemError('目录字段 spec 线材规格无效。');
    }
  }

  if (kind === 'protective_sleeve') {
    return {
      sleeveType: requiredText(spec.sleeveType, 'spec.sleeveType'),
      material: optionalText(spec.material, 'spec.material'),
      color: optionalText(spec.color, 'spec.color'),
      shrinkRatio: optionalPositiveNumber(spec.shrinkRatio, 'spec.shrinkRatio'),
      nominalLengthM: optionalPositiveNumber(spec.nominalLengthM, 'spec.nominalLengthM'),
      suppliedInnerDiameterMm: optionalPositiveNumber(spec.suppliedInnerDiameterMm, 'spec.suppliedInnerDiameterMm'),
      recoveredInnerDiameterMm: optionalPositiveNumber(spec.recoveredInnerDiameterMm, 'spec.recoveredInnerDiameterMm'),
      recoveredWallThicknessMm: optionalPositiveNumber(spec.recoveredWallThicknessMm, 'spec.recoveredWallThicknessMm'),
    };
  }

  if (kind === 'overmold') {
    if (spec.innerMaterialOptional !== undefined) {
      throw new CatalogItemError('目录字段 spec.innerMaterialOptional 已废弃。');
    }
    const outerMaterialText = requiredText(spec.outerMaterial, 'spec.outerMaterial');
    if (outerMaterialText !== '黑色PVC' && outerMaterialText !== '黑色TPE') {
      throw new CatalogItemError('目录字段 spec.outerMaterial 无效。');
    }
    const outerMaterial = outerMaterialText as OvermoldOuterMaterial;

    const outerFormText = requiredText(spec.outerForm, 'spec.outerForm');
    if (outerFormText !== 'straight' && outerFormText !== 'bent') {
      throw new CatalogItemError('目录字段 spec.outerForm 必须为 straight 或 bent。');
    }
    const outerForm = outerFormText as OvermoldForm;

    let outerHardness: OvermoldHardness | undefined;
    if (outerMaterial === '黑色PVC') {
      if (requiredText(spec.outerHardness, 'spec.outerHardness') !== '45P') {
        throw new CatalogItemError('黑色PVC外模的 spec.outerHardness 必须为 45P。');
      }
      outerHardness = '45P';
    } else if (spec.outerHardness !== undefined) {
      throw new CatalogItemError('黑色TPE外模不能包含 spec.outerHardness。');
    }

    const hasInnerMaterial = spec.innerMaterial !== undefined;
    const hasInnerForm = spec.innerForm !== undefined;
    if (hasInnerMaterial !== hasInnerForm) {
      throw new CatalogItemError('目录字段 spec.innerMaterial 和 spec.innerForm 必须同时存在或同时省略。');
    }

    let innerMaterial: OvermoldInnerMaterial | undefined;
    let innerForm: OvermoldForm | undefined;
    if (hasInnerMaterial && hasInnerForm) {
      if (requiredText(spec.innerMaterial, 'spec.innerMaterial') !== '低密度透明PE') {
        throw new CatalogItemError('目录字段 spec.innerMaterial 无效。');
      }
      const innerFormText = requiredText(spec.innerForm, 'spec.innerForm');
      if (innerFormText !== outerForm) {
        throw new CatalogItemError('目录字段 spec.innerForm 必须与 spec.outerForm 一致。');
      }
      innerMaterial = '低密度透明PE';
      innerForm = outerForm;
    }

    return {
      outerMaterial,
      ...(outerHardness ? { outerHardness } : {}),
      outerForm,
      ...(innerMaterial && innerForm ? { innerMaterial, innerForm } : {}),
    };
  }

  if (kind === 'model') {
    return { modelKind: requiredText(spec.modelKind, 'spec.modelKind') };
  }

  return {
    specification: requiredText(spec.specification, 'spec.specification'),
    unit: requiredText(spec.unit, 'spec.unit'),
  };
}

function engineeringFields(spec: CatalogWireEngineeringSpec): CatalogWireEngineeringSpec {
  return {
    ...(spec.ratedVoltageV === undefined ? {} : { ratedVoltageV: spec.ratedVoltageV }),
    ...(spec.temperatureRangeC === undefined ? {} : { temperatureRangeC: { ...spec.temperatureRangeC } }),
    ...(spec.flameTest === undefined ? {} : { flameTest: spec.flameTest }),
    ...(spec.rohsCompliant === undefined ? {} : { rohsCompliant: spec.rohsCompliant }),
    ...(spec.conductorMaterial === undefined ? {} : { conductorMaterial: spec.conductorMaterial }),
    ...(spec.conductorStructure === undefined ? {} : { conductorStructure: spec.conductorStructure }),
    ...(spec.insulationMaterial === undefined ? {} : { insulationMaterial: spec.insulationMaterial }),
    ...(spec.insulationDiameterMm === undefined ? {} : { insulationDiameterMm: spec.insulationDiameterMm }),
    ...(spec.insulationDiameterToleranceMm === undefined ? {} : { insulationDiameterToleranceMm: spec.insulationDiameterToleranceMm }),
    ...(spec.braidStructure === undefined ? {} : { braidStructure: spec.braidStructure }),
    ...(spec.braidStructureDescription === undefined ? {} : { braidStructureDescription: spec.braidStructureDescription }),
    ...(spec.shieldCoverageRatio === undefined ? {} : { shieldCoverageRatio: spec.shieldCoverageRatio }),
    ...(spec.shieldCoverageDescription === undefined ? {} : { shieldCoverageDescription: spec.shieldCoverageDescription }),
    ...(spec.jacketHardnessP === undefined ? {} : { jacketHardnessP: spec.jacketHardnessP }),
    ...(spec.outerDiameterMm === undefined ? {} : { outerDiameterMm: spec.outerDiameterMm }),
    ...(spec.outerDiameterToleranceMm === undefined ? {} : { outerDiameterToleranceMm: spec.outerDiameterToleranceMm }),
    ...(spec.tensileStrengthPsi === undefined ? {} : { tensileStrengthPsi: spec.tensileStrengthPsi }),
    ...(spec.elongationPercent === undefined ? {} : { elongationPercent: spec.elongationPercent }),
    ...(spec.conductorResistanceOhmPerKmAt20C === undefined ? {} : { conductorResistanceOhmPerKmAt20C: spec.conductorResistanceOhmPerKmAt20C }),
    ...(spec.insulationResistanceMOhmKm === undefined ? {} : { insulationResistanceMOhmKm: spec.insulationResistanceMOhmKm }),
    ...(spec.coreColorDescription === undefined ? {} : { coreColorDescription: spec.coreColorDescription }),
  };
}

export function parseCatalogItemRow(value: unknown): CatalogItemRow {
  const row = object(value, 'row');
  const kind = row.kind;
  if (kind !== 'connector' && kind !== 'wire' && kind !== 'protective_sleeve'
    && kind !== 'overmold' && kind !== 'model' && kind !== 'accessory' && kind !== 'packaging') {
    throw new CatalogItemError('目录字段 kind 无效。');
  }
  if (row.image_path !== null && row.image_path !== undefined && typeof row.image_path !== 'string') {
    throw new CatalogItemError('目录字段 image_path 无效。');
  }
  const variants = imageVariants(row.image_variants);
  if (typeof row.sort_order !== 'number' || !Number.isInteger(row.sort_order) || row.sort_order < 0) {
    throw new CatalogItemError('目录字段 sort_order 无效。');
  }

  return {
    id: requiredText(row.id, 'id'),
    kind,
    code: requiredText(row.code, 'code'),
    name: requiredText(row.name, 'name'),
    model: requiredText(row.model, 'model'),
    manufacturer: text(row.manufacturer, 'manufacturer'),
    resource_group: text(row.resource_group, 'resource_group'),
    description: text(row.description, 'description'),
    image_path: typeof row.image_path === 'string' ? row.image_path : null,
    image_variants: variants,
    sort_order: row.sort_order,
    spec: parseSpec(kind, row.spec),
  } as CatalogItemRow;
}

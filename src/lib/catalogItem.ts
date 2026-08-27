import { parseCatalogWireSpec } from '@/lib/wireCatalog';
import type {
  OvermoldForm,
  OvermoldHardness,
  OvermoldInnerMaterial,
  OvermoldOuterMaterial,
} from '@/types/harness';

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
  };
  wire:
    | {
        kind: 'electronic';
        awg: number;
        ulNumber: '1007';
        conductorColor: string;
      }
    | {
        kind: 'jacketed';
        awg: number;
        ulNumber?: 'UL2464' | 'UL20276';
        jacketMaterial: 'PVC' | 'PUR';
        jacketColor: 'black' | 'green';
        coreCount: number;
        shielded: boolean;
        coreColors: string[];
      };
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
    const pinCount = positiveNumber(spec.pinCount, 'spec.pinCount');
    const pinLabels = stringArray(spec.pinLabels, 'spec.pinLabels');
    if (pinLabels.length !== pinCount) throw new CatalogItemError('目录字段 spec.pinLabels 数量无效。');
    return {
      connectorType,
      series: optionalText(spec.series, 'spec.series'),
      pinCount,
      rowCount: optionalPositiveNumber(spec.rowCount, 'spec.rowCount'),
      pitchMm: optionalPositiveNumber(spec.pitchMm, 'spec.pitchMm'),
      pinLabels,
      housingMaterial: optionalText(spec.housingMaterial, 'spec.housingMaterial'),
      contactMaterial: optionalText(spec.contactMaterial, 'spec.contactMaterial'),
      nutMaterial: optionalText(spec.nutMaterial, 'spec.nutMaterial'),
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
      });
      return parsed.kind === 'electronic'
        ? {
            kind: parsed.kind,
            awg: parsed.awg,
            ulNumber: parsed.ulNumber,
            conductorColor: parsed.color,
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

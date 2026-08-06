import { calculateCableOd } from '@/lib/canvasMaterials';
import type {
  CanvasWireSpec,
  JacketCoreCount,
  JacketMaterial,
  JacketColor,
  JacketUlNumber,
} from '@/types/harness';
import type { CatalogWireSpec } from '@/types/catalog';

export type CatalogWireRow = Record<string, unknown>;

const JACKET_CORE_COUNTS: JacketCoreCount[] = [
  1, 2, 3, 4, 5, 6, 8, 12, 17, 20, 24, 30, 32, 40, 50,
];
const JACKET_MATERIALS: JacketMaterial[] = ['PVC', 'PUR'];
const JACKET_COLORS: JacketColor[] = ['black', 'green'];
const JACKET_UL_NUMBERS: JacketUlNumber[] = ['UL2464', 'UL20276'];

export class WireCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WireCatalogError';
  }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function positiveNumber(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new WireCatalogError(`invalid ${field}`);
  }
  return parsed;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new WireCatalogError(`invalid ${field}`);
  }
  return value;
}

export function parseCatalogWireSpec(row: CatalogWireRow): CatalogWireSpec {
  const kind = text(row.wire_kind);
  if (kind !== 'electronic' && kind !== 'jacketed') {
    throw new WireCatalogError('invalid wire kind');
  }
  const awg = positiveNumber(row.awg, 'awg');

  if (kind === 'electronic') {
    if (row.ul_number !== '1007') throw new WireCatalogError('invalid electronic UL number');
    const color = text(row.conductor_color);
    if (!color
      || (row.jacket_material !== null && row.jacket_material !== undefined)
      || (row.jacket_color !== null && row.jacket_color !== undefined)
      || (row.core_count !== null && row.core_count !== undefined)) {
      throw new WireCatalogError('invalid electronic wire fields');
    }
    if (row.is_shielded !== false) throw new WireCatalogError('invalid electronic shielded flag');
    const coreColors = stringArray(row.core_colors, 'core colors');
    if (coreColors.length !== 0) throw new WireCatalogError('invalid electronic core colors');
    return { kind, color, awg, ulNumber: '1007' };
  }

  if (kind === 'jacketed') {
    const jacketMaterial = text(row.jacket_material);
    const jacketColor = text(row.jacket_color);
    const coreCount = Number(row.core_count);
    const ulNumber = row.ul_number === null || row.ul_number === undefined || row.ul_number === ''
      ? undefined
      : text(row.ul_number);
    if (!jacketMaterial || !JACKET_MATERIALS.includes(jacketMaterial as JacketMaterial)) {
      throw new WireCatalogError('invalid jacket material');
    }
    if (!jacketColor || !JACKET_COLORS.includes(jacketColor as JacketColor)) {
      throw new WireCatalogError('invalid jacket color');
    }
    if (!JACKET_CORE_COUNTS.includes(coreCount as JacketCoreCount)) {
      throw new WireCatalogError('invalid core count');
    }
    if (ulNumber !== undefined && !JACKET_UL_NUMBERS.includes(ulNumber as JacketUlNumber)) {
      throw new WireCatalogError('invalid jacketed UL number');
    }
    if (row.conductor_color !== null && row.conductor_color !== undefined) {
      throw new WireCatalogError('invalid jacketed conductor color');
    }
    if (typeof row.is_shielded !== 'boolean') throw new WireCatalogError('invalid shielded flag');
    const coreColors = stringArray(row.core_colors, 'core colors');
    if (coreColors.length !== coreCount) throw new WireCatalogError('core colors do not match core count');
    return {
      kind,
      jacketMaterial: jacketMaterial as JacketMaterial,
      jacketColor: jacketColor as JacketColor,
      awg,
      coreCount: coreCount as JacketCoreCount,
      shielded: row.is_shielded,
      coreColors,
      ...(ulNumber ? { ulNumber: ulNumber as JacketUlNumber } : {}),
    };
  }

  throw new WireCatalogError('invalid wire kind');
}

export function applyCatalogWireSpec(current: CanvasWireSpec, catalog: CatalogWireSpec): CanvasWireSpec {
  if (catalog.kind === 'electronic') {
    return {
      kind: 'electronic',
      color: catalog.color,
      awg: catalog.awg,
      ulNumber: catalog.ulNumber,
      lengthMm: current.lengthMm,
      endTreatment: current.endTreatment,
    };
  }

  return {
    kind: 'jacketed',
    jacketMaterial: catalog.jacketMaterial,
    jacketColor: catalog.jacketColor,
    awg: catalog.awg,
    coreCount: catalog.coreCount,
    shielded: catalog.shielded,
    odMm: calculateCableOd(catalog.awg, catalog.coreCount, catalog.shielded),
    coreColors: [...catalog.coreColors],
    endTreatment: current.endTreatment,
    lengthMm: current.lengthMm,
    ...(catalog.ulNumber ? { ulNumber: catalog.ulNumber } : {}),
  };
}

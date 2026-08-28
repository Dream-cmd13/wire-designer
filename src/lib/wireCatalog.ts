import { calculateCableOd, resolveColor } from '@/lib/canvasMaterials';
import type {
  CanvasWireSpec,
  JacketCoreCount,
  JacketMaterial,
  JacketColor,
  JacketUlNumber,
  TemperatureRangeC,
} from '@/types/harness';
import type { CatalogWire, CatalogWireEngineeringSpec, CatalogWireSpec } from '@/types/catalog';

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

function text(value: unknown, field = 'text'): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new WireCatalogError(`invalid ${field}`);
  }
  return value;
}

function positiveNumber(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new WireCatalogError(`invalid ${field}`);
  }
  return parsed;
}

function optionalPositiveNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return positiveNumber(value, field);
}

function optionalNonNegativeNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new WireCatalogError(`invalid ${field}`);
  }
  return parsed;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new WireCatalogError(`invalid ${field}`);
  return value;
}

function temperatureRange(value: unknown, field: string): TemperatureRangeC | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new WireCatalogError(`invalid ${field}`);
  }
  const source = value as Record<string, unknown>;
  const parsedMin = source.min === undefined || source.min === null
    ? undefined
    : typeof source.min === 'number' && Number.isFinite(source.min)
      ? source.min
      : (() => {
          const parsed = Number(source.min);
          if (!Number.isFinite(parsed)) throw new WireCatalogError(`invalid ${field}.min`);
          return parsed;
        })();
  const max = source.max === undefined || source.max === null
    ? undefined
    : typeof source.max === 'number' && Number.isFinite(source.max)
      ? source.max
      : (() => {
          const parsed = Number(source.max);
          if (!Number.isFinite(parsed)) throw new WireCatalogError(`invalid ${field}.max`);
          return parsed;
        })();
  if (parsedMin === undefined && max === undefined) {
    throw new WireCatalogError(`invalid ${field}`);
  }
  if (parsedMin !== undefined && max !== undefined && parsedMin > max) {
    throw new WireCatalogError(`invalid ${field}`);
  }
  return {
    ...(parsedMin === undefined ? {} : { min: parsedMin }),
    ...(max === undefined ? {} : { max }),
  };
}

function engineeringSpec(row: CatalogWireRow): CatalogWireEngineeringSpec {
  const ratedVoltageV = optionalPositiveNumber(row.rated_voltage_v, 'rated voltage');
  const temperatureRangeC = temperatureRange(row.temperature_range_c, 'temperature range');
  const flameTest = text(row.flame_test, 'flame test');
  const rohsCompliant = optionalBoolean(row.rohs_compliant, 'ROHS flag');
  const conductorMaterial = text(row.conductor_material, 'conductor material');
  const conductorStructure = text(row.conductor_structure, 'conductor structure');
  const insulationMaterial = text(row.insulation_material, 'insulation material');
  const insulationDiameterMm = optionalPositiveNumber(row.insulation_diameter_mm, 'insulation diameter');
  const insulationDiameterToleranceMm = optionalPositiveNumber(row.insulation_diameter_tolerance_mm, 'insulation diameter tolerance');
  const braidStructure = text(row.braid_structure, 'braid structure');
  const braidStructureDescription = text(row.braid_structure_description, 'braid structure description');
  const shieldCoverageRatio = optionalNonNegativeNumber(row.shield_coverage_ratio, 'shield coverage ratio');
  if (shieldCoverageRatio !== undefined && shieldCoverageRatio > 1) {
    throw new WireCatalogError('invalid shield coverage ratio');
  }
  const shieldCoverageDescription = text(row.shield_coverage_description, 'shield coverage description');
  const jacketHardnessP = optionalPositiveNumber(row.jacket_hardness_p, 'jacket hardness');
  const outerDiameterMm = optionalPositiveNumber(row.outer_diameter_mm, 'outer diameter');
  const outerDiameterToleranceMm = optionalPositiveNumber(row.outer_diameter_tolerance_mm, 'outer diameter tolerance');
  const tensileStrengthPsi = optionalPositiveNumber(row.tensile_strength_psi, 'tensile strength');
  const elongationPercent = optionalNonNegativeNumber(row.elongation_percent, 'elongation');
  const conductorResistanceOhmPerKmAt20C = optionalPositiveNumber(row.conductor_resistance_ohm_per_km_at_20c, 'conductor resistance');
  const insulationResistanceMOhmKm = optionalPositiveNumber(row.insulation_resistance_mohm_km, 'insulation resistance');
  const coreColorDescription = text(row.core_color_description, 'core color description');

  return {
    ...(ratedVoltageV === undefined ? {} : { ratedVoltageV }),
    ...(temperatureRangeC === undefined ? {} : { temperatureRangeC }),
    ...(flameTest === undefined ? {} : { flameTest }),
    ...(rohsCompliant === undefined ? {} : { rohsCompliant }),
    ...(conductorMaterial === undefined ? {} : { conductorMaterial }),
    ...(conductorStructure === undefined ? {} : { conductorStructure }),
    ...(insulationMaterial === undefined ? {} : { insulationMaterial }),
    ...(insulationDiameterMm === undefined ? {} : { insulationDiameterMm }),
    ...(insulationDiameterToleranceMm === undefined ? {} : { insulationDiameterToleranceMm }),
    ...(braidStructure === undefined ? {} : { braidStructure }),
    ...(braidStructureDescription === undefined ? {} : { braidStructureDescription }),
    ...(shieldCoverageRatio === undefined ? {} : { shieldCoverageRatio }),
    ...(shieldCoverageDescription === undefined ? {} : { shieldCoverageDescription }),
    ...(jacketHardnessP === undefined ? {} : { jacketHardnessP }),
    ...(outerDiameterMm === undefined ? {} : { outerDiameterMm }),
    ...(outerDiameterToleranceMm === undefined ? {} : { outerDiameterToleranceMm }),
    ...(tensileStrengthPsi === undefined ? {} : { tensileStrengthPsi }),
    ...(elongationPercent === undefined ? {} : { elongationPercent }),
    ...(conductorResistanceOhmPerKmAt20C === undefined ? {} : { conductorResistanceOhmPerKmAt20C }),
    ...(insulationResistanceMOhmKm === undefined ? {} : { insulationResistanceMOhmKm }),
    ...(coreColorDescription === undefined ? {} : { coreColorDescription }),
  };
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new WireCatalogError(`invalid ${field}`);
  }
  return value;
}

export function parseCatalogWireSpec(row: CatalogWireRow): CatalogWireSpec {
  const kind = text(row.wire_kind, 'wire kind');
  if (kind !== 'electronic' && kind !== 'jacketed') {
    throw new WireCatalogError('invalid wire kind');
  }
  const awg = positiveNumber(row.awg, 'awg');
  const engineering = engineeringSpec(row);

  if (kind === 'electronic') {
    if (row.ul_number !== '1007') throw new WireCatalogError('invalid electronic UL number');
    const color = text(row.conductor_color, 'conductor color');
    if (!color
      || (row.jacket_material !== null && row.jacket_material !== undefined)
      || (row.jacket_color !== null && row.jacket_color !== undefined)
      || (row.core_count !== null && row.core_count !== undefined)) {
      throw new WireCatalogError('invalid electronic wire fields');
    }
    if (row.is_shielded !== false) throw new WireCatalogError('invalid electronic shielded flag');
    const coreColors = stringArray(row.core_colors, 'core colors');
    if (coreColors.length !== 0) throw new WireCatalogError('invalid electronic core colors');
    return { kind, color, awg, ulNumber: '1007', ...engineering };
  }

  if (kind === 'jacketed') {
    const jacketMaterial = text(row.jacket_material, 'jacket material');
    const jacketColor = text(row.jacket_color, 'jacket color');
    const coreCount = Number(row.core_count);
    const ulNumber = row.ul_number === null || row.ul_number === undefined || row.ul_number === ''
      ? undefined
      : text(row.ul_number, 'UL number');
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
      ...engineering,
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
    odMm: catalog.outerDiameterMm
      ?? calculateCableOd(catalog.awg, catalog.coreCount, catalog.shielded),
    ...(catalog.outerDiameterToleranceMm === undefined
      ? {}
      : { outerDiameterToleranceMm: catalog.outerDiameterToleranceMm }),
    coreColors: [...catalog.coreColors],
    endTreatment: current.endTreatment,
    lengthMm: current.lengthMm,
    ...(catalog.ulNumber ? { ulNumber: catalog.ulNumber } : {}),
  };
}

export function generateWireDefaultName(spec: CanvasWireSpec): string {
  if (spec.kind === 'electronic') {
    const colorName = resolveColor(spec.color).name;
    const ul = spec.ulNumber ? `UL${spec.ulNumber} ` : '';
    return `${ul}${spec.awg}AWG ${colorName}电子线`;
  }
  const jacketColorName = spec.jacketColor === 'black' ? '黑色' : spec.jacketColor === 'green' ? '绿色' : spec.jacketColor;
  const shieldedText = spec.shielded ? '屏蔽' : '';
  const ul = spec.ulNumber ? `${spec.ulNumber} ` : '';
  return `${ul}${spec.jacketMaterial} ${spec.awg}AWG ${spec.coreCount}芯 ${jacketColorName}${shieldedText}护套线`.replace(/\s+/g, ' ').trim();
}

export function findMatchingCatalogWire(
  catalogWires: CatalogWire[],
  spec: CanvasWireSpec,
): CatalogWire | undefined {
  if (spec.kind === 'electronic') {
    return catalogWires.find((wire) => {
      if (wire.spec.kind !== 'electronic') return false;
      if (wire.spec.awg !== spec.awg) return false;
      const colorMatches = wire.spec.color === spec.color || resolveColor(wire.spec.color).name === resolveColor(spec.color).name;
      if (!colorMatches) return false;
      if (spec.ulNumber && wire.spec.ulNumber && wire.spec.ulNumber !== spec.ulNumber) return false;
      return true;
    });
  }

  if (spec.kind === 'jacketed') {
    return catalogWires.find((wire) => {
      if (wire.spec.kind !== 'jacketed') return false;
      if (wire.spec.jacketMaterial !== spec.jacketMaterial) return false;
      if (wire.spec.jacketColor !== spec.jacketColor) return false;
      if (wire.spec.awg !== spec.awg) return false;
      if (wire.spec.coreCount !== spec.coreCount) return false;
      if (wire.spec.shielded !== spec.shielded) return false;
      const specUl = spec.ulNumber || undefined;
      const wireUl = wire.spec.ulNumber || undefined;
      if (specUl !== wireUl) return false;
      return true;
    });
  }

  return undefined;
}

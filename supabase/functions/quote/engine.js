// src/lib/canvasMaterials.ts
var CORE_COLOR_OPTIONS = [
  "\u7EA2\u8272",
  "\u9ED1\u8272",
  "\u767D\u8272",
  "\u7EFF\u8272",
  "\u9EC4\u8272",
  "\u84DD\u8272",
  "\u68D5\u8272",
  "\u6A59\u8272",
  "\u7070\u8272",
  "\u7D2B\u8272",
  "\u91D1\u8272",
  "\u7C89\u8272",
  "\u9EC4\u6CE8\u7EFF",
  "\u6D45\u84DD\u8272",
  "\u9EC4\u7EFF\u8272",
  "\u7C73\u767D\u8272",
  "\u6DF1\u84DD\u8272",
  "\u6D45\u7EFF\u8272",
  "\u7A7A\u767D",
  "\u900F\u660E"
];
var CORE_COLOR_SEQUENCE = [...CORE_COLOR_OPTIONS];
var CANVAS_MATERIAL_STRIP_TOP = 0;
var CANVAS_MATERIAL_STRIP_PADDING_Y = 6;
var CANVAS_MATERIAL_STRIP_HEIGHT = 10;
var CANVAS_MATERIAL_SLEEVE_CENTER_Y = CANVAS_MATERIAL_STRIP_TOP + CANVAS_MATERIAL_STRIP_PADDING_Y + CANVAS_MATERIAL_STRIP_HEIGHT / 2;
function calculateCableOd(awg, coreCount, shielded) {
  const safeAwg = Math.min(40, Math.max(4, awg));
  const conductorDiameter = 0.127 * Math.pow(92, (36 - safeAwg) / 39);
  const insulatedCoreDiameter = conductorDiameter * 1.35 + 0.45;
  const bundleDiameter = insulatedCoreDiameter * Math.sqrt(coreCount) * 1.12;
  const estimatedOd = bundleDiameter + 1.55 + (shielded ? 0.35 : 0);
  return Math.round(estimatedOd * 100) / 100;
}

// src/lib/wireGauge.ts
function isValidWireGauge(spec) {
  const positive = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
  return spec.conductorAreaMm2 !== void 0 ? positive(spec.conductorAreaMm2) && spec.awg === void 0 : positive(spec.awg);
}
function geometryAwg(spec) {
  if (spec.conductorAreaMm2 !== void 0) {
    const diameter = Math.sqrt(4 * spec.conductorAreaMm2 / Math.PI);
    return 36 - 39 * Math.log(diameter / 0.127) / Math.log(92);
  }
  return spec.awg;
}

// src/lib/wireCatalog.ts
var JACKET_CORE_COUNTS = [
  1,
  2,
  3,
  4,
  5,
  6,
  8,
  12,
  17,
  20,
  24,
  30,
  32,
  40,
  50
];
var JACKET_MATERIALS = ["PVC", "PUR"];
var JACKET_COLORS = ["black", "green"];
var JACKET_UL_NUMBERS = ["UL2464", "UL20276"];
var WireCatalogError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "WireCatalogError";
  }
};
function text(value, field = "text") {
  if (value === void 0 || value === null || value === "") return void 0;
  if (typeof value !== "string" || !value.trim()) {
    throw new WireCatalogError(`invalid ${field}`);
  }
  return value;
}
function positiveNumber(value, field) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new WireCatalogError(`invalid ${field}`);
  }
  return parsed;
}
function optionalPositiveNumber(value, field) {
  if (value === void 0 || value === null || value === "") return void 0;
  return positiveNumber(value, field);
}
function optionalNonNegativeNumber(value, field) {
  if (value === void 0 || value === null || value === "") return void 0;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new WireCatalogError(`invalid ${field}`);
  }
  return parsed;
}
function optionalBoolean(value, field) {
  if (value === void 0 || value === null) return void 0;
  if (typeof value !== "boolean") throw new WireCatalogError(`invalid ${field}`);
  return value;
}
function temperatureRange(value, field) {
  if (value === void 0 || value === null) return void 0;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new WireCatalogError(`invalid ${field}`);
  }
  const source = value;
  const parsedMin = source.min === void 0 || source.min === null ? void 0 : typeof source.min === "number" && Number.isFinite(source.min) ? source.min : (() => {
    const parsed = Number(source.min);
    if (!Number.isFinite(parsed)) throw new WireCatalogError(`invalid ${field}.min`);
    return parsed;
  })();
  const max2 = source.max === void 0 || source.max === null ? void 0 : typeof source.max === "number" && Number.isFinite(source.max) ? source.max : (() => {
    const parsed = Number(source.max);
    if (!Number.isFinite(parsed)) throw new WireCatalogError(`invalid ${field}.max`);
    return parsed;
  })();
  if (parsedMin === void 0 && max2 === void 0) {
    throw new WireCatalogError(`invalid ${field}`);
  }
  if (parsedMin !== void 0 && max2 !== void 0 && parsedMin > max2) {
    throw new WireCatalogError(`invalid ${field}`);
  }
  return {
    ...parsedMin === void 0 ? {} : { min: parsedMin },
    ...max2 === void 0 ? {} : { max: max2 }
  };
}
function engineeringSpec(row) {
  const ingressProtection = text(row.ingress_protection, "ingress protection");
  const ratedVoltageV = optionalPositiveNumber(row.rated_voltage_v, "rated voltage");
  const temperatureRangeC = temperatureRange(row.temperature_range_c, "temperature range");
  const flameTest = text(row.flame_test, "flame test");
  const rohsCompliant = optionalBoolean(row.rohs_compliant, "ROHS flag");
  const conductorMaterial = text(row.conductor_material, "conductor material");
  const conductorStructure = text(row.conductor_structure, "conductor structure");
  const insulationMaterial = text(row.insulation_material, "insulation material");
  const insulationDiameterMm = optionalPositiveNumber(row.insulation_diameter_mm, "insulation diameter");
  const insulationDiameterToleranceMm = optionalPositiveNumber(row.insulation_diameter_tolerance_mm, "insulation diameter tolerance");
  const braidStructure = text(row.braid_structure, "braid structure");
  const braidStructureDescription = text(row.braid_structure_description, "braid structure description");
  const shieldCoverageRatio = optionalNonNegativeNumber(row.shield_coverage_ratio, "shield coverage ratio");
  if (shieldCoverageRatio !== void 0 && shieldCoverageRatio > 1) {
    throw new WireCatalogError("invalid shield coverage ratio");
  }
  const shieldCoverageDescription = text(row.shield_coverage_description, "shield coverage description");
  const jacketHardnessP = optionalPositiveNumber(row.jacket_hardness_p, "jacket hardness");
  const outerDiameterMm = optionalPositiveNumber(row.outer_diameter_mm, "outer diameter");
  const outerDiameterToleranceMm = optionalPositiveNumber(row.outer_diameter_tolerance_mm, "outer diameter tolerance");
  const tensileStrengthPsi = optionalPositiveNumber(row.tensile_strength_psi, "tensile strength");
  const elongationPercent = optionalNonNegativeNumber(row.elongation_percent, "elongation");
  const conductorResistanceOhmPerKmAt20C = optionalPositiveNumber(row.conductor_resistance_ohm_per_km_at_20c, "conductor resistance");
  const insulationResistanceMOhmKm = optionalPositiveNumber(row.insulation_resistance_mohm_km, "insulation resistance");
  const coreColorDescription = text(row.core_color_description, "core color description");
  return {
    ...ingressProtection === void 0 ? {} : { ingressProtection },
    ...ratedVoltageV === void 0 ? {} : { ratedVoltageV },
    ...temperatureRangeC === void 0 ? {} : { temperatureRangeC },
    ...flameTest === void 0 ? {} : { flameTest },
    ...rohsCompliant === void 0 ? {} : { rohsCompliant },
    ...conductorMaterial === void 0 ? {} : { conductorMaterial },
    ...conductorStructure === void 0 ? {} : { conductorStructure },
    ...insulationMaterial === void 0 ? {} : { insulationMaterial },
    ...insulationDiameterMm === void 0 ? {} : { insulationDiameterMm },
    ...insulationDiameterToleranceMm === void 0 ? {} : { insulationDiameterToleranceMm },
    ...braidStructure === void 0 ? {} : { braidStructure },
    ...braidStructureDescription === void 0 ? {} : { braidStructureDescription },
    ...shieldCoverageRatio === void 0 ? {} : { shieldCoverageRatio },
    ...shieldCoverageDescription === void 0 ? {} : { shieldCoverageDescription },
    ...jacketHardnessP === void 0 ? {} : { jacketHardnessP },
    ...outerDiameterMm === void 0 ? {} : { outerDiameterMm },
    ...outerDiameterToleranceMm === void 0 ? {} : { outerDiameterToleranceMm },
    ...tensileStrengthPsi === void 0 ? {} : { tensileStrengthPsi },
    ...elongationPercent === void 0 ? {} : { elongationPercent },
    ...conductorResistanceOhmPerKmAt20C === void 0 ? {} : { conductorResistanceOhmPerKmAt20C },
    ...insulationResistanceMOhmKm === void 0 ? {} : { insulationResistanceMOhmKm },
    ...coreColorDescription === void 0 ? {} : { coreColorDescription }
  };
}
function stringArray(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new WireCatalogError(`invalid ${field}`);
  }
  return value;
}
function parseCatalogWireSpec(row) {
  const kind = text(row.wire_kind, "wire kind");
  if (kind !== "electronic" && kind !== "jacketed") {
    throw new WireCatalogError("invalid wire kind");
  }
  const awg = optionalPositiveNumber(row.awg, "awg");
  const conductorAreaMm2 = optionalPositiveNumber(row.conductor_area_mm2, "conductor area");
  if (!isValidWireGauge({ awg, conductorAreaMm2 })) throw new WireCatalogError("invalid wire gauge");
  const engineering = engineeringSpec(row);
  if (kind === "electronic") {
    if (awg === void 0 || conductorAreaMm2 !== void 0) throw new WireCatalogError("electronic wire requires AWG");
    if (row.ul_number !== "1007") throw new WireCatalogError("invalid electronic UL number");
    const color = text(row.conductor_color, "conductor color");
    if (!color || row.jacket_material !== null && row.jacket_material !== void 0 || row.jacket_color !== null && row.jacket_color !== void 0 || row.core_count !== null && row.core_count !== void 0) {
      throw new WireCatalogError("invalid electronic wire fields");
    }
    if (row.is_shielded !== false) throw new WireCatalogError("invalid electronic shielded flag");
    const coreColors = stringArray(row.core_colors, "core colors");
    if (coreColors.length !== 0) throw new WireCatalogError("invalid electronic core colors");
    return { kind, color, awg, ulNumber: "1007", ...engineering };
  }
  if (kind === "jacketed") {
    const jacketMaterial = text(row.jacket_material, "jacket material");
    const jacketColor = text(row.jacket_color, "jacket color");
    const coreCount = Number(row.core_count);
    const ulNumber = row.ul_number === null || row.ul_number === void 0 || row.ul_number === "" ? void 0 : text(row.ul_number, "UL number");
    if (!jacketMaterial || !JACKET_MATERIALS.includes(jacketMaterial)) {
      throw new WireCatalogError("invalid jacket material");
    }
    if (!jacketColor || !JACKET_COLORS.includes(jacketColor)) {
      throw new WireCatalogError("invalid jacket color");
    }
    if (!JACKET_CORE_COUNTS.includes(coreCount)) {
      throw new WireCatalogError("invalid core count");
    }
    if (ulNumber !== void 0 && !JACKET_UL_NUMBERS.includes(ulNumber)) {
      throw new WireCatalogError("invalid jacketed UL number");
    }
    if (row.conductor_color !== null && row.conductor_color !== void 0) {
      throw new WireCatalogError("invalid jacketed conductor color");
    }
    if (typeof row.is_shielded !== "boolean") throw new WireCatalogError("invalid shielded flag");
    const coreColors = stringArray(row.core_colors, "core colors");
    if (coreColors.length !== coreCount) throw new WireCatalogError("core colors do not match core count");
    return {
      kind,
      jacketMaterial,
      jacketColor,
      awg,
      coreCount,
      ...conductorAreaMm2 === void 0 ? {} : { conductorAreaMm2 },
      shielded: row.is_shielded,
      coreColors,
      ...ulNumber ? { ulNumber } : {},
      ...engineering
    };
  }
  throw new WireCatalogError("invalid wire kind");
}
function applyCatalogWireSpec(current, catalog) {
  if (catalog.kind === "electronic") {
    return {
      kind: "electronic",
      color: catalog.color,
      awg: catalog.awg,
      ulNumber: catalog.ulNumber,
      lengthMm: current.lengthMm,
      endTreatment: current.endTreatment
    };
  }
  return {
    kind: "jacketed",
    jacketMaterial: catalog.jacketMaterial,
    jacketColor: catalog.jacketColor,
    awg: catalog.awg,
    coreCount: catalog.coreCount,
    ...catalog.conductorAreaMm2 === void 0 ? {} : { conductorAreaMm2: catalog.conductorAreaMm2 },
    shielded: catalog.shielded,
    odMm: catalog.outerDiameterMm ?? calculateCableOd(geometryAwg(catalog), catalog.coreCount, catalog.shielded),
    ...catalog.outerDiameterToleranceMm === void 0 ? {} : { outerDiameterToleranceMm: catalog.outerDiameterToleranceMm },
    coreColors: [...catalog.coreColors],
    endTreatment: current.endTreatment,
    lengthMm: current.lengthMm,
    ...catalog.ulNumber ? { ulNumber: catalog.ulNumber } : {}
  };
}

// src/lib/catalogItem.ts
var CatalogItemError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "CatalogItemError";
  }
};
function object(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CatalogItemError(`\u76EE\u5F55\u5B57\u6BB5 ${field} \u65E0\u6548\u3002`);
  }
  return value;
}
function imageVariants(value) {
  if (value === void 0 || value === null) return {};
  const source = object(value, "image_variants");
  const result = {};
  for (const [key, path] of Object.entries(source)) {
    if (typeof path !== "string" || !path.trim()) {
      throw new CatalogItemError(`\u76EE\u5F55\u5B57\u6BB5 image_variants.${key} \u65E0\u6548\u3002`);
    }
    result[key] = path;
  }
  return result;
}
function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new CatalogItemError(`\u76EE\u5F55\u5B57\u6BB5 ${field} \u65E0\u6548\u3002`);
  }
  return value;
}
function text2(value, field) {
  if (typeof value !== "string") throw new CatalogItemError(`\u76EE\u5F55\u5B57\u6BB5 ${field} \u65E0\u6548\u3002`);
  return value;
}
function optionalText(value, field) {
  if (value === void 0 || value === null || value === "") return void 0;
  return requiredText(value, field);
}
function positiveNumber2(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new CatalogItemError(`\u76EE\u5F55\u5B57\u6BB5 ${field} \u65E0\u6548\u3002`);
  }
  return value;
}
function optionalPositiveNumber2(value, field) {
  if (value === void 0 || value === null) return void 0;
  return positiveNumber2(value, field);
}
function optionalBoolean2(value, field) {
  if (value === void 0 || value === null) return void 0;
  if (typeof value !== "boolean") throw new CatalogItemError(`\u76EE\u5F55\u5B57\u6BB5 ${field} \u65E0\u6548\u3002`);
  return value;
}
function optionalPositiveInteger(value, field) {
  const parsed = optionalPositiveNumber2(value, field);
  if (parsed !== void 0 && !Number.isInteger(parsed)) {
    throw new CatalogItemError(`\u76EE\u5F55\u5B57\u6BB5 ${field} \u65E0\u6548\u3002`);
  }
  return parsed;
}
function temperatureRange2(value, field) {
  if (value === void 0 || value === null) return void 0;
  const source = object(value, field);
  const readBound = (bound, boundField) => {
    if (bound === void 0 || bound === null) return void 0;
    if (typeof bound !== "number" || !Number.isFinite(bound)) {
      throw new CatalogItemError(`\u76EE\u5F55\u5B57\u6BB5 ${boundField} \u65E0\u6548\u3002`);
    }
    return bound;
  };
  const min2 = readBound(source.min, `${field}.min`);
  const max2 = readBound(source.max, `${field}.max`);
  if (min2 === void 0 && max2 === void 0) {
    throw new CatalogItemError(`\u76EE\u5F55\u5B57\u6BB5 ${field} \u65E0\u6548\u3002`);
  }
  if (min2 !== void 0 && max2 !== void 0 && min2 > max2) {
    throw new CatalogItemError(`\u76EE\u5F55\u5B57\u6BB5 ${field} \u65E0\u6548\u3002`);
  }
  return {
    ...min2 === void 0 ? {} : { min: min2 },
    ...max2 === void 0 ? {} : { max: max2 }
  };
}
function stringArray2(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new CatalogItemError(`\u76EE\u5F55\u5B57\u6BB5 ${field} \u65E0\u6548\u3002`);
  }
  return [...value];
}
function parseSpec(kind, value) {
  const spec = object(value, "spec");
  if (kind === "connector") {
    const connectorType = spec.connectorType;
    if (connectorType !== "male" && connectorType !== "female" && connectorType !== "receptacle") {
      throw new CatalogItemError("\u76EE\u5F55\u5B57\u6BB5 spec.connectorType \u65E0\u6548\u3002");
    }
    const pinCount = optionalPositiveInteger(spec.pinCount, "spec.pinCount");
    if (pinCount === void 0) throw new CatalogItemError("\u76EE\u5F55\u5B57\u6BB5 spec.pinCount \u65E0\u6548\u3002");
    const pinLabels = spec.pinLabels === void 0 ? Array.from({ length: pinCount }, (_, i) => String(i + 1)) : stringArray2(spec.pinLabels, "spec.pinLabels");
    if (pinLabels.length !== pinCount) throw new CatalogItemError("\u76EE\u5F55\u5B57\u6BB5 spec.pinLabels \u6570\u91CF\u65E0\u6548\u3002");
    const shielded = optionalBoolean2(spec.shielded, "spec.shielded");
    const ratedVoltageV = optionalPositiveNumber2(spec.ratedVoltageV, "spec.ratedVoltageV");
    const ratedCurrentA = optionalPositiveNumber2(spec.ratedCurrentA, "spec.ratedCurrentA");
    const temperatureRangeC = temperatureRange2(spec.temperatureRangeC, "spec.temperatureRangeC");
    const ingressProtection = optionalText(spec.ingressProtection, "spec.ingressProtection");
    const flammabilityRating = optionalText(spec.flammabilityRating, "spec.flammabilityRating");
    const matingCyclesMin = optionalPositiveInteger(spec.matingCyclesMin, "spec.matingCyclesMin");
    return {
      connectorType,
      series: optionalText(spec.series, "spec.series"),
      pinCount,
      rowCount: optionalPositiveInteger(spec.rowCount, "spec.rowCount"),
      pitchMm: optionalPositiveNumber2(spec.pitchMm, "spec.pitchMm"),
      pinLabels,
      housingMaterial: optionalText(spec.housingMaterial, "spec.housingMaterial"),
      contactMaterial: optionalText(spec.contactMaterial, "spec.contactMaterial"),
      nutMaterial: optionalText(spec.nutMaterial, "spec.nutMaterial"),
      ...shielded === void 0 ? {} : { shielded },
      ...ratedVoltageV === void 0 ? {} : { ratedVoltageV },
      ...ratedCurrentA === void 0 ? {} : { ratedCurrentA },
      ...temperatureRangeC === void 0 ? {} : { temperatureRangeC },
      ...ingressProtection === void 0 ? {} : { ingressProtection },
      ...flammabilityRating === void 0 ? {} : { flammabilityRating },
      ...matingCyclesMin === void 0 ? {} : { matingCyclesMin }
    };
  }
  if (kind === "wire") {
    try {
      const parsed = parseCatalogWireSpec({
        wire_kind: spec.kind,
        awg: spec.awg,
        conductor_area_mm2: spec.kind === "jacketed" ? spec.conductorAreaMm2 : void 0,
        ul_number: spec.ulNumber ?? null,
        conductor_color: spec.kind === "electronic" ? spec.conductorColor : null,
        jacket_material: spec.kind === "jacketed" ? spec.jacketMaterial : null,
        jacket_color: spec.kind === "jacketed" ? spec.jacketColor : null,
        core_count: spec.kind === "jacketed" ? spec.coreCount : null,
        is_shielded: spec.kind === "jacketed" ? spec.shielded : false,
        core_colors: spec.kind === "jacketed" ? spec.coreColors : [],
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
        ingress_protection: spec.ingressProtection
      });
      return parsed.kind === "electronic" ? {
        kind: parsed.kind,
        awg: parsed.awg,
        ulNumber: parsed.ulNumber,
        conductorColor: parsed.color,
        ...engineeringFields(parsed)
      } : {
        kind: parsed.kind,
        awg: parsed.awg,
        ...parsed.ulNumber ? { ulNumber: parsed.ulNumber } : {},
        ...parsed.conductorAreaMm2 === void 0 ? {} : { conductorAreaMm2: parsed.conductorAreaMm2 },
        jacketMaterial: parsed.jacketMaterial,
        jacketColor: parsed.jacketColor,
        coreCount: parsed.coreCount,
        shielded: parsed.shielded,
        coreColors: [...parsed.coreColors],
        ...engineeringFields(parsed)
      };
    } catch {
      throw new CatalogItemError("\u76EE\u5F55\u5B57\u6BB5 spec \u7EBF\u6750\u89C4\u683C\u65E0\u6548\u3002");
    }
  }
  if (kind === "protective_sleeve") {
    return {
      sleeveType: requiredText(spec.sleeveType, "spec.sleeveType"),
      material: optionalText(spec.material, "spec.material"),
      color: optionalText(spec.color, "spec.color"),
      shrinkRatio: optionalPositiveNumber2(spec.shrinkRatio, "spec.shrinkRatio"),
      nominalLengthM: optionalPositiveNumber2(spec.nominalLengthM, "spec.nominalLengthM"),
      suppliedInnerDiameterMm: optionalPositiveNumber2(spec.suppliedInnerDiameterMm, "spec.suppliedInnerDiameterMm"),
      recoveredInnerDiameterMm: optionalPositiveNumber2(spec.recoveredInnerDiameterMm, "spec.recoveredInnerDiameterMm"),
      recoveredWallThicknessMm: optionalPositiveNumber2(spec.recoveredWallThicknessMm, "spec.recoveredWallThicknessMm")
    };
  }
  if (kind === "overmold") {
    if (spec.innerMaterialOptional !== void 0) {
      throw new CatalogItemError("\u76EE\u5F55\u5B57\u6BB5 spec.innerMaterialOptional \u5DF2\u5E9F\u5F03\u3002");
    }
    const outerMaterialText = requiredText(spec.outerMaterial, "spec.outerMaterial");
    if (outerMaterialText !== "\u9ED1\u8272PVC" && outerMaterialText !== "\u9ED1\u8272TPE") {
      throw new CatalogItemError("\u76EE\u5F55\u5B57\u6BB5 spec.outerMaterial \u65E0\u6548\u3002");
    }
    const outerMaterial = outerMaterialText;
    const outerFormText = requiredText(spec.outerForm, "spec.outerForm");
    if (outerFormText !== "straight" && outerFormText !== "bent") {
      throw new CatalogItemError("\u76EE\u5F55\u5B57\u6BB5 spec.outerForm \u5FC5\u987B\u4E3A straight \u6216 bent\u3002");
    }
    const outerForm = outerFormText;
    let outerHardness;
    if (outerMaterial === "\u9ED1\u8272PVC") {
      if (requiredText(spec.outerHardness, "spec.outerHardness") !== "45P") {
        throw new CatalogItemError("\u9ED1\u8272PVC\u5916\u6A21\u7684 spec.outerHardness \u5FC5\u987B\u4E3A 45P\u3002");
      }
      outerHardness = "45P";
    } else if (spec.outerHardness !== void 0) {
      throw new CatalogItemError("\u9ED1\u8272TPE\u5916\u6A21\u4E0D\u80FD\u5305\u542B spec.outerHardness\u3002");
    }
    const hasInnerMaterial = spec.innerMaterial !== void 0;
    const hasInnerForm = spec.innerForm !== void 0;
    if (hasInnerMaterial !== hasInnerForm) {
      throw new CatalogItemError("\u76EE\u5F55\u5B57\u6BB5 spec.innerMaterial \u548C spec.innerForm \u5FC5\u987B\u540C\u65F6\u5B58\u5728\u6216\u540C\u65F6\u7701\u7565\u3002");
    }
    let innerMaterial;
    let innerForm;
    if (hasInnerMaterial && hasInnerForm) {
      if (requiredText(spec.innerMaterial, "spec.innerMaterial") !== "\u4F4E\u5BC6\u5EA6\u900F\u660EPE") {
        throw new CatalogItemError("\u76EE\u5F55\u5B57\u6BB5 spec.innerMaterial \u65E0\u6548\u3002");
      }
      const innerFormText = requiredText(spec.innerForm, "spec.innerForm");
      if (innerFormText !== outerForm) {
        throw new CatalogItemError("\u76EE\u5F55\u5B57\u6BB5 spec.innerForm \u5FC5\u987B\u4E0E spec.outerForm \u4E00\u81F4\u3002");
      }
      innerMaterial = "\u4F4E\u5BC6\u5EA6\u900F\u660EPE";
      innerForm = outerForm;
    }
    return {
      outerMaterial,
      ...outerHardness ? { outerHardness } : {},
      outerForm,
      ...innerMaterial && innerForm ? { innerMaterial, innerForm } : {}
    };
  }
  if (kind === "model") {
    return { modelKind: requiredText(spec.modelKind, "spec.modelKind") };
  }
  return {
    specification: requiredText(spec.specification, "spec.specification"),
    unit: requiredText(spec.unit, "spec.unit")
  };
}
function engineeringFields(spec) {
  return {
    ...spec.ratedVoltageV === void 0 ? {} : { ratedVoltageV: spec.ratedVoltageV },
    ...spec.temperatureRangeC === void 0 ? {} : { temperatureRangeC: { ...spec.temperatureRangeC } },
    ...spec.flameTest === void 0 ? {} : { flameTest: spec.flameTest },
    ...spec.rohsCompliant === void 0 ? {} : { rohsCompliant: spec.rohsCompliant },
    ...spec.conductorMaterial === void 0 ? {} : { conductorMaterial: spec.conductorMaterial },
    ...spec.conductorStructure === void 0 ? {} : { conductorStructure: spec.conductorStructure },
    ...spec.insulationMaterial === void 0 ? {} : { insulationMaterial: spec.insulationMaterial },
    ...spec.insulationDiameterMm === void 0 ? {} : { insulationDiameterMm: spec.insulationDiameterMm },
    ...spec.insulationDiameterToleranceMm === void 0 ? {} : { insulationDiameterToleranceMm: spec.insulationDiameterToleranceMm },
    ...spec.braidStructure === void 0 ? {} : { braidStructure: spec.braidStructure },
    ...spec.braidStructureDescription === void 0 ? {} : { braidStructureDescription: spec.braidStructureDescription },
    ...spec.shieldCoverageRatio === void 0 ? {} : { shieldCoverageRatio: spec.shieldCoverageRatio },
    ...spec.shieldCoverageDescription === void 0 ? {} : { shieldCoverageDescription: spec.shieldCoverageDescription },
    ...spec.jacketHardnessP === void 0 ? {} : { jacketHardnessP: spec.jacketHardnessP },
    ...spec.outerDiameterMm === void 0 ? {} : { outerDiameterMm: spec.outerDiameterMm },
    ...spec.outerDiameterToleranceMm === void 0 ? {} : { outerDiameterToleranceMm: spec.outerDiameterToleranceMm },
    ...spec.tensileStrengthPsi === void 0 ? {} : { tensileStrengthPsi: spec.tensileStrengthPsi },
    ...spec.elongationPercent === void 0 ? {} : { elongationPercent: spec.elongationPercent },
    ...spec.conductorResistanceOhmPerKmAt20C === void 0 ? {} : { conductorResistanceOhmPerKmAt20C: spec.conductorResistanceOhmPerKmAt20C },
    ...spec.insulationResistanceMOhmKm === void 0 ? {} : { insulationResistanceMOhmKm: spec.insulationResistanceMOhmKm },
    ...spec.coreColorDescription === void 0 ? {} : { coreColorDescription: spec.coreColorDescription },
    ...spec.ingressProtection === void 0 ? {} : { ingressProtection: spec.ingressProtection }
  };
}
function parseCatalogItemRow(value) {
  const row = object(value, "row");
  const kind = row.kind;
  if (kind !== "connector" && kind !== "wire" && kind !== "protective_sleeve" && kind !== "overmold" && kind !== "model" && kind !== "accessory" && kind !== "packaging") {
    throw new CatalogItemError("\u76EE\u5F55\u5B57\u6BB5 kind \u65E0\u6548\u3002");
  }
  if (row.image_path !== null && row.image_path !== void 0 && typeof row.image_path !== "string") {
    throw new CatalogItemError("\u76EE\u5F55\u5B57\u6BB5 image_path \u65E0\u6548\u3002");
  }
  const variants = imageVariants(row.image_variants);
  if (typeof row.sort_order !== "number" || !Number.isInteger(row.sort_order) || row.sort_order < 0) {
    throw new CatalogItemError("\u76EE\u5F55\u5B57\u6BB5 sort_order \u65E0\u6548\u3002");
  }
  return {
    id: requiredText(row.id, "id"),
    kind,
    code: requiredText(row.code, "code"),
    name: requiredText(row.name, "name"),
    model: requiredText(row.model, "model"),
    supplier_id: typeof row.supplier_id === "string" ? row.supplier_id : null,
    supplier_no: typeof row.supplier_no === "string" && row.supplier_no.trim() ? row.supplier_no.trim() : row.supplier && typeof row.supplier === "object" && !Array.isArray(row.supplier) && typeof row.supplier.supplier_no === "string" ? row.supplier.supplier_no.trim() : null,
    resource_group: text2(row.resource_group, "resource_group"),
    description: text2(row.description, "description"),
    image_path: typeof row.image_path === "string" ? row.image_path : null,
    image_variants: variants,
    sort_order: row.sort_order,
    spec: parseSpec(kind, row.spec)
  };
}

// src/lib/permissions.ts
var canViewPricing = (role) => role === "engineer" || role === "admin";

// node_modules/decimal.js/decimal.mjs
var EXP_LIMIT = 9e15;
var MAX_DIGITS = 1e9;
var NUMERALS = "0123456789abcdef";
var LN10 = "2.3025850929940456840179914546843642076011014886287729760333279009675726096773524802359972050895982983419677840422862486334095254650828067566662873690987816894829072083255546808437998948262331985283935053089653777326288461633662222876982198867465436674744042432743651550489343149393914796194044002221051017141748003688084012647080685567743216228355220114804663715659121373450747856947683463616792101806445070648000277502684916746550586856935673420670581136429224554405758925724208241314695689016758940256776311356919292033376587141660230105703089634572075440370847469940168269282808481184289314848524948644871927809676271275775397027668605952496716674183485704422507197965004714951050492214776567636938662976979522110718264549734772662425709429322582798502585509785265383207606726317164309505995087807523710333101197857547331541421808427543863591778117054309827482385045648019095610299291824318237525357709750539565187697510374970888692180205189339507238539205144634197265287286965110862571492198849978748873771345686209167058";
var PI = "3.1415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679821480865132823066470938446095505822317253594081284811174502841027019385211055596446229489549303819644288109756659334461284756482337867831652712019091456485669234603486104543266482133936072602491412737245870066063155881748815209209628292540917153643678925903600113305305488204665213841469519415116094330572703657595919530921861173819326117931051185480744623799627495673518857527248912279381830119491298336733624406566430860213949463952247371907021798609437027705392171762931767523846748184676694051320005681271452635608277857713427577896091736371787214684409012249534301465495853710507922796892589235420199561121290219608640344181598136297747713099605187072113499999983729780499510597317328160963185950244594553469083026425223082533446850352619311881710100031378387528865875332083814206171776691473035982534904287554687311595628638823537875937519577818577805321712268066130019278766111959092164201989380952572010654858632789";
var DEFAULTS = {
  // These values must be integers within the stated ranges (inclusive).
  // Most of these values can be changed at run-time using the `Decimal.config` method.
  // The maximum number of significant digits of the result of a calculation or base conversion.
  // E.g. `Decimal.config({ precision: 20 });`
  precision: 20,
  // 1 to MAX_DIGITS
  // The rounding mode used when rounding to `precision`.
  //
  // ROUND_UP         0 Away from zero.
  // ROUND_DOWN       1 Towards zero.
  // ROUND_CEIL       2 Towards +Infinity.
  // ROUND_FLOOR      3 Towards -Infinity.
  // ROUND_HALF_UP    4 Towards nearest neighbour. If equidistant, up.
  // ROUND_HALF_DOWN  5 Towards nearest neighbour. If equidistant, down.
  // ROUND_HALF_EVEN  6 Towards nearest neighbour. If equidistant, towards even neighbour.
  // ROUND_HALF_CEIL  7 Towards nearest neighbour. If equidistant, towards +Infinity.
  // ROUND_HALF_FLOOR 8 Towards nearest neighbour. If equidistant, towards -Infinity.
  //
  // E.g.
  // `Decimal.rounding = 4;`
  // `Decimal.rounding = Decimal.ROUND_HALF_UP;`
  rounding: 4,
  // 0 to 8
  // The modulo mode used when calculating the modulus: a mod n.
  // The quotient (q = a / n) is calculated according to the corresponding rounding mode.
  // The remainder (r) is calculated as: r = a - n * q.
  //
  // UP         0 The remainder is positive if the dividend is negative, else is negative.
  // DOWN       1 The remainder has the same sign as the dividend (JavaScript %).
  // FLOOR      3 The remainder has the same sign as the divisor (Python %).
  // HALF_EVEN  6 The IEEE 754 remainder function.
  // EUCLID     9 Euclidian division. q = sign(n) * floor(a / abs(n)). Always positive.
  //
  // Truncated division (1), floored division (3), the IEEE 754 remainder (6), and Euclidian
  // division (9) are commonly used for the modulus operation. The other rounding modes can also
  // be used, but they may not give useful results.
  modulo: 1,
  // 0 to 9
  // The exponent value at and beneath which `toString` returns exponential notation.
  // JavaScript numbers: -7
  toExpNeg: -7,
  // 0 to -EXP_LIMIT
  // The exponent value at and above which `toString` returns exponential notation.
  // JavaScript numbers: 21
  toExpPos: 21,
  // 0 to EXP_LIMIT
  // The minimum exponent value, beneath which underflow to zero occurs.
  // JavaScript numbers: -324  (5e-324)
  minE: -EXP_LIMIT,
  // -1 to -EXP_LIMIT
  // The maximum exponent value, above which overflow to Infinity occurs.
  // JavaScript numbers: 308  (1.7976931348623157e+308)
  maxE: EXP_LIMIT,
  // 1 to EXP_LIMIT
  // Whether to use cryptographically-secure random number generation, if available.
  crypto: false
  // true/false
};
var inexact;
var quadrant;
var external = true;
var decimalError = "[DecimalError] ";
var invalidArgument = decimalError + "Invalid argument: ";
var precisionLimitExceeded = decimalError + "Precision limit exceeded";
var cryptoUnavailable = decimalError + "crypto unavailable";
var tag = "[object Decimal]";
var mathfloor = Math.floor;
var mathpow = Math.pow;
var isBinary = /^0b([01]+(\.[01]*)?|\.[01]+)(p[+-]?\d+)?$/i;
var isHex = /^0x([0-9a-f]+(\.[0-9a-f]*)?|\.[0-9a-f]+)(p[+-]?\d+)?$/i;
var isOctal = /^0o([0-7]+(\.[0-7]*)?|\.[0-7]+)(p[+-]?\d+)?$/i;
var isDecimal = /^(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;
var BASE = 1e7;
var LOG_BASE = 7;
var MAX_SAFE_INTEGER = 9007199254740991;
var LN10_PRECISION = LN10.length - 1;
var PI_PRECISION = PI.length - 1;
var P = { toStringTag: tag };
P.absoluteValue = P.abs = function() {
  var x = new this.constructor(this);
  if (x.s < 0) x.s = 1;
  return finalise(x);
};
P.ceil = function() {
  return finalise(new this.constructor(this), this.e + 1, 2);
};
P.clampedTo = P.clamp = function(min2, max2) {
  var k, x = this, Ctor = x.constructor;
  min2 = new Ctor(min2);
  max2 = new Ctor(max2);
  if (!min2.s || !max2.s) return new Ctor(NaN);
  if (min2.gt(max2)) throw Error(invalidArgument + max2);
  k = x.cmp(min2);
  return k < 0 ? min2 : x.cmp(max2) > 0 ? max2 : new Ctor(x);
};
P.comparedTo = P.cmp = function(y) {
  var i, j, xdL, ydL, x = this, xd = x.d, yd = (y = new x.constructor(y)).d, xs = x.s, ys = y.s;
  if (!xd || !yd) {
    return !xs || !ys ? NaN : xs !== ys ? xs : xd === yd ? 0 : !xd ^ xs < 0 ? 1 : -1;
  }
  if (!xd[0] || !yd[0]) return xd[0] ? xs : yd[0] ? -ys : 0;
  if (xs !== ys) return xs;
  if (x.e !== y.e) return x.e > y.e ^ xs < 0 ? 1 : -1;
  xdL = xd.length;
  ydL = yd.length;
  for (i = 0, j = xdL < ydL ? xdL : ydL; i < j; ++i) {
    if (xd[i] !== yd[i]) return xd[i] > yd[i] ^ xs < 0 ? 1 : -1;
  }
  return xdL === ydL ? 0 : xdL > ydL ^ xs < 0 ? 1 : -1;
};
P.cosine = P.cos = function() {
  var pr, rm, x = this, Ctor = x.constructor;
  if (!x.d) return new Ctor(NaN);
  if (!x.d[0]) return new Ctor(1);
  pr = Ctor.precision;
  rm = Ctor.rounding;
  Ctor.precision = pr + Math.max(x.e, x.sd()) + LOG_BASE;
  Ctor.rounding = 1;
  x = cosine(Ctor, toLessThanHalfPi(Ctor, x));
  Ctor.precision = pr;
  Ctor.rounding = rm;
  return finalise(quadrant == 2 || quadrant == 3 ? x.neg() : x, pr, rm, true);
};
P.cubeRoot = P.cbrt = function() {
  var e, m, n, r, rep, s, sd, t, t3, t3plusx, x = this, Ctor = x.constructor;
  if (!x.isFinite() || x.isZero()) return new Ctor(x);
  external = false;
  s = x.s * mathpow(x.s * x, 1 / 3);
  if (!s || Math.abs(s) == 1 / 0) {
    n = digitsToString(x.d);
    e = x.e;
    if (s = (e - n.length + 1) % 3) n += s == 1 || s == -2 ? "0" : "00";
    s = mathpow(n, 1 / 3);
    e = mathfloor((e + 1) / 3) - (e % 3 == (e < 0 ? -1 : 2));
    if (s == 1 / 0) {
      n = "5e" + e;
    } else {
      n = s.toExponential();
      n = n.slice(0, n.indexOf("e") + 1) + e;
    }
    r = new Ctor(n);
    r.s = x.s;
  } else {
    r = new Ctor(s.toString());
  }
  sd = (e = Ctor.precision) + 3;
  for (; ; ) {
    t = r;
    t3 = t.times(t).times(t);
    t3plusx = t3.plus(x);
    r = divide(t3plusx.plus(x).times(t), t3plusx.plus(t3), sd + 2, 1);
    if (digitsToString(t.d).slice(0, sd) === (n = digitsToString(r.d)).slice(0, sd)) {
      n = n.slice(sd - 3, sd + 1);
      if (n == "9999" || !rep && n == "4999") {
        if (!rep) {
          finalise(t, e + 1, 0);
          if (t.times(t).times(t).eq(x)) {
            r = t;
            break;
          }
        }
        sd += 4;
        rep = 1;
      } else {
        if (!+n || !+n.slice(1) && n.charAt(0) == "5") {
          finalise(r, e + 1, 1);
          m = !r.times(r).times(r).eq(x);
        }
        break;
      }
    }
  }
  external = true;
  return finalise(r, e, Ctor.rounding, m);
};
P.decimalPlaces = P.dp = function() {
  var w, d = this.d, n = NaN;
  if (d) {
    w = d.length - 1;
    n = (w - mathfloor(this.e / LOG_BASE)) * LOG_BASE;
    w = d[w];
    if (w) for (; w % 10 == 0; w /= 10) n--;
    if (n < 0) n = 0;
  }
  return n;
};
P.dividedBy = P.div = function(y) {
  return divide(this, new this.constructor(y));
};
P.dividedToIntegerBy = P.divToInt = function(y) {
  var x = this, Ctor = x.constructor;
  return finalise(divide(x, new Ctor(y), 0, 1, 1), Ctor.precision, Ctor.rounding);
};
P.equals = P.eq = function(y) {
  return this.cmp(y) === 0;
};
P.floor = function() {
  return finalise(new this.constructor(this), this.e + 1, 3);
};
P.greaterThan = P.gt = function(y) {
  return this.cmp(y) > 0;
};
P.greaterThanOrEqualTo = P.gte = function(y) {
  var k = this.cmp(y);
  return k == 1 || k === 0;
};
P.hyperbolicCosine = P.cosh = function() {
  var k, n, pr, rm, len, x = this, Ctor = x.constructor, one = new Ctor(1);
  if (!x.isFinite()) return new Ctor(x.s ? 1 / 0 : NaN);
  if (x.isZero()) return one;
  pr = Ctor.precision;
  rm = Ctor.rounding;
  Ctor.precision = pr + Math.max(x.e, x.sd()) + 4;
  Ctor.rounding = 1;
  len = x.d.length;
  if (len < 32) {
    k = Math.ceil(len / 3);
    n = (1 / tinyPow(4, k)).toString();
  } else {
    k = 16;
    n = "2.3283064365386962890625e-10";
  }
  x = taylorSeries(Ctor, 1, x.times(n), new Ctor(1), true);
  var cosh2_x, i = k, d8 = new Ctor(8);
  for (; i--; ) {
    cosh2_x = x.times(x);
    x = one.minus(cosh2_x.times(d8.minus(cosh2_x.times(d8))));
  }
  return finalise(x, Ctor.precision = pr, Ctor.rounding = rm, true);
};
P.hyperbolicSine = P.sinh = function() {
  var k, pr, rm, len, x = this, Ctor = x.constructor;
  if (!x.isFinite() || x.isZero()) return new Ctor(x);
  pr = Ctor.precision;
  rm = Ctor.rounding;
  Ctor.precision = pr + Math.max(x.e, x.sd()) + 4;
  Ctor.rounding = 1;
  len = x.d.length;
  if (len < 3) {
    x = taylorSeries(Ctor, 2, x, x, true);
  } else {
    k = 1.4 * Math.sqrt(len);
    k = k > 16 ? 16 : k | 0;
    x = x.times(1 / tinyPow(5, k));
    x = taylorSeries(Ctor, 2, x, x, true);
    var sinh2_x, d5 = new Ctor(5), d16 = new Ctor(16), d20 = new Ctor(20);
    for (; k--; ) {
      sinh2_x = x.times(x);
      x = x.times(d5.plus(sinh2_x.times(d16.times(sinh2_x).plus(d20))));
    }
  }
  Ctor.precision = pr;
  Ctor.rounding = rm;
  return finalise(x, pr, rm, true);
};
P.hyperbolicTangent = P.tanh = function() {
  var pr, rm, x = this, Ctor = x.constructor;
  if (!x.isFinite()) return new Ctor(x.s);
  if (x.isZero()) return new Ctor(x);
  pr = Ctor.precision;
  rm = Ctor.rounding;
  Ctor.precision = pr + 7;
  Ctor.rounding = 1;
  return divide(x.sinh(), x.cosh(), Ctor.precision = pr, Ctor.rounding = rm);
};
P.inverseCosine = P.acos = function() {
  var x = this, Ctor = x.constructor, k = x.abs().cmp(1), pr = Ctor.precision, rm = Ctor.rounding;
  if (k !== -1) {
    return k === 0 ? x.isNeg() ? getPi(Ctor, pr, rm) : new Ctor(0) : new Ctor(NaN);
  }
  if (x.isZero()) return getPi(Ctor, pr + 4, rm).times(0.5);
  Ctor.precision = pr + 6;
  Ctor.rounding = 1;
  x = new Ctor(1).minus(x).div(x.plus(1)).sqrt().atan();
  Ctor.precision = pr;
  Ctor.rounding = rm;
  return x.times(2);
};
P.inverseHyperbolicCosine = P.acosh = function() {
  var pr, rm, x = this, Ctor = x.constructor;
  if (x.lte(1)) return new Ctor(x.eq(1) ? 0 : NaN);
  if (!x.isFinite()) return new Ctor(x);
  pr = Ctor.precision;
  rm = Ctor.rounding;
  Ctor.precision = pr + Math.max(Math.abs(x.e), x.sd()) + 4;
  Ctor.rounding = 1;
  external = false;
  x = x.times(x).minus(1).sqrt().plus(x);
  external = true;
  Ctor.precision = pr;
  Ctor.rounding = rm;
  return x.ln();
};
P.inverseHyperbolicSine = P.asinh = function() {
  var pr, rm, x = this, Ctor = x.constructor;
  if (!x.isFinite() || x.isZero()) return new Ctor(x);
  pr = Ctor.precision;
  rm = Ctor.rounding;
  Ctor.precision = pr + 2 * Math.max(Math.abs(x.e), x.sd()) + 6;
  Ctor.rounding = 1;
  external = false;
  x = x.times(x).plus(1).sqrt().plus(x);
  external = true;
  Ctor.precision = pr;
  Ctor.rounding = rm;
  return x.ln();
};
P.inverseHyperbolicTangent = P.atanh = function() {
  var pr, rm, wpr, xsd, x = this, Ctor = x.constructor;
  if (!x.isFinite()) return new Ctor(NaN);
  if (x.e >= 0) return new Ctor(x.abs().eq(1) ? x.s / 0 : x.isZero() ? x : NaN);
  pr = Ctor.precision;
  rm = Ctor.rounding;
  xsd = x.sd();
  if (Math.max(xsd, pr) < 2 * -x.e - 1) return finalise(new Ctor(x), pr, rm, true);
  Ctor.precision = wpr = xsd - x.e;
  x = divide(x.plus(1), new Ctor(1).minus(x), wpr + pr, 1);
  Ctor.precision = pr + 4;
  Ctor.rounding = 1;
  x = x.ln();
  Ctor.precision = pr;
  Ctor.rounding = rm;
  return x.times(0.5);
};
P.inverseSine = P.asin = function() {
  var halfPi, k, pr, rm, x = this, Ctor = x.constructor;
  if (x.isZero()) return new Ctor(x);
  k = x.abs().cmp(1);
  pr = Ctor.precision;
  rm = Ctor.rounding;
  if (k !== -1) {
    if (k === 0) {
      halfPi = getPi(Ctor, pr + 4, rm).times(0.5);
      halfPi.s = x.s;
      return halfPi;
    }
    return new Ctor(NaN);
  }
  Ctor.precision = pr + 6;
  Ctor.rounding = 1;
  x = x.div(new Ctor(1).minus(x.times(x)).sqrt().plus(1)).atan();
  Ctor.precision = pr;
  Ctor.rounding = rm;
  return x.times(2);
};
P.inverseTangent = P.atan = function() {
  var i, j, k, n, px, t, r, wpr, x2, x = this, Ctor = x.constructor, pr = Ctor.precision, rm = Ctor.rounding;
  if (!x.isFinite()) {
    if (!x.s) return new Ctor(NaN);
    if (pr + 4 <= PI_PRECISION) {
      r = getPi(Ctor, pr + 4, rm).times(0.5);
      r.s = x.s;
      return r;
    }
  } else if (x.isZero()) {
    return new Ctor(x);
  } else if (x.abs().eq(1) && pr + 4 <= PI_PRECISION) {
    r = getPi(Ctor, pr + 4, rm).times(0.25);
    r.s = x.s;
    return r;
  }
  Ctor.precision = wpr = pr + 10;
  Ctor.rounding = 1;
  k = Math.min(28, wpr / LOG_BASE + 2 | 0);
  for (i = k; i; --i) x = x.div(x.times(x).plus(1).sqrt().plus(1));
  external = false;
  j = Math.ceil(wpr / LOG_BASE);
  n = 1;
  x2 = x.times(x);
  r = new Ctor(x);
  px = x;
  for (; i !== -1; ) {
    px = px.times(x2);
    t = r.minus(px.div(n += 2));
    px = px.times(x2);
    r = t.plus(px.div(n += 2));
    if (r.d[j] !== void 0) for (i = j; r.d[i] === t.d[i] && i--; ) ;
  }
  if (k) r = r.times(2 << k - 1);
  external = true;
  return finalise(r, Ctor.precision = pr, Ctor.rounding = rm, true);
};
P.isFinite = function() {
  return !!this.d;
};
P.isInteger = P.isInt = function() {
  return !!this.d && mathfloor(this.e / LOG_BASE) > this.d.length - 2;
};
P.isNaN = function() {
  return !this.s;
};
P.isNegative = P.isNeg = function() {
  return this.s < 0;
};
P.isPositive = P.isPos = function() {
  return this.s > 0;
};
P.isZero = function() {
  return !!this.d && this.d[0] === 0;
};
P.lessThan = P.lt = function(y) {
  return this.cmp(y) < 0;
};
P.lessThanOrEqualTo = P.lte = function(y) {
  return this.cmp(y) < 1;
};
P.logarithm = P.log = function(base) {
  var isBase10, d, denominator, k, inf, num, sd, r, arg = this, Ctor = arg.constructor, pr = Ctor.precision, rm = Ctor.rounding, guard = 5;
  if (base == null) {
    base = new Ctor(10);
    isBase10 = true;
  } else {
    base = new Ctor(base);
    d = base.d;
    if (base.s < 0 || !d || !d[0] || base.eq(1)) return new Ctor(NaN);
    isBase10 = base.eq(10);
  }
  d = arg.d;
  if (arg.s < 0 || !d || !d[0] || arg.eq(1)) {
    return new Ctor(d && !d[0] ? -1 / 0 : arg.s != 1 ? NaN : d ? 0 : 1 / 0);
  }
  if (isBase10) {
    if (d.length > 1) {
      inf = true;
    } else {
      for (k = d[0]; k % 10 === 0; ) k /= 10;
      inf = k !== 1;
    }
  }
  external = false;
  sd = pr + guard;
  num = naturalLogarithm(arg, sd);
  denominator = isBase10 ? getLn10(Ctor, sd + 10) : naturalLogarithm(base, sd);
  r = divide(num, denominator, sd, 1);
  if (checkRoundingDigits(r.d, k = pr, rm)) {
    do {
      sd += 10;
      num = naturalLogarithm(arg, sd);
      denominator = isBase10 ? getLn10(Ctor, sd + 10) : naturalLogarithm(base, sd);
      r = divide(num, denominator, sd, 1);
      if (!inf) {
        if (+digitsToString(r.d).slice(k + 1, k + 15) + 1 == 1e14) {
          r = finalise(r, pr + 1, 0);
        }
        break;
      }
    } while (checkRoundingDigits(r.d, k += 10, rm));
  }
  external = true;
  return finalise(r, pr, rm);
};
P.minus = P.sub = function(y) {
  var d, e, i, j, k, len, pr, rm, xd, xe, xLTy, yd, x = this, Ctor = x.constructor;
  y = new Ctor(y);
  if (!x.d || !y.d) {
    if (!x.s || !y.s) y = new Ctor(NaN);
    else if (x.d) y.s = -y.s;
    else y = new Ctor(y.d || x.s !== y.s ? x : NaN);
    return y;
  }
  if (x.s != y.s) {
    y.s = -y.s;
    return x.plus(y);
  }
  xd = x.d;
  yd = y.d;
  pr = Ctor.precision;
  rm = Ctor.rounding;
  if (!xd[0] || !yd[0]) {
    if (yd[0]) y.s = -y.s;
    else if (xd[0]) y = new Ctor(x);
    else return new Ctor(rm === 3 ? -0 : 0);
    return external ? finalise(y, pr, rm) : y;
  }
  e = mathfloor(y.e / LOG_BASE);
  xe = mathfloor(x.e / LOG_BASE);
  xd = xd.slice();
  k = xe - e;
  if (k) {
    xLTy = k < 0;
    if (xLTy) {
      d = xd;
      k = -k;
      len = yd.length;
    } else {
      d = yd;
      e = xe;
      len = xd.length;
    }
    i = Math.max(Math.ceil(pr / LOG_BASE), len) + 2;
    if (k > i) {
      k = i;
      d.length = 1;
    }
    d.reverse();
    for (i = k; i--; ) d.push(0);
    d.reverse();
  } else {
    i = xd.length;
    len = yd.length;
    xLTy = i < len;
    if (xLTy) len = i;
    for (i = 0; i < len; i++) {
      if (xd[i] != yd[i]) {
        xLTy = xd[i] < yd[i];
        break;
      }
    }
    k = 0;
  }
  if (xLTy) {
    d = xd;
    xd = yd;
    yd = d;
    y.s = -y.s;
  }
  len = xd.length;
  for (i = yd.length - len; i > 0; --i) xd[len++] = 0;
  for (i = yd.length; i > k; ) {
    if (xd[--i] < yd[i]) {
      for (j = i; j && xd[--j] === 0; ) xd[j] = BASE - 1;
      --xd[j];
      xd[i] += BASE;
    }
    xd[i] -= yd[i];
  }
  for (; xd[--len] === 0; ) xd.pop();
  for (; xd[0] === 0; xd.shift()) --e;
  if (!xd[0]) return new Ctor(rm === 3 ? -0 : 0);
  y.d = xd;
  y.e = getBase10Exponent(xd, e);
  return external ? finalise(y, pr, rm) : y;
};
P.modulo = P.mod = function(y) {
  var q, x = this, Ctor = x.constructor;
  y = new Ctor(y);
  if (!x.d || !y.s || y.d && !y.d[0]) return new Ctor(NaN);
  if (!y.d || x.d && !x.d[0]) {
    return finalise(new Ctor(x), Ctor.precision, Ctor.rounding);
  }
  external = false;
  if (Ctor.modulo == 9) {
    q = divide(x, y.abs(), 0, 3, 1);
    q.s *= y.s;
  } else {
    q = divide(x, y, 0, Ctor.modulo, 1);
  }
  q = q.times(y);
  external = true;
  return x.minus(q);
};
P.naturalExponential = P.exp = function() {
  return naturalExponential(this);
};
P.naturalLogarithm = P.ln = function() {
  return naturalLogarithm(this);
};
P.negated = P.neg = function() {
  var x = new this.constructor(this);
  x.s = -x.s;
  return finalise(x);
};
P.plus = P.add = function(y) {
  var carry, d, e, i, k, len, pr, rm, xd, yd, x = this, Ctor = x.constructor;
  y = new Ctor(y);
  if (!x.d || !y.d) {
    if (!x.s || !y.s) y = new Ctor(NaN);
    else if (!x.d) y = new Ctor(y.d || x.s === y.s ? x : NaN);
    return y;
  }
  if (x.s != y.s) {
    y.s = -y.s;
    return x.minus(y);
  }
  xd = x.d;
  yd = y.d;
  pr = Ctor.precision;
  rm = Ctor.rounding;
  if (!xd[0] || !yd[0]) {
    if (!yd[0]) y = new Ctor(x);
    return external ? finalise(y, pr, rm) : y;
  }
  k = mathfloor(x.e / LOG_BASE);
  e = mathfloor(y.e / LOG_BASE);
  xd = xd.slice();
  i = k - e;
  if (i) {
    if (i < 0) {
      d = xd;
      i = -i;
      len = yd.length;
    } else {
      d = yd;
      e = k;
      len = xd.length;
    }
    k = Math.ceil(pr / LOG_BASE);
    len = k > len ? k + 1 : len + 1;
    if (i > len) {
      i = len;
      d.length = 1;
    }
    d.reverse();
    for (; i--; ) d.push(0);
    d.reverse();
  }
  len = xd.length;
  i = yd.length;
  if (len - i < 0) {
    i = len;
    d = yd;
    yd = xd;
    xd = d;
  }
  for (carry = 0; i; ) {
    carry = (xd[--i] = xd[i] + yd[i] + carry) / BASE | 0;
    xd[i] %= BASE;
  }
  if (carry) {
    xd.unshift(carry);
    ++e;
  }
  for (len = xd.length; xd[--len] == 0; ) xd.pop();
  y.d = xd;
  y.e = getBase10Exponent(xd, e);
  return external ? finalise(y, pr, rm) : y;
};
P.precision = P.sd = function(z) {
  var k, x = this;
  if (z !== void 0 && z !== !!z && z !== 1 && z !== 0) throw Error(invalidArgument + z);
  if (x.d) {
    k = getPrecision(x.d);
    if (z && x.e + 1 > k) k = x.e + 1;
  } else {
    k = NaN;
  }
  return k;
};
P.round = function() {
  var x = this, Ctor = x.constructor;
  return finalise(new Ctor(x), x.e + 1, Ctor.rounding);
};
P.sine = P.sin = function() {
  var pr, rm, x = this, Ctor = x.constructor;
  if (!x.isFinite()) return new Ctor(NaN);
  if (x.isZero()) return new Ctor(x);
  pr = Ctor.precision;
  rm = Ctor.rounding;
  Ctor.precision = pr + Math.max(x.e, x.sd()) + LOG_BASE;
  Ctor.rounding = 1;
  x = sine(Ctor, toLessThanHalfPi(Ctor, x));
  Ctor.precision = pr;
  Ctor.rounding = rm;
  return finalise(quadrant > 2 ? x.neg() : x, pr, rm, true);
};
P.squareRoot = P.sqrt = function() {
  var m, n, sd, r, rep, t, x = this, d = x.d, e = x.e, s = x.s, Ctor = x.constructor;
  if (s !== 1 || !d || !d[0]) {
    return new Ctor(!s || s < 0 && (!d || d[0]) ? NaN : d ? x : 1 / 0);
  }
  external = false;
  s = Math.sqrt(+x);
  if (s == 0 || s == 1 / 0) {
    n = digitsToString(d);
    if ((n.length + e) % 2 == 0) n += "0";
    s = Math.sqrt(n);
    e = mathfloor((e + 1) / 2) - (e < 0 || e % 2);
    if (s == 1 / 0) {
      n = "5e" + e;
    } else {
      n = s.toExponential();
      n = n.slice(0, n.indexOf("e") + 1) + e;
    }
    r = new Ctor(n);
  } else {
    r = new Ctor(s.toString());
  }
  sd = (e = Ctor.precision) + 3;
  for (; ; ) {
    t = r;
    r = t.plus(divide(x, t, sd + 2, 1)).times(0.5);
    if (digitsToString(t.d).slice(0, sd) === (n = digitsToString(r.d)).slice(0, sd)) {
      n = n.slice(sd - 3, sd + 1);
      if (n == "9999" || !rep && n == "4999") {
        if (!rep) {
          finalise(t, e + 1, 0);
          if (t.times(t).eq(x)) {
            r = t;
            break;
          }
        }
        sd += 4;
        rep = 1;
      } else {
        if (!+n || !+n.slice(1) && n.charAt(0) == "5") {
          finalise(r, e + 1, 1);
          m = !r.times(r).eq(x);
        }
        break;
      }
    }
  }
  external = true;
  return finalise(r, e, Ctor.rounding, m);
};
P.tangent = P.tan = function() {
  var pr, rm, x = this, Ctor = x.constructor;
  if (!x.isFinite()) return new Ctor(NaN);
  if (x.isZero()) return new Ctor(x);
  pr = Ctor.precision;
  rm = Ctor.rounding;
  Ctor.precision = pr + 10;
  Ctor.rounding = 1;
  x = x.sin();
  x.s = 1;
  x = divide(x, new Ctor(1).minus(x.times(x)).sqrt(), pr + 10, 0);
  Ctor.precision = pr;
  Ctor.rounding = rm;
  return finalise(quadrant == 2 || quadrant == 4 ? x.neg() : x, pr, rm, true);
};
P.times = P.mul = function(y) {
  var carry, e, i, k, r, rL, t, xdL, ydL, x = this, Ctor = x.constructor, xd = x.d, yd = (y = new Ctor(y)).d;
  y.s *= x.s;
  if (!xd || !xd[0] || !yd || !yd[0]) {
    return new Ctor(!y.s || xd && !xd[0] && !yd || yd && !yd[0] && !xd ? NaN : !xd || !yd ? y.s / 0 : y.s * 0);
  }
  e = mathfloor(x.e / LOG_BASE) + mathfloor(y.e / LOG_BASE);
  xdL = xd.length;
  ydL = yd.length;
  if (xdL < ydL) {
    r = xd;
    xd = yd;
    yd = r;
    rL = xdL;
    xdL = ydL;
    ydL = rL;
  }
  r = [];
  rL = xdL + ydL;
  for (i = rL; i--; ) r.push(0);
  for (i = ydL; --i >= 0; ) {
    carry = 0;
    for (k = xdL + i; k > i; ) {
      t = r[k] + yd[i] * xd[k - i - 1] + carry;
      r[k--] = t % BASE | 0;
      carry = t / BASE | 0;
    }
    r[k] = (r[k] + carry) % BASE | 0;
  }
  for (; !r[--rL]; ) r.pop();
  if (carry) ++e;
  else r.shift();
  y.d = r;
  y.e = getBase10Exponent(r, e);
  return external ? finalise(y, Ctor.precision, Ctor.rounding) : y;
};
P.toBinary = function(sd, rm) {
  return toStringBinary(this, 2, sd, rm);
};
P.toDecimalPlaces = P.toDP = function(dp, rm) {
  var x = this, Ctor = x.constructor;
  x = new Ctor(x);
  if (dp === void 0) return x;
  checkInt32(dp, 0, MAX_DIGITS);
  if (rm === void 0) rm = Ctor.rounding;
  else checkInt32(rm, 0, 8);
  return finalise(x, dp + x.e + 1, rm);
};
P.toExponential = function(dp, rm) {
  var str, x = this, Ctor = x.constructor;
  if (dp === void 0) {
    str = finiteToString(x, true);
  } else {
    checkInt32(dp, 0, MAX_DIGITS);
    if (rm === void 0) rm = Ctor.rounding;
    else checkInt32(rm, 0, 8);
    x = finalise(new Ctor(x), dp + 1, rm);
    str = finiteToString(x, true, dp + 1);
  }
  return x.isNeg() && !x.isZero() ? "-" + str : str;
};
P.toFixed = function(dp, rm) {
  var str, y, x = this, Ctor = x.constructor;
  if (dp === void 0) {
    str = finiteToString(x);
  } else {
    checkInt32(dp, 0, MAX_DIGITS);
    if (rm === void 0) rm = Ctor.rounding;
    else checkInt32(rm, 0, 8);
    y = finalise(new Ctor(x), dp + x.e + 1, rm);
    str = finiteToString(y, false, dp + y.e + 1);
  }
  return x.isNeg() && !x.isZero() ? "-" + str : str;
};
P.toFraction = function(maxD) {
  var d, d0, d1, d2, e, k, n, n0, n1, pr, q, r, x = this, xd = x.d, Ctor = x.constructor;
  if (!xd) return new Ctor(x);
  n1 = d0 = new Ctor(1);
  d1 = n0 = new Ctor(0);
  d = new Ctor(d1);
  e = d.e = getPrecision(xd) - x.e - 1;
  k = e % LOG_BASE;
  d.d[0] = mathpow(10, k < 0 ? LOG_BASE + k : k);
  if (maxD == null) {
    maxD = e > 0 ? d : n1;
  } else {
    n = new Ctor(maxD);
    if (!n.isInt() || n.lt(n1)) throw Error(invalidArgument + n);
    maxD = n.gt(d) ? e > 0 ? d : n1 : n;
  }
  external = false;
  n = new Ctor(digitsToString(xd));
  pr = Ctor.precision;
  Ctor.precision = e = xd.length * LOG_BASE * 2;
  for (; ; ) {
    q = divide(n, d, 0, 1, 1);
    d2 = d0.plus(q.times(d1));
    if (d2.cmp(maxD) == 1) break;
    d0 = d1;
    d1 = d2;
    d2 = n1;
    n1 = n0.plus(q.times(d2));
    n0 = d2;
    d2 = d;
    d = n.minus(q.times(d2));
    n = d2;
  }
  d2 = divide(maxD.minus(d0), d1, 0, 1, 1);
  n0 = n0.plus(d2.times(n1));
  d0 = d0.plus(d2.times(d1));
  n0.s = n1.s = x.s;
  r = divide(n1, d1, e, 1).minus(x).abs().cmp(divide(n0, d0, e, 1).minus(x).abs()) < 1 ? [n1, d1] : [n0, d0];
  Ctor.precision = pr;
  external = true;
  return r;
};
P.toHexadecimal = P.toHex = function(sd, rm) {
  return toStringBinary(this, 16, sd, rm);
};
P.toNearest = function(y, rm) {
  var x = this, Ctor = x.constructor;
  x = new Ctor(x);
  if (y == null) {
    if (!x.d) return x;
    y = new Ctor(1);
    rm = Ctor.rounding;
  } else {
    y = new Ctor(y);
    if (rm === void 0) {
      rm = Ctor.rounding;
    } else {
      checkInt32(rm, 0, 8);
    }
    if (!x.d) return y.s ? x : y;
    if (!y.d) {
      if (y.s) y.s = x.s;
      return y;
    }
  }
  if (y.d[0]) {
    external = false;
    x = divide(x, y, 0, rm, 1).times(y);
    external = true;
    finalise(x);
  } else {
    y.s = x.s;
    x = y;
  }
  return x;
};
P.toNumber = function() {
  return +this;
};
P.toOctal = function(sd, rm) {
  return toStringBinary(this, 8, sd, rm);
};
P.toPower = P.pow = function(y) {
  var e, k, pr, r, rm, s, x = this, Ctor = x.constructor, yn = +(y = new Ctor(y));
  if (!x.d || !y.d || !x.d[0] || !y.d[0]) return new Ctor(mathpow(+x, yn));
  x = new Ctor(x);
  if (x.eq(1)) return x;
  pr = Ctor.precision;
  rm = Ctor.rounding;
  if (y.eq(1)) return finalise(x, pr, rm);
  e = mathfloor(y.e / LOG_BASE);
  if (e >= y.d.length - 1 && (k = yn < 0 ? -yn : yn) <= MAX_SAFE_INTEGER) {
    r = intPow(Ctor, x, k, pr);
    return y.s < 0 ? new Ctor(1).div(r) : finalise(r, pr, rm);
  }
  s = x.s;
  if (s < 0) {
    if (e < y.d.length - 1) return new Ctor(NaN);
    if ((y.d[e] & 1) == 0) s = 1;
    if (x.e == 0 && x.d[0] == 1 && x.d.length == 1) {
      x.s = s;
      return x;
    }
  }
  k = mathpow(+x, yn);
  e = k == 0 || !isFinite(k) ? mathfloor(yn * (Math.log("0." + digitsToString(x.d)) / Math.LN10 + x.e + 1)) : new Ctor(k + "").e;
  if (e > Ctor.maxE + 1 || e < Ctor.minE - 1) return new Ctor(e > 0 ? s / 0 : 0);
  external = false;
  Ctor.rounding = x.s = 1;
  k = Math.min(12, (e + "").length);
  r = naturalExponential(y.times(naturalLogarithm(x, pr + k)), pr);
  if (r.d) {
    r = finalise(r, pr + 5, 1);
    if (checkRoundingDigits(r.d, pr, rm)) {
      e = pr + 10;
      r = finalise(naturalExponential(y.times(naturalLogarithm(x, e + k)), e), e + 5, 1);
      if (+digitsToString(r.d).slice(pr + 1, pr + 15) + 1 == 1e14) {
        r = finalise(r, pr + 1, 0);
      }
    }
  }
  r.s = s;
  external = true;
  Ctor.rounding = rm;
  return finalise(r, pr, rm);
};
P.toPrecision = function(sd, rm) {
  var str, x = this, Ctor = x.constructor;
  if (sd === void 0) {
    str = finiteToString(x, x.e <= Ctor.toExpNeg || x.e >= Ctor.toExpPos);
  } else {
    checkInt32(sd, 1, MAX_DIGITS);
    if (rm === void 0) rm = Ctor.rounding;
    else checkInt32(rm, 0, 8);
    x = finalise(new Ctor(x), sd, rm);
    str = finiteToString(x, sd <= x.e || x.e <= Ctor.toExpNeg, sd);
  }
  return x.isNeg() && !x.isZero() ? "-" + str : str;
};
P.toSignificantDigits = P.toSD = function(sd, rm) {
  var x = this, Ctor = x.constructor;
  if (sd === void 0) {
    sd = Ctor.precision;
    rm = Ctor.rounding;
  } else {
    checkInt32(sd, 1, MAX_DIGITS);
    if (rm === void 0) rm = Ctor.rounding;
    else checkInt32(rm, 0, 8);
  }
  return finalise(new Ctor(x), sd, rm);
};
P.toString = function() {
  var x = this, Ctor = x.constructor, str = finiteToString(x, x.e <= Ctor.toExpNeg || x.e >= Ctor.toExpPos);
  return x.isNeg() && !x.isZero() ? "-" + str : str;
};
P.truncated = P.trunc = function() {
  return finalise(new this.constructor(this), this.e + 1, 1);
};
P.valueOf = P.toJSON = function() {
  var x = this, Ctor = x.constructor, str = finiteToString(x, x.e <= Ctor.toExpNeg || x.e >= Ctor.toExpPos);
  return x.isNeg() ? "-" + str : str;
};
function digitsToString(d) {
  var i, k, ws, indexOfLastWord = d.length - 1, str = "", w = d[0];
  if (indexOfLastWord > 0) {
    str += w;
    for (i = 1; i < indexOfLastWord; i++) {
      ws = d[i] + "";
      k = LOG_BASE - ws.length;
      if (k) str += getZeroString(k);
      str += ws;
    }
    w = d[i];
    ws = w + "";
    k = LOG_BASE - ws.length;
    if (k) str += getZeroString(k);
  } else if (w === 0) {
    return "0";
  }
  for (; w % 10 === 0; ) w /= 10;
  return str + w;
}
function checkInt32(i, min2, max2) {
  if (i !== ~~i || i < min2 || i > max2) {
    throw Error(invalidArgument + i);
  }
}
function checkRoundingDigits(d, i, rm, repeating) {
  var di, k, r, rd;
  for (k = d[0]; k >= 10; k /= 10) --i;
  if (--i < 0) {
    i += LOG_BASE;
    di = 0;
  } else {
    di = Math.ceil((i + 1) / LOG_BASE);
    i %= LOG_BASE;
  }
  k = mathpow(10, LOG_BASE - i);
  rd = d[di] % k | 0;
  if (repeating == null) {
    if (i < 3) {
      if (i == 0) rd = rd / 100 | 0;
      else if (i == 1) rd = rd / 10 | 0;
      r = rm < 4 && rd == 99999 || rm > 3 && rd == 49999 || rd == 5e4 || rd == 0;
    } else {
      r = (rm < 4 && rd + 1 == k || rm > 3 && rd + 1 == k / 2) && (d[di + 1] / k / 100 | 0) == mathpow(10, i - 2) - 1 || (rd == k / 2 || rd == 0) && (d[di + 1] / k / 100 | 0) == 0;
    }
  } else {
    if (i < 4) {
      if (i == 0) rd = rd / 1e3 | 0;
      else if (i == 1) rd = rd / 100 | 0;
      else if (i == 2) rd = rd / 10 | 0;
      r = (repeating || rm < 4) && rd == 9999 || !repeating && rm > 3 && rd == 4999;
    } else {
      r = ((repeating || rm < 4) && rd + 1 == k || !repeating && rm > 3 && rd + 1 == k / 2) && (d[di + 1] / k / 1e3 | 0) == mathpow(10, i - 3) - 1;
    }
  }
  return r;
}
function convertBase(str, baseIn, baseOut) {
  var j, arr = [0], arrL, i = 0, strL = str.length;
  for (; i < strL; ) {
    for (arrL = arr.length; arrL--; ) arr[arrL] *= baseIn;
    arr[0] += NUMERALS.indexOf(str.charAt(i++));
    for (j = 0; j < arr.length; j++) {
      if (arr[j] > baseOut - 1) {
        if (arr[j + 1] === void 0) arr[j + 1] = 0;
        arr[j + 1] += arr[j] / baseOut | 0;
        arr[j] %= baseOut;
      }
    }
  }
  return arr.reverse();
}
function cosine(Ctor, x) {
  var k, len, y;
  if (x.isZero()) return x;
  len = x.d.length;
  if (len < 32) {
    k = Math.ceil(len / 3);
    y = (1 / tinyPow(4, k)).toString();
  } else {
    k = 16;
    y = "2.3283064365386962890625e-10";
  }
  Ctor.precision += k;
  x = taylorSeries(Ctor, 1, x.times(y), new Ctor(1));
  for (var i = k; i--; ) {
    var cos2x = x.times(x);
    x = cos2x.times(cos2x).minus(cos2x).times(8).plus(1);
  }
  Ctor.precision -= k;
  return x;
}
var divide = /* @__PURE__ */ (function() {
  function multiplyInteger(x, k, base) {
    var temp, carry = 0, i = x.length;
    for (x = x.slice(); i--; ) {
      temp = x[i] * k + carry;
      x[i] = temp % base | 0;
      carry = temp / base | 0;
    }
    if (carry) x.unshift(carry);
    return x;
  }
  function compare(a, b, aL, bL) {
    var i, r;
    if (aL != bL) {
      r = aL > bL ? 1 : -1;
    } else {
      for (i = r = 0; i < aL; i++) {
        if (a[i] != b[i]) {
          r = a[i] > b[i] ? 1 : -1;
          break;
        }
      }
    }
    return r;
  }
  function subtract(a, b, aL, base) {
    var i = 0;
    for (; aL--; ) {
      a[aL] -= i;
      i = a[aL] < b[aL] ? 1 : 0;
      a[aL] = i * base + a[aL] - b[aL];
    }
    for (; !a[0] && a.length > 1; ) a.shift();
  }
  return function(x, y, pr, rm, dp, base) {
    var cmp, e, i, k, logBase, more, prod, prodL, q, qd, rem, remL, rem0, sd, t, xi, xL, yd0, yL, yz, Ctor = x.constructor, sign2 = x.s == y.s ? 1 : -1, xd = x.d, yd = y.d;
    if (!xd || !xd[0] || !yd || !yd[0]) {
      return new Ctor(
        // Return NaN if either NaN, or both Infinity or 0.
        !x.s || !y.s || (xd ? yd && xd[0] == yd[0] : !yd) ? NaN : (
          // Return ±0 if x is 0 or y is ±Infinity, or return ±Infinity as y is 0.
          xd && xd[0] == 0 || !yd ? sign2 * 0 : sign2 / 0
        )
      );
    }
    if (base) {
      logBase = 1;
      e = x.e - y.e;
    } else {
      base = BASE;
      logBase = LOG_BASE;
      e = mathfloor(x.e / logBase) - mathfloor(y.e / logBase);
    }
    yL = yd.length;
    xL = xd.length;
    q = new Ctor(sign2);
    qd = q.d = [];
    for (i = 0; yd[i] == (xd[i] || 0); i++) ;
    if (yd[i] > (xd[i] || 0)) e--;
    if (pr == null) {
      sd = pr = Ctor.precision;
      rm = Ctor.rounding;
    } else if (dp) {
      sd = pr + (x.e - y.e) + 1;
    } else {
      sd = pr;
    }
    if (sd < 0) {
      qd.push(1);
      more = true;
    } else {
      sd = sd / logBase + 2 | 0;
      i = 0;
      if (yL == 1) {
        k = 0;
        yd = yd[0];
        sd++;
        for (; (i < xL || k) && sd--; i++) {
          t = k * base + (xd[i] || 0);
          qd[i] = t / yd | 0;
          k = t % yd | 0;
        }
        more = k || i < xL;
      } else {
        k = base / (yd[0] + 1) | 0;
        if (k > 1) {
          yd = multiplyInteger(yd, k, base);
          xd = multiplyInteger(xd, k, base);
          yL = yd.length;
          xL = xd.length;
        }
        xi = yL;
        rem = xd.slice(0, yL);
        remL = rem.length;
        for (; remL < yL; ) rem[remL++] = 0;
        yz = yd.slice();
        yz.unshift(0);
        yd0 = yd[0];
        if (yd[1] >= base / 2) ++yd0;
        do {
          k = 0;
          cmp = compare(yd, rem, yL, remL);
          if (cmp < 0) {
            rem0 = rem[0];
            if (yL != remL) rem0 = rem0 * base + (rem[1] || 0);
            k = rem0 / yd0 | 0;
            if (k > 1) {
              if (k >= base) k = base - 1;
              prod = multiplyInteger(yd, k, base);
              prodL = prod.length;
              remL = rem.length;
              cmp = compare(prod, rem, prodL, remL);
              if (cmp == 1) {
                k--;
                subtract(prod, yL < prodL ? yz : yd, prodL, base);
              }
            } else {
              if (k == 0) cmp = k = 1;
              prod = yd.slice();
            }
            prodL = prod.length;
            if (prodL < remL) prod.unshift(0);
            subtract(rem, prod, remL, base);
            if (cmp == -1) {
              remL = rem.length;
              cmp = compare(yd, rem, yL, remL);
              if (cmp < 1) {
                k++;
                subtract(rem, yL < remL ? yz : yd, remL, base);
              }
            }
            remL = rem.length;
          } else if (cmp === 0) {
            k++;
            rem = [0];
          }
          qd[i++] = k;
          if (cmp && rem[0]) {
            rem[remL++] = xd[xi] || 0;
          } else {
            rem = [xd[xi]];
            remL = 1;
          }
        } while ((xi++ < xL || rem[0] !== void 0) && sd--);
        more = rem[0] !== void 0;
      }
      if (!qd[0]) qd.shift();
    }
    if (logBase == 1) {
      q.e = e;
      inexact = more;
    } else {
      for (i = 1, k = qd[0]; k >= 10; k /= 10) i++;
      q.e = i + e * logBase - 1;
      finalise(q, dp ? pr + q.e + 1 : pr, rm, more);
    }
    return q;
  };
})();
function finalise(x, sd, rm, isTruncated) {
  var digits, i, j, k, rd, roundUp, w, xd, xdi, Ctor = x.constructor;
  out: if (sd != null) {
    xd = x.d;
    if (!xd) return x;
    for (digits = 1, k = xd[0]; k >= 10; k /= 10) digits++;
    i = sd - digits;
    if (i < 0) {
      i += LOG_BASE;
      j = sd;
      w = xd[xdi = 0];
      rd = w / mathpow(10, digits - j - 1) % 10 | 0;
    } else {
      xdi = Math.ceil((i + 1) / LOG_BASE);
      k = xd.length;
      if (xdi >= k) {
        if (isTruncated) {
          for (; k++ <= xdi; ) xd.push(0);
          w = rd = 0;
          digits = 1;
          i %= LOG_BASE;
          j = i - LOG_BASE + 1;
        } else {
          break out;
        }
      } else {
        w = k = xd[xdi];
        for (digits = 1; k >= 10; k /= 10) digits++;
        i %= LOG_BASE;
        j = i - LOG_BASE + digits;
        rd = j < 0 ? 0 : w / mathpow(10, digits - j - 1) % 10 | 0;
      }
    }
    isTruncated = isTruncated || sd < 0 || xd[xdi + 1] !== void 0 || (j < 0 ? w : w % mathpow(10, digits - j - 1));
    roundUp = rm < 4 ? (rd || isTruncated) && (rm == 0 || rm == (x.s < 0 ? 3 : 2)) : rd > 5 || rd == 5 && (rm == 4 || isTruncated || rm == 6 && // Check whether the digit to the left of the rounding digit is odd.
    (i > 0 ? j > 0 ? w / mathpow(10, digits - j) : 0 : xd[xdi - 1]) % 10 & 1 || rm == (x.s < 0 ? 8 : 7));
    if (sd < 1 || !xd[0]) {
      xd.length = 0;
      if (roundUp) {
        sd -= x.e + 1;
        xd[0] = mathpow(10, (LOG_BASE - sd % LOG_BASE) % LOG_BASE);
        x.e = -sd || 0;
      } else {
        xd[0] = x.e = 0;
      }
      return x;
    }
    if (i == 0) {
      xd.length = xdi;
      k = 1;
      xdi--;
    } else {
      xd.length = xdi + 1;
      k = mathpow(10, LOG_BASE - i);
      xd[xdi] = j > 0 ? (w / mathpow(10, digits - j) % mathpow(10, j) | 0) * k : 0;
    }
    if (roundUp) {
      for (; ; ) {
        if (xdi == 0) {
          for (i = 1, j = xd[0]; j >= 10; j /= 10) i++;
          j = xd[0] += k;
          for (k = 1; j >= 10; j /= 10) k++;
          if (i != k) {
            x.e++;
            if (xd[0] == BASE) xd[0] = 1;
          }
          break;
        } else {
          xd[xdi] += k;
          if (xd[xdi] != BASE) break;
          xd[xdi--] = 0;
          k = 1;
        }
      }
    }
    for (i = xd.length; xd[--i] === 0; ) xd.pop();
  }
  if (external) {
    if (x.e > Ctor.maxE) {
      x.d = null;
      x.e = NaN;
    } else if (x.e < Ctor.minE) {
      x.e = 0;
      x.d = [0];
    }
  }
  return x;
}
function finiteToString(x, isExp, sd) {
  if (!x.isFinite()) return nonFiniteToString(x);
  var k, e = x.e, str = digitsToString(x.d), len = str.length;
  if (isExp) {
    if (sd && (k = sd - len) > 0) {
      str = str.charAt(0) + "." + str.slice(1) + getZeroString(k);
    } else if (len > 1) {
      str = str.charAt(0) + "." + str.slice(1);
    }
    str = str + (x.e < 0 ? "e" : "e+") + x.e;
  } else if (e < 0) {
    str = "0." + getZeroString(-e - 1) + str;
    if (sd && (k = sd - len) > 0) str += getZeroString(k);
  } else if (e >= len) {
    str += getZeroString(e + 1 - len);
    if (sd && (k = sd - e - 1) > 0) str = str + "." + getZeroString(k);
  } else {
    if ((k = e + 1) < len) str = str.slice(0, k) + "." + str.slice(k);
    if (sd && (k = sd - len) > 0) {
      if (e + 1 === len) str += ".";
      str += getZeroString(k);
    }
  }
  return str;
}
function getBase10Exponent(digits, e) {
  var w = digits[0];
  for (e *= LOG_BASE; w >= 10; w /= 10) e++;
  return e;
}
function getLn10(Ctor, sd, pr) {
  if (sd > LN10_PRECISION) {
    external = true;
    if (pr) Ctor.precision = pr;
    throw Error(precisionLimitExceeded);
  }
  return finalise(new Ctor(LN10), sd, 1, true);
}
function getPi(Ctor, sd, rm) {
  if (sd > PI_PRECISION) throw Error(precisionLimitExceeded);
  return finalise(new Ctor(PI), sd, rm, true);
}
function getPrecision(digits) {
  var w = digits.length - 1, len = w * LOG_BASE + 1;
  w = digits[w];
  if (w) {
    for (; w % 10 == 0; w /= 10) len--;
    for (w = digits[0]; w >= 10; w /= 10) len++;
  }
  return len;
}
function getZeroString(k) {
  var zs = "";
  for (; k--; ) zs += "0";
  return zs;
}
function intPow(Ctor, x, n, pr) {
  var isTruncated, r = new Ctor(1), k = Math.ceil(pr / LOG_BASE + 4);
  external = false;
  for (; ; ) {
    if (n % 2) {
      r = r.times(x);
      if (truncate(r.d, k)) isTruncated = true;
    }
    n = mathfloor(n / 2);
    if (n === 0) {
      n = r.d.length - 1;
      if (isTruncated && r.d[n] === 0) ++r.d[n];
      break;
    }
    x = x.times(x);
    truncate(x.d, k);
  }
  external = true;
  return r;
}
function isOdd(n) {
  return n.d[n.d.length - 1] & 1;
}
function maxOrMin(Ctor, args, n) {
  var k, y, x = new Ctor(args[0]), i = 0;
  for (; ++i < args.length; ) {
    y = new Ctor(args[i]);
    if (!y.s) {
      x = y;
      break;
    }
    k = x.cmp(y);
    if (k === n || k === 0 && x.s === n) {
      x = y;
    }
  }
  return x;
}
function naturalExponential(x, sd) {
  var denominator, guard, j, pow2, sum2, t, wpr, rep = 0, i = 0, k = 0, Ctor = x.constructor, rm = Ctor.rounding, pr = Ctor.precision;
  if (!x.d || !x.d[0] || x.e > 17) {
    return new Ctor(x.d ? !x.d[0] ? 1 : x.s < 0 ? 0 : 1 / 0 : x.s ? x.s < 0 ? 0 : x : 0 / 0);
  }
  if (sd == null) {
    external = false;
    wpr = pr;
  } else {
    wpr = sd;
  }
  t = new Ctor(0.03125);
  while (x.e > -2) {
    x = x.times(t);
    k += 5;
  }
  guard = Math.log(mathpow(2, k)) / Math.LN10 * 2 + 5 | 0;
  wpr += guard;
  denominator = pow2 = sum2 = new Ctor(1);
  Ctor.precision = wpr;
  for (; ; ) {
    pow2 = finalise(pow2.times(x), wpr, 1);
    denominator = denominator.times(++i);
    t = sum2.plus(divide(pow2, denominator, wpr, 1));
    if (digitsToString(t.d).slice(0, wpr) === digitsToString(sum2.d).slice(0, wpr)) {
      j = k;
      while (j--) sum2 = finalise(sum2.times(sum2), wpr, 1);
      if (sd == null) {
        if (rep < 3 && checkRoundingDigits(sum2.d, wpr - guard, rm, rep)) {
          Ctor.precision = wpr += 10;
          denominator = pow2 = t = new Ctor(1);
          i = 0;
          rep++;
        } else {
          return finalise(sum2, Ctor.precision = pr, rm, external = true);
        }
      } else {
        Ctor.precision = pr;
        return sum2;
      }
    }
    sum2 = t;
  }
}
function naturalLogarithm(y, sd) {
  var c, c0, denominator, e, numerator, rep, sum2, t, wpr, x1, x2, n = 1, guard = 10, x = y, xd = x.d, Ctor = x.constructor, rm = Ctor.rounding, pr = Ctor.precision;
  if (x.s < 0 || !xd || !xd[0] || !x.e && xd[0] == 1 && xd.length == 1) {
    return new Ctor(xd && !xd[0] ? -1 / 0 : x.s != 1 ? NaN : xd ? 0 : x);
  }
  if (sd == null) {
    external = false;
    wpr = pr;
  } else {
    wpr = sd;
  }
  Ctor.precision = wpr += guard;
  c = digitsToString(xd);
  c0 = c.charAt(0);
  if (Math.abs(e = x.e) < 15e14) {
    while (c0 < 7 && c0 != 1 || c0 == 1 && c.charAt(1) > 3) {
      x = x.times(y);
      c = digitsToString(x.d);
      c0 = c.charAt(0);
      n++;
    }
    e = x.e;
    if (c0 > 1) {
      x = new Ctor("0." + c);
      e++;
    } else {
      x = new Ctor(c0 + "." + c.slice(1));
    }
  } else {
    t = getLn10(Ctor, wpr + 2, pr).times(e + "");
    x = naturalLogarithm(new Ctor(c0 + "." + c.slice(1)), wpr - guard).plus(t);
    Ctor.precision = pr;
    return sd == null ? finalise(x, pr, rm, external = true) : x;
  }
  x1 = x;
  sum2 = numerator = x = divide(x.minus(1), x.plus(1), wpr, 1);
  x2 = finalise(x.times(x), wpr, 1);
  denominator = 3;
  for (; ; ) {
    numerator = finalise(numerator.times(x2), wpr, 1);
    t = sum2.plus(divide(numerator, new Ctor(denominator), wpr, 1));
    if (digitsToString(t.d).slice(0, wpr) === digitsToString(sum2.d).slice(0, wpr)) {
      sum2 = sum2.times(2);
      if (e !== 0) sum2 = sum2.plus(getLn10(Ctor, wpr + 2, pr).times(e + ""));
      sum2 = divide(sum2, new Ctor(n), wpr, 1);
      if (sd == null) {
        if (checkRoundingDigits(sum2.d, wpr - guard, rm, rep)) {
          Ctor.precision = wpr += guard;
          t = numerator = x = divide(x1.minus(1), x1.plus(1), wpr, 1);
          x2 = finalise(x.times(x), wpr, 1);
          denominator = rep = 1;
        } else {
          return finalise(sum2, Ctor.precision = pr, rm, external = true);
        }
      } else {
        Ctor.precision = pr;
        return sum2;
      }
    }
    sum2 = t;
    denominator += 2;
  }
}
function nonFiniteToString(x) {
  return String(x.s * x.s / 0);
}
function parseDecimal(x, str) {
  var e, i, len;
  if ((e = str.indexOf(".")) > -1) str = str.replace(".", "");
  if ((i = str.search(/e/i)) > 0) {
    if (e < 0) e = i;
    e += +str.slice(i + 1);
    str = str.substring(0, i);
  } else if (e < 0) {
    e = str.length;
  }
  for (i = 0; str.charCodeAt(i) === 48; i++) ;
  for (len = str.length; str.charCodeAt(len - 1) === 48; --len) ;
  str = str.slice(i, len);
  if (str) {
    len -= i;
    x.e = e = e - i - 1;
    x.d = [];
    i = (e + 1) % LOG_BASE;
    if (e < 0) i += LOG_BASE;
    if (i < len) {
      if (i) x.d.push(+str.slice(0, i));
      for (len -= LOG_BASE; i < len; ) x.d.push(+str.slice(i, i += LOG_BASE));
      str = str.slice(i);
      i = LOG_BASE - str.length;
    } else {
      i -= len;
    }
    for (; i--; ) str += "0";
    x.d.push(+str);
    if (external) {
      if (x.e > x.constructor.maxE) {
        x.d = null;
        x.e = NaN;
      } else if (x.e < x.constructor.minE) {
        x.e = 0;
        x.d = [0];
      }
    }
  } else {
    x.e = 0;
    x.d = [0];
  }
  return x;
}
function parseOther(x, str) {
  var base, Ctor, divisor, i, isFloat, len, p, xd, xe;
  if (str.indexOf("_") > -1) {
    str = str.replace(/(\d)_(?=\d)/g, "$1");
    if (isDecimal.test(str)) return parseDecimal(x, str);
  } else if (str === "Infinity" || str === "NaN") {
    if (!+str) x.s = NaN;
    x.e = NaN;
    x.d = null;
    return x;
  }
  if (isHex.test(str)) {
    base = 16;
    str = str.toLowerCase();
  } else if (isBinary.test(str)) {
    base = 2;
  } else if (isOctal.test(str)) {
    base = 8;
  } else {
    throw Error(invalidArgument + str);
  }
  i = str.search(/p/i);
  if (i > 0) {
    p = +str.slice(i + 1);
    str = str.substring(2, i);
  } else {
    str = str.slice(2);
  }
  i = str.indexOf(".");
  isFloat = i >= 0;
  Ctor = x.constructor;
  if (isFloat) {
    str = str.replace(".", "");
    len = str.length;
    i = len - i;
    divisor = intPow(Ctor, new Ctor(base), i, i * 2);
  }
  xd = convertBase(str, base, BASE);
  xe = xd.length - 1;
  for (i = xe; xd[i] === 0; --i) xd.pop();
  if (i < 0) return new Ctor(x.s * 0);
  x.e = getBase10Exponent(xd, xe);
  x.d = xd;
  external = false;
  if (isFloat) x = divide(x, divisor, len * 4);
  if (p) x = x.times(Math.abs(p) < 54 ? mathpow(2, p) : Decimal.pow(2, p));
  external = true;
  return x;
}
function sine(Ctor, x) {
  var k, len = x.d.length;
  if (len < 3) {
    return x.isZero() ? x : taylorSeries(Ctor, 2, x, x);
  }
  k = 1.4 * Math.sqrt(len);
  k = k > 16 ? 16 : k | 0;
  x = x.times(1 / tinyPow(5, k));
  x = taylorSeries(Ctor, 2, x, x);
  var sin2_x, d5 = new Ctor(5), d16 = new Ctor(16), d20 = new Ctor(20);
  for (; k--; ) {
    sin2_x = x.times(x);
    x = x.times(d5.plus(sin2_x.times(d16.times(sin2_x).minus(d20))));
  }
  return x;
}
function taylorSeries(Ctor, n, x, y, isHyperbolic) {
  var j, t, u, x2, i = 1, pr = Ctor.precision, k = Math.ceil(pr / LOG_BASE);
  external = false;
  x2 = x.times(x);
  u = new Ctor(y);
  for (; ; ) {
    t = divide(u.times(x2), new Ctor(n++ * n++), pr, 1);
    u = isHyperbolic ? y.plus(t) : y.minus(t);
    y = divide(t.times(x2), new Ctor(n++ * n++), pr, 1);
    t = u.plus(y);
    if (t.d[k] !== void 0) {
      for (j = k; t.d[j] === u.d[j] && j--; ) ;
      if (j == -1) break;
    }
    j = u;
    u = y;
    y = t;
    t = j;
    i++;
  }
  external = true;
  t.d.length = k + 1;
  return t;
}
function tinyPow(b, e) {
  var n = b;
  while (--e) n *= b;
  return n;
}
function toLessThanHalfPi(Ctor, x) {
  var t, isNeg = x.s < 0, pi = getPi(Ctor, Ctor.precision, 1), halfPi = pi.times(0.5);
  x = x.abs();
  if (x.lte(halfPi)) {
    quadrant = isNeg ? 4 : 1;
    return x;
  }
  t = x.divToInt(pi);
  if (t.isZero()) {
    quadrant = isNeg ? 3 : 2;
  } else {
    x = x.minus(t.times(pi));
    if (x.lte(halfPi)) {
      quadrant = isOdd(t) ? isNeg ? 2 : 3 : isNeg ? 4 : 1;
      return x;
    }
    quadrant = isOdd(t) ? isNeg ? 1 : 4 : isNeg ? 3 : 2;
  }
  return x.minus(pi).abs();
}
function toStringBinary(x, baseOut, sd, rm) {
  var base, e, i, k, len, roundUp, str, xd, y, Ctor = x.constructor, isExp = sd !== void 0;
  if (isExp) {
    checkInt32(sd, 1, MAX_DIGITS);
    if (rm === void 0) rm = Ctor.rounding;
    else checkInt32(rm, 0, 8);
  } else {
    sd = Ctor.precision;
    rm = Ctor.rounding;
  }
  if (!x.isFinite()) {
    str = nonFiniteToString(x);
  } else {
    str = finiteToString(x);
    i = str.indexOf(".");
    if (isExp) {
      base = 2;
      if (baseOut == 16) {
        sd = sd * 4 - 3;
      } else if (baseOut == 8) {
        sd = sd * 3 - 2;
      }
    } else {
      base = baseOut;
    }
    if (i >= 0) {
      str = str.replace(".", "");
      y = new Ctor(1);
      y.e = str.length - i;
      y.d = convertBase(finiteToString(y), 10, base);
      y.e = y.d.length;
    }
    xd = convertBase(str, 10, base);
    e = len = xd.length;
    for (; xd[--len] == 0; ) xd.pop();
    if (!xd[0]) {
      str = isExp ? "0p+0" : "0";
    } else {
      if (i < 0) {
        e--;
      } else {
        x = new Ctor(x);
        x.d = xd;
        x.e = e;
        x = divide(x, y, sd, rm, 0, base);
        xd = x.d;
        e = x.e;
        roundUp = inexact;
      }
      i = xd[sd];
      k = base / 2;
      roundUp = roundUp || xd[sd + 1] !== void 0;
      roundUp = rm < 4 ? (i !== void 0 || roundUp) && (rm === 0 || rm === (x.s < 0 ? 3 : 2)) : i > k || i === k && (rm === 4 || roundUp || rm === 6 && xd[sd - 1] & 1 || rm === (x.s < 0 ? 8 : 7));
      xd.length = sd;
      if (roundUp) {
        for (; ++xd[--sd] > base - 1; ) {
          xd[sd] = 0;
          if (!sd) {
            ++e;
            xd.unshift(1);
          }
        }
      }
      for (len = xd.length; !xd[len - 1]; --len) ;
      for (i = 0, str = ""; i < len; i++) str += NUMERALS.charAt(xd[i]);
      if (isExp) {
        if (len > 1) {
          if (baseOut == 16 || baseOut == 8) {
            i = baseOut == 16 ? 4 : 3;
            for (--len; len % i; len++) str += "0";
            xd = convertBase(str, base, baseOut);
            for (len = xd.length; !xd[len - 1]; --len) ;
            for (i = 1, str = "1."; i < len; i++) str += NUMERALS.charAt(xd[i]);
          } else {
            str = str.charAt(0) + "." + str.slice(1);
          }
        }
        str = str + (e < 0 ? "p" : "p+") + e;
      } else if (e < 0) {
        for (; ++e; ) str = "0" + str;
        str = "0." + str;
      } else {
        if (++e > len) for (e -= len; e--; ) str += "0";
        else if (e < len) str = str.slice(0, e) + "." + str.slice(e);
      }
    }
    str = (baseOut == 16 ? "0x" : baseOut == 2 ? "0b" : baseOut == 8 ? "0o" : "") + str;
  }
  return x.s < 0 ? "-" + str : str;
}
function truncate(arr, len) {
  if (arr.length > len) {
    arr.length = len;
    return true;
  }
}
function abs(x) {
  return new this(x).abs();
}
function acos(x) {
  return new this(x).acos();
}
function acosh(x) {
  return new this(x).acosh();
}
function add(x, y) {
  return new this(x).plus(y);
}
function asin(x) {
  return new this(x).asin();
}
function asinh(x) {
  return new this(x).asinh();
}
function atan(x) {
  return new this(x).atan();
}
function atanh(x) {
  return new this(x).atanh();
}
function atan2(y, x) {
  y = new this(y);
  x = new this(x);
  var r, pr = this.precision, rm = this.rounding, wpr = pr + 4;
  if (!y.s || !x.s) {
    r = new this(NaN);
  } else if (!y.d && !x.d) {
    r = getPi(this, wpr, 1).times(x.s > 0 ? 0.25 : 0.75);
    r.s = y.s;
  } else if (!x.d || y.isZero()) {
    r = x.s < 0 ? getPi(this, pr, rm) : new this(0);
    r.s = y.s;
  } else if (!y.d || x.isZero()) {
    r = getPi(this, wpr, 1).times(0.5);
    r.s = y.s;
  } else if (x.s < 0) {
    this.precision = wpr;
    this.rounding = 1;
    r = this.atan(divide(y, x, wpr, 1));
    x = getPi(this, wpr, 1);
    this.precision = pr;
    this.rounding = rm;
    r = y.s < 0 ? r.minus(x) : r.plus(x);
  } else {
    r = this.atan(divide(y, x, wpr, 1));
  }
  return r;
}
function cbrt(x) {
  return new this(x).cbrt();
}
function ceil(x) {
  return finalise(x = new this(x), x.e + 1, 2);
}
function clamp(x, min2, max2) {
  return new this(x).clamp(min2, max2);
}
function config(obj) {
  if (!obj || typeof obj !== "object") throw Error(decimalError + "Object expected");
  var i, p, v, useDefaults = obj.defaults === true, ps = [
    "precision",
    1,
    MAX_DIGITS,
    "rounding",
    0,
    8,
    "toExpNeg",
    -EXP_LIMIT,
    0,
    "toExpPos",
    0,
    EXP_LIMIT,
    "maxE",
    0,
    EXP_LIMIT,
    "minE",
    -EXP_LIMIT,
    0,
    "modulo",
    0,
    9
  ];
  for (i = 0; i < ps.length; i += 3) {
    if (p = ps[i], useDefaults) this[p] = DEFAULTS[p];
    if ((v = obj[p]) !== void 0) {
      if (mathfloor(v) === v && v >= ps[i + 1] && v <= ps[i + 2]) this[p] = v;
      else throw Error(invalidArgument + p + ": " + v);
    }
  }
  if (p = "crypto", useDefaults) this[p] = DEFAULTS[p];
  if ((v = obj[p]) !== void 0) {
    if (v === true || v === false || v === 0 || v === 1) {
      if (v) {
        if (typeof crypto != "undefined" && crypto && (crypto.getRandomValues || crypto.randomBytes)) {
          this[p] = true;
        } else {
          throw Error(cryptoUnavailable);
        }
      } else {
        this[p] = false;
      }
    } else {
      throw Error(invalidArgument + p + ": " + v);
    }
  }
  return this;
}
function cos(x) {
  return new this(x).cos();
}
function cosh(x) {
  return new this(x).cosh();
}
function clone(obj) {
  var i, p, ps;
  function Decimal2(v) {
    var e, i2, t, x = this;
    if (!(x instanceof Decimal2)) return new Decimal2(v);
    x.constructor = Decimal2;
    if (isDecimalInstance(v)) {
      x.s = v.s;
      if (external) {
        if (!v.d || v.e > Decimal2.maxE) {
          x.e = NaN;
          x.d = null;
        } else if (v.e < Decimal2.minE) {
          x.e = 0;
          x.d = [0];
        } else {
          x.e = v.e;
          x.d = v.d.slice();
        }
      } else {
        x.e = v.e;
        x.d = v.d ? v.d.slice() : v.d;
      }
      return;
    }
    t = typeof v;
    if (t === "number") {
      if (v === 0) {
        x.s = 1 / v < 0 ? -1 : 1;
        x.e = 0;
        x.d = [0];
        return;
      }
      if (v < 0) {
        v = -v;
        x.s = -1;
      } else {
        x.s = 1;
      }
      if (v === ~~v && v < 1e7) {
        for (e = 0, i2 = v; i2 >= 10; i2 /= 10) e++;
        if (external) {
          if (e > Decimal2.maxE) {
            x.e = NaN;
            x.d = null;
          } else if (e < Decimal2.minE) {
            x.e = 0;
            x.d = [0];
          } else {
            x.e = e;
            x.d = [v];
          }
        } else {
          x.e = e;
          x.d = [v];
        }
        return;
      }
      if (v * 0 !== 0) {
        if (!v) x.s = NaN;
        x.e = NaN;
        x.d = null;
        return;
      }
      return parseDecimal(x, v.toString());
    }
    if (t === "string") {
      if ((i2 = v.charCodeAt(0)) === 45) {
        v = v.slice(1);
        x.s = -1;
      } else {
        if (i2 === 43) v = v.slice(1);
        x.s = 1;
      }
      return isDecimal.test(v) ? parseDecimal(x, v) : parseOther(x, v);
    }
    if (t === "bigint") {
      if (v < 0) {
        v = -v;
        x.s = -1;
      } else {
        x.s = 1;
      }
      return parseDecimal(x, v.toString());
    }
    throw Error(invalidArgument + v);
  }
  Decimal2.prototype = P;
  Decimal2.ROUND_UP = 0;
  Decimal2.ROUND_DOWN = 1;
  Decimal2.ROUND_CEIL = 2;
  Decimal2.ROUND_FLOOR = 3;
  Decimal2.ROUND_HALF_UP = 4;
  Decimal2.ROUND_HALF_DOWN = 5;
  Decimal2.ROUND_HALF_EVEN = 6;
  Decimal2.ROUND_HALF_CEIL = 7;
  Decimal2.ROUND_HALF_FLOOR = 8;
  Decimal2.EUCLID = 9;
  Decimal2.config = Decimal2.set = config;
  Decimal2.clone = clone;
  Decimal2.isDecimal = isDecimalInstance;
  Decimal2.abs = abs;
  Decimal2.acos = acos;
  Decimal2.acosh = acosh;
  Decimal2.add = add;
  Decimal2.asin = asin;
  Decimal2.asinh = asinh;
  Decimal2.atan = atan;
  Decimal2.atanh = atanh;
  Decimal2.atan2 = atan2;
  Decimal2.cbrt = cbrt;
  Decimal2.ceil = ceil;
  Decimal2.clamp = clamp;
  Decimal2.cos = cos;
  Decimal2.cosh = cosh;
  Decimal2.div = div;
  Decimal2.exp = exp;
  Decimal2.floor = floor;
  Decimal2.hypot = hypot;
  Decimal2.ln = ln;
  Decimal2.log = log;
  Decimal2.log10 = log10;
  Decimal2.log2 = log2;
  Decimal2.max = max;
  Decimal2.min = min;
  Decimal2.mod = mod;
  Decimal2.mul = mul;
  Decimal2.pow = pow;
  Decimal2.random = random;
  Decimal2.round = round;
  Decimal2.sign = sign;
  Decimal2.sin = sin;
  Decimal2.sinh = sinh;
  Decimal2.sqrt = sqrt;
  Decimal2.sub = sub;
  Decimal2.sum = sum;
  Decimal2.tan = tan;
  Decimal2.tanh = tanh;
  Decimal2.trunc = trunc;
  if (obj === void 0) obj = {};
  if (obj) {
    if (obj.defaults !== true) {
      ps = ["precision", "rounding", "toExpNeg", "toExpPos", "maxE", "minE", "modulo", "crypto"];
      for (i = 0; i < ps.length; ) if (!obj.hasOwnProperty(p = ps[i++])) obj[p] = this[p];
    }
  }
  Decimal2.config(obj);
  return Decimal2;
}
function div(x, y) {
  return new this(x).div(y);
}
function exp(x) {
  return new this(x).exp();
}
function floor(x) {
  return finalise(x = new this(x), x.e + 1, 3);
}
function hypot() {
  var i, n, t = new this(0);
  external = false;
  for (i = 0; i < arguments.length; ) {
    n = new this(arguments[i++]);
    if (!n.d) {
      if (n.s) {
        external = true;
        return new this(1 / 0);
      }
      t = n;
    } else if (t.d) {
      t = t.plus(n.times(n));
    }
  }
  external = true;
  return t.sqrt();
}
function isDecimalInstance(obj) {
  return obj instanceof Decimal || obj && obj.toStringTag === tag || false;
}
function ln(x) {
  return new this(x).ln();
}
function log(x, y) {
  return new this(x).log(y);
}
function log2(x) {
  return new this(x).log(2);
}
function log10(x) {
  return new this(x).log(10);
}
function max() {
  return maxOrMin(this, arguments, -1);
}
function min() {
  return maxOrMin(this, arguments, 1);
}
function mod(x, y) {
  return new this(x).mod(y);
}
function mul(x, y) {
  return new this(x).mul(y);
}
function pow(x, y) {
  return new this(x).pow(y);
}
function random(sd) {
  var d, e, k, n, i = 0, r = new this(1), rd = [];
  if (sd === void 0) sd = this.precision;
  else checkInt32(sd, 1, MAX_DIGITS);
  k = Math.ceil(sd / LOG_BASE);
  if (!this.crypto) {
    for (; i < k; ) rd[i++] = Math.random() * 1e7 | 0;
  } else if (crypto.getRandomValues) {
    d = crypto.getRandomValues(new Uint32Array(k));
    for (; i < k; ) {
      n = d[i];
      if (n >= 429e7) {
        d[i] = crypto.getRandomValues(new Uint32Array(1))[0];
      } else {
        rd[i++] = n % 1e7;
      }
    }
  } else if (crypto.randomBytes) {
    d = crypto.randomBytes(k *= 4);
    for (; i < k; ) {
      n = d[i] + (d[i + 1] << 8) + (d[i + 2] << 16) + ((d[i + 3] & 127) << 24);
      if (n >= 214e7) {
        crypto.randomBytes(4).copy(d, i);
      } else {
        rd.push(n % 1e7);
        i += 4;
      }
    }
    i = k / 4;
  } else {
    throw Error(cryptoUnavailable);
  }
  k = rd[--i];
  sd %= LOG_BASE;
  if (k && sd) {
    n = mathpow(10, LOG_BASE - sd);
    rd[i] = (k / n | 0) * n;
  }
  for (; rd[i] === 0; i--) rd.pop();
  if (i < 0) {
    e = 0;
    rd = [0];
  } else {
    e = -1;
    for (; rd[0] === 0; e -= LOG_BASE) rd.shift();
    for (k = 1, n = rd[0]; n >= 10; n /= 10) k++;
    if (k < LOG_BASE) e -= LOG_BASE - k;
  }
  r.e = e;
  r.d = rd;
  return r;
}
function round(x) {
  return finalise(x = new this(x), x.e + 1, this.rounding);
}
function sign(x) {
  x = new this(x);
  return x.d ? x.d[0] ? x.s : 0 * x.s : x.s || NaN;
}
function sin(x) {
  return new this(x).sin();
}
function sinh(x) {
  return new this(x).sinh();
}
function sqrt(x) {
  return new this(x).sqrt();
}
function sub(x, y) {
  return new this(x).sub(y);
}
function sum() {
  var i = 0, args = arguments, x = new this(args[i]);
  external = false;
  for (; x.s && ++i < args.length; ) x = x.plus(args[i]);
  external = true;
  return finalise(x, this.precision, this.rounding);
}
function tan(x) {
  return new this(x).tan();
}
function tanh(x) {
  return new this(x).tanh();
}
function trunc(x) {
  return finalise(x = new this(x), x.e + 1, 1);
}
P[/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")] = P.toString;
P[Symbol.toStringTag] = "Decimal";
var Decimal = P.constructor = clone(DEFAULTS);
LN10 = new Decimal(LN10);
PI = new Decimal(PI);
var decimal_default = Decimal;

// src/lib/overmoldSpec.ts
function formatOvermoldForm(form) {
  if (!form) return "";
  if (form === "straight" || form === "\u76F4\u5934") return "\u76F4\u5934";
  if (form === "bent" || form === "\u5F2F\u5934") return "\u5F2F\u5934";
  return form;
}
function getAvailableInnerMold(spec) {
  if (!spec?.innerMaterial || !spec.innerForm || spec.innerForm !== spec.outerForm) {
    return null;
  }
  return {
    material: spec.innerMaterial,
    form: spec.innerForm,
    formLabel: formatOvermoldForm(spec.innerForm)
  };
}

// src/lib/quoteMaterials.ts
function normalizeSpecification(value) {
  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    return value.trim();
  }
}
function materialPriceKey(row) {
  return JSON.stringify([row.kind, row.resourceId, normalizeSpecification(row.specification), row.lengthMm, row.unit]);
}
function materialPriceTierKey(row) {
  return JSON.stringify([row.kind, row.resourceId, normalizeSpecification(row.specification), row.unit]);
}
function getQuoteMaterials(config2, catalog) {
  const rows = config2.connectors.map(({ connector: c }) => ({
    kind: "connector",
    resourceId: c.resourceItemId || c.id,
    name: c.name,
    specification: JSON.stringify([c.model || "", c.series || "", c.pinCount, c.type]),
    lengthMm: 0,
    unit: "\u5143/\u4E2A",
    quantity: 1
  }));
  for (const material of config2.materials) {
    const s = material.spec;
    const specification = s.kind === "jacketed" ? [s.kind, s.awg ?? null, s.coreCount, s.shielded, s.jacketMaterial, s.jacketColor, s.odMm, s.ulNumber || "", s.coreColors, ...s.conductorAreaMm2 === void 0 ? [] : [s.conductorAreaMm2]] : [s.kind, s.awg, s.color, s.ulNumber];
    rows.push({
      kind: "wire",
      resourceId: material.resourceItemId || "",
      name: material.name,
      specification: JSON.stringify(specification),
      lengthMm: s.lengthMm,
      unit: "\u5143/\u6761",
      quantity: 1
    });
  }
  for (const model of config2.models) {
    const spec = catalog?.overmolds.find((entry) => entry.id === model.overmoldSpecId);
    rows.push({
      kind: "outer-mold",
      resourceId: spec?.resourceItemId || model.resourceItemId || model.overmoldSpecId,
      name: spec?.name || model.overmoldSpecId,
      specification: spec ? JSON.stringify([spec.outerMaterial, spec.outerHardness || "", spec.outerForm]) : "",
      lengthMm: 0,
      unit: "\u5143/\u4E2A",
      quantity: 1
    });
    const inner = model.includeInnerMold ? getAvailableInnerMold(spec) : null;
    if (inner) rows.push({
      kind: "inner-mold",
      resourceId: spec?.resourceItemId || spec.id,
      name: `${inner.material}${inner.formLabel}\u5185\u6A21`,
      specification: JSON.stringify([inner.material, inner.form]),
      lengthMm: 0,
      unit: "\u5143/\u4E2A",
      quantity: 1
    });
  }
  const grouped = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = materialPriceKey(row);
    const previous = grouped.get(key);
    if (previous) previous.quantity += row.quantity;
    else grouped.set(key, { ...row });
  }
  return [...grouped.values()];
}

// src/lib/finishingLaborRates.ts
var FINISHING_LABOR_NAMES = ["\u7535\u6D4B", "\u5916\u89C2", "\u5305\u88C5\u4EBA\u5DE5"];
var FINISHING_LENGTHS_MM = [500, 1e3, 2e3, 3e3, 5e3];
var STANDARD_LABOR_NAMES = ["\u88C1\u7EBF", "\u53BB\u76AE", "\u53BB\u5916\u76AE", "\u5904\u7406\u7F16\u7EC7", "\u70ED\u7F29\u7F16\u7EC7", "\u710A\u63A5", "\u6210\u578B", "\u6CBE\u9521"];

// src/lib/pricingSettingsImport.ts
function validatePricingSettings(value) {
  const object2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  if (!object2(value)) return false;
  const input = value;
  const rates = ["materialLossRate", "processingLossRate", "marginRate", "freightRate"];
  if (Object.keys(input).some((k) => ![...rates, "laborRates", "finishingLaborRates", "version"].includes(k))) return false;
  const valid = (v) => typeof v === "string" && /^[0-9]{1,9}(\.[0-9]{1,6})?$/.test(v);
  if (rates.some((k) => !valid(input[k]) || Number(input[k]) >= 1)) return false;
  const validRates = (v, names) => object2(v) && Object.keys(v).length === names.length && names.every((k) => valid(v[k]));
  const tiers = input.finishingLaborRates;
  return validRates(input.laborRates, STANDARD_LABOR_NAMES) && object2(tiers) && Object.keys(tiers).length === FINISHING_LENGTHS_MM.length && FINISHING_LENGTHS_MM.every((length) => validRates(tiers[length], FINISHING_LABOR_NAMES));
}

// server/pricing.ts
var DEFAULT_PRICING_SETTINGS = {
  version: 1,
  materialLossRate: "0.03",
  processingLossRate: "0.05",
  marginRate: "0.20",
  freightRate: "0.03",
  laborRates: { "\u88C1\u7EBF": "0.05", "\u53BB\u76AE": "0.05", "\u53BB\u5916\u76AE": "0.02", "\u5904\u7406\u7F16\u7EC7": "0.10", "\u70ED\u7F29\u7F16\u7EC7": "0.10", "\u710A\u63A5": "0.20", "\u6210\u578B": "0.20", "\u6CBE\u9521": "0.05" },
  finishingLaborRates: {
    "500": { \u7535\u6D4B: "0.05", \u5916\u89C2: "0.05", \u5305\u88C5\u4EBA\u5DE5: "0.05" },
    "1000": { \u7535\u6D4B: "0.10", \u5916\u89C2: "0.20", \u5305\u88C5\u4EBA\u5DE5: "0.10" },
    "2000": { \u7535\u6D4B: "0.10", \u5916\u89C2: "0.20", \u5305\u88C5\u4EBA\u5DE5: "0.20" },
    "3000": { \u7535\u6D4B: "0.10", \u5916\u89C2: "0.20", \u5305\u88C5\u4EBA\u5DE5: "0.20" },
    "5000": { \u7535\u6D4B: "0.10", \u5916\u89C2: "0.20", \u5305\u88C5\u4EBA\u5DE5: "0.30" }
  }
};
var Money = decimal_default.clone({ precision: 40, rounding: decimal_default.ROUND_HALF_UP });
function calculatePrice(config2, prices, catalog, parameters = DEFAULT_PRICING_SETTINGS) {
  if (!validatePricingSettings(parameters)) return { status: "blocked", issues: ["\u5B9A\u4EF7\u53C2\u6570\u65E0\u6548\uFF0C\u8BF7\u68C0\u67E5\u5DE5\u827A\u5355\u4EF7\u53CA\u4E94\u6863\u7EBF\u957F\u4EF7\u683C"] };
  const issues = [];
  const wire = config2.materials[0];
  if (config2.materials.length !== 1) issues.push("\u81EA\u52A8\u62A5\u4EF7\u4EC5\u652F\u6301\u4E00\u6839\u5B9E\u4F53\u7EBF\u6750");
  if (!wire || !Number.isSafeInteger(wire.spec.lengthMm) || wire.spec.lengthMm <= 0) issues.push("\u7EBF\u957F\u5FC5\u987B\u4E3A\u6B63\u6574\u6570\u6BEB\u7C73");
  if (!Number.isSafeInteger(config2.quantity) || config2.quantity < 1 || config2.quantity > 1e6) issues.push("\u8BA2\u5355\u6570\u91CF\u5FC5\u987B\u4E3A 1 \u81F3 1000000 \u7684\u6574\u6570");
  if (!config2.connectors.length || config2.connectors.length > 2) issues.push("\u7B2C\u4E00\u7248\u4EC5\u652F\u6301\u5355\u5934\u6216\u53CC\u5934\u8FDE\u63A5\u5668");
  if (config2.connectors.some(({ connector: c }) => !/\bM(?:8|12)(?!\d)/i.test(c.series || c.name))) issues.push("\u81EA\u52A8\u62A5\u4EF7\u4EC5\u652F\u6301 M8\u3001M12 \u8FDE\u63A5\u5668");
  const settings = config2.quotation;
  const endpointBType = settings?.endpointBType ?? (config2.connectors.length === 2 ? "connector" : "cut");
  const tinningEnds = endpointBType === "strip-tin" ? 1 : 0;
  if (!["connector", "cut", "strip-tin"].includes(endpointBType) || config2.connectors.length !== (endpointBType === "connector" ? 2 : 1)) {
    issues.push("B \u7AEF\u5F62\u5F0F\u4E0E\u8FDE\u63A5\u5668\u6570\u91CF\u4E0D\u4E00\u81F4");
  }
  if (!settings || ![1, 2].includes(settings.processingEnds)) issues.push("\u8BF7\u786E\u8BA4\u52A0\u5DE5\u7AEF\u6570\u4E0E SR \u70B9\u6570");
  if (settings && (settings.processingEnds !== config2.connectors.length || !Number.isInteger(settings.srPoints) || settings.srPoints < 0 || settings.srPoints > settings.processingEnds)) issues.push("\u52A0\u5DE5\u7AEF\u6570\u987B\u4E0E\u8FDE\u63A5\u5668\u4E2A\u6570\u4E00\u81F4\uFF0CSR \u70B9\u6570\u4E0D\u80FD\u8D85\u8FC7\u7AEF\u6570");
  if (config2.models.length !== config2.connectors.length) issues.push("\u6BCF\u4E2A\u52A0\u5DE5\u7AEF\u5FC5\u987B\u6709\u4E00\u4E2A\u5916\u6A21\uFF0C\u5916\u6A21\u4E2A\u6570\u987B\u4E0E\u52A0\u5DE5\u7AEF\u6570\u4E00\u81F4");
  const innerMoldCount = config2.models.filter((model) => model.includeInnerMold).length;
  if (config2.connectors.length === 2) {
    if (innerMoldCount === 1) issues.push("\u53CC\u7AEF\u5185\u6A21\u5FC5\u987B\u4E24\u7AEF\u90FD\u6709\u6216\u4E24\u7AEF\u90FD\u6CA1\u6709");
  }
  for (const model of config2.models) {
    const spec = catalog?.overmolds.find((entry) => entry.id === model.overmoldSpecId);
    if (!spec || spec.outerMaterial !== "\u9ED1\u8272PVC" || spec.outerHardness !== "45P") issues.push("\u5916\u6A21\u987B\u4E3A\u76EE\u5F55\u4E2D\u7684\u9ED1\u8272 PVC 45P");
    if (model.includeInnerMold && !getAvailableInnerMold(spec)) issues.push("\u6240\u9009\u5916\u6A21\u6CA1\u6709\u53EF\u7528\u7684\u5185\u6A21\u89C4\u683C");
  }
  const cores = wire?.spec.kind === "jacketed" ? wire.spec.coreCount : 1;
  if (!Number.isInteger(cores) || cores < 1 || cores > 100) issues.push("\u7EBF\u6750\u82AF\u6570\u5FC5\u987B\u4E3A 1 \u81F3 100");
  if (issues.length) return { status: "blocked", issues: [...new Set(issues)] };
  if (wire.spec.lengthMm > 5e3) return { status: "manual", issues: ["\u8D85\u8FC7 5 \u7C73\uFF0C\u9700\u4EBA\u5DE5\u6838\u4EF7"] };
  const materialLines = [];
  for (const row of getQuoteMaterials(config2, catalog)) {
    const matches = prices.filter((price) => materialPriceTierKey(price) === materialPriceTierKey(row) && price.lengthMm >= row.lengthMm).sort((a, b) => a.lengthMm - b.lengthMm);
    const selectedLength = matches[0]?.lengthMm;
    const selected = matches.filter((price) => price.lengthMm === selectedLength);
    if (!row.resourceId || selected.length !== 1) {
      issues.push(`${row.name}\uFF1A\u7F3A\u5C11\u552F\u4E00\u5339\u914D\u7684\u542B\u7A0E\u4EF7\u683C${row.kind === "wire" ? `\uFF08\u5B9E\u9645 ${row.lengthMm}mm\uFF0C\u9700\u4E0D\u5C0F\u4E8E\u8BE5\u957F\u5EA6\u7684\u4EF7\u683C\u6863\u4F4D\uFF09` : ""}`);
      continue;
    }
    if (!/^\d{1,9}(\.\d{1,6})?$/.test(selected[0].taxIncludedPrice)) {
      issues.push(`${row.name}\uFF1A\u4EF7\u683C\u65E0\u6548`);
      continue;
    }
    const amount = new Money(selected[0].taxIncludedPrice);
    if (!amount.isFinite() || amount.isNegative()) {
      issues.push(`${row.name}\uFF1A\u4EF7\u683C\u65E0\u6548`);
      continue;
    }
    materialLines.push({ name: row.name, points: row.quantity, unitPrice: amount.toString(), amount: amount.mul(row.quantity).toString(), kind: row.kind });
  }
  if (issues.length) return { status: "blocked", issues };
  const weldingEnds = settings.processingEnds;
  const ends = weldingEnds + tinningEnds;
  const shield = wire.spec.kind === "jacketed" && wire.spec.shielded;
  const molding = config2.models.length + innerMoldCount;
  const laborInput = [
    ["\u88C1\u7EBF", Math.ceil(wire.spec.lengthMm / 500)],
    ["\u53BB\u76AE", cores * ends],
    ["\u53BB\u5916\u76AE", ends],
    ["\u5904\u7406\u7F16\u7EC7", shield ? ends : 0],
    ["\u70ED\u7F29\u7F16\u7EC7", shield ? ends : 0],
    ["\u710A\u63A5", (cores + (shield ? 1 : 0)) * weldingEnds],
    ["\u6210\u578B", molding],
    ["\u6CBE\u9521", (cores + (shield ? 1 : 0)) * tinningEnds]
  ];
  const labor = laborInput.map(([name, points]) => ({ name, points, unitPrice: parameters.laborRates[name], amount: new Money(parameters.laborRates[name]).mul(points).toString() }));
  const finishingLength = FINISHING_LENGTHS_MM.find((length) => wire.spec.lengthMm <= length);
  const finishingRates = parameters.finishingLaborRates[finishingLength];
  labor.push(...FINISHING_LABOR_NAMES.map((name) => ({
    name,
    points: 1,
    unitPrice: finishingRates[name],
    amount: new Money(finishingRates[name]).toString()
  })));
  const sum2 = (lines) => lines.reduce((total, row) => total.plus(row.amount), new Money(0));
  const m = sum2(materialLines), p = sum2(labor);
  const materialLoss = m.mul(parameters.materialLossRate), processingLoss = p.mul(parameters.processingLossRate);
  const cost = m.plus(p).plus(materialLoss).plus(processingLoss);
  const sellingPrice = cost.div(new Money(1).minus(parameters.marginRate)), freight = sellingPrice.mul(parameters.freightRate);
  const unitPrice = sellingPrice.plus(freight).toFixed(2);
  return { status: "ready", price: {
    materials: materialLines,
    labor,
    materialSubtotal: m.toString(),
    laborSubtotal: p.toString(),
    materialLoss: materialLoss.toString(),
    processingLoss: processingLoss.toString(),
    cost: cost.toString(),
    sellingPrice: sellingPrice.toString(),
    freight: freight.toString(),
    unitPrice,
    totalPrice: new Money(unitPrice).mul(config2.quantity).toFixed(2)
  } };
}

// server/quoteService.ts
function catalogFromRows(rows) {
  const items = rows.map(parseCatalogItemRow);
  return {
    connectors: items.filter((i) => i.kind === "connector").map((i) => ({
      id: i.code,
      resourceItemId: i.id,
      name: i.name,
      model: i.model,
      ...i.spec,
      type: i.spec.connectorType
    })),
    wires: items.filter((i) => i.kind === "wire").map((i) => ({
      id: i.code,
      resourceItemId: i.id,
      name: i.name,
      spec: i.spec.kind === "electronic" ? { ...i.spec, color: i.spec.conductorColor } : { ...i.spec }
    })),
    overmolds: items.filter((i) => i.kind === "overmold").map((i) => ({
      id: i.code,
      resourceItemId: i.id,
      name: i.name,
      ...i.spec
    })),
    wireColors: [],
    leadTimeOptions: [],
    protectionOptions: [],
    pricingRules: [],
    quantityDiscountRules: [],
    loadedAt: Date.now()
  };
}
function canonicalizeQuote(config2, catalog) {
  if (!config2 || !Array.isArray(config2.connectors) || !Array.isArray(config2.materials) || !Array.isArray(config2.models) || config2.connectors.length > 2 || config2.materials.length !== 1 || config2.models.length > 2 || config2.protectiveSleeves?.length) {
    throw new Error("\u914D\u7F6E\u8D85\u51FA\u81EA\u52A8\u62A5\u4EF7\u652F\u6301\u8303\u56F4");
  }
  const connectors = config2.connectors.map((instance) => {
    const connector = catalog.connectors.find((c) => c.resourceItemId === instance.connector?.resourceItemId);
    if (!connector) throw new Error("\u8FDE\u63A5\u5668\u4E0D\u5728\u7269\u6599\u76EE\u5F55\u4E2D");
    return { ...instance, connector };
  });
  const materials = config2.materials.map((material) => {
    const wire = catalog.wires.find((w) => w.resourceItemId === material.resourceItemId);
    if (!wire || !material.spec) throw new Error("\u7EBF\u6750\u4E0D\u5728\u7269\u6599\u76EE\u5F55\u4E2D");
    return { ...material, name: wire.name, spec: applyCatalogWireSpec(material.spec, wire.spec) };
  });
  const wireSpec = materials[0].spec;
  if (wireSpec.kind !== "jacketed" || connectors.some(({ connector }) => connector.pinCount !== wireSpec.coreCount || typeof connector.shielded !== "boolean" || connector.shielded !== wireSpec.shielded)) {
    throw new Error("\u8FDE\u63A5\u5668\u548C\u7EBF\u6750\u7684\u82AF\u6570\u3001\u5C4F\u853D\u5C5E\u6027\u5FC5\u987B\u4E00\u81F4");
  }
  for (const model of config2.models) {
    if (model.kind !== "outer-box" || model.includeInnerMold !== void 0 && typeof model.includeInnerMold !== "boolean") throw new Error("\u4E0D\u652F\u6301\u6B64\u6210\u578B\u914D\u7F6E");
    if (!catalog.overmolds.some((m) => m.id === model.overmoldSpecId)) throw new Error("\u5916\u6A21\u4E0D\u5728\u7269\u6599\u76EE\u5F55\u4E2D");
  }
  return { ...config2, connectors, materials };
}
function quoteForRole(config2, catalog, prices, settings, role) {
  if (role !== "sales" && !canViewPricing(role)) throw new Error("\u62A5\u4EF7\u6743\u9650\u672A\u5C31\u7EEA");
  const result = calculatePrice(canonicalizeQuote(config2, catalog), prices, catalog, settings);
  if (result.status !== "ready") return canViewPricing(role) ? result : {
    status: result.status,
    issues: [result.status === "manual" ? "\u9700\u5DE5\u7A0B\u5E08\u4EBA\u5DE5\u6838\u4EF7" : "\u5F53\u524D\u914D\u7F6E\u65E0\u6CD5\u62A5\u4EF7\uFF0C\u8BF7\u68C0\u67E5\u4FE1\u606F\u6216\u8054\u7CFB\u5DE5\u7A0B\u5E08"]
  };
  return {
    status: "ready",
    settingsVersion: settings.version,
    calculatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    price: {
      unitPrice: result.price.unitPrice,
      totalPrice: result.price.totalPrice,
      ...canViewPricing(role) ? { breakdown: result.price } : {}
    }
  };
}
export {
  canonicalizeQuote,
  catalogFromRows,
  quoteForRole
};
/*! Bundled license information:

decimal.js/decimal.mjs:
  (*!
   *  decimal.js v10.6.0
   *  An arbitrary-precision Decimal type for JavaScript.
   *  https://github.com/MikeMcl/decimal.js
   *  Copyright (c) 2025 Michael Mclaughlin <M8ch88l@gmail.com>
   *  MIT Licence
   *)
*/

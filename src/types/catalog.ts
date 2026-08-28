import type {
  Connector,
  ElectronicWireSpec,
  JacketedWireSpec,
  OvermoldSpec,
  TemperatureRangeC,
  WireColor,
} from '@/types/harness';

/** Engineering facts imported from a manufacturer or customer catalog. */
export interface CatalogWireEngineeringSpec {
  ratedVoltageV?: number;
  temperatureRangeC?: TemperatureRangeC;
  flameTest?: string;
  rohsCompliant?: boolean;
  conductorMaterial?: string;
  conductorStructure?: string;
  insulationMaterial?: string;
  insulationDiameterMm?: number;
  insulationDiameterToleranceMm?: number;
  braidStructure?: string;
  /** Keep source text when a sheet contains a second, conflicting notation. */
  braidStructureDescription?: string;
  shieldCoverageRatio?: number;
  /** Keep source text such as 65% alongside the normalized ratio. */
  shieldCoverageDescription?: string;
  jacketHardnessP?: number;
  outerDiameterMm?: number;
  outerDiameterToleranceMm?: number;
  tensileStrengthPsi?: number;
  elongationPercent?: number;
  conductorResistanceOhmPerKmAt20C?: number;
  insulationResistanceMOhmKm?: number;
  coreColorDescription?: string;
}

export type CatalogWireSpec =
  | (Pick<ElectronicWireSpec, 'kind' | 'color' | 'awg' | 'ulNumber'> & CatalogWireEngineeringSpec)
  | (Pick<JacketedWireSpec, 'kind' | 'jacketMaterial' | 'jacketColor' | 'awg' | 'coreCount' | 'shielded' | 'coreColors' | 'ulNumber'> & CatalogWireEngineeringSpec);

export interface CatalogWire {
  id: string;
  resourceItemId: string;
  name: string;
  /** Original catalog model and common metadata, when loaded from Supabase. */
  model?: string;
  manufacturer?: string;
  resourceGroup?: string;
  description?: string;
  image?: string;
  spec: CatalogWireSpec;
}

export interface LeadTimeOption {
  id: string;
  name: string;
  days: string;
  multiplier: number;
}

export interface ProtectionOption {
  id: string;
  name: string;
  price: number;
  materialMultipliers: Record<string, number>;
}

export interface PricingRule {
  ruleCode: string;
  ruleKey: string;
  numericValue: number;
}

export interface QuantityDiscountRule {
  minimumQuantity: number;
  multiplier: number;
}

export interface CatalogSnapshot {
  connectors: Connector[];
  wires: CatalogWire[];
  wireColors: WireColor[];
  overmolds: OvermoldSpec[];
  leadTimeOptions: LeadTimeOption[];
  protectionOptions: ProtectionOption[];
  pricingRules: PricingRule[];
  quantityDiscountRules: QuantityDiscountRule[];
  loadedAt: number;
}

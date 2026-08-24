import type {
  Connector,
  ElectronicWireSpec,
  JacketedWireSpec,
  OvermoldSpec,
  WireColor,
} from '@/types/harness';

export type CatalogWireSpec =
  | Pick<ElectronicWireSpec, 'kind' | 'color' | 'awg' | 'ulNumber'>
  | Pick<JacketedWireSpec, 'kind' | 'jacketMaterial' | 'jacketColor' | 'awg' | 'coreCount' | 'shielded' | 'coreColors' | 'ulNumber'>;

export interface CatalogWire {
  id: string;
  resourceItemId: string;
  name: string;
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

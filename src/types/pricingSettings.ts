export type FinishingLaborRates = Record<'500' | '1000' | '2000' | '3000' | '5000',
  Record<'电测' | '外观' | '包装人工', string>>;

export interface PricingSettings {
  version: number;
  materialLossRate: string;
  processingLossRate: string;
  marginRate: string;
  freightRate: string;
  laborRates: Record<string, string>;
  finishingLaborRates: FinishingLaborRates;
}

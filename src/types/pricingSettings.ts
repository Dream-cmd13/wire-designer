export interface PricingSettings {
  version: number;
  materialLossRate: string;
  processingLossRate: string;
  marginRate: string;
  freightRate: string;
  laborRates: Record<string, string>;
}

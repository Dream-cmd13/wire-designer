import type {
  LeadTimeOption,
  PricingRule,
  ProtectionOption,
  QuantityDiscountRule,
} from '@/types/catalog';
import type { WireColor } from '@/types/harness';

export const WIRE_COLORS = [
  { id: 'red', name: '红色', hex: '#DC2626' },
  { id: 'black', name: '黑色', hex: '#171717' },
  { id: 'white', name: '白色', hex: '#F5F5F5' },
  { id: 'green', name: '绿色', hex: '#16A34A' },
  { id: 'blue', name: '蓝色', hex: '#2563EB' },
  { id: 'yellow', name: '黄色', hex: '#CA8A04' },
  { id: 'orange', name: '橙色', hex: '#EA580C' },
  { id: 'purple', name: '紫色', hex: '#9333EA' },
  { id: 'brown', name: '棕色', hex: '#92400E' },
  { id: 'gray', name: '灰色', hex: '#6B7280' },
  { id: 'gold', name: '金色', hex: '#D4AF37' },
  { id: 'pink', name: '粉色', hex: '#EC4899' },
  { id: 'yellow-green', name: '黄绿', hex: '#A3E635' },
  { id: 'blank', name: '空白', hex: '#F8FAFC' },
] satisfies readonly WireColor[];

export const LEAD_TIME_OPTIONS = [
  { id: 'rush', name: '加急', days: '10个工作日', multiplier: 1 },
  { id: 'standard', name: '标准', days: '20-30个工作日', multiplier: 1 },
  { id: 'economy', name: '经济', days: '30-50个工作日', multiplier: 1 },
] satisfies readonly LeadTimeOption[];

export const PROTECTION_OPTIONS: readonly ProtectionOption[] = [
  { id: 'none', name: '无', price: 0, materialMultipliers: {} },
] satisfies readonly ProtectionOption[];

export const PRICING_RULES: readonly PricingRule[] = [];

export const QUANTITY_DISCOUNT_RULES: readonly QuantityDiscountRule[] = [];

export function staticCatalogOptions() {
  return {
    wireColors: WIRE_COLORS.map((item) => ({ ...item })),
    leadTimeOptions: LEAD_TIME_OPTIONS.map((item) => ({ ...item })),
    protectionOptions: PROTECTION_OPTIONS.map((item) => ({
      ...item,
      materialMultipliers: { ...item.materialMultipliers },
    })),
    pricingRules: PRICING_RULES.map((item) => ({ ...item })),
    quantityDiscountRules: QUANTITY_DISCOUNT_RULES.map((item) => ({ ...item })),
  };
}

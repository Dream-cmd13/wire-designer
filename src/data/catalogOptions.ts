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
  { id: 'rush', name: '加急', days: '10个工作日', multiplier: 1.3 },
  { id: 'standard', name: '标准', days: '20-30个工作日', multiplier: 1 },
  { id: 'economy', name: '经济', days: '30-50个工作日', multiplier: 0.9 },
] satisfies readonly LeadTimeOption[];

export const PROTECTION_OPTIONS: readonly ProtectionOption[] = [
  { id: 'none', name: '无', price: 0, materialMultipliers: {} },
  { id: 'acetate-cloth', name: '醋酸布', price: 2.2, materialMultipliers: {} },
  { id: 'fleece', name: '绒布', price: 2.8, materialMultipliers: {} },
  { id: 'heat-shrink', name: '热缩管', price: 1.67, materialMultipliers: {} },
  { id: 'braided', name: '编织网管', price: 3.33, materialMultipliers: {} },
  { id: 'spiral', name: '螺旋缠绕管', price: 0.8, materialMultipliers: {} },
  { id: 'convoluted', name: '波纹管', price: 1.2, materialMultipliers: {} },
  {
    id: 'corrugated',
    name: '波纹管（可选材质）',
    price: 4,
    materialMultipliers: { PP: 1, PA: 1.4, 'stainless-steel': 3.2 },
  },
] satisfies readonly ProtectionOption[];

export const PRICING_RULES = [
  { ruleCode: 'connector', ruleKey: 'base', numericValue: 0.5 },
  { ruleCode: 'connector', ruleKey: 'per_pin', numericValue: 0.3 },
  { ruleCode: 'wire_per_meter', ruleKey: 'awg_22', numericValue: 2 },
  { ruleCode: 'wire_per_meter', ruleKey: 'awg_24', numericValue: 1.5 },
  { ruleCode: 'wire_per_meter', ruleKey: 'awg_26', numericValue: 1 },
  { ruleCode: 'wire_per_meter', ruleKey: 'awg_28', numericValue: 0.8 },
  { ruleCode: 'wire_per_meter', ruleKey: 'awg_30', numericValue: 0.6 },
  { ruleCode: 'wire_type_multiplier', ruleKey: 'silicone', numericValue: 1.5 },
  { ruleCode: 'wire_type_multiplier', ruleKey: 'ul1007', numericValue: 1 },
  { ruleCode: 'wire_type_multiplier', ruleKey: 'ul1061', numericValue: 0.9 },
  { ruleCode: 'wire_type_multiplier', ruleKey: 'gxl', numericValue: 1.3 },
  { ruleCode: 'wire_type_multiplier', ruleKey: 'ptfe', numericValue: 2 },
  { ruleCode: 'labor', ruleKey: 'per_connector', numericValue: 2 },
  { ruleCode: 'labor', ruleKey: 'per_meter', numericValue: 1.5 },
  { ruleCode: 'jacketed', ruleKey: 'core_factor', numericValue: 0.6 },
] satisfies readonly PricingRule[];

export const QUANTITY_DISCOUNT_RULES = [
  { minimumQuantity: 1, multiplier: 1 },
  { minimumQuantity: 5, multiplier: 0.95 },
  { minimumQuantity: 10, multiplier: 0.9 },
  { minimumQuantity: 20, multiplier: 0.85 },
  { minimumQuantity: 50, multiplier: 0.8 },
  { minimumQuantity: 100, multiplier: 0.7 },
] satisfies readonly QuantityDiscountRule[];

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

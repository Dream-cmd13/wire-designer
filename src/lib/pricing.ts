import Decimal from 'decimal.js';
export const formatQuoteMoney = (value: string) => new Decimal(value).toFixed(2, Decimal.ROUND_HALF_UP);
export interface QuoteLine { name: string; points: number; unitPrice: string; amount: string; kind?: 'connector' | 'wire' | 'outer-mold' | 'inner-mold' }
export interface QuoteBreakdown {
  materials: QuoteLine[]; labor: QuoteLine[]; materialSubtotal: string; laborSubtotal: string;
  materialLoss: string; processingLoss: string; cost: string; sellingPrice: string; freight: string;
  unitPrice: string; totalPrice: string;
}
export interface QuotePrice { unitPrice: string; totalPrice: string; breakdown?: QuoteBreakdown }
export type QuoteResult = { status: 'blocked' | 'manual'; issues: string[] } | { status: 'ready'; price: QuotePrice; settingsVersion: number; calculatedAt: string };

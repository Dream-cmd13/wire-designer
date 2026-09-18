export interface FinishedHarnessMaterialSupplier {
  supplier_no: string | null;
}

export interface CalculationStepItem {
  stepKey: string;
  numberFormat?: string;
  name: string;
  formula: string;
  expression: string;
  displayExpression?: string;
  result: number | null;
  unit?: string;
  description?: string;
}

export interface BomItem {
  numberFormats?: Record<string, string>;
  index: number;
  type: string | null;
  spec: string | null;
  brand?: string | null;
  qty: number | null;
  unit: string | null;
  unitPrice: number | null;
  totalPrice: number | null;
}

export interface LaborItem {
  numberFormats?: Record<string, string>;
  index: number;
  name: string;
  ratePerPoint: number | null;
  points: number | null;
  cost: number | null;
  note?: string | null;
}

export interface FinishedHarnessCostAnalysis {
  id: string;
  harnessMaterialId: string | null;
  platformNo: string;
  sourceExcelFile: string;
  sourceSheetName: string;
  customerName: string | null;
  customerPartNo: string | null;
  materialCost: number | null;
  materialLoss: number | null;
  laborCost: number | null;
  laborLoss: number | null;
  totalCost: number | null;
  taxCost: number | null;
  salesPrice: number | null;
  samplePrice: number | null;
  quotePrice: number | null;
  formulaConfig: Record<string, unknown>;
  calculationSteps: CalculationStepItem[];
  bomItems: BomItem[];
  laborItems: LaborItem[];
  sourceExcelUrl?: string | null;
  sourceExcelPath?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinishedHarnessMaterial {
  id: string;
  sourceMaterialId: number | null;
  sourceGoodsId: number | null;
  platformNo: string;
  sonName: string;
  supplierId: string | null;
  supplierNo: string | null;
  supplier?: FinishedHarnessMaterialSupplier | null;
  file2d: string | null;
  packingWay: string | null;
  packing: number | null;
  sonUnit: string | null;
  sonPriceLow: number | null;
  totalCost: number | null;
  salesPrice: number | null;
  samplePrice: number | null;
  quotePrice: number | null;
  hasCostAnalysis: boolean;
  sourceExcelUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}


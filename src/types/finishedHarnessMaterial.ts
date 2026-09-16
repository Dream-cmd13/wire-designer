export interface FinishedHarnessMaterialSupplier {
  supplier_no: string | null;
}

export interface CalculationStepItem {
  stepKey: string;
  name: string;
  formula: string;
  expression: string;
  result: number | null;
  unit?: string;
  description?: string;
}

export interface BomItem {
  index: number;
  type: string;
  spec: string;
  brand?: string;
  qty: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
}

export interface LaborItem {
  index: number;
  name: string;
  ratePerPoint: number;
  points: number;
  cost: number;
  note?: string;
}

export interface FinishedHarnessCostAnalysis {
  id: string;
  harnessMaterialId: string | null;
  platformNo: string;
  sourceExcelFile: string;
  sourceSheetName: string;
  customerName: string | null;
  customerPartNo: string | null;
  materialCost: number;
  materialLoss: number;
  laborCost: number;
  laborLoss: number;
  totalCost: number;
  taxCost: number;
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


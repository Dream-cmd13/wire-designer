export interface FinishedHarnessMaterialSupplier {
  supplier_no: string | null;
}

export interface FinishedHarnessMaterial {
  id: string;
  sourceMaterialId: number;
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
  createdAt: string;
  updatedAt: string;
}

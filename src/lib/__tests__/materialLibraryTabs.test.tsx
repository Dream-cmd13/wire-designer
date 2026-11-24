// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCatalogSnapshot, setCatalogSnapshot } from '@/lib/catalogRuntime';
import { MaterialLibraryPage } from '@/pages/MaterialLibraryPage';
import type { PriceBook } from '@/repositories/priceRepository';
import { useCatalogStore } from '@/stores/catalogStore';
import { useFinishedHarnessStore } from '@/stores/finishedHarnessStore';
import { usePriceStore } from '@/stores/priceStore';
import { useUserStore } from '@/stores/userStore';
import type { CatalogSnapshot, CatalogWire } from '@/types/catalog';
import type { FinishedHarnessMaterial } from '@/types/finishedHarnessMaterial';
import type { OvermoldSpec } from '@/types/harness';

function buildSnapshot(): CatalogSnapshot {
  const connectors = [
    ...Array.from({ length: 25 }, (_, idx) => {
      const n = String(idx + 1).padStart(2, '0');
      return {
        id: `conn-alpha-${n}`,
        resourceItemId: `res-conn-alpha-${n}`,
        name: `Alpha连接器-${n}`,
        model: `M12-A-${n}`,
        series: 'M12',
        supplierNo: 'SUP-A',
        pinCount: 4,
        pinLabels: ['1', '2', '3', '4'],
        type: 'male' as const,
        shielded: true,
        pitch: 2.54,
      };
    }),
    ...Array.from({ length: 5 }, (_, idx) => {
      const n = String(idx + 1).padStart(2, '0');
      return {
        id: `conn-beta-${n}`,
        resourceItemId: `res-conn-beta-${n}`,
        name: `Beta连接器-${n}`,
        model: `M12-B-${n}`,
        series: 'M12',
        supplierNo: 'SUP-B',
        pinCount: 5,
        pinLabels: ['1', '2', '3', '4', '5'],
        type: 'female' as const,
        shielded: false,
        pitch: 2.54,
      };
    }),
  ];

  const wires: CatalogWire[] = [
    ...Array.from({ length: 25 }, (_, idx) => {
      const n = String(idx + 1).padStart(2, '0');
      return {
        id: `wire-cu-${n}`,
        resourceItemId: `res-wire-cu-${n}`,
        name: `铜芯电子线-${n}`,
        model: `UL1007-22-${n}`,
        spec: {
          kind: 'electronic' as const,
          awg: 22,
          color: '黑色',
          ulNumber: '1007' as const,
        },
      };
    }),
    ...Array.from({ length: 5 }, (_, idx) => {
      const n = String(idx + 1).padStart(2, '0');
      return {
        id: `wire-jkt-${n}`,
        resourceItemId: `res-wire-jkt-${n}`,
        name: `屏蔽护套线-${n}`,
        model: `UL2464-24-${n}`,
        spec: {
          kind: 'jacketed' as const,
          awg: 24,
          coreCount: 4,
          shielded: true,
          jacketMaterial: 'PVC' as const,
          jacketColor: 'black' as const,
          odMm: 5.2,
          ulNumber: 'UL2464' as const,
          coreColors: ['红', '黑', '白', '绿'],
        },
      };
    }),
  ];

  const overmolds: OvermoldSpec[] = [
    ...Array.from({ length: 25 }, (_, idx) => {
      const n = String(idx + 1).padStart(2, '0');
      return {
        id: `mold-str-${n}`,
        resourceItemId: `res-mold-str-${n}`,
        name: `直头外模-${n}`,
        outerForm: 'straight' as const,
        outerMaterial: '黑色PVC' as const,
        outerHardness: '45P' as const,
      };
    }),
    ...Array.from({ length: 5 }, (_, idx) => {
      const n = String(idx + 1).padStart(2, '0');
      return {
        id: `mold-bent-${n}`,
        resourceItemId: `res-mold-bent-${n}`,
        name: `弯头外模-${n}`,
        outerForm: 'bent' as const,
        outerMaterial: '黑色PVC' as const,
        outerHardness: '45P' as const,
      };
    }),
  ];

  return {
    connectors,
    wires,
    overmolds,
    wireColors: [],
    leadTimeOptions: [],
    protectionOptions: [],
    pricingRules: [],
    quantityDiscountRules: [],
    loadedAt: Date.now(),
  };
}

function buildFinishedHarnesses(): FinishedHarnessMaterial[] {
  return [
    ...Array.from({ length: 25 }, (_, idx) => {
      const n = String(idx + 1).padStart(2, '0');
      return {
        id: `fh-a-${n}`,
        sourceMaterialId: 1000 + idx,
        sourceGoodsId: 2000 + idx,
        platformNo: `FH-A-${n}`,
        sonName: `成品方案A-${n}`,
        supplierId: 'sup-f1',
        supplierNo: 'SUP-F1',
        supplier: { supplier_no: 'SUP-F1' },
        file2d: `https://example.com/drawing-${n}.pdf`,
        packingWay: '袋装',
        packing: 10,
        sonUnit: 'pcs',
        sonPriceLow: 20,
        totalCost: 15,
        salesPrice: 28,
        samplePrice: 40,
        quotePrice: 25,
        hasCostAnalysis: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
    }),
    ...Array.from({ length: 5 }, (_, idx) => {
      const n = String(idx + 1).padStart(2, '0');
      return {
        id: `fh-b-${n}`,
        sourceMaterialId: 3000 + idx,
        sourceGoodsId: null,
        platformNo: `FH-B-${n}`,
        sonName: `成品方案B-${n}`,
        supplierId: 'sup-f2',
        supplierNo: 'SUP-F2',
        supplier: { supplier_no: 'SUP-F2' },
        file2d: null,
        packingWay: null,
        packing: null,
        sonUnit: null,
        sonPriceLow: null,
        totalCost: null,
        salesPrice: null,
        samplePrice: null,
        quotePrice: null,
        hasCostAnalysis: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
    }),
  ];
}

function getSelectByDefaultOption(defaultOptionLabel: string): HTMLSelectElement {
  const option = screen.getByRole('option', { name: defaultOptionLabel });
  const select = option.closest('select');
  if (!select) {
    throw new Error(`未找到包含选项“${defaultOptionLabel}”的下拉框`);
  }
  return select;
}

const emptyPriceBook: PriceBook = {
  importedAt: '2026-01-01T00:00:00Z',
  sourceName: 'test.xlsx',
  prices: [],
};

const originalCatalogInit = useCatalogStore.getState().initialize;
const originalPriceLoad = usePriceStore.getState().load;
const originalFinishedLoad = useFinishedHarnessStore.getState().load;

describe('MaterialLibraryPage 标签页切换状态保留', () => {
  beforeEach(() => {
    const snapshot = buildSnapshot();
    const finishedHarnesses = buildFinishedHarnesses();
    setCatalogSnapshot(snapshot);
    useUserStore.setState({ currentUser: null });
    useCatalogStore.setState({
      status: 'ready',
      snapshot,
      refreshing: false,
      error: null,
      initialize: vi.fn().mockResolvedValue(undefined),
    });
    usePriceStore.setState({
      book: emptyPriceBook,
      loading: false,
      refreshing: false,
      error: null,
      load: vi.fn().mockResolvedValue(undefined),
    });
    useFinishedHarnessStore.setState({
      items: finishedHarnesses,
      loading: false,
      refreshing: false,
      error: null,
      load: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    cleanup();
    clearCatalogSnapshot();
    useCatalogStore.setState({ initialize: originalCatalogInit });
    useCatalogStore.getState().reset();
    usePriceStore.setState({ load: originalPriceLoad });
    usePriceStore.getState().reset();
    useFinishedHarnessStore.setState({ load: originalFinishedLoad });
    useFinishedHarnessStore.getState().reset();
    useUserStore.setState({ currentUser: null });
  });

  it('在 4 个标签页间来回切换时保留各标签页的筛选条件与分页状态', () => {
    render(<MaterialLibraryPage />);

    // 1. 连接器 Tab：设置搜索、供应商/类型筛选并翻到第 2 页
    const connSearch = screen.getByPlaceholderText('搜索连接器名称、型号、供应商、ID') as HTMLInputElement;
    fireEvent.change(connSearch, { target: { value: 'Alpha' } });
    fireEvent.change(getSelectByDefaultOption('全部供应商'), { target: { value: 'SUP-A' } });
    fireEvent.change(getSelectByDefaultOption('全部类型'), { target: { value: 'male' } });
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(screen.getByText('Alpha连接器-21')).toBeTruthy();

    // 2. 线材 Tab：设置搜索、线种筛选并翻到第 2 页
    fireEvent.click(screen.getByRole('button', { name: /^线材/ }));
    const wireSearch = screen.getByPlaceholderText('搜索线缆名称、型号、UL标号、AWG') as HTMLInputElement;
    fireEvent.change(wireSearch, { target: { value: '铜芯' } });
    fireEvent.change(getSelectByDefaultOption('全部线种类型'), { target: { value: 'electronic' } });
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(screen.getByText('铜芯电子线-21')).toBeTruthy();

    // 3. 模具 Tab：设置搜索并翻到第 2 页
    fireEvent.click(screen.getByRole('button', { name: /^模具/ }));
    const moldSearch = screen.getByPlaceholderText('搜索模具名称、代号、材质') as HTMLInputElement;
    fireEvent.change(moldSearch, { target: { value: '直头' } });
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(screen.getByText('直头外模-21')).toBeTruthy();

    // 4. 现有成品线束方案 Tab：设置搜索、供应商/成本状态筛选并翻到第 2 页
    fireEvent.click(screen.getByRole('button', { name: /^现有成品线束方案/ }));
    const finishedSearch = screen.getByPlaceholderText('搜索成品料号、物料名称') as HTMLInputElement;
    fireEvent.change(finishedSearch, { target: { value: 'FH-A' } });
    fireEvent.change(getSelectByDefaultOption('全部供应商'), { target: { value: 'SUP-F1' } });
    fireEvent.change(getSelectByDefaultOption('全部成本状态'), { target: { value: 'has' } });
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(screen.getByText('FH-A-21')).toBeTruthy();

    // 5. 切回连接器 Tab，验证搜索词、筛选值和页码完整保留
    fireEvent.click(screen.getByRole('button', { name: /^连接器/ }));
    expect((screen.getByPlaceholderText('搜索连接器名称、型号、供应商、ID') as HTMLInputElement).value).toBe('Alpha');
    expect(getSelectByDefaultOption('全部供应商').value).toBe('SUP-A');
    expect(getSelectByDefaultOption('全部类型').value).toBe('male');
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(screen.getByText('Alpha连接器-21')).toBeTruthy();

    // 6. 切回线材 Tab，验证搜索词、线种和页码完整保留
    fireEvent.click(screen.getByRole('button', { name: /^线材/ }));
    expect((screen.getByPlaceholderText('搜索线缆名称、型号、UL标号、AWG') as HTMLInputElement).value).toBe('铜芯');
    expect(getSelectByDefaultOption('全部线种类型').value).toBe('electronic');
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(screen.getByText('铜芯电子线-21')).toBeTruthy();

    // 7. 切回模具 Tab，验证搜索词与页码完整保留
    fireEvent.click(screen.getByRole('button', { name: /^模具/ }));
    expect((screen.getByPlaceholderText('搜索模具名称、代号、材质') as HTMLInputElement).value).toBe('直头');
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(screen.getByText('直头外模-21')).toBeTruthy();

    // 8. 切回现有成品线束方案 Tab，验证搜索词、筛选值和页码完整保留
    fireEvent.click(screen.getByRole('button', { name: /^现有成品线束方案/ }));
    expect((screen.getByPlaceholderText('搜索成品料号、物料名称') as HTMLInputElement).value).toBe('FH-A');
    expect(getSelectByDefaultOption('全部供应商').value).toBe('SUP-F1');
    expect(getSelectByDefaultOption('全部成本状态').value).toBe('has');
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(screen.getByText('FH-A-21')).toBeTruthy();
  });

  it('点击“重置筛选”后恢复默认筛选条件并回到第 1 页', () => {
    render(<MaterialLibraryPage />);

    const connSearch = screen.getByPlaceholderText('搜索连接器名称、型号、供应商、ID') as HTMLInputElement;
    fireEvent.change(connSearch, { target: { value: 'Alpha' } });
    fireEvent.change(getSelectByDefaultOption('全部供应商'), { target: { value: 'SUP-A' } });
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(screen.getByText('2 / 2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '重置筛选' }));

    expect((screen.getByPlaceholderText('搜索连接器名称、型号、供应商、ID') as HTMLInputElement).value).toBe('');
    expect(getSelectByDefaultOption('全部供应商').value).toBe('all');
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.getByText('Alpha连接器-01')).toBeTruthy();
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MaterialLibraryPage } from '@/pages/MaterialLibraryPage';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePriceStore } from '@/stores/priceStore';
import { useFinishedHarnessStore } from '@/stores/finishedHarnessStore';
import { FinishedHarnessMaterialDetailDialog } from '@/components/materials/FinishedHarnessMaterialDetailDialog';
import { mapFinishedHarnessMaterialRow } from '@/repositories/finishedHarnessMaterialRepository';
import { setCatalogSnapshot } from '@/lib/catalogRuntime';
import * as XLSX from 'xlsx';
import { createPriceTemplate, parsePriceWorkbook } from '@/lib/priceImport';
import {
  buildCatalogPriceTemplateRows,
  getCatalogPriceCandidates,
} from '@/lib/quoteMaterials';
import type { CatalogSnapshot } from '@/types/catalog';
import type { PriceBook } from '@/repositories/priceRepository';
import type { FinishedHarnessMaterial } from '@/types/finishedHarnessMaterial';

const mockFinishedHarnesses: FinishedHarnessMaterial[] = [
  {
    id: 'fh-1',
    sourceMaterialId: 184387,
    sourceGoodsId: 143341,
    platformNo: 'WL-B21-001',
    sonName: '3P 航插 双头护套线 L=1800MM',
    supplierId: 'sup-1',
    supplierNo: 'A118',
    supplier: { supplier_no: 'A118' },
    file2d: 'http://img.wanliango.com/Product/定制/WL-B21-001.pdf',
    packingWay: '盒装',
    packing: 1,
    sonUnit: 'pcs',
    sonPriceLow: 60,
    createdAt: '2024-05-02T10:00:00Z',
    updatedAt: '2024-05-02T10:00:00Z',
  },
  {
    id: 'fh-2',
    sourceMaterialId: 185371,
    sourceGoodsId: null,
    platformNo: 'WL-B21-005',
    sonName: 'Cable-Power Vision-Buzzer',
    supplierId: null,
    supplierNo: null,
    supplier: null,
    file2d: null,
    packingWay: null,
    packing: null,
    sonUnit: null,
    sonPriceLow: null,
    createdAt: '2024-05-03T10:00:00Z',
    updatedAt: '2024-05-03T10:00:00Z',
  },
];

const mockSnapshot: CatalogSnapshot = {
  connectors: [
    {
      id: 'conn-1',
      resourceItemId: 'res-conn-1',
      name: '测试连接器A',
      model: 'MODEL-A',
      series: 'SERIES-A',
      supplierNo: 'A118',
      pinCount: 4,
      pinLabels: ['1', '2', '3', '4'],
      type: 'male',
      shielded: false,
      pitch: 2.54,
    },
  ],
  wires: [
    {
      id: 'wire-1',
      resourceItemId: 'res-wire-1',
      name: '测试电子线',
      model: 'UL1007-22',
      spec: {
        kind: 'electronic',
        awg: 22,
        color: '黑色',
        ulNumber: '1007',
        ratedVoltageV: 300,
      },
    },
  ],
  overmolds: [
    {
      id: 'mold-1',
      name: '直头外模',
      outerForm: 'straight',
      outerMaterial: '黑色PVC',
      outerHardness: '45P',
    },
  ],
  protectionOptions: [
    {
      id: 'sleeve-1',
      name: '波纹套管',
      price: 1.8,
      materialMultipliers: {},
    },
  ],
  wireColors: [],
  leadTimeOptions: [],
  pricingRules: [],
  quantityDiscountRules: [],
  loadedAt: Date.now(),
};

const mockPriceBook: PriceBook = {
  importedAt: new Date().toISOString(),
  sourceName: 'test.xlsx',
  prices: [
    {
      kind: 'connector',
      resourceId: 'res-conn-1',
      name: '测试连接器A',
      specification: JSON.stringify(['MODEL-A', 'SERIES-A', 4, 'male']),
      lengthMm: 0,
      unit: '元/个',
      taxIncludedPrice: '2.50',
    },
    {
      kind: 'wire',
      resourceId: 'res-wire-1',
      name: '测试电子线',
      specification: JSON.stringify(['electronic', 22, '黑色', '1007']),
      lengthMm: 500,
      unit: '元/条',
      taxIncludedPrice: '1.80',
    },
    {
      kind: 'wire',
      resourceId: 'res-wire-1',
      name: '测试电子线',
      specification: JSON.stringify(['electronic', 22, '黑色', '1007']),
      lengthMm: 1000,
      unit: '元/条',
      taxIncludedPrice: '2.60',
    },
  ],
};

describe('MaterialLibraryPage', () => {
  it('renders material library title, tabs, and action buttons', () => {
    setCatalogSnapshot(mockSnapshot);
    useCatalogStore.setState({ status: 'ready', snapshot: mockSnapshot });
    useCatalogStore.getInitialState = () => useCatalogStore.getState();
    usePriceStore.setState({ book: mockPriceBook, loading: false, error: null });
    usePriceStore.getInitialState = () => usePriceStore.getState();

    const html = renderToStaticMarkup(<MaterialLibraryPage />);

    // 标题与操作栏
    expect(html).toContain('物料库');
    expect(html).toContain('导出价格表');
    expect(html).toContain('导入价格表');

    // 筛选控件（包含屏蔽状态与插座类型）
    expect(html).toContain('全部屏蔽状态');
    expect(html).toContain('已屏蔽');
    expect(html).toContain('未屏蔽');
    expect(html).toContain('插座 (receptacle)');

    // Tabs
    expect(html).toContain('连接器');
    expect(html).toContain('线材');
    expect(html).toContain('模具与套管');
    expect(html).toContain('现有成品线束方案');

    // 默认展示连接器列表和单价
    expect(html).toContain('测试连接器A');
    expect(html).toContain('MODEL-A');
    expect(html).toContain('含税单价');
    expect(html).toContain('计价单位');
    expect(html).toContain('¥ 2.50');
    expect(html).toContain('元/个');

    // 统一分页组件
    expect(html).toContain('显示 1 - 1 条');
    expect(html).toContain('20 条/页');
  });

  it('renders wires tab correctly with multi-tier price tags and per-strip unit', () => {
    setCatalogSnapshot(mockSnapshot);
    useCatalogStore.setState({ status: 'ready', snapshot: mockSnapshot });
    useCatalogStore.getInitialState = () => useCatalogStore.getState();
    usePriceStore.setState({ book: mockPriceBook, loading: false, error: null });
    usePriceStore.getInitialState = () => usePriceStore.getState();

    const html = renderToStaticMarkup(<MaterialLibraryPage initialTab="wires" />);
    expect(html).toContain('测试电子线');
    expect(html).toContain('UL1007');
    expect(html).toContain('22 AWG');
    expect(html).toContain('300V');

    // 多档位价格与元/条单位
    expect(html).toContain('0.5m:');
    expect(html).toContain('¥ 1.80');
    expect(html).toContain('1m:');
    expect(html).toContain('¥ 2.60');
    expect(html).toContain('元/条');

    // 统一分页组件
    expect(html).toContain('显示 1 - 1 条');
    expect(html).toContain('20 条/页');
  });

  it('renders accessories tab correctly with overmolds and sleeves', () => {
    setCatalogSnapshot(mockSnapshot);
    useCatalogStore.setState({ status: 'ready', snapshot: mockSnapshot });
    useCatalogStore.getInitialState = () => useCatalogStore.getState();
    usePriceStore.setState({ book: mockPriceBook, loading: false, error: null });
    usePriceStore.getInitialState = () => usePriceStore.getState();

    const html = renderToStaticMarkup(<MaterialLibraryPage initialTab="accessories" />);
    expect(html).toContain('直头外模');
    expect(html).toContain('成型外模 (共享价格库)');
    expect(html).toContain('波纹套管');
    expect(html).toContain('防护辅材 (系统配置标准价)');
    expect(html).toContain('¥ 1.80');
    expect(html).toContain('元/米');

    // 统一分页组件
    expect(html).toContain('显示 1 - 2 条');
    expect(html).toContain('20 条/页');
  });

  it('generates price template rows containing unpriced catalog items for batch pricing', () => {
    const candidates = getCatalogPriceCandidates(mockSnapshot);
    expect(candidates.length).toBe(3);

    const emptyPriceBook: PriceBook = {
      importedAt: new Date().toISOString(),
      sourceName: 'empty.xlsx',
      prices: [],
    };
    const templateRows = buildCatalogPriceTemplateRows(mockSnapshot, emptyPriceBook.prices);

    // 即使没有任何价格，也要包含全部物料候选以支持批量补价
    expect(templateRows.length).toBeGreaterThanOrEqual(3);
    const names = templateRows.map((r) => r.name);
    expect(names).toContain('测试连接器A');
    expect(names).toContain('测试电子线');
    expect(names).toContain('直头外模');

    // 线缆默认生成 1000mm 档位
    const wireRow = templateRows.find((r) => r.name === '测试电子线');
    expect(wireRow?.lengthMm).toBe(1000);
    expect(wireRow?.unit).toBe('元/条');
  });

  it('preserves all existing wire price tiers when exporting template', () => {
    const templateRows = buildCatalogPriceTemplateRows(mockSnapshot, mockPriceBook.prices);

    // 线缆在 mockPriceBook 中有 500mm 与 1000mm 两个档位，应全部导出
    const wireRows = templateRows.filter((r) => r.name === '测试电子线');
    expect(wireRows.length).toBe(2);
    expect(wireRows.map((r) => r.lengthMm).sort((a, b) => a - b)).toEqual([500, 1000]);
  });

  it('does not falsely match price when resourceId is identical but specification differs', () => {
    setCatalogSnapshot(mockSnapshot);
    useCatalogStore.setState({ status: 'ready', snapshot: mockSnapshot });
    useCatalogStore.getInitialState = () => useCatalogStore.getState();

    // 价格库里虽然 resourceId 一致，但 specification 是 8 芯而不是 4 芯
    const mismatchPriceBook: PriceBook = {
      importedAt: new Date().toISOString(),
      sourceName: 'mismatch.xlsx',
      prices: [
        {
          kind: 'connector',
          resourceId: 'res-conn-1',
          name: '测试连接器A',
          specification: JSON.stringify(['MODEL-A', 'SERIES-A', 8, 'male']),
          lengthMm: 0,
          unit: '元/个',
          taxIncludedPrice: '99.00',
        },
      ],
    };

    usePriceStore.setState({ book: mismatchPriceBook, loading: false, error: null });
    usePriceStore.getInitialState = () => usePriceStore.getState();

    const html = renderToStaticMarkup(<MaterialLibraryPage />);
    // 严格精确匹配下不应串价匹配为 99.00，应显示待定价
    expect(html).not.toContain('¥ 99.00');
    expect(html).toContain('待定价');
  });

  it('supports full roundtrip: buildCatalogPriceTemplateRows -> createPriceTemplate -> parsePriceWorkbook even with outdated price names', () => {
    // 共享价格库中保存了历史旧名称的所有物料价格
    const outdatedPriceBook: PriceBook = {
      importedAt: new Date().toISOString(),
      sourceName: 'old.xlsx',
      prices: [
        {
          kind: 'connector',
          resourceId: 'res-conn-1',
          name: '旧历史连接器名称',
          specification: JSON.stringify(['MODEL-A', 'SERIES-A', 4, 'male']),
          lengthMm: 0,
          unit: '元/个',
          taxIncludedPrice: '9.99',
        },
        {
          kind: 'wire',
          resourceId: 'res-wire-1',
          name: '旧电子线名称',
          specification: JSON.stringify(['electronic', 22, '黑色', '1007']),
          lengthMm: 1000,
          unit: '元/条',
          taxIncludedPrice: '3.50',
        },
        {
          kind: 'outer-mold',
          resourceId: 'mold-1',
          name: '旧外模名称',
          specification: JSON.stringify(['黑色PVC', '45P', 'straight']),
          lengthMm: 0,
          unit: '元/个',
          taxIncludedPrice: '5.00',
        },
      ],
    };

    const templateRows = buildCatalogPriceTemplateRows(mockSnapshot, outdatedPriceBook.prices);
    // 导出的模板必须使用当前 Catalog 的权威名称
    const connRow = templateRows.find((r) => r.resourceId === 'res-conn-1');
    expect(connRow?.name).toBe('测试连接器A');
    const wireRow = templateRows.find((r) => r.resourceId === 'res-wire-1');
    expect(wireRow?.name).toBe('测试电子线');

    const workbook = createPriceTemplate(templateRows, outdatedPriceBook.prices);
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });

    const candidates = getCatalogPriceCandidates(mockSnapshot);
    const parsedPrices = parsePriceWorkbook(buffer, candidates);

    expect(parsedPrices.length).toBe(3);
    const parsedConn = parsedPrices.find((p) => p.resourceId === 'res-conn-1');
    expect(parsedConn?.taxIncludedPrice).toBe('9.99');
    expect(parsedConn?.name).toBe('测试连接器A');

    const parsedWire = parsedPrices.find((p) => p.resourceId === 'res-wire-1');
    expect(Number(parsedWire?.taxIncludedPrice)).toBe(3.5);
    expect(parsedWire?.name).toBe('测试电子线');
  });

  it('renders finished harnesses tab correctly with table columns, drawing link, and fallback labels', () => {
    setCatalogSnapshot(mockSnapshot);
    useCatalogStore.setState({ status: 'ready', snapshot: mockSnapshot });
    useCatalogStore.getInitialState = () => useCatalogStore.getState();
    usePriceStore.setState({ book: mockPriceBook, loading: false, error: null });
    usePriceStore.getInitialState = () => usePriceStore.getState();
    useFinishedHarnessStore.setState({
      items: mockFinishedHarnesses,
      loading: false,
      error: null,
    });
    useFinishedHarnessStore.getInitialState = () => useFinishedHarnessStore.getState();

    const html = renderToStaticMarkup(<MaterialLibraryPage initialTab="finished-harnesses" />);

    // 搜索与筛选控件
    expect(html).toContain('搜索成品料号、物料名称');
    expect(html).toContain('全部供应商编号');
    expect(html).toContain('全部图纸状态');
    expect(html).toContain('包含图纸');
    expect(html).toContain('暂无图纸');

    // 固定 6 列表头
    expect(html).toContain('料号');
    expect(html).toContain('物料名称');
    expect(html).toContain('供应商编号');
    expect(html).toContain('图纸');
    expect(html).toContain('成本分析');
    expect(html).toContain('报价');

    // 第一条物料数据展示
    expect(html).toContain('WL-B21-001');
    expect(html).toContain('3P 航插 双头护套线 L=1800MM');
    expect(html).toContain('A118');
    expect(html).toContain('打开图纸');

    // 第二条物料数据（空字段回退展示）
    expect(html).toContain('WL-B21-005');
    expect(html).toContain('Cable-Power Vision-Buzzer');
    expect(html).toContain('暂无编号');
    expect(html).toContain('暂无图纸');

    // 成本分析与报价固定显示“暂无”
    expect(html).toContain('暂无');

    // 列表不显示供应商名称（仅显示供应商编号）
    expect(html).not.toContain('万联');

    // 统一分页组件（默认 20 条/页）
    expect(html).toContain('显示 1 - 2 条');
    expect(html).toContain('20 条/页');
  });

  it('renders finished harness detail dialog correctly with all fields and null fallbacks', () => {
    const htmlWithData = renderToStaticMarkup(
      <FinishedHarnessMaterialDetailDialog
        isOpen={true}
        onClose={() => {}}
        material={mockFinishedHarnesses[0]}
      />,
    );

    expect(htmlWithData).toContain('成品线束物料详情');
    expect(htmlWithData).toContain('基础信息');
    expect(htmlWithData).toContain('包装信息');
    expect(htmlWithData).toContain('价格信息');
    expect(htmlWithData).toContain('图纸信息');
    expect(htmlWithData).toContain('元数据');

    // 基础信息
    expect(htmlWithData).toContain('WL-B21-001');
    expect(htmlWithData).toContain('3P 航插 双头护套线 L=1800MM');
    expect(htmlWithData).toContain('184387');
    expect(htmlWithData).toContain('143341');
    expect(htmlWithData).toContain('pcs');
    expect(htmlWithData).toContain('A118');

    // 包装信息
    expect(htmlWithData).toContain('盒装');
    expect(htmlWithData).toContain('1');

    // 价格信息
    expect(htmlWithData).toContain('¥ 60.00');
    expect(htmlWithData).toContain('成本分析：');
    expect(htmlWithData).toContain('正式报价：');

    // 图纸信息
    expect(htmlWithData).toContain('打开图纸');
    expect(htmlWithData).toContain('http://img.wanliango.com/Product/定制/WL-B21-001.pdf');

    // 测试空值场景（保证空值显示“暂无”，不误显示为 0）
    const htmlWithNulls = renderToStaticMarkup(
      <FinishedHarnessMaterialDetailDialog
        isOpen={true}
        onClose={() => {}}
        material={mockFinishedHarnesses[1]}
      />,
    );

    expect(htmlWithNulls).toContain('WL-B21-005');
    expect(htmlWithNulls).toContain('Cable-Power Vision-Buzzer');
    expect(htmlWithNulls).toContain('暂无编号');
    expect(htmlWithNulls).toContain('暂无图纸');
    expect(htmlWithNulls).not.toContain('¥ 0.00');
    expect(htmlWithNulls).not.toContain('>0<');
  });

  it('maps raw database row with null handling and validation correctly', () => {
    const row = {
      id: 'uuid-1',
      source_material_id: '12345',
      source_goods_id: null,
      platform_no: 'WL-TEST-001',
      son_name: '测试线束',
      supplier_id: null,
      supplier: { supplier_no: 'A999' },
      file_2d: null,
      packing_way: null,
      packing: null,
      son_unit: null,
      son_price_low: null,
      created_at: '2024-05-01T00:00:00Z',
      updated_at: '2024-05-01T00:00:00Z',
    };

    const mapped = mapFinishedHarnessMaterialRow(row);
    expect(mapped.id).toBe('uuid-1');
    expect(mapped.sourceMaterialId).toBe(12345);
    expect(mapped.sourceGoodsId).toBeNull();
    expect(mapped.supplierNo).toBe('A999');
    expect(mapped.supplier?.supplier_no).toBe('A999');
    expect(mapped.file2d).toBeNull();
    expect(mapped.packing).toBeNull();
    expect(mapped.sonPriceLow).toBeNull();
  });

  it('automatically clamps connector page to 1 and prevents empty table when price import reduces unpriced items', () => {
    // 构造 21 个测试连接器
    const twentyOneConnectors = Array.from({ length: 21 }, (_, i) => ({
      id: `conn-p-${i + 1}`,
      resourceItemId: `res-conn-p-${i + 1}`,
      name: `测试连接器-${i + 1}`,
      model: `MODEL-${i + 1}`,
      series: 'SERIES-P',
      supplierNo: `SUP-${i + 1}`,
      pinCount: 4,
      pinLabels: ['1', '2', '3', '4'],
      type: 'male' as const,
      shielded: false,
      pitch: 2.54,
    }));

    const dynamicSnapshot: CatalogSnapshot = {
      ...mockSnapshot,
      connectors: twentyOneConnectors,
    };

    setCatalogSnapshot(dynamicSnapshot);
    useCatalogStore.setState({ status: 'ready', snapshot: dynamicSnapshot });
    useCatalogStore.getInitialState = () => useCatalogStore.getState();

    // 阶段 1：价格库为空，所有 21 项均待定价，用户浏览第 2 页（每页 20 条）
    usePriceStore.setState({
      book: { importedAt: new Date().toISOString(), sourceName: 'empty.xlsx', prices: [] },
      loading: false,
      error: null,
    });
    usePriceStore.getInitialState = () => usePriceStore.getState();

    const htmlBeforeImport = renderToStaticMarkup(
      <MaterialLibraryPage initialConnPriceStatus="unpriced" initialConnPage={2} />,
    );

    // 第 2 页正常展示第 21 条物料
    expect(htmlBeforeImport).toContain('显示 21 - 21 条');
    expect(htmlBeforeImport).toContain('2 / 2');
    expect(htmlBeforeImport).toContain('测试连接器-21');

    // 阶段 2：导入价格，为第 21 条连接器补充了价格
    // 待定价物料数量从 21 条减少到 20 条（总页数从 2 页减少为 1 页）
    usePriceStore.setState({
      book: {
        importedAt: new Date().toISOString(),
        sourceName: 'imported.xlsx',
        prices: [
          {
            kind: 'connector',
            resourceId: 'res-conn-p-21',
            name: '测试连接器-21',
            specification: JSON.stringify(['MODEL-21', 'SERIES-P', 4, 'male']),
            lengthMm: 0,
            unit: '元/个',
            taxIncludedPrice: '9.90',
          },
        ],
      },
      loading: false,
      error: null,
    });
    usePriceStore.getInitialState = () => usePriceStore.getState();

    // 当用户仍在原本的第 2 页状态时，自动约束校正到当前最大有效页码（第 1 页），避免切片越界与空表
    const htmlAfterImport = renderToStaticMarkup(
      <MaterialLibraryPage initialConnPriceStatus="unpriced" initialConnPage={2} />,
    );

    expect(htmlAfterImport).toContain('显示 1 - 20 条');
    expect(htmlAfterImport).toContain('1 / 1');
    expect(htmlAfterImport).toContain('测试连接器-1');
    expect(htmlAfterImport).not.toContain('测试连接器-21');
    expect(htmlAfterImport).not.toContain('显示 21 - 20 条');
    expect(htmlAfterImport).not.toContain('未找到匹配的连接器。');
  });

  it('automatically clamps wire page to 1 when price import reduces unpriced wires', () => {
    const twentyOneWires = Array.from({ length: 21 }, (_, i) => ({
      id: `wire-p-${i + 1}`,
      resourceItemId: `res-wire-p-${i + 1}`,
      name: `测试线缆-${i + 1}`,
      model: `UL1007-AWG-${i + 1}`,
      spec: {
        kind: 'electronic' as const,
        awg: 20,
        color: '黑色',
        ulNumber: '1007' as const,
        ratedVoltageV: 300,
      },
    }));

    const dynamicSnapshot: CatalogSnapshot = {
      ...mockSnapshot,
      wires: twentyOneWires,
    };

    setCatalogSnapshot(dynamicSnapshot);
    useCatalogStore.setState({ status: 'ready', snapshot: dynamicSnapshot });
    useCatalogStore.getInitialState = () => useCatalogStore.getState();

    usePriceStore.setState({
      book: { importedAt: new Date().toISOString(), sourceName: 'empty.xlsx', prices: [] },
      loading: false,
      error: null,
    });
    usePriceStore.getInitialState = () => usePriceStore.getState();

    const htmlBeforeImport = renderToStaticMarkup(
      <MaterialLibraryPage initialTab="wires" initialWirePriceStatus="unpriced" initialWirePage={2} />,
    );
    expect(htmlBeforeImport).toContain('显示 21 - 21 条');
    expect(htmlBeforeImport).toContain('2 / 2');
    expect(htmlBeforeImport).toContain('测试线缆-21');

    // 导入第 21 条线缆的价格
    usePriceStore.setState({
      book: {
        importedAt: new Date().toISOString(),
        sourceName: 'imported.xlsx',
        prices: [
          {
            kind: 'wire',
            resourceId: 'res-wire-p-21',
            name: '测试线缆-21',
            specification: JSON.stringify(['electronic', 20, '黑色', '1007']),
            lengthMm: 1000,
            unit: '元/条',
            taxIncludedPrice: '3.50',
          },
        ],
      },
      loading: false,
      error: null,
    });
    usePriceStore.getInitialState = () => usePriceStore.getState();

    const htmlAfterImport = renderToStaticMarkup(
      <MaterialLibraryPage initialTab="wires" initialWirePriceStatus="unpriced" initialWirePage={2} />,
    );
    expect(htmlAfterImport).toContain('显示 1 - 20 条');
    expect(htmlAfterImport).toContain('1 / 1');
    expect(htmlAfterImport).toContain('测试线缆-1');
    expect(htmlAfterImport).not.toContain('测试线缆-21');
    expect(htmlAfterImport).not.toContain('未找到匹配的线材。');
  });
});

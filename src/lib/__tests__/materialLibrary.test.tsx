import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MaterialLibraryPage } from '@/pages/MaterialLibraryPage';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePriceStore } from '@/stores/priceStore';
import { setCatalogSnapshot } from '@/lib/catalogRuntime';
import * as XLSX from 'xlsx';
import { createPriceTemplate, parsePriceWorkbook } from '@/lib/priceImport';
import {
  buildCatalogPriceTemplateRows,
  getCatalogPriceCandidates,
} from '@/lib/quoteMaterials';
import type { CatalogSnapshot } from '@/types/catalog';
import type { PriceBook } from '@/repositories/priceRepository';

const mockSnapshot: CatalogSnapshot = {
  connectors: [
    {
      id: 'conn-1',
      resourceItemId: 'res-conn-1',
      name: '测试连接器A',
      model: 'MODEL-A',
      series: 'SERIES-A',
      manufacturer: 'TE',
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

    // 默认展示连接器列表和单价
    expect(html).toContain('测试连接器A');
    expect(html).toContain('MODEL-A');
    expect(html).toContain('含税单价');
    expect(html).toContain('计价单位');
    expect(html).toContain('¥ 2.50');
    expect(html).toContain('元/个');
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
});

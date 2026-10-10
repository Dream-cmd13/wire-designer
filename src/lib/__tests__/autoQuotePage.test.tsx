import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoQuotePage } from '@/pages/AutoQuotePage';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePriceStore } from '@/stores/priceStore';
import type { CatalogSnapshot } from '@/types/catalog';
import type { PriceBook } from '@/repositories/priceRepository';

// SSR 读取 Zustand 的初始快照，测试改为读取真实 store 的当前目录与价格。
vi.mock('@/stores/catalogStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/catalogStore')>();
  const store = actual.useCatalogStore;
  return { ...actual, useCatalogStore: Object.assign(
    <T,>(selector: (state: ReturnType<typeof store.getState>) => T) => selector(store.getState()),
    store,
  ) };
});

vi.mock('@/stores/priceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/priceStore')>();
  const store = actual.usePriceStore;
  return { ...actual, usePriceStore: Object.assign(() => store.getState(), store) };
});

const mockCatalog: CatalogSnapshot = {
  connectors: [
    {
      id: 'conn-m12',
      resourceItemId: 'res-m12',
      name: 'M12-4P-公头',
      model: 'M12-A-04P-M',
      series: 'M12',
      pinCount: 4,
      shielded: true,
      type: 'male',
      pinLabels: ['1', '2', '3', '4'],
    },
    {
      id: 'conn-m8',
      resourceItemId: 'res-m8',
      name: 'M8-3P-母头',
      model: 'M8-A-03P-F',
      series: 'M8',
      pinCount: 3,
      shielded: false,
      type: 'female',
      pinLabels: ['1', '2', '3'],
    },
  ],
  wires: [
    {
      id: 'wire-1',
      resourceItemId: 'res-wire-1',
      name: 'UL2464 24AWG 4芯黑色护套线',
      model: 'UL2464',
      spec: {
        kind: 'jacketed',
        awg: 24,
        coreCount: 4,
        jacketMaterial: 'PVC',
        jacketColor: 'black',
        shielded: true,
        coreColors: ['黑色', '棕色', '蓝色', '白色'],
        outerDiameterMm: 5.0,
      },
    },
  ],
  overmolds: [
    {
      id: 'mold-1',
      resourceItemId: 'res-mold-1',
      name: 'M12 直头外模 黑色PVC 45P',
      outerMaterial: '黑色PVC',
      outerHardness: '45P',
      outerForm: 'straight',
    },
  ],
  wireColors: [],
  protectionOptions: [],
  leadTimeOptions: [],
  pricingRules: [],
  quantityDiscountRules: [],
  loadedAt: Date.now(),
};

const mockPriceBook: PriceBook = {
  importedAt: new Date().toISOString(),
  sourceName: 'test.xlsx',
  prices: [],
};

describe('AutoQuotePage', () => {
  beforeEach(() => {
    useCatalogStore.setState({ snapshot: mockCatalog, status: 'ready', error: null });
    usePriceStore.setState({ book: mockPriceBook, loading: false, error: null });
  });

  it('defaults to matching connectors and cable instead of the second incompatible connector', () => {
    const html = renderToStaticMarkup(<AutoQuotePage />);
    expect(html).toContain('已按 A 端锁定：4芯 · 屏蔽');
    expect(html).not.toContain('M8-3P-母头');
    expect(html).toContain('UL2464 24AWG 4芯黑色护套线');
  });

  it('shows an empty cable selection when no cable matches A', () => {
    useCatalogStore.setState({ snapshot: { ...mockCatalog, wires: [] } });
    const html = renderToStaticMarkup(<AutoQuotePage />);
    expect(html).toContain('没有与 A 端芯数及屏蔽属性一致的线材');
    expect(html).toContain('请选择线材物料');
  });

  it('renders all required form sections and elements', () => {
    useCatalogStore.setState({
      snapshot: mockCatalog,
      status: 'ready',
      error: null,
    });
    usePriceStore.setState({
      book: mockPriceBook,
      loading: false,
      error: null,
    });

    const html = renderToStaticMarkup(<AutoQuotePage />);

    // 标题与横幅
    expect(html).toContain('线束自动报价系统');

    // 字段
    expect(html).toContain('A 端连接器料号');
    expect(html).toContain('B 端形式');
    expect(html).toContain('切断');
    expect(html).toContain('剥皮沾锡');
    expect(html).toContain('线材物料');
    expect(html).toContain('成型模具配置');
    expect(html).toContain('黑色 PVC 45P');
    expect(html).toContain('TPE (待支持)');
    expect(html).toContain('无内模');
    expect(html).not.toContain('无外模');
    expect(html).toContain('PE 内模');
    expect(html).toContain('报价线长 (mm)');
    expect(html).not.toContain('订单数量');
    expect(html).not.toContain('快捷数量');
    expect(html).toContain('快捷线长:');
    for (const length of [100, 500, 1000, 2000, 5000]) {
      expect(html).toContain(`${length} mm`);
    }

    // 右侧报价区域
    expect(html).toContain('实时成本分析与报价');
    expect(html).not.toContain('报价确认结构图');
  });

  it('renders endpoint forms and identifies pending-support tags', () => {
    useCatalogStore.setState({
      snapshot: mockCatalog,
      status: 'ready',
      error: null,
    });

    const html = renderToStaticMarkup(<AutoQuotePage />);
    expect(html).toContain('待支持');
  });
});

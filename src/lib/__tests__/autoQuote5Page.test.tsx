import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoQuote5Page } from '@/pages/AutoQuote5Page';
import { getRouteByPath, requiresAuth, shouldKeepRouteAfterLogin } from '@/lib/appRoute';
import { buildAutoQuoteConfig, DEFAULT_AUTO_QUOTE_FORM } from '@/lib/autoQuote';
import { getQuoteMaterials } from '@/lib/quoteMaterials';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePriceStore } from '@/stores/priceStore';
import type { MaterialPrice } from '@/repositories/priceRepository';
import type { CatalogSnapshot } from '@/types/catalog';

vi.mock('@/stores/catalogStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/catalogStore')>();
  return {
    useCatalogStore: Object.assign(
      <T,>(selector?: (state: ReturnType<typeof actual.useCatalogStore.getState>) => T) =>
        selector ? selector(actual.useCatalogStore.getState()) : actual.useCatalogStore.getState(),
      actual.useCatalogStore,
    ),
  };
});
vi.mock('@/stores/priceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/priceStore')>();
  return {
    usePriceStore: Object.assign(
      <T,>(selector?: (state: ReturnType<typeof actual.usePriceStore.getState>) => T) =>
        selector ? selector(actual.usePriceStore.getState()) : actual.usePriceStore.getState(),
      actual.usePriceStore,
    ),
  };
});

const mockCatalog: CatalogSnapshot = {
  connectors: [
    {
      id: 'conn-m12',
      resourceItemId: 'res-conn-m12',
      name: 'M12-4Pin-公头',
      series: 'M12',
      pinCount: 4,
      type: 'male',
      pinLabels: ['1', '2', '3', '4'],
    },
    {
      id: 'conn-m8',
      resourceItemId: 'res-conn-m8',
      name: 'M8-3Pin-母头',
      series: 'M8',
      pinCount: 3,
      type: 'female',
      pinLabels: ['1', '2', '3'],
    },
  ],
  wires: [
    {
      id: 'wire-cat-1',
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
      id: 'mold-pvc-1',
      resourceItemId: 'res-mold-1',
      name: 'M12外模 直头 黑色PVC 45P',
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
  loadedAt: 0,
};

const emptyCatalog: CatalogSnapshot = {
  connectors: [], wires: [], wireColors: [], overmolds: [], leadTimeOptions: [],
  protectionOptions: [], pricingRules: [], quantityDiscountRules: [], loadedAt: 0,
};

function createReadyPrices(): MaterialPrice[] {
  const { config } = buildAutoQuoteConfig({
    ...DEFAULT_AUTO_QUOTE_FORM,
    connectorAId: 'conn-m12',
    connectorBId: 'conn-m8',
    wireResourceId: 'res-wire-1',
    outerMoldSpecId: 'mold-pvc-1',
  }, mockCatalog);
  return getQuoteMaterials(config!, mockCatalog).map((row) => ({
    ...row,
    taxIncludedPrice: row.kind === 'wire' ? '4.50' : row.kind === 'connector' ? '2.80' : '1.20',
  }));
}

describe('自动报价5', () => {
  const catalogState = useCatalogStore.getState();
  const priceState = usePriceStore.getState();

  beforeEach(() => {
    useCatalogStore.setState({ status: 'ready', refreshing: false, error: null, snapshot: emptyCatalog });
    usePriceStore.setState({ book: null, loading: false, refreshing: false, error: null });
  });

  afterEach(() => {
    useCatalogStore.setState(catalogState);
    usePriceStore.setState(priceState);
  });

  it('has its own authenticated route and preserves existing quote routes', () => {
    const route = getRouteByPath('/auto-quote-5');
    expect(route.id).toBe('auto-quote-5');
    expect(route.title).toBe('自动报价5');
    expect(route.path).toBe('/auto-quote-5');
    expect(requiresAuth(route)).toBe(true);
    expect(shouldKeepRouteAfterLogin(route, null)).toBe(true);
    expect(getRouteByPath('/auto-quote-4').id).toBe('auto-quote-4');
  });

  it('renders tier matrix and toolbar controls', () => {
    const html = renderToStaticMarkup(<AutoQuote5Page />);
    for (const text of [
      '自动报价5',
      '阶梯比价矩阵',
      '正式商务报价函',
      '基准采购单价',
      '基准订单含税总价',
      '起订量梯度价格矩阵',
      '长度档位价格对比',
      '采购批量 (PCS)',
      '含税单价 (元/条)',
      '阶梯降幅 (%)',
    ]) {
      expect(html).toContain(text);
    }
  });

  it('calculates tiered pricing matrix values when catalog and prices are ready', () => {
    useCatalogStore.setState({ status: 'ready', snapshot: mockCatalog });
    usePriceStore.setState({
      book: { importedAt: '', sourceName: 'test', prices: createReadyPrices() },
      loading: false,
    });

    const html = renderToStaticMarkup(<AutoQuote5Page />);
    expect(html).toContain('公式引擎实时计算完成');
    expect(html).toContain('50 条');
    expect(html).toContain('100 条');
    expect(html).toContain('500 条');
    expect(html).toContain('1000 条');
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoQuote3Page } from '@/pages/AutoQuote3Page';
import { getRouteByPath, requiresAuth, shouldKeepRouteAfterLogin } from '@/lib/appRoute';
import { buildAutoQuoteConfig, DEFAULT_AUTO_QUOTE_FORM } from '@/lib/autoQuote';
import { getQuoteMaterials } from '@/lib/quoteMaterials';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePriceStore } from '@/stores/priceStore';
import type { MaterialPrice } from '@/repositories/priceRepository';
import type { CatalogSnapshot } from '@/types/catalog';

// Zustand uses initial state during SSR; render the explicitly seeded test state.
vi.mock('@/stores/catalogStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/catalogStore')>();
  return { useCatalogStore: Object.assign(() => actual.useCatalogStore.getState(), actual.useCatalogStore) };
});
vi.mock('@/stores/priceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/priceStore')>();
  return { usePriceStore: Object.assign(() => actual.usePriceStore.getState(), actual.usePriceStore) };
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
    {
      id: 'conn-db9',
      resourceItemId: 'res-conn-db9',
      name: 'DB9串口',
      series: 'D-SUB',
      pinCount: 9,
      type: 'male',
      pinLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
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
    {
      id: 'mold-tpe-1',
      resourceItemId: 'res-mold-tpe',
      name: 'M12外模 TPE',
      outerMaterial: '黑色TPE',
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

describe('自动报价3', () => {
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

  it('has its own authenticated route and preserves the existing quote routes', () => {
    const route = getRouteByPath('/auto-quote-3');
    expect(route.id).toBe('auto-quote-3');
    expect(route.title).toBe('自动报价3');
    expect(route.path).toBe('/auto-quote-3');
    expect(requiresAuth(route)).toBe(true);
    expect(shouldKeepRouteAfterLogin(route, null)).toBe(true);
    expect(getRouteByPath('/auto-quote').id).toBe('auto-quote');
    expect(getRouteByPath('/auto-quote-2').id).toBe('auto-quote-2');
  });

  it('renders a step wizard with inline card selection and a live summary rail', () => {
    const html = renderToStaticMarkup(<AutoQuote3Page />);
    for (const text of ['自动报价3', '连接方式', '线材物料', '成型模具', '长度与数量', '报价结果', '配置摘要', '实时测算', '上一步', '下一步']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('A 端连接器');
    expect(html).toContain('B 端形式');
    expect(html).not.toContain('报价确认结构图');
  });

  it('lists pending selections in the live estimate rail when catalog is empty', () => {
    const html = renderToStaticMarkup(<AutoQuote3Page />);
    expect(html).toContain('请选择 A 端连接器');
    expect(html).toContain('待完善');
    expect(html).not.toContain('含税含运费单价');
  });

  it('shows the live unit price when catalog and prices are complete', () => {
    useCatalogStore.setState({ status: 'ready', snapshot: mockCatalog });
    usePriceStore.setState({
      book: { importedAt: '', sourceName: 'test', prices: createReadyPrices() },
      loading: false,
    });
    const html = renderToStaticMarkup(<AutoQuote3Page />);
    expect(html).toContain('可实时报价');
    expect(html).toContain('含税含运费单价');
    expect(html).toContain('订单总额');
    expect(html).not.toContain('请选择 A 端连接器');
  });
});

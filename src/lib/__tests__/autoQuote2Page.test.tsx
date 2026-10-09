import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoQuote2Page, AutoQuote2Result } from '@/pages/AutoQuote2Page';
import { getRouteByPath, requiresAuth, shouldKeepRouteAfterLogin } from '@/lib/appRoute';
import type { AutoQuoteEvaluation } from '@/lib/autoQuote';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePriceStore } from '@/stores/priceStore';

// Zustand uses initial state during SSR; render the explicitly seeded test state.
vi.mock('@/stores/catalogStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/catalogStore')>();
  return { useCatalogStore: Object.assign(() => actual.useCatalogStore.getState(), actual.useCatalogStore) };
});
vi.mock('@/stores/priceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/priceStore')>();
  return { usePriceStore: Object.assign(() => actual.usePriceStore.getState(), actual.usePriceStore) };
});

describe('自动报价2', () => {
  const catalogState = useCatalogStore.getState();
  const priceState = usePriceStore.getState();

  beforeEach(() => {
    useCatalogStore.setState({ status: 'ready', refreshing: false, error: null, snapshot: {
      connectors: [], wires: [], wireColors: [], overmolds: [], leadTimeOptions: [],
      protectionOptions: [], pricingRules: [], quantityDiscountRules: [], loadedAt: 0,
    } });
    usePriceStore.setState({ loading: false, refreshing: false, error: null });
  });

  afterEach(() => {
    useCatalogStore.setState(catalogState);
    usePriceStore.setState(priceState);
  });

  it('has its own authenticated route and preserves the original quote route', () => {
    const route = getRouteByPath('/auto-quote-2');
    expect(route.id).toBe('auto-quote-2');
    expect(route.title).toBe('自动报价2');
    expect(requiresAuth(route)).toBe(true);
    expect(shouldKeepRouteAfterLogin(route, null)).toBe(true);
    expect(getRouteByPath('/auto-quote').id).toBe('auto-quote');
  });

  it('renders an explicit input form without drawing or cost-detail controls', () => {
    const html = renderToStaticMarkup(<AutoQuote2Page />);
    for (const text of ['自动报价2', 'A 端连接器', 'B 端形式', '线材', '外模', '内模', '长度', '数量', '获取报价']) {
      expect(html).toContain(text);
    }
    for (const text of ['加工明细', '材料成本', '成本分析', '导出 Excel', '图纸预览']) {
      expect(html).not.toContain(text);
    }
    expect(html).toContain('填写信息后获取报价');
  });

  it('disables quoting while catalog data is loading or unavailable', () => {
    useCatalogStore.setState({ status: 'loading', snapshot: null });
    expect(renderToStaticMarkup(<AutoQuote2Page />)).toContain('正在加载物料和价格');
    useCatalogStore.setState({ status: 'error', error: '目录读取失败' });
    const html = renderToStaticMarkup(<AutoQuote2Page />);
    expect(html).toContain('目录读取失败');
    expect(html).toContain('重新加载');
    expect(html).not.toContain('订单总价');
  });

  it('renders only the final selling prices even when the evaluation includes internal costs', () => {
    const evaluation: AutoQuoteEvaluation = {
      status: 'ready', issues: [],
      price: {
        unitPrice: '12.34', totalPrice: '1234.00',
        materials: [{ name: '内部采购价', points: 1, unitPrice: '8.765432', amount: '8.765432' }],
        labor: [{ name: '内部焊接工费', points: 1, unitPrice: '0.765432', amount: '0.765432' }],
        materialSubtotal: '8.765432', laborSubtotal: '0.765432', materialLoss: '0.111111',
        processingLoss: '0.222222', cost: '9.543219', sellingPrice: '11.980582', freight: '0.359418',
      },
    };
    const html = renderToStaticMarkup(<AutoQuote2Result evaluation={evaluation} />);
    expect(html).toContain('12.34');
    expect(html).toContain('1234.00');
    expect(html).toContain('含税含运费单价');
    expect(html).toContain('订单总价');
    for (const privateValue of ['内部采购价', '内部焊接工费', '8.765432', '0.765432', '9.543219', '成本', '毛利', '明细']) {
      expect(html).not.toContain(privateValue);
    }
  });

  it.each(['blocked', 'manual', 'unsupported', 'incomplete'] as const)('explains %s without displaying a selling price', (status) => {
    const html = renderToStaticMarkup(<AutoQuote2Result evaluation={{ status, issues: ['请联系维护人员补充价格'] }} />);
    expect(html).toContain('请联系维护人员补充价格');
    expect(html).not.toContain('含税含运费单价');
    expect(html).not.toContain('订单总价');
  });
});

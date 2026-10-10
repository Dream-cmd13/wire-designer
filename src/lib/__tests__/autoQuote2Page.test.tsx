import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoQuote2Page, AutoQuote2Result } from '@/pages/AutoQuote2Page';
import { getRouteByPath, requiresAuth, shouldKeepRouteAfterLogin } from '@/lib/appRoute';
import { DEFAULT_AUTO_QUOTE_FORM, buildQuoteSummaryText, type AutoQuoteEvaluation } from '@/lib/autoQuote';
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
    // 初始状态下所有输入框均为空白并提示占位符
    expect(html).toContain('placeholder="请输入长度" value=""');
    expect(html).toContain('placeholder="请输入数量" value=""');
    expect(html).toContain('请选择 A 端料号');
    expect(html).toContain('请选择 B 端料号');
    expect(html).toContain('请选择线材料号');
    // 确认已移除多余提示字体
    expect(html).not.toContain('首版工业标准公式支持 M8 与 M12 系列连接器选配');
    expect(html).not.toContain('线束快速询价 · 一屏极速版');
    expect(html).not.toContain('自顶向下流程录入');
    expect(html).not.toContain('纯售价模式');
  });

  it('automatically preselects the first available supported overmold spec', () => {
    useCatalogStore.setState({
      status: 'ready',
      refreshing: false,
      error: null,
      snapshot: {
        connectors: [],
        wires: [],
        wireColors: [],
        overmolds: [
          {
            id: 'mold-pvc-m12',
            resourceItemId: 'res-mold-1',
            name: 'M12外模 直头 黑色PVC 45P',
            outerMaterial: '黑色PVC',
            outerHardness: '45P',
            outerForm: 'straight',
          },
          {
            id: 'mold-pvc-m8',
            resourceItemId: 'res-mold-2',
            name: 'M8外模 直头 黑色PVC 45P',
            outerMaterial: '黑色PVC',
            outerHardness: '45P',
            outerForm: 'straight',
          },
        ],
        leadTimeOptions: [],
        protectionOptions: [],
        pricingRules: [],
        quantityDiscountRules: [],
        loadedAt: 0,
      },
    });

    const html = renderToStaticMarkup(<AutoQuote2Page />);
    expect(html).toContain('直/弯头');
    expect(html).toContain('直头');
    // 选框默认值预选了第一个可用外模
    expect(html).toContain('value="mold-pvc-m12" selected=""');
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

  it('builds quote summary text correctly without leaking internal details', () => {
    const evaluation: AutoQuoteEvaluation = {
      status: 'ready',
      issues: [],
      price: {
        unitPrice: '25.80',
        totalPrice: '25800.00',
        materials: [{ name: '采购料', points: 1, unitPrice: '10.00', amount: '10.00' }],
        labor: [],
        materialSubtotal: '10.00',
        laborSubtotal: '5.00',
        materialLoss: '0.50',
        processingLoss: '0.50',
        cost: '16.00',
        sellingPrice: '25.00',
        freight: '0.80',
      },
    };

    const text = buildQuoteSummaryText(
      {
        ...DEFAULT_AUTO_QUOTE_FORM,
        lengthMm: 1500,
        quantity: 1000,
        endpointBType: 'connector',
        outerMoldEnds: 2,
      },
      evaluation,
      { name: 'M12-4Pin-公头', model: 'M12-A-4P-M', pinCount: 4 },
      { name: 'M12-4Pin-母头', model: 'M12-A-4P-F', pinCount: 4 },
      { name: 'UL2464 24AWG 4芯黑色护套线' },
      'M12直头 黑色PVC 45P',
    );

    expect(text).toContain('【线束询价核算结果】');
    expect(text).toContain('M12-A-4P-M (4Pin)');
    expect(text).toContain('M12-A-4P-F (4Pin)');
    expect(text).toContain('UL2464 24AWG 4芯黑色护套线');
    expect(text).toContain('1500 mm');
    expect(text).toContain('1000 条');
    expect(text).toContain('¥25.80 / 条');
    expect(text).toContain('¥25800.00 元');
    expect(text).toContain('含 13% 增值税专用发票及指定地点标准运费');
    for (const privateValue of ['采购料', '内部', '成本', '毛利', '明细']) {
      expect(text).not.toContain(privateValue);
    }
  });

  it.each(['blocked', 'manual', 'unsupported', 'incomplete'] as const)('explains %s without displaying a selling price', (status) => {
    const html = renderToStaticMarkup(<AutoQuote2Result evaluation={{ status, issues: ['请联系维护人员补充价格'] }} />);
    expect(html).toContain('请联系维护人员补充价格');
    expect(html).not.toContain('含税含运费单价');
    expect(html).not.toContain('订单总价');
  });
});

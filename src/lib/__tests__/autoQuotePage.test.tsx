import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoQuotePage } from '@/pages/AutoQuotePage';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePriceStore } from '@/stores/priceStore';
import type { CatalogSnapshot } from '@/types/catalog';
import type { PriceBook } from '@/repositories/priceRepository';

import { useUserStore } from '@/stores/userStore';
import { useServerQuote } from '@/lib/useServerQuote';
import { isValidElement, type ReactNode } from 'react';
import * as XLSX from 'xlsx';
import { AutoQuotePriceCard } from '@/components/autoQuote/AutoQuotePriceCard';

const hookHarness = vi.hoisted(() => ({ active: false, index: 0, states: [] as unknown[] }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!hookHarness.active) return actual.useState(initial);
      const index = hookHarness.index++;
      if (!(index in hookHarness.states)) hookHarness.states[index] = initial;
      return [hookHarness.states[index], (value: unknown) => { hookHarness.states[index] = value; }];
    },
    useMemo: (factory: () => unknown, deps: unknown[]) => hookHarness.active ? factory() : actual.useMemo(factory, deps),
    useEffect: (effect: () => void, deps: unknown[]) => { if (!hookHarness.active) actual.useEffect(effect, deps); },
  };
});
vi.mock('xlsx', async (importOriginal) => ({ ...await importOriginal<typeof import('xlsx')>(), writeFile: vi.fn() }));

function findStickyExport(node: ReactNode): (() => void) | undefined {
  if (Array.isArray(node)) {
    for (const child of node) { const found = findStickyExport(child); if (found) return found; }
  } else if (isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) {
    if (node.type === 'button' && node.props.onClick?.name === 'handleExportPublicExcel') return node.props.onClick;
    return findStickyExport(node.props.children);
  }
}

function findPriceCard(node: ReactNode): ReactNode {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findPriceCard(child);
      if (found) return found;
    }
  } else if (isValidElement<{ children?: ReactNode }>(node)) {
    if (node.type === AutoQuotePriceCard) return node;
    return findPriceCard(node.props.children);
  }
}

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

vi.mock('@/stores/userStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/userStore')>();
  const store = actual.useUserStore;
  return { ...actual, useUserStore: Object.assign(
    <T,>(selector: (state: ReturnType<typeof store.getState>) => T) => selector(store.getState()),
    store,
  ) };
});

vi.mock('@/lib/useServerQuote', () => ({
  useServerQuote: vi.fn(() => ({
    result: undefined,
    loading: false,
    error: undefined,
    retry: vi.fn(),
  })),
}));

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
    hookHarness.active = false;
    hookHarness.states = [];
    hookHarness.index = 0;
    useCatalogStore.setState({ snapshot: mockCatalog, status: 'ready', error: null });
    usePriceStore.setState({ book: mockPriceBook, loading: false, error: null });
    useUserStore.setState({ currentUser: null });
    vi.mocked(useServerQuote).mockReturnValue({
      result: undefined,
      loading: false,
      error: undefined,
      retry: vi.fn(),
    });
  });

  it('shows request failures and retry in the sticky bar rather than blaming the input', () => {
    vi.mocked(useServerQuote).mockReturnValue({ result: undefined, loading: false, error: '服务端报价失败', retry: vi.fn() });
    const html = renderToStaticMarkup(<AutoQuotePage />);
    const bar = html.slice(html.indexOf('data-testid="auto-quote-sticky-bar"'));
    expect(bar).toContain('服务端报价失败');
    expect(bar).toContain('重试');
    expect(bar).not.toContain('请完善选配输入');
    expect(html).not.toContain('请完善选配输入');
    expect(html).not.toContain('实时公式引擎就绪');
  });

  it('shows quotation loading without an incomplete-input warning', () => {
    vi.mocked(useServerQuote).mockReturnValue({ result: undefined, loading: true, error: undefined, retry: vi.fn() });
    const html = renderToStaticMarkup(<AutoQuotePage />);
    expect(html).toContain('正在核算报价');
    expect(html).not.toContain('请完善选配输入');
    expect(html).not.toContain('实时公式引擎就绪');
    expect(html).not.toContain('导出报价 Excel');
  });

  it.each(['idle', 'loading'] as const)('shows catalog loading for %s rather than missing selections', (status) => {
    useCatalogStore.setState({ snapshot: null, status });
    const html = renderToStaticMarkup(<AutoQuotePage />);
    expect(html).toContain('正在加载物料目录');
    expect(html).not.toContain('请完善选配输入');
    expect(html).not.toContain('请选择线材物料');
    expect(html).not.toContain('实时公式引擎就绪');
  });

  it('shows catalog failure with retry and no misleading input warning', () => {
    useCatalogStore.setState({ snapshot: null, status: 'error', error: '物料目录连接失败' });
    const html = renderToStaticMarkup(<AutoQuotePage />);
    expect(html).toContain('物料目录连接失败');
    expect(html).toContain('重试');
    expect(html).not.toContain('请完善选配输入');
    expect(html).not.toContain('实时公式引擎就绪');
  });

  it('shows successful quotation status only after receiving a ready result', () => {
    vi.mocked(useServerQuote).mockReturnValue({ result: { status: 'ready', price: { unitPrice: '10.00', totalPrice: '10000.00' }, settingsVersion: 1, calculatedAt: '2026-10-12' }, loading: false, error: undefined, retry: vi.fn() });
    const html = renderToStaticMarkup(<AutoQuotePage />);
    expect(html).toContain('报价已更新');
    expect(html).toContain('¥10.00');
    expect(html).not.toContain('请完善选配输入');
    expect(html).toContain('核价时间');
    expect(html).toContain('2026-10-12');
    expect(html).toContain('重新核价');
    expect(html).toContain('导出当前核价结果');
  });

  it('recovers from a failed quote through loading to a ready result', () => {
    vi.mocked(useServerQuote).mockReturnValue({ result: undefined, loading: false, error: '核算连接失败', retry: vi.fn() });
    expect(renderToStaticMarkup(<AutoQuotePage />)).toContain('核算连接失败');
    vi.mocked(useServerQuote).mockReturnValue({ result: undefined, loading: true, error: undefined, retry: vi.fn() });
    const loading = renderToStaticMarkup(<AutoQuotePage />);
    expect(loading).toContain('正在核算报价');
    expect(loading).not.toContain('核算连接失败');
    expect(loading).not.toContain('请完善选配输入');
    vi.mocked(useServerQuote).mockReturnValue({ result: { status: 'ready', price: { unitPrice: '12.00', totalPrice: '12000.00' }, settingsVersion: 1, calculatedAt: '2026-10-12' }, loading: false, error: undefined, retry: vi.fn() });
    const ready = renderToStaticMarkup(<AutoQuotePage />);
    expect(ready).toContain('¥12.00');
    expect(ready).not.toContain('正在核算报价');
    expect(ready).not.toContain('核算连接失败');
  });

  it('shows the previous and current unit price after a manual refresh changes the amount', () => {
    vi.mocked(useServerQuote).mockReturnValue({ result: { status: 'ready', price: { unitPrice: '12.00', totalPrice: '12000.00' }, settingsVersion: 2, calculatedAt: '2026-10-12T01:02:03Z' }, previousUnitPrice: '10.00', loading: false, error: undefined, retry: vi.fn() });
    const html = renderToStaticMarkup(<AutoQuotePage />);
    expect(html).toContain('单价由 ¥10.00 更新为 ¥12.00');
    expect(html).toContain('2026-10-12 09:02:03 (北京时间)');
  });

  it.each(['sales', 'engineer'] as const)('keeps %s failure and loading messages mutually exclusive', (role) => {
    useUserStore.setState({ currentUser: { id: 'user', name: 'User', email: 'user@example.com', role, createdAt: 0 } });
    for (const pending of [true, false]) {
      vi.mocked(useServerQuote).mockReturnValue({ result: undefined, loading: pending, error: pending ? undefined : '核算失败', retry: vi.fn() });
      const html = renderToStaticMarkup(<AutoQuotePage />);
      expect(html).toContain(pending ? '正在核算报价' : '核算失败');
      expect(html).not.toContain(pending ? '核算失败' : '正在核算报价');
      expect(html).not.toContain('请完善选配输入');
      expect(html).not.toContain('导出报价 Excel');
    }
  });

  it('shows sticky export failures and clears the error after a successful retry', () => {
    vi.mocked(useServerQuote).mockReturnValue({ result: { status: 'ready', price: { unitPrice: '10', totalPrice: '10000' }, settingsVersion: 1, calculatedAt: '2026-10-12' }, loading: false, error: undefined, retry: vi.fn() });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(XLSX.writeFile).mockImplementationOnce(() => { throw new Error('write failed'); });
    hookHarness.active = true;
    try {
      const exportQuote = findStickyExport(AutoQuotePage());
      expect(exportQuote).toBeTypeOf('function');
      exportQuote!();
      hookHarness.index = 0;
      const failedTree = AutoQuotePage();
      hookHarness.active = false;
      expect(renderToStaticMarkup(failedTree)).toContain('导出报价失败，请重试。');
      hookHarness.active = true;
      findStickyExport(failedTree)!();
      hookHarness.index = 0;
      const retriedTree = AutoQuotePage();
      hookHarness.active = false;
      expect(renderToStaticMarkup(retriedTree)).not.toContain('导出报价失败，请重试。');
    } finally {
      hookHarness.active = false;
      log.mockRestore();
    }
  });

  it('exports the displayed unit price without an unconfirmed order quantity or total', () => {
    vi.mocked(useServerQuote).mockReturnValue({ result: { status: 'ready', price: { unitPrice: '10.00', totalPrice: '10000.00' }, settingsVersion: 1, calculatedAt: '2026-10-12' }, loading: false, error: undefined, retry: vi.fn() });
    vi.mocked(XLSX.writeFile).mockClear();
    hookHarness.active = true;
    try {
      findStickyExport(AutoQuotePage())!();
      const book = vi.mocked(XLSX.writeFile).mock.calls[0][0];
      const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
      expect(rows).toMatchObject([{
        产品名称: expect.any(String),
        交期: '7日',
        含税含运费单价: '10.00',
        核价时间: '2026-10-12 08:00:00 (北京时间)',
      }]);
      expect(rows[0]).not.toHaveProperty('订单数量');
      expect(rows[0]).not.toHaveProperty('订单总价');
      expect(rows[0]).not.toHaveProperty('计价规则版本');
    } finally {
      hookHarness.active = false;
    }
  });

  it.each(['sales', 'engineer', 'admin'] as const)('uses unit-price export in the %s quotation card', (role) => {
    useUserStore.setState({ currentUser: { id: 'user', name: 'User', email: 'user@example.com', role, createdAt: 0 } });
    hookHarness.active = true;
    try {
      const card = findPriceCard(AutoQuotePage());
      expect(isValidElement<{ exportScope: string }>(card) && card.props.exportScope).toBe('unit');
    } finally {
      hookHarness.active = false;
    }
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
    expect(html).toContain('实时报价');
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

  it('renders single-column layout with sticky bottom bar for sales user', () => {
    useUserStore.setState({
      currentUser: {
        id: 'u-sales',
        name: 'Sales Rep',
        email: 'sales@example.com',
        role: 'sales',
        createdAt: 0,
      },
    });

    vi.mocked(useServerQuote).mockReturnValue({
      result: {
        status: 'ready',
        price: {
          unitPrice: '58.50',
          totalPrice: '58500.00',
          breakdown: {
            materials: [{ name: 'M12 公头', points: 1, unitPrice: '10', amount: '10' }],
            labor: [{ name: '焊锡工序', points: 1, unitPrice: '5', amount: '5' }],
            materialLoss: '1.20',
            processingLoss: '0.80',
            cost: '30.00',
            sellingPrice: '50.00',
            freight: '8.50',
            materialSubtotal: '20.00',
            laborSubtotal: '10.00',
            unitPrice: '58.50',
            totalPrice: '58500.00',
          },
        },
        settingsVersion: 1,
        calculatedAt: '2026-10-12',
      },
      loading: false,
      error: undefined,
      retry: vi.fn(),
    });

    const html = renderToStaticMarkup(<AutoQuotePage />);

    // 结构：单列容器与底部吸附栏存在，双列容器不存在
    expect(html).toContain('data-testid="auto-quote-single-column"');
    expect(html).not.toContain('data-testid="auto-quote-dual-column"');
    expect(html).toContain('data-testid="auto-quote-sticky-bar"');
    expect(html).toContain('max-w-3xl');

    // 业务员可见内容：选配参数、最终单价、交期参考、导出报价
    expect(html).toContain('选配参数与端部工艺');
    expect(html).toContain('含税含运费单价');
    expect(html).toContain('¥58.50');
    expect(html).not.toContain('订单总价');
    expect(html).toContain('交期参考');
    expect(html).toContain('导出报价 Excel');

    // 业务员严禁看到内部成本拆解与工序明细
    expect(html).not.toContain('材料成本拆解');
    expect(html).not.toContain('加工费工序明细');
    expect(html).not.toContain('成本与损耗分析');
    expect(html).not.toContain('导出内部成本分析表');
  });

  it('renders dual-column layout with internal breakdown for engineer or admin', () => {
    useUserStore.setState({
      currentUser: {
        id: 'u-eng',
        name: 'Engineer Lee',
        email: 'eng@example.com',
        role: 'engineer',
        createdAt: 0,
      },
    });

    vi.mocked(useServerQuote).mockReturnValue({
      result: {
        status: 'ready',
        price: {
          unitPrice: '58.50',
          totalPrice: '58500.00',
          breakdown: {
            materials: [{ name: 'M12 公头', points: 1, unitPrice: '10', amount: '10' }],
            labor: [{ name: '焊锡工序', points: 1, unitPrice: '5', amount: '5' }],
            materialLoss: '1.20',
            processingLoss: '0.80',
            cost: '30.00',
            sellingPrice: '50.00',
            freight: '8.50',
            materialSubtotal: '20.00',
            laborSubtotal: '10.00',
            unitPrice: '58.50',
            totalPrice: '58500.00',
          },
        },
        settingsVersion: 1,
        calculatedAt: '2026-10-12',
      },
      loading: false,
      error: undefined,
      retry: vi.fn(),
    });

    const html = renderToStaticMarkup(<AutoQuotePage />);

    // 结构：双列容器存在，单列容器与业务员底部吸附栏不存在
    expect(html).toContain('data-testid="auto-quote-dual-column"');
    expect(html).not.toContain('data-testid="auto-quote-single-column"');
    expect(html).not.toContain('data-testid="auto-quote-sticky-bar"');
    expect(html).toContain('lg:w-[480px]');

    // 工程师可见内容：产品选配、最终报价、成本拆解、加工工序和内部导出
    expect(html).toContain('选配参数与端部工艺');
    expect(html).toContain('实时报价');
    expect(html).toContain('材料成本拆解');
    expect(html).toContain('加工费工序明细');
    expect(html).toContain('成本与损耗分析');
    expect(html).toContain('导出内部成本分析表');
  });

  it('retains role-based layout consistently even during incomplete or blocked states', () => {
    // 即使在 blocked 状态下，业务员依然是单列，工程师依然是双列，不会因缺价来回跳动
    useUserStore.setState({
      currentUser: {
        id: 'u-sales',
        name: 'Sales Rep',
        email: 'sales@example.com',
        role: 'sales',
        createdAt: 0,
      },
    });
    vi.mocked(useServerQuote).mockReturnValue({
      result: { status: 'blocked', issues: ['请选择连接器与线材'] },
      loading: false,
      error: undefined,
      retry: vi.fn(),
    });

    const salesHtml = renderToStaticMarkup(<AutoQuotePage />);
    expect(salesHtml).toContain('data-testid="auto-quote-single-column"');
    expect(salesHtml).not.toContain('data-testid="auto-quote-dual-column"');

    useUserStore.setState({
      currentUser: {
        id: 'u-admin',
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'admin',
        createdAt: 0,
      },
    });

    const adminHtml = renderToStaticMarkup(<AutoQuotePage />);
    expect(adminHtml).toContain('data-testid="auto-quote-dual-column"');
    expect(adminHtml).not.toContain('data-testid="auto-quote-single-column"');
  });
});

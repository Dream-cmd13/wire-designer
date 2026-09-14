import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QuoteModal } from '@/components/panels/QuotePanel';
import { BomModal } from '@/components/panels/BomPanel';
import { BomPreviewModal, type BomPreviewItem } from '@/components/panels/BomPreviewModal';
import { useHarnessStore } from '@/stores/harnessStore';
import { usePriceStore } from '@/stores/priceStore';
import { DEFAULT_QUOTE_LEAD_TIME } from '@/data/catalogOptions';
import { alignHarnessConfig } from '@/lib/canvasMaterials';

describe('QuoteModal component & anti-jitter behavior', () => {
  it('does not render when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <QuoteModal isOpen={false} onClose={() => {}} />,
    );
    expect(html).toBe('');
  });

  it('renders quote modal dialog when isOpen is true', () => {
    const html = renderToStaticMarkup(
      <QuoteModal isOpen={true} onClose={() => {}} />,
    );
    expect(html).toContain('线束报价核算');
    expect(html).not.toContain('共享材料价格库');
    expect(html).not.toContain('导入价格');
    expect(html).not.toContain('下载模板');
    expect(html).toContain('订单数量');
    expect(html).toContain('加工端数');
    expect(html).toContain('导出报价 Excel');
  });

  it('completely removes shared material price db section from QuotePanel.tsx', () => {
    const source = readFileSync('src/components/panels/QuotePanel.tsx', 'utf8');
    expect(source).not.toContain('共享材料价格库');
    expect(source).not.toContain('exportPrices');
  });

  it('completely removes M8 / M12 references from QuotePanel.tsx source code', () => {
    const source = readFileSync('src/components/panels/QuotePanel.tsx', 'utf8');
    expect(source).not.toContain('M8 / M12 报价');
    expect(source).not.toContain('M8 / M12');
  });

  it('completely eliminates window.focus reload listener to prevent Alt+Tab refresh jitter', () => {
    const source = readFileSync('src/components/panels/QuotePanel.tsx', 'utf8');
    expect(source).not.toContain("window.addEventListener('focus'");
    expect(source).not.toContain('window.addEventListener("focus"');
  });

  it('renders BomModal dialog when open and hides when closed', () => {
    expect(renderToStaticMarkup(<BomModal isOpen={false} onClose={() => {}} />)).toBe('');
    const html = renderToStaticMarkup(<BomModal isOpen={true} onClose={() => {}} />);
    expect(html).toContain('BOM物料清单');
    expect(html).toContain('线束工程组件与物料统计');
  });

  it('automatically identifies and selects processing ends based on connector count', () => {
    const store = useHarnessStore.getState();
    // 2 connectors: should automatically select 2 ends without redundant explanation text
    const configWith2 = {
      ...store.config,
      connectors: [
        { id: 'c1', label: 'J1', position: { x: 0, y: 0 }, jumpers: [], connector: { id: 'p1', name: 'M12-4P', pinCount: 4, type: 'male' as const, manufacturer: '' } },
        { id: 'c2', label: 'J2', position: { x: 100, y: 0 }, jumpers: [], connector: { id: 'p2', name: 'M12-4P', pinCount: 4, type: 'female' as const, manufacturer: '' } },
      ],
    };
    useHarnessStore.getState().replaceDocument(configWith2);
    const html2 = renderToStaticMarkup(<QuoteModal isOpen={true} onClose={() => {}} />);
    expect(html2).not.toContain('已按连接器自动选择');
    expect(html2).not.toContain('已自动选择');
    expect(html2).toContain('<option value="2" selected="">双头 / 2 端</option>');

    // 1 connector: should automatically select 1 end without redundant explanation text
    const configWith1 = {
      ...store.config,
      connectors: [
        { id: 'c1', label: 'J1', position: { x: 0, y: 0 }, jumpers: [], connector: { id: 'p1', name: 'M12-4P', pinCount: 4, type: 'male' as const, manufacturer: '' } },
      ],
    };
    useHarnessStore.getState().replaceDocument(configWith1);
    const html1 = renderToStaticMarkup(<QuoteModal isOpen={true} onClose={() => {}} />);
    expect(html1).not.toContain('已按连接器自动选择');
    expect(html1).not.toContain('已自动选择');
    expect(html1).toContain('<option value="1" selected="">单头 / 1 端</option>');
  });

  it('alignHarnessConfig keeps quotation.processingEnds synced with connector count', () => {
    const base = useHarnessStore.getState().config;
    const initialConfig = {
      ...base,
      quotation: { processingEnds: 1 as const, srPoints: 0 },
      connectors: [
        { id: 'c1', label: 'J1', position: { x: 0, y: 0 }, jumpers: [], connector: { id: 'p1', name: 'M12-4P', pinCount: 4, type: 'male' as const, manufacturer: '' } },
        { id: 'c2', label: 'J2', position: { x: 100, y: 0 }, jumpers: [], connector: { id: 'p2', name: 'M12-4P', pinCount: 4, type: 'female' as const, manufacturer: '' } },
      ],
    };
    const aligned = alignHarnessConfig(initialConfig);
    expect(aligned.quotation?.processingEnds).toBe(2);
  });

  it('binds DEFAULT_QUOTE_LEAD_TIME in the total price card of QuotePanel', () => {
    const source = readFileSync('src/components/panels/QuotePanel.tsx', 'utf8');
    expect(source).toContain('交期：{DEFAULT_QUOTE_LEAD_TIME}');
    expect(source).toContain('订单总价（{config.quantity} 件）');
    expect(DEFAULT_QUOTE_LEAD_TIME).toBe('7日');
  });

  it('applies anti-jitter minimum height classes to QuoteModal container', () => {
    const html = renderToStaticMarkup(<QuoteModal isOpen={true} onClose={() => {}} />);
    expect(html).toContain('min-h-[460px]');
    expect(html).toContain('sm:min-h-[520px]');
  });

  it('renders loading skeleton and suppresses missing price warning during initial loading', () => {
    usePriceStore.setState({ book: null, loading: true, error: null });
    usePriceStore.getInitialState = () => usePriceStore.getState();
    const html = renderToStaticMarkup(<QuoteModal isOpen={true} onClose={() => {}} />);
    expect(html).toContain('正在核算报价');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('缺少');
    // reset
    usePriceStore.setState({ book: null, loading: false, error: null });
    usePriceStore.getInitialState = () => usePriceStore.getState();
  });

  it('preloads price store alongside catalog initialization in App.tsx', () => {
    const source = readFileSync('src/App.tsx', 'utf8');
    expect(source).toContain('usePriceStore');
    expect(source).toContain('loadPrices');
  });
});

describe('BomPreviewModal component', () => {
  it('does not render when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <BomPreviewModal isOpen={false} onClose={() => {}} />,
    );
    expect(html).toBe('');
  });

  it('renders modal with left/right buttons when multiple images exist across items', () => {
    const items: BomPreviewItem[] = [
      {
        itemName: 'M12-4P 公头',
        files: [
          { name: 'm12_front.png', url: 'https://example.com/m12_front.png', type: 'image' },
          { name: 'm12_side.png', url: 'https://example.com/m12_side.png', type: 'image' },
        ],
      },
      {
        itemName: '22AWG 电子线',
        files: [
          { name: 'wire.png', url: 'https://example.com/wire.png', type: 'image' },
        ],
      },
    ];

    const html = renderToStaticMarkup(
      <BomPreviewModal isOpen={true} onClose={() => {}} items={items} initialIndex={0} />,
    );

    expect(html).toContain('物料关联文件预览');
    expect(html).toContain('上一张图片');
    expect(html).toContain('下一张图片');
    expect(html).toContain('1 / 3');
    expect(html).toContain('M12-4P 公头');
    expect(html).toContain('m12_front.png');
    // Ensure image has object-contain without artificial white border padding card
    expect(html).toContain('object-contain');
    expect(html).not.toContain('p-2 rounded-lg bg-white shadow border border-slate-200');
  });

  it('supports single-item legacy files prop', () => {
    const html = renderToStaticMarkup(
      <BomPreviewModal
        isOpen={true}
        onClose={() => {}}
        itemName="单项物料"
        files={[
          { name: 'single.png', url: 'https://example.com/single.png', type: 'image' },
        ]}
      />,
    );

    expect(html).toContain('物料关联文件预览');
    expect(html).toContain('单项物料');
    expect(html).toContain('single.png');
    expect(html).not.toContain('上一张图片');
  });
});


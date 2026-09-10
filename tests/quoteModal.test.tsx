import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QuoteModal } from '@/components/panels/QuotePanel';
import { BomModal } from '@/components/panels/BomPanel';

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
    expect(html).toContain('共享材料价格库');
    expect(html).toContain('订单数量');
    expect(html).toContain('加工端数');
    expect(html).toContain('导出报价 Excel');
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
});

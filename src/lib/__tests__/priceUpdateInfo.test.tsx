import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PriceUpdateInfo } from '@/components/materials/PriceUpdateInfo';
import type { MaterialPrice } from '@/repositories/priceRepository';
const price: MaterialPrice = { kind: 'connector', resourceId: 'c', name: '连接器', specification: '[]', lengthMm: 0, unit: '元/个', taxIncludedPrice: '1' };
describe('price update metadata', () => {
  it('shows the recorded updater and Beijing time', () => {
    const html = renderToStaticMarkup(<PriceUpdateInfo price={{ ...price, updatedAt: '2026-10-12T08:30:45Z', updatedBy: 'id', updatedByName: '张工' }} />);
    expect(html).toContain('更新时间：');
    expect(html).toContain('2026/10/12 16:30:45');
    expect(html).toContain('更新人：');
    expect(html).toContain('张工');
  });
  it('does not invent historical updater details or show metadata for unpriced items', () => {
    expect(renderToStaticMarkup(<PriceUpdateInfo />)).toBe('');
    const html = renderToStaticMarkup(<PriceUpdateInfo price={{ ...price, updatedAt: 'invalid' }} />);
    expect(html.match(/未记录/g)).toHaveLength(2);
    expect(html).not.toContain('Invalid Date');
  });
});

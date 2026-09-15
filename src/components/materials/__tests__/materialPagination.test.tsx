import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MaterialPagination } from '../MaterialPagination';

describe('MaterialPagination', () => {
  it('renders nothing when totalCount is 0', () => {
    const html = renderToStaticMarkup(
      <MaterialPagination
        currentPage={1}
        pageSize={20}
        totalCount={0}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />,
    );
    expect(html).toBe('');
  });

  it('renders range, total count, default page size (20) and page counter', () => {
    const html = renderToStaticMarkup(
      <MaterialPagination
        currentPage={1}
        pageSize={20}
        totalCount={522}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />,
    );

    expect(html).toContain('显示 1 - 20 条');
    expect(html).toContain('522');
    expect(html).toContain('20 条/页');
    expect(html).toContain('50 条/页');
    expect(html).toContain('100 条/页');
    expect(html).toContain('1 / 27');
    expect(html).toContain('上一页');
    expect(html).toContain('下一页');
  });

  it('calculates middle page item range correctly', () => {
    const html = renderToStaticMarkup(
      <MaterialPagination
        currentPage={3}
        pageSize={20}
        totalCount={55}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />,
    );

    expect(html).toContain('显示 41 - 55 条');
    expect(html).toContain('3 / 3');
  });

  it('renders with scrollContainerRef without error', () => {
    const mockContainer = { scrollTo: () => {}, scrollTop: 0 } as unknown as HTMLElement;
    const html = renderToStaticMarkup(
      <MaterialPagination
        currentPage={1}
        pageSize={20}
        totalCount={100}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
        scrollContainerRef={{ current: mockContainer }}
      />,
    );
    expect(html).toContain('显示 1 - 20 条');
  });
});

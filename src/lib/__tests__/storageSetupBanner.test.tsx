import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StorageSetupBanner } from '@/components/shared/StorageSetupBanner';

describe('StorageSetupBanner', () => {
  it('shows missing and public buckets with the bootstrap command', () => {
    const html = renderToStaticMarkup(
      <StorageSetupBanner
        state={{
          status: 'issue',
          missingBuckets: ['catalog-assets'],
          publicBuckets: ['project-assets'],
        }}
        checking={false}
        onRetry={() => undefined}
      />,
    );

    expect(html).toContain('缺少存储桶');
    expect(html).toContain('catalog-assets');
    expect(html).toContain('不是私有桶');
    expect(html).toContain('project-assets');
    expect(html).toContain('npm run supabase:bootstrap-storage');
    expect(html).toContain('aria-label="重新检测存储状态"');
  });

  it('shows a safe health-check error', () => {
    const html = renderToStaticMarkup(
      <StorageSetupBanner
        state={{ status: 'error', message: '无法确认远程存储状态。' }}
        checking={false}
        onRetry={() => undefined}
      />,
    );

    expect(html).toContain('无法确认远程存储状态。');
    expect(html).toContain('aria-label="重新检测存储状态"');
  });

  it.each([
    { status: 'ready' as const },
    { status: 'unconfigured' as const },
  ])('renders nothing for $status state', (state) => {
    const html = renderToStaticMarkup(
      <StorageSetupBanner
        state={state}
        checking={false}
        onRetry={() => undefined}
      />,
    );

    expect(html).toBe('');
  });

  it('disables retry while a new check is running', () => {
    const html = renderToStaticMarkup(
      <StorageSetupBanner
        state={{
          status: 'issue',
          missingBuckets: ['catalog-assets'],
          publicBuckets: [],
        }}
        checking
        onRetry={() => undefined}
      />,
    );

    expect(html).toContain('disabled=""');
    expect(html).toContain('animate-spin');
  });
});

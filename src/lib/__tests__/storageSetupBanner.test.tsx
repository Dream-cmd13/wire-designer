import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StorageSetupBanner } from '@/components/shared/StorageSetupBanner';

describe('StorageSetupBanner', () => {
  it('explains the impact in plain language without bucket names or deploy commands', () => {
    const html = renderToStaticMarkup(
      <StorageSetupBanner
        state={{
          status: 'issue',
          missingBuckets: ['catalog-assets'],
          publicBuckets: ['catalog-assets'],
        }}
        checking={false}
        onRetry={() => undefined}
      />,
    );

    expect(html).toContain('图片和附件功能暂时不可用');
    expect(html).toContain('请联系管理员完成系统配置');
    expect(html).not.toContain('存储桶');
    expect(html).not.toContain('catalog-assets');
    expect(html).not.toContain('npm run supabase:bootstrap-storage');
    expect(html).toContain('重新检测文件服务状态');
  });

  it('shows a safe health-check error with the retry action', () => {
    const html = renderToStaticMarkup(
      <StorageSetupBanner
        state={{ status: 'error', message: '文件服务状态暂时无法确认，请检查网络后重试；如持续出现，请联系管理员。' }}
        checking={false}
        onRetry={() => undefined}
      />,
    );

    expect(html).toContain('文件服务状态暂时无法确认');
    expect(html).not.toContain('Supabase');
    expect(html).not.toContain('SQL');
    expect(html).toContain('重新检测文件服务状态');
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

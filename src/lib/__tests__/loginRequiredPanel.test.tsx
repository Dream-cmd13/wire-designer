import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LoginRequiredHint } from '@/components/auth/LoginRequiredHint';
import { LoginRequiredPanel } from '@/components/auth/LoginRequiredPanel';

describe('login required surfaces', () => {
  it('renders the panel with default copy and a login button', () => {
    const html = renderToStaticMarkup(<LoginRequiredPanel />);

    expect(html).toContain('需要登录后使用');
    expect(html).toContain('当前功能需要登录后使用，请先登录。');
    expect(html).toContain('登录');
  });

  it('renders the inline hint with a custom message', () => {
    const html = renderToStaticMarkup(
      <LoginRequiredHint message="登录后可查看公共物料目录。" />,
    );

    expect(html).toContain('登录后可查看公共物料目录。');
    expect(html).toContain('登录');
  });
});

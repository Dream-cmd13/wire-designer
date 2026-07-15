import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getUserErrorMessage } from '@/lib/userErrorMessage';

describe('getUserErrorMessage', () => {
  it('names known missing drawing tables in Chinese', () => {
    expect(getUserErrorMessage(new Error("Could not find the table 'public.catalog_items' in the schema cache")))
      .toBe('公共资源数据表不存在或尚未初始化，请联系管理员完成数据库配置。');
    expect(getUserErrorMessage(new Error("Could not find the table 'public.drawing_icons' in the schema cache")))
      .toBe('绘图图标数据表不存在或尚未初始化，请联系管理员完成数据库配置。');
  });

  it('translates generic database, network, permission, conflict, and unknown errors', () => {
    expect(getUserErrorMessage({ message: "Could not find the table 'public.anything' in the schema cache" }))
      .toBe('所需数据表不存在或尚未初始化，请联系管理员完成数据库配置。');
    expect(getUserErrorMessage(new TypeError('Failed to fetch'))).toBe('网络连接失败，请检查网络后重试。');
    expect(getUserErrorMessage({ code: '42501', message: 'permission denied' })).toBe('没有权限执行此操作。');
    expect(getUserErrorMessage({ code: '23505', message: 'duplicate key' })).toBe('数据已存在或发生冲突，请刷新后重试。');
    expect(getUserErrorMessage(new Error('unmapped English'), '资源加载失败，请重试。')).toBe('资源加载失败，请重试。');
    expect(getUserErrorMessage(new Error('unmapped English'))).toBe('操作失败，请稍后重试。');
  });

  it('does not expose caught error messages directly from user-facing catch blocks', () => {
    const files = [
      'src/App.tsx',
      'src/components/project/ProjectList.tsx',
      'src/components/project/ImportProjectDialog.tsx',
      'src/components/drawings/PdfCropViewer.tsx',
      'src/components/drawings/standalone/DrawingResourcePanel.tsx',
      'src/components/drawings/standalone/StandaloneDrawingWizard.tsx',
      'src/pages/DrawingWorkbenchPage.tsx',
    ];
    files.forEach((file) => expect(readFileSync(file, 'utf8')).not.toMatch(/instanceof Error \? [^\n]*\.message/));
    expect(readFileSync('src/components/shared/ErrorBoundary.tsx', 'utf8')).not.toContain('{this.state.error.message}');
  });
});

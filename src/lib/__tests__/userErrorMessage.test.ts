import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getUserErrorMessage, UserFacingError } from '@/lib/userErrorMessage';

function listSourceFiles(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((entry) => entry.endsWith('.ts') || entry.endsWith('.tsx'))
    .map((entry) => `${root}/${entry.replace(/\\/g, '/')}`);
}

describe('getUserErrorMessage', () => {
  it('treats missing tables and columns as a loading problem without naming internal objects', () => {
    const missingTable = getUserErrorMessage(
      new Error("Could not find the table 'public.catalog_items' in the schema cache"),
    );
    expect(missingTable).toBe('所需数据暂时无法加载，请联系管理员处理。');
    expect(missingTable).not.toContain('catalog_items');
    expect(missingTable).not.toContain('数据表');
    expect(getUserErrorMessage(new Error('column material_prices.unit does not exist')))
      .toBe('所需数据暂时无法加载，请联系管理员处理。');
  });

  it('translates login, session, and permission failures', () => {
    expect(getUserErrorMessage(new Error('Invalid login credentials')))
      .toBe('账号或密码不正确，请重新输入。');
    expect(getUserErrorMessage({ status: 401, message: 'JWT expired' }))
      .toBe('登录已过期，请重新登录后继续。');
    expect(getUserErrorMessage({ code: '42501', message: 'permission denied' }))
      .toBe('没有权限执行此操作，请联系管理员处理。');
    expect(getUserErrorMessage({ status: 403, message: 'Forbidden' }))
      .toBe('没有权限执行此操作，请联系管理员处理。');
  });

  it('translates storage, file, and local space failures', () => {
    expect(getUserErrorMessage(new Error('Failed to download storage object')))
      .toBe('图片和附件暂时无法加载，请稍后重试；如持续出现，请联系管理员。');
    expect(getUserErrorMessage(new Error('Object not found')))
      .toBe('相关文件不存在或已被删除，请联系管理员确认。');
    const quota = Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' });
    expect(getUserErrorMessage(quota)).toBe('本地存储空间不足，未能备份最新修改，请清理空间后重试。');
    expect(getUserErrorMessage(new Error('Access is denied for this document')))
      .toBe('浏览器阻止了本机存储，未能备份最新修改，请检查浏览器隐私设置后重试。');
    expect(getUserErrorMessage(new Error('Unexpected token < in JSON at position 0')))
      .toBe('文件内容已损坏或格式不正确，无法读取。');
  });

  it('translates network, service, and conflict failures', () => {
    expect(getUserErrorMessage(new TypeError('Failed to fetch'))).toBe('网络连接失败，请检查网络后重试。');
    expect(getUserErrorMessage({ status: 503, message: 'Service Unavailable' }))
      .toBe('服务暂时不可用，请稍后重试。');
    expect(getUserErrorMessage({ code: '23505', message: 'duplicate key' }))
      .toBe('相同记录已存在，请刷新后重试。');
  });

  it('never exposes unmapped technical messages and keeps the caller fallback', () => {
    expect(getUserErrorMessage(new Error('unmapped English'), '资源加载失败，请重试。')).toBe('资源加载失败，请重试。');
    expect(getUserErrorMessage(new Error('unmapped English'))).toBe('操作失败，请稍后重试。');
    expect(getUserErrorMessage(null)).toBe('操作失败，请稍后重试。');
  });

  it('passes business validation messages through UserFacingError', () => {
    expect(getUserErrorMessage(new UserFacingError('第 3 行“测试连接器”未匹配到目录物料，请核对名称、规格和单位')))
      .toBe('第 3 行“测试连接器”未匹配到目录物料，请核对名称、规格和单位');
  });
});

describe('user-facing error handling contract', () => {
  it('does not expose caught error messages directly from user-facing catch blocks', () => {
    const files = [
      'src/App.tsx',
      'src/components/auth/AuthModal.tsx',
      'src/components/project/ProjectList.tsx',
      'src/components/project/ImportProjectDialog.tsx',
      'src/components/drawings/standalone/DrawingResourcePanel.tsx',
      'src/components/drawings/standalone/StandaloneDrawingWizard.tsx',
      'src/components/drawings/TwoDView.tsx',
      'src/components/materials/ExcelPreviewModal.tsx',
      'src/pages/DrawingWorkbenchPage.tsx',
      'src/pages/MaterialLibraryPage.tsx',
      'src/components/panels/QuotePanel.tsx',
    ];
    files.forEach((file) => expect(readFileSync(file, 'utf8')).not.toMatch(/instanceof Error \? [^\n]*\.message/));
    expect(readFileSync('src/components/shared/ErrorBoundary.tsx', 'utf8')).not.toContain('{this.state.error.message}');
    expect(readFileSync('src/components/materials/ExcelPreviewModal.tsx', 'utf8'))
      .not.toContain('error: err instanceof Error');
  });

  it('does not use browser alert or confirm popups for user feedback', () => {
    const files = listSourceFiles('src').filter((file) => !file.includes('__tests__'));
    expect(files.length).toBeGreaterThan(50);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/window\.(alert|confirm)\s*\(/);
    }
  });

  it('mounts the unified notice host at the app root', () => {
    const appSource = readFileSync('src/App.tsx', 'utf8');
    expect(appSource).toContain('<NoticeHost />');
    expect(appSource).toContain("from '@/stores/noticeStore'");
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/stores/projectStore';
import { useUserStore } from '@/stores/userStore';

// Mock sub-components to keep test light and focused on App restoration logic
vi.mock('@/components/canvas/HarnessCanvas', () => ({
  HarnessCanvas: () => <div data-testid="harness-canvas">Canvas</div>,
}));

vi.mock('@/components/drawings/TwoDView', () => ({
  TwoDView: () => <div data-testid="two-d-view">TwoDView</div>,
}));

vi.mock('@/components/project/ProjectList', () => ({
  ProjectList: () => <div data-testid="project-list">ProjectList</div>,
}));

vi.mock('@/components/project/ProjectWizard', () => ({
  ProjectWizard: () => <div>Wizard</div>,
}));

vi.mock('@/components/panels/BomPanel', () => ({
  BomModal: () => null,
}));

vi.mock('@/components/panels/QuotePanel', () => ({
  QuoteModal: () => null,
}));

vi.mock('@/components/auth/AuthModal', () => ({
  AuthModal: () => null,
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}));

import App from '@/App';

function setMockLocation(pathname: string, search = '') {
  const mockWindow = {
    location: {
      pathname,
      search,
      hash: '',
    },
    history: {
      replaceState: vi.fn(),
      pushState: vi.fn(),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(globalThis, 'window', {
    value: mockWindow,
    writable: true,
    configurable: true,
  });
}

describe('Project restoration UI state', () => {
  beforeEach(() => {
    useProjectStore.getState().resetProjects();
    useUserStore.setState({ currentUser: null, authReady: true });
    setMockLocation('/home');
  });

  it('shows "尚未打开项目" when visiting designer route without projectId and no active project', () => {
    setMockLocation('/designer/design');

    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('尚未打开项目');
    expect(html).toContain('请先从首页打开项目，再进入线束设计器。');
    expect(html).not.toContain('正在加载项目...');
  });

  it('shows "正在加载项目..." loading state when visiting designer route with projectId before project is ready', () => {
    setMockLocation('/designer/design', '?projectId=proj-123');

    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('正在加载项目...');
    expect(html).toContain('正在准备设计环境与图纸数据，请稍候。');
    expect(html).not.toContain('尚未打开项目');
    expect(html).not.toContain('请先从首页打开项目，再进入线束设计器。');
  });

  it('shows "正在加载项目..." loading state on product-image route with projectId', () => {
    setMockLocation('/designer/product-image', '?projectId=proj-456');

    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('正在加载项目...');
    expect(html).toContain('正在准备设计环境与图纸数据，请稍候。');
    expect(html).not.toContain('尚未打开项目');
  });
});

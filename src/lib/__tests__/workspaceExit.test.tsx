import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';
import { readWorkspaceDraft, removeWorkspaceDraft } from '@/lib/workspaceDraftCache';
import { projectRepository } from '@/repositories/projectRepository';
import type { Project } from '@/types/user';

const reactState = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const hooks = {
    useState: (initial: unknown) => [
      typeof initial === 'function' ? (initial as () => unknown)() : initial,
      vi.fn(),
    ],
    useEffect: (fn: () => void | (() => void)) => {
      reactState.effects.push(fn);
    },
    useRef: (initial: unknown) => ({ current: initial }),
    useCallback: (fn: unknown) => fn,
  };
  return { ...actual, ...hooks, default: { ...actual, ...hooks } };
});

vi.mock('@/stores/userStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/userStore')>();
  const hook = (selector?: (state: ReturnType<typeof actual.useUserStore.getState>) => unknown) => (
    selector ? selector(actual.useUserStore.getState()) : actual.useUserStore.getState()
  );
  return { ...actual, useUserStore: Object.assign(hook, actual.useUserStore) };
});

vi.mock('@/stores/projectStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/projectStore')>();
  const hook = (selector?: (state: ReturnType<typeof actual.useProjectStore.getState>) => unknown) => (
    selector ? selector(actual.useProjectStore.getState()) : actual.useProjectStore.getState()
  );
  return { ...actual, useProjectStore: Object.assign(hook, actual.useProjectStore) };
});

vi.mock('@/stores/harnessStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/harnessStore')>();
  const hook = (selector?: (state: ReturnType<typeof actual.useHarnessStore.getState>) => unknown) => (
    selector ? selector(actual.useHarnessStore.getState()) : actual.useHarnessStore.getState()
  );
  return { ...actual, useHarnessStore: Object.assign(hook, actual.useHarnessStore) };
});

vi.mock('@/stores/historyStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/historyStore')>();
  const hook = (selector?: (state: ReturnType<typeof actual.useHistoryStore.getState>) => unknown) => (
    selector ? selector(actual.useHistoryStore.getState()) : actual.useHistoryStore.getState()
  );
  return { ...actual, useHistoryStore: Object.assign(hook, actual.useHistoryStore) };
});

vi.mock('@/stores/drawingStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/drawingStore')>();
  const hook = (selector?: (state: ReturnType<typeof actual.useDrawingStore.getState>) => unknown) => (
    selector ? selector(actual.useDrawingStore.getState()) : actual.useDrawingStore.getState()
  );
  return { ...actual, useDrawingStore: Object.assign(hook, actual.useDrawingStore) };
});

vi.mock('@/stores/catalogStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/catalogStore')>();
  const hook = (selector?: (state: ReturnType<typeof actual.useCatalogStore.getState>) => unknown) => (
    selector ? selector(actual.useCatalogStore.getState()) : actual.useCatalogStore.getState()
  );
  return { ...actual, useCatalogStore: Object.assign(hook, actual.useCatalogStore) };
});

vi.mock('@/stores/priceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/priceStore')>();
  const hook = (selector?: (state: ReturnType<typeof actual.usePriceStore.getState>) => unknown) => (
    selector ? selector(actual.usePriceStore.getState()) : actual.usePriceStore.getState()
  );
  return { ...actual, usePriceStore: Object.assign(hook, actual.usePriceStore) };
});

vi.mock('@/lib/supabaseClient', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}));

import App from '@/App';
import { useDrawingStore } from '@/stores/drawingStore';
import { useHarnessStore } from '@/stores/harnessStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useProjectStore } from '@/stores/projectStore';
import { useUserStore } from '@/stores/userStore';

function createMockStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}

type WindowMock = {
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

let windowMock: WindowMock;

function installWindow(): WindowMock {
  const mock: WindowMock = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: { pathname: '/home', search: '', hash: '' },
      history: { replaceState: vi.fn(), pushState: vi.fn() },
      addEventListener: mock.addEventListener,
      removeEventListener: mock.removeEventListener,
    },
    writable: true,
    configurable: true,
  });
  return mock;
}

function signIn(id: string): void {
  useUserStore.setState({
    currentUser: { id, name: id, email: `${id}@test`, createdAt: 1 },
    authReady: true,
  });
}

function makeProject(id: string): Project {
  return {
    id,
    userId: 'user-a',
    name: id,
    description: '',
    createdAt: 1,
    updatedAt: 1,
  };
}

type BeforeUnloadHandler = (event: { preventDefault: () => void; returnValue: unknown }) => void;

function renderAppAndCaptureBeforeUnload(): BeforeUnloadHandler {
  reactState.effects.length = 0;
  App();
  for (const effect of reactState.effects) {
    try {
      effect();
    } catch {
      // 部分 effect 依赖真实浏览器 API，测试环境按需忽略。
    }
  }
  const calls = windowMock.addEventListener.mock.calls.filter(([type]) => type === 'beforeunload');
  const handler = calls.at(-1)?.[1] as BeforeUnloadHandler | undefined;
  expect(handler).toBeTruthy();
  return handler!;
}

describe('workspace exit protection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    Object.defineProperty(globalThis, 'localStorage', {
      value: createMockStorage(),
      writable: true,
      configurable: true,
    });
    signIn('user-a');
    useProjectStore.getState().resetProjects();
    useHistoryStore.getState().clear();
    useDrawingStore.setState({ documents: {}, activeDocumentId: null, saveState: 'saved', draftError: null });
    useHarnessStore.getState().replaceDocument(createFallbackConfig(), { markSaved: true });
    windowMock = installWindow();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not block unload or write drafts when everything is saved', () => {
    useProjectStore.getState().setCurrentProject(makeProject('p1'));
    const handler = renderAppAndCaptureBeforeUnload();

    const event = { preventDefault: vi.fn(), returnValue: undefined as unknown };
    handler(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(readWorkspaceDraft('user-a', 'project', 'p1')).toBeNull();
  });

  it('writes a project draft and blocks unload while the project is unsaved', () => {
    useProjectStore.getState().setCurrentProject(makeProject('p1'));
    useHarnessStore.getState().replaceDocument(
      { ...createFallbackConfig(), id: 'p1', name: 'p1' },
      { markSaved: false },
    );
    const emergencySave = vi.spyOn(projectRepository, 'emergencySave').mockImplementation(() => {});
    const handler = renderAppAndCaptureBeforeUnload();
    signIn('user-a');

    const event = { preventDefault: vi.fn(), returnValue: undefined as unknown };
    handler(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.returnValue).toBe('');
    const draft = readWorkspaceDraft('user-a', 'project', 'p1');
    expect(draft).not.toBeNull();
    expect((draft?.document as { id: string }).id).toBe('p1');
    expect(emergencySave).toHaveBeenCalledTimes(1);
    removeWorkspaceDraft('user-a', 'project', 'p1');
  });

  it('blocks unload while a drawing is unsaved even without an active project', () => {
    useDrawingStore.setState({ saveState: 'dirty' });
    const handler = renderAppAndCaptureBeforeUnload();

    const event = { preventDefault: vi.fn(), returnValue: undefined as unknown };
    handler(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });
});

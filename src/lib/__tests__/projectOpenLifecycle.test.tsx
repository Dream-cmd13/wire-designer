import { readFileSync } from 'node:fs';
import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';
import { readWorkspaceDraft, writeWorkspaceDraft } from '@/lib/workspaceDraftCache';
import { projectRepository, type ProjectLoadResult } from '@/repositories/projectRepository';
import type { Project } from '@/types/user';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const hooks = {
    useState: (initial: unknown) => [
      typeof initial === 'function' ? (initial as () => unknown)() : initial,
      vi.fn(),
    ],
    useEffect: vi.fn(),
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
import { useHarnessStore } from '@/stores/harnessStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useNoticeStore } from '@/stores/noticeStore';
import { useProjectStore } from '@/stores/projectStore';
import { useUserStore } from '@/stores/userStore';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise<void>((resolve) => {
  setTimeout(resolve, 0);
});

function findOpenProjectHandler(node: ReactNode): ((project: Project) => void) | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findOpenProjectHandler(child);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const props = node.props as { onOpenProject?: (project: Project) => void; children?: ReactNode };
  if (typeof props.onOpenProject === 'function') return props.onOpenProject;
  return findOpenProjectHandler(props.children);
}

function findCloseProjectHandler(node: ReactNode): (() => Promise<void>) | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findCloseProjectHandler(child);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const props = node.props as { onCloseProject?: () => Promise<void>; children?: ReactNode };
  if (typeof props.onCloseProject === 'function') return props.onCloseProject;
  return findCloseProjectHandler(props.children);
}

function installWindow(pathname = '/home'): { pushState: ReturnType<typeof vi.fn> } {
  const history = { replaceState: vi.fn(), pushState: vi.fn() };
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: { pathname, search: '', hash: '' },
      history,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      alert: vi.fn(),
    },
    writable: true,
    configurable: true,
  });
  return history;
}

function signIn(id: string | null): void {
  useUserStore.setState({
    currentUser: id ? { id, name: id, email: `${id}@test`, createdAt: 1 } : null,
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

function makeResult(id: string): ProjectLoadResult {
  return { status: 'ok', config: { ...createFallbackConfig(), id, name: id } };
}

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

describe('project open lifecycle', () => {
  let historyMock: { pushState: ReturnType<typeof vi.fn> };
  let initialConfigId: string;

  beforeEach(() => {
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
    useNoticeStore.getState().clear();
    useHarnessStore.getState().replaceDocument(createFallbackConfig(), { markSaved: true });
    initialConfigId = useHarnessStore.getState().config.id;
    historyMock = installWindow('/home');
  });

  it('lets only the newest open request update the workspace and restore state', async () => {
    const load1 = deferred<ProjectLoadResult>();
    const load2 = deferred<ProjectLoadResult>();
    vi.spyOn(projectRepository, 'load').mockImplementation((projectId) => (
      projectId === 'p1' ? load1.promise : load2.promise
    ));

    const open = findOpenProjectHandler(App());
    expect(open).toBeTruthy();
    open!(makeProject('p1'));
    open!(makeProject('p2'));

    load1.resolve(makeResult('p1'));
    await tick();

    expect(useHarnessStore.getState().config.id).toBe(initialConfigId);
    expect(useHistoryStore.getState().paused).toBe(true);

    load2.resolve(makeResult('p2'));
    await tick();

    expect(useHarnessStore.getState().config.id).toBe('p2');
    expect(useHistoryStore.getState().paused).toBe(false);
    expect(historyMock.pushState).toHaveBeenCalledTimes(1);
    expect(String(historyMock.pushState.mock.calls.at(-1)?.[2])).toContain('projectId=p2');
  });

  it('does not let a stale failed open reset the newer workspace', async () => {
    const load1 = deferred<ProjectLoadResult>();
    const load2 = deferred<ProjectLoadResult>();
    vi.spyOn(projectRepository, 'load').mockImplementation((projectId) => (
      projectId === 'p1' ? load1.promise : load2.promise
    ));

    const open = findOpenProjectHandler(App());
    open!(makeProject('p1'));
    await tick();
    open!(makeProject('p2'));

    load2.resolve(makeResult('p2'));
    await tick();
    load1.reject(new Error('network down'));
    await tick();

    expect(useHarnessStore.getState().config.id).toBe('p2');
    expect(useHistoryStore.getState().paused).toBe(false);
    expect(historyMock.pushState).toHaveBeenCalledTimes(1);
  });

  it('does not apply a project load after the account changed', async () => {
    const load1 = deferred<ProjectLoadResult>();
    vi.spyOn(projectRepository, 'load').mockReturnValue(load1.promise);

    const open = findOpenProjectHandler(App());
    open!(makeProject('p1'));
    signIn('user-b');
    load1.resolve(makeResult('p1'));
    await tick();

    expect(useHarnessStore.getState().config.id).toBe(initialConfigId);
    expect(historyMock.pushState).not.toHaveBeenCalled();
  });

  it('waits for the newest edit before closing and clearing the draft', async () => {
    useProjectStore.getState().setCurrentProject(makeProject('p1'));
    useHarnessStore.getState().replaceDocument(
      { ...createFallbackConfig(), id: 'p1', name: 'v1' },
      { markSaved: false },
    );
    const saves: number[] = [];
    const gate = deferred<void>();
    vi.spyOn(projectRepository, 'save').mockImplementation(async (_id, config) => {
      saves.push(config.updatedAt);
      if (saves.length === 1) await gate.promise;
    });

    const close = findCloseProjectHandler(App());
    expect(close).toBeTruthy();
    const closePromise = close!();
    await tick();
    expect(saves).toHaveLength(1);

    useHarnessStore.getState().setConfig({ name: 'v2' });
    const latestConfig = useHarnessStore.getState().config;
    writeWorkspaceDraft({
      ownerId: 'user-a',
      kind: 'project',
      documentId: 'p1',
      revision: latestConfig.updatedAt,
      baseUpdatedAt: 1,
      document: latestConfig,
    });

    gate.resolve();
    await closePromise;
    await tick();

    expect(saves).toHaveLength(2);
    expect(saves[1]).toBe(latestConfig.updatedAt);
    expect(readWorkspaceDraft('user-a', 'project', 'p1')).toBeNull();
    expect(useProjectStore.getState().currentProject).toBeNull();
  });

  it('resets the workspace before starting the project list load', () => {
    const source = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
    const resetEffectIndex = source.search(/resetWorkspaceForUser\(\s*keepRequestedRoute/);
    const loadEffectIndex = source.indexOf('void loadProjects(currentUserId)');

    expect(resetEffectIndex).toBeGreaterThan(-1);
    expect(loadEffectIndex).toBeGreaterThan(-1);
    expect(resetEffectIndex).toBeLessThan(loadEffectIndex);
  });

  it('does not let a pending close of the previous project close a newly opened project', async () => {
    useProjectStore.getState().setCurrentProject(makeProject('p1'));
    useHarnessStore.getState().replaceDocument(
      { ...createFallbackConfig(), id: 'p1', name: 'p1' },
      { markSaved: false },
    );
    const gate = deferred<void>();
    const saveSpy = vi.spyOn(projectRepository, 'save').mockImplementation(async () => {
      await gate.promise;
    });
    vi.spyOn(projectRepository, 'load').mockResolvedValue(makeResult('p2'));

    const tree = App();
    const close = findCloseProjectHandler(tree);
    const open = findOpenProjectHandler(tree);
    expect(close).toBeTruthy();
    expect(open).toBeTruthy();

    const closePromise = close!();
    await tick();
    expect(saveSpy).toHaveBeenCalledTimes(1);

    open!(makeProject('p2'));
    await tick();
    gate.resolve();
    await closePromise;
    await tick();

    expect(useProjectStore.getState().currentProject?.id).toBe('p2');
    expect(useHarnessStore.getState().config.id).toBe('p2');
  });

  it('persists the previous project edit before opening the next project', async () => {
    useProjectStore.getState().setCurrentProject(makeProject('p1'));
    useHarnessStore.getState().replaceDocument(
      { ...createFallbackConfig(), id: 'p1', name: 'p1' },
      { markSaved: false },
    );
    const failureGate = deferred<void>();
    const saveSpy = vi.spyOn(projectRepository, 'save').mockImplementation(async () => {
      if (saveSpy.mock.calls.length === 1) await failureGate.promise;
    });
    vi.spyOn(projectRepository, 'load').mockResolvedValue(makeResult('p2'));

    const tree = App();
    const close = findCloseProjectHandler(tree);
    const open = findOpenProjectHandler(tree);
    expect(close).toBeTruthy();
    expect(open).toBeTruthy();

    const closePromise = close!();
    await tick();
    expect(saveSpy).toHaveBeenCalledTimes(1);

    open!(makeProject('p2'));
    await tick();
    useHarnessStore.getState().setConfig({ name: 'p2-edit' });

    failureGate.reject(new Error('network down'));
    await closePromise;
    await tick();

    expect(saveSpy).toHaveBeenCalledTimes(2);
    expect(saveSpy.mock.calls[1]?.[1].name).toBe('p2-edit');
    expect(useHarnessStore.getState().saveState.status).toBe('saved');
    expect(useProjectStore.getState().currentProject?.id).toBe('p2');
    expect(useHarnessStore.getState().config.id).toBe('p2');
  });

  it('reopens the same project only after its pending edit is fully saved', async () => {
    useProjectStore.getState().setCurrentProject(makeProject('p1'));
    useHarnessStore.getState().replaceDocument(
      { ...createFallbackConfig(), id: 'p1', name: 'p1' },
      { markSaved: false },
    );
    const failureGate = deferred<void>();
    const saveSpy = vi.spyOn(projectRepository, 'save').mockImplementation(async () => {
      if (saveSpy.mock.calls.length === 1) await failureGate.promise;
    });
    const loadSpy = vi.spyOn(projectRepository, 'load')
      .mockImplementation(async (projectId) => makeResult(projectId));

    const tree = App();
    const close = findCloseProjectHandler(tree);
    const open = findOpenProjectHandler(tree);
    expect(close).toBeTruthy();
    expect(open).toBeTruthy();

    const closePromise = close!();
    await tick();
    expect(saveSpy).toHaveBeenCalledTimes(1);

    open!(makeProject('p2'));
    await tick();
    open!(makeProject('p1'));
    await tick();
    useHarnessStore.getState().setConfig({ name: 'p1-edit' });

    failureGate.reject(new Error('network down'));
    await closePromise;
    await tick();

    expect(saveSpy).toHaveBeenCalledTimes(2);
    expect(saveSpy.mock.calls[1]?.[1].name).toBe('p1-edit');
    expect(loadSpy.mock.calls.map(([id]) => id)).toEqual(['p1']);
    expect(useHarnessStore.getState().saveState.status).toBe('saved');
    expect(useProjectStore.getState().currentProject?.id).toBe('p1');
    expect(useHarnessStore.getState().config.id).toBe('p1');
    expect(readWorkspaceDraft('user-a', 'project', 'p1')).toBeNull();
  });

  it('saves and backs up the current project before opening another one', async () => {
    useProjectStore.getState().setCurrentProject(makeProject('p1'));
    useHarnessStore.getState().replaceDocument(
      { ...createFallbackConfig(), id: 'p1', name: '待保存修改' },
      { markSaved: false },
    );
    const savedNames: string[] = [];
    vi.spyOn(projectRepository, 'save').mockImplementation(async (_id, config) => {
      savedNames.push(config.name);
    });
    vi.spyOn(projectRepository, 'load').mockImplementation(async (projectId) => makeResult(projectId));

    const open = findOpenProjectHandler(App());
    open!(makeProject('p2'));
    await tick();
    await tick();

    expect(savedNames).toEqual(['待保存修改']);
    expect(useProjectStore.getState().currentProject?.id).toBe('p2');
    expect(useHarnessStore.getState().config.id).toBe('p2');
    expect(readWorkspaceDraft('user-a', 'project', 'p1')).toBeNull();
  });

  it('keeps the current workspace and draft when the pre-switch save fails', async () => {
    useProjectStore.getState().setCurrentProject(makeProject('p1'));
    useHarnessStore.getState().replaceDocument(
      { ...createFallbackConfig(), id: 'p1', name: '待保存修改' },
      { markSaved: false },
    );
    vi.spyOn(projectRepository, 'save').mockRejectedValue(new Error('network down'));
    const load = vi.spyOn(projectRepository, 'load')
      .mockImplementation(async (projectId) => makeResult(projectId));

    const open = findOpenProjectHandler(App());
    open!(makeProject('p2'));
    await tick();
    await tick();

    expect(load).not.toHaveBeenCalled();
    expect(useProjectStore.getState().currentProject?.id).toBe('p1');
    expect(useHarnessStore.getState().config.id).toBe('p1');
    expect(useHarnessStore.getState().saveState.status).toBe('error');
    const notices = useNoticeStore.getState().notices;
    expect(notices).toHaveLength(1);
    expect(notices[0]?.tone).toBe('danger');
    expect(notices[0]?.message).toContain('已取消切换');
    expect(notices[0]?.action?.label).toBe('重试保存');
    expect(readWorkspaceDraft('user-a', 'project', 'p1')).not.toBeNull();
  });

  it('keeps an undecided local draft when closing an already saved project', async () => {
    useProjectStore.getState().setCurrentProject(makeProject('p1'));
    const cloudConfig = { ...createFallbackConfig(), id: 'p1', name: 'p1' };
    useHarnessStore.getState().replaceDocument(cloudConfig, { markSaved: true });
    const draftConfig = { ...cloudConfig, name: '本地草稿', updatedAt: cloudConfig.updatedAt - 1000 };
    writeWorkspaceDraft({
      ownerId: 'user-a',
      kind: 'project',
      documentId: 'p1',
      revision: draftConfig.updatedAt,
      baseUpdatedAt: 1,
      document: draftConfig,
    });

    const close = findCloseProjectHandler(App());
    await close!();

    expect(readWorkspaceDraft('user-a', 'project', 'p1')).not.toBeNull();
    expect(useProjectStore.getState().currentProject).toBeNull();
  });
});

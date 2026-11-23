// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';
import { readWorkspaceDraft, writeWorkspaceDraft } from '@/lib/workspaceDraftCache';
import { projectRepository, type ProjectLoadResult } from '@/repositories/projectRepository';
import type { Project } from '@/types/user';

vi.mock('@/components/layout/MainLayout', () => ({ MainLayout: () => <div>工作区</div> }));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}));

import App from '@/App';
import { NoticeHost } from '@/components/shared/NoticeHost';
import { useCatalogStore } from '@/stores/catalogStore';
import { useHarnessStore } from '@/stores/harnessStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useNoticeStore } from '@/stores/noticeStore';
import { usePriceStore } from '@/stores/priceStore';
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

const tick = () => act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });

async function openCard(id: string) {
  const card = await screen.findByRole('article', { name: id });
  fireEvent.click(within(card).getByRole('button', { name: /^打开$/ }));
}

function mountInEditor() {
  window.history.replaceState(null, '', '/designer/design?projectId=p1');
  render(<App />);
}

function closeProject() {
  fireEvent.click(screen.getByRole('button', { name: /^关闭项目$/ }));
}

function goToList() {
  fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: /^线束设计器$/ }));
}

function signIn(id: string | null): void {
  useUserStore.setState({
    currentUser: id ? { id, name: id, email: `${id}@test`, createdAt: 1, role: 'engineer' } : null,
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

let loadVersionCounter = 0;

function makeResult(id: string): Extract<ProjectLoadResult, { status: 'ok' }> {
  loadVersionCounter += 1;
  return {
    status: 'ok',
    config: { ...createFallbackConfig(), id, name: id },
    version: { revision: loadVersionCounter, updatedAt: `load-${loadVersionCounter}` },
  };
}

describe('project open lifecycle', () => {
  let initialConfigId: string;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.clear();
    window.history.replaceState(null, '', '/designer');
    vi.spyOn(projectRepository, 'listProjects').mockImplementation(async (id) => id === 'user-a' ? [makeProject('p1'), makeProject('p2')] : []);
    vi.spyOn(useCatalogStore.getState(), 'initialize').mockResolvedValue(undefined);
    vi.spyOn(useCatalogStore.getState(), 'refreshIfStale').mockResolvedValue(undefined);
    vi.spyOn(usePriceStore.getState(), 'load').mockResolvedValue(undefined);
    signIn('user-a');
    useProjectStore.getState().resetProjects();
    useHistoryStore.getState().clear();
    useNoticeStore.getState().clear();
    useHarnessStore.getState().replaceDocument(createFallbackConfig(), { markSaved: true });
    initialConfigId = useHarnessStore.getState().config.id;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lets only the newest open request update the workspace and restore state', async () => {
    const load1 = deferred<ProjectLoadResult>();
    const load2 = deferred<ProjectLoadResult>();
    vi.spyOn(projectRepository, 'load').mockImplementation((projectId) => (
      projectId === 'p1' ? load1.promise : load2.promise
    ));

    render(<App />);
    await openCard('p1');
    await tick();
    await openCard('p2');

    load1.resolve(makeResult('p1'));
    await tick();

    expect(useHarnessStore.getState().config.id).toBe(initialConfigId);
    expect(useProjectStore.getState().currentProject).toBeNull();
    expect(useHistoryStore.getState().paused).toBe(false);

    load2.resolve(makeResult('p2'));
    await tick();

    expect(useHarnessStore.getState().config.id).toBe('p2');
    expect(useHistoryStore.getState().paused).toBe(false);
    expect(window.location.pathname + window.location.search).toBe('/designer/design?projectId=p2');
  });

  it('does not let a stale failed open reset the newer workspace', async () => {
    const load1 = deferred<ProjectLoadResult>();
    const load2 = deferred<ProjectLoadResult>();
    vi.spyOn(projectRepository, 'load').mockImplementation((projectId) => (
      projectId === 'p1' ? load1.promise : load2.promise
    ));

    render(<App />);
    await openCard('p1');
    await tick();
    await openCard('p2');

    load2.resolve(makeResult('p2'));
    await tick();
    load1.reject(new Error('network down'));
    await tick();

    expect(useHarnessStore.getState().config.id).toBe('p2');
    expect(useHistoryStore.getState().paused).toBe(false);
    expect(window.location.pathname + window.location.search).toBe('/designer/design?projectId=p2');
  });

  it('preserves the active project and undo history when a new project fails to load', async () => {
    const active = makeProject('p1');
    useProjectStore.getState().setCurrentProject(active);
    const config = makeResult('p1');
    useHarnessStore.getState().replaceDocument(config.config, { markSaved: true });
    useHistoryStore.getState().pushState({ ...config.config, name: '先前版本' });
    const history = useHistoryStore.getState().past;
    const load = vi.spyOn(projectRepository, 'load').mockRejectedValue(new Error('network down'));
    render(<><App /><NoticeHost /></>);
    await openCard('p2');
    await screen.findByText('打开项目失败');
    expect(useProjectStore.getState().currentProject).toBe(active);
    expect(useHistoryStore.getState().past).toBe(history);
    const sidebar = within(screen.getByRole('navigation'));
    fireEvent.click(sidebar.getByRole('button', { name: /^设计图$/ }));
    expect(window.location.pathname + window.location.search).toBe('/designer/design?projectId=p1');
    expect(load).toHaveBeenCalledExactlyOnceWith('p2');
  });

  it('keeps the active design and its save version in sync after renaming from the list', async () => {
    useProjectStore.getState().setCurrentProject(makeProject('p1'));
    const loaded = makeResult('p1');
    useProjectStore.getState().setCurrentProjectVersion(loaded.version);
    useHarnessStore.getState().replaceDocument(loaded.config, { markSaved: true });
    const version = { revision: loaded.version.revision + 1, updatedAt: 'rename-1' };
    const save = vi.spyOn(projectRepository, 'save').mockResolvedValue(version);
    const update = vi.spyOn(projectRepository, 'updateProject');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '重命名项目 p1' }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '改名后的活动项目' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByRole('article', { name: '改名后的活动项目' });
    expect(save).toHaveBeenCalledExactlyOnceWith('p1', expect.objectContaining({ name: '改名后的活动项目' }), loaded.version);
    expect(update).not.toHaveBeenCalled();
    expect(useProjectStore.getState().currentProjectVersion).toEqual(version);
    expect(useHarnessStore.getState().config.name).toBe('改名后的活动项目');
    fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: /^设计图$/ }));
    expect(screen.getByPlaceholderText('未命名项目')).toHaveProperty('value', '改名后的活动项目');
  });

  it('does not apply a project load after the account changed', async () => {
    const load1 = deferred<ProjectLoadResult>();
    const load = vi.spyOn(projectRepository, 'load').mockReturnValue(load1.promise);

    render(<App />);
    await openCard('p1');
    await tick();
    expect(load).toHaveBeenCalledWith('p1');
    act(() => signIn('user-b'));
    const resetConfig = useHarnessStore.getState().config;
    load1.resolve(makeResult('p1'));
    await tick();

    expect(useHarnessStore.getState().config).toBe(resetConfig);
    expect(window.location.pathname + window.location.search).toBe('/designer');
    expect(screen.queryByRole('article', { name: 'p1' })).toBeNull();
  });

  it('finishes a deep-link restore when the same account becomes an admin', async () => {
    const pending = deferred<ProjectLoadResult>();
    const load = vi.spyOn(projectRepository, 'load').mockReturnValue(pending.promise);
    mountInEditor();
    await tick();
    expect(load).toHaveBeenCalledExactlyOnceWith('p1');
    act(() => useUserStore.setState((state) => ({ currentUser: { ...state.currentUser!, role: 'admin' } })));
    pending.resolve(makeResult('p1'));
    await tick();
    expect(screen.getByPlaceholderText('未命名项目')).toHaveProperty('value', 'p1');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('restarts a pending deep link when history jumps to another entry with the same URL', async () => {
    const pending = deferred<ProjectLoadResult>();
    const load = vi.spyOn(projectRepository, 'load').mockReturnValueOnce(pending.promise).mockResolvedValueOnce(makeResult('p1'));
    mountInEditor();
    await tick();
    expect(load).toHaveBeenCalledExactlyOnceWith('p1');
    fireEvent.popState(window);
    await tick();
    expect(screen.getByPlaceholderText('未命名项目')).toHaveProperty('value', 'p1');
    pending.resolve(makeResult('p2'));
    await tick();
    expect(useHarnessStore.getState().config.id).toBe('p1');
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
      return { revision: saves.length, updatedAt: `save-${saves.length}` };
    });

    mountInEditor();
    closeProject();
    await tick();
    expect(saves).toHaveLength(1);

    act(() => useHarnessStore.getState().setConfig({ name: 'v2' }));
    const latestConfig = useHarnessStore.getState().config;
    writeWorkspaceDraft({
      ownerId: 'user-a',
      kind: 'project',
      documentId: 'p1',
      localRevision: useHarnessStore.getState().localRevision,
      baseServerRevision: null,
      document: latestConfig,
    });

    gate.resolve();
    await tick();

    expect(saves).toHaveLength(2);
    expect(saves[1]).toBe(latestConfig.updatedAt);
    expect(readWorkspaceDraft('user-a', 'project', 'p1')).toBeNull();
    expect(useProjectStore.getState().currentProject).toBeNull();
  });

  it('resets the workspace before loading the new account project list', async () => {
    useProjectStore.getState().setCurrentProject(makeProject('p1'));
    mountInEditor();
    await tick();
    const nextProject = { ...makeProject('p2'), userId: 'user-b' };
    vi.mocked(projectRepository.listProjects).mockImplementationOnce(async (id) => {
      expect(id).toBe('user-b');
      expect(useProjectStore.getState().currentProject).toBeNull();
      return [nextProject];
    });
    act(() => signIn('user-b'));
    await screen.findByRole('article', { name: 'p2' });
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
      return { revision: 1, updatedAt: 'save-1' };
    });
    vi.spyOn(projectRepository, 'load').mockResolvedValue(makeResult('p2'));

    mountInEditor();
    closeProject();
    await tick();
    expect(saveSpy).toHaveBeenCalledTimes(1);

    goToList();
    await openCard('p2');
    await tick();
    gate.resolve();
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
      return { revision: saveSpy.mock.calls.length, updatedAt: `save-${saveSpy.mock.calls.length}` };
    });
    vi.spyOn(projectRepository, 'load').mockResolvedValue(makeResult('p2'));

    mountInEditor();
    closeProject();
    await tick();
    expect(saveSpy).toHaveBeenCalledTimes(1);

    goToList();
    await openCard('p2');
    await tick();
    act(() => useHarnessStore.getState().setConfig({ name: 'p2-edit' }));

    failureGate.reject(new Error('network down'));
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
      return { revision: saveSpy.mock.calls.length, updatedAt: `save-${saveSpy.mock.calls.length}` };
    });
    const loadSpy = vi.spyOn(projectRepository, 'load')
      .mockImplementation(async (projectId) => makeResult(projectId));

    mountInEditor();
    closeProject();
    await tick();
    expect(saveSpy).toHaveBeenCalledTimes(1);

    goToList();
    await openCard('p2');
    await tick();
    await openCard('p1');
    await tick();
    act(() => useHarnessStore.getState().setConfig({ name: 'p1-edit' }));

    failureGate.reject(new Error('network down'));
    await tick();

    expect(saveSpy).toHaveBeenCalledTimes(2);
    expect(saveSpy.mock.calls[1]?.[1].name).toBe('p1-edit');
    expect(loadSpy).not.toHaveBeenCalled();
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
      return { revision: savedNames.length, updatedAt: `save-${savedNames.length}` };
    });
    vi.spyOn(projectRepository, 'load').mockImplementation(async (projectId) => makeResult(projectId));

    render(<App />);
    await openCard('p2');
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

    render(<App />);
    await openCard('p2');
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
    fireEvent.click(screen.getByRole('button', { name: '新建项目' }));
    await tick();
    expect(screen.queryByRole('heading', { name: '新建项目向导' })).toBeNull();
    const sidebar = within(screen.getByRole('navigation'));
    fireEvent.click(sidebar.getByRole('button', { name: /^设计图$/ }));
    expect(window.location.pathname + window.location.search).toBe('/designer/design?projectId=p1');
    closeProject();
    await tick();
    expect(useProjectStore.getState().currentProject?.id).toBe('p1');
    expect(window.location.pathname + window.location.search).toBe('/designer/design?projectId=p1');
  });

  it('allows recovery of invalid project data without saving a blank replacement', async () => {
    vi.spyOn(projectRepository, 'load').mockResolvedValue({
      status: 'invalid', raw: '{"damaged":true}', backupKey: 'test-p1', issues: ['invalid structure'],
      version: { revision: 1, updatedAt: 'cloud-1' },
    });
    const save = vi.spyOn(projectRepository, 'save');
    render(<App />);
    await openCard('p1');
    await screen.findByRole('button', { name: '下载原始副本' });
    goToList();
    const sidebar = within(screen.getByRole('navigation'));
    fireEvent.click(sidebar.getByRole('button', { name: /^设计图$/ }));
    expect(screen.getByRole('button', { name: '下载原始副本' })).toBeTruthy();
    closeProject();
    expect(useProjectStore.getState().currentProject).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('only offers draft recovery in the active editor, including after returning from the list', async () => {
    const cloud = makeResult('p1');
    writeWorkspaceDraft({ ownerId: 'user-a', kind: 'project', documentId: 'p1', localRevision: 1,
      baseServerRevision: 1, document: { ...cloud.config, name: '本地草稿' } });
    vi.spyOn(projectRepository, 'load').mockResolvedValue(cloud);
    render(<App />);
    await openCard('p1');
    await screen.findByRole('button', { name: '恢复本地草稿' });
    goToList();
    expect(screen.queryByRole('button', { name: '恢复本地草稿' })).toBeNull();
    const sidebar = within(screen.getByRole('navigation'));
    fireEvent.click(sidebar.getByRole('button', { name: /^设计图$/ }));
    expect(screen.getByRole('button', { name: '恢复本地草稿' })).toBeTruthy();
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
      localRevision: 1,
      baseServerRevision: null,
      document: draftConfig,
    });

    mountInEditor();
    closeProject();
    await tick();

    expect(readWorkspaceDraft('user-a', 'project', 'p1')).not.toBeNull();
    expect(useProjectStore.getState().currentProject).toBeNull();
  });
});

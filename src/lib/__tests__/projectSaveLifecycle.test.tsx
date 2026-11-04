// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSnapshot } from '@/types/catalog';
import type { DocumentVersion } from '@/types/document';
import type { Project } from '@/types/user';

vi.mock('@/components/layout/AdminShell', () => ({
  AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/layout/MainLayout', () => ({
  MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/canvas/HarnessCanvas', () => ({
  HarnessCanvas: () => <div data-testid="canvas" />,
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}));

import App from '@/App';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';
import { setCatalogSnapshot } from '@/lib/catalogRuntime';
import { DocumentWriteError } from '@/lib/documentWriteError';
import { writeWorkspaceDraft } from '@/lib/workspaceDraftCache';
import { projectRepository } from '@/repositories/projectRepository';
import { useCatalogStore } from '@/stores/catalogStore';
import { useHarnessStore } from '@/stores/harnessStore';
import { useHistoryStore } from '@/stores/historyStore';
import { usePriceStore } from '@/stores/priceStore';
import { useProjectStore } from '@/stores/projectStore';
import { useUserStore } from '@/stores/userStore';

function makeSnapshot(loadedAt: number): CatalogSnapshot {
  return {
    connectors: [],
    wires: [],
    wireColors: [],
    overmolds: [],
    leadTimeOptions: [],
    protectionOptions: [],
    pricingRules: [],
    quantityDiscountRules: [],
    loadedAt,
  };
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
});

describe('project save lifecycle (real React + real stores)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/designer/design?projectId=p1');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(useCatalogStore.getState(), 'initialize').mockResolvedValue(undefined);
    vi.spyOn(useCatalogStore.getState(), 'refreshIfStale').mockResolvedValue(undefined);
    vi.spyOn(usePriceStore.getState(), 'load').mockResolvedValue(undefined);
    vi.spyOn(projectRepository, 'listProjects').mockResolvedValue([makeProject('p1')]);

    useUserStore.setState({
      currentUser: { id: 'user-a', name: 'user-a', email: 'a@test', createdAt: 1, role: 'engineer' },
      authReady: true,
    });
    useProjectStore.getState().resetProjects();
    useProjectStore.getState().setCurrentProject(makeProject('p1'));
    useHistoryStore.getState().clear();
    useHarnessStore.getState().replaceDocument(
      { ...createFallbackConfig(), id: 'p1', name: 'p1' },
      { markSaved: true },
    );
    const snapshot = makeSnapshot(1);
    setCatalogSnapshot(snapshot);
    useCatalogStore.setState({ snapshot, status: 'ready', refreshing: false, error: null });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps selection and viewports when the document becomes dirty', async () => {
    render(<App />);
    await waitFor(() => expect(useCatalogStore.getState().status).toBe('ready'));

    act(() => {
      useHarnessStore.getState().setSelection({ kind: 'connector', id: 'c1' });
      useHarnessStore.getState().setCanvasViewport({ x: 10, y: 20, zoom: 1.5 });
      useHarnessStore.getState().setTwoDViewport({ zoom: 2, pan: { x: 1, y: 2 } });
    });

    act(() => {
      useHarnessStore.getState().setConfig({ name: '改名' });
    });
    await flush();

    const state = useHarnessStore.getState();
    expect(state.config.name).toBe('改名');
    expect(state.selection).toEqual({ kind: 'connector', id: 'c1' });
    expect(state.canvasViewport).toEqual({ x: 10, y: 20, zoom: 1.5 });
    expect(state.twoDViewport).toEqual({ zoom: 2, pan: { x: 1, y: 2 } });
  });

  it('applies a catalog snapshot refresh without rewriting or resetting the document', async () => {
    render(<App />);
    await waitFor(() => expect(useCatalogStore.getState().status).toBe('ready'));

    act(() => {
      useHarnessStore.getState().setSelection({ kind: 'connector', id: 'c1' });
      useHarnessStore.getState().setCanvasViewport({ x: 10, y: 20, zoom: 1.5 });
    });

    const configBefore = useHarnessStore.getState().config;
    const historyBefore = useHistoryStore.getState().past;

    act(() => {
      const next = makeSnapshot(2);
      setCatalogSnapshot(next);
      useCatalogStore.setState({ snapshot: next, status: 'ready' });
    });
    await flush();

    const state = useHarnessStore.getState();
    expect(state.config).toBe(configBefore);
    expect(state.selection).toEqual({ kind: 'connector', id: 'c1' });
    expect(state.canvasViewport).toEqual({ x: 10, y: 20, zoom: 1.5 });
    expect(state.saveState.status).toBe('saved');
    expect(useHistoryStore.getState().past).toBe(historyBefore);
  });

  it('keeps a pending save in the saving state while the catalog refreshes', async () => {
    const gate = deferred<DocumentVersion>();
    vi.spyOn(projectRepository, 'save').mockReturnValue(gate.promise);
    render(<App />);
    await flush();

    act(() => {
      useHarnessStore.getState().setSelection({ kind: 'material', id: 'm1' });
      useHarnessStore.getState().setCanvasViewport({ x: 1, y: 2, zoom: 1 });
      useHarnessStore.getState().setConfig({ name: '修改中' });
    });
    await waitFor(
      () => expect(useHarnessStore.getState().saveState.status).toBe('saving'),
      { timeout: 4000 },
    );

    act(() => {
      const next = makeSnapshot(3);
      setCatalogSnapshot(next);
      useCatalogStore.setState({ snapshot: next, status: 'ready' });
    });
    await flush();

    expect(useHarnessStore.getState().saveState.status).toBe('saving');
    expect(useHarnessStore.getState().selection).toEqual({ kind: 'material', id: 'm1' });
    expect(useHarnessStore.getState().canvasViewport).toEqual({ x: 1, y: 2, zoom: 1 });

    await act(async () => {
      gate.resolve({ revision: 1, updatedAt: 'save-gate' });
      await gate.promise;
    });
    await waitFor(
      () => expect(useHarnessStore.getState().saveState.status).toBe('saved'),
      { timeout: 4000 },
    );
  });

  it('keeps a save failure visible and does not auto-retry in a loop', async () => {
    const saveSpy = vi.spyOn(projectRepository, 'save').mockRejectedValue(new Error('network down'));
    render(<App />);
    await flush();

    act(() => {
      useHarnessStore.getState().setConfig({ name: '会失败' });
    });
    await waitFor(
      () => expect(useHarnessStore.getState().saveState.status).toBe('error'),
      { timeout: 4000 },
    );
    expect(useHarnessStore.getState().saveState).toMatchObject({
      message: expect.stringContaining('网络连接失败'),
    });

    act(() => {
      const next = makeSnapshot(4);
      setCatalogSnapshot(next);
      useCatalogStore.setState({ snapshot: next, status: 'ready' });
    });
    await new Promise((resolve) => setTimeout(resolve, 2600));

    expect(useHarnessStore.getState().saveState.status).toBe('error');
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps an edit made within the same millisecond during a save and persists it afterwards', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const gate = deferred<DocumentVersion>();
    const savedNames: string[] = [];
    const saveSpy = vi.spyOn(projectRepository, 'save').mockImplementation(async (_id, config) => {
      savedNames.push(config.name);
      if (savedNames.length === 1) await gate.promise;
      return { revision: savedNames.length, updatedAt: `save-${savedNames.length}` };
    });
    render(<App />);
    await flush();

    act(() => {
      useHarnessStore.getState().setConfig({ name: '第一版' });
    });
    await new Promise((resolve) => setTimeout(resolve, 2300));
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(useHarnessStore.getState().saveState.status).toBe('saving');

    act(() => {
      useHarnessStore.getState().setConfig({ name: '第二版' });
    });

    nowSpy.mockRestore();
    await act(async () => {
      gate.resolve({ revision: 1, updatedAt: 'save-gate' });
      await gate.promise;
    });
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(2), { timeout: 4000 });
    await waitFor(
      () => expect(useHarnessStore.getState().saveState.status).toBe('saved'),
      { timeout: 4000 },
    );

    expect(savedNames).toEqual(['第一版', '第二版']);
    expect(useHarnessStore.getState().config.name).toBe('第二版');
  });

  it('continues saving after a failure when the user edits again', async () => {
    const saveSpy = vi.spyOn(projectRepository, 'save').mockImplementation(async (_id, config) => {
      if (config.name === '第一次') throw new Error('network down');
      return { revision: 1, updatedAt: 'save-1' };
    });
    render(<App />);
    await flush();

    act(() => {
      useHarnessStore.getState().setConfig({ name: '第一次' });
    });
    await waitFor(
      () => expect(useHarnessStore.getState().saveState.status).toBe('error'),
      { timeout: 4000 },
    );

    act(() => {
      useHarnessStore.getState().setConfig({ name: '第二次' });
    });
    await waitFor(
      () => expect(useHarnessStore.getState().saveState.status).toBe('saved'),
      { timeout: 4000 },
    );

    expect(saveSpy.mock.calls.length).toBe(2);
  });

  it('pauses autosave, keeps local content and offers recovery on a version conflict', async () => {
    const conflict = new DocumentWriteError('conflict', '云端已有更新的版本，本次保存未覆盖本地内容。请选择恢复方式。');
    const saveSpy = vi.spyOn(projectRepository, 'save').mockRejectedValue(conflict);
    render(<App />);
    await flush();

    act(() => {
      useHarnessStore.getState().setConfig({ name: '本地修改' });
    });
    await waitFor(
      () => expect(useHarnessStore.getState().saveState.status).toBe('error'),
      { timeout: 4000 },
    );

    // 暂停自动保存：冲突后不做无条件覆盖或自动重试
    await new Promise((resolve) => setTimeout(resolve, 2600));
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(useHarnessStore.getState().config.name).toBe('本地修改');

    expect(screen.getByText('保存冲突')).toBeTruthy();
    expect(screen.getByText('下载本地副本')).toBeTruthy();
    expect(screen.getByText('读取云端版本')).toBeTruthy();
    expect(screen.getByText('另存为新文档')).toBeTruthy();
  });

  it('replaces local content with the cloud version only after explicit confirmation', async () => {
    const conflict = new DocumentWriteError('conflict', '云端已有更新的版本，本次保存未覆盖本地内容。请选择恢复方式。');
    vi.spyOn(projectRepository, 'save').mockRejectedValue(conflict);
    const loadSpy = vi.spyOn(projectRepository, 'load').mockResolvedValue({
      status: 'ok',
      config: { ...createFallbackConfig(), id: 'p1', name: '云端版本' },
      version: { revision: 5, updatedAt: 'cloud-5' },
    });
    render(<App />);
    await flush();

    act(() => {
      useHarnessStore.getState().setConfig({ name: '本地修改' });
    });
    await waitFor(
      () => expect(useHarnessStore.getState().saveState.status).toBe('error'),
      { timeout: 4000 },
    );

    fireEvent.click(screen.getByText('读取云端版本'));
    await flush();
    expect(loadSpy).not.toHaveBeenCalled();
    expect(screen.getByText('读取云端版本会替换本地内容')).toBeTruthy();

    fireEvent.click(screen.getByText('确定读取云端'));
    await waitFor(
      () => expect(useHarnessStore.getState().config.name).toBe('云端版本'),
      { timeout: 4000 },
    );
    expect(loadSpy).toHaveBeenCalledWith('p1');
    expect(useProjectStore.getState().currentProjectVersion).toEqual({ revision: 5, updatedAt: 'cloud-5' });
    expect(screen.queryByText('保存冲突')).toBeNull();
  });

  it('restores a draft with its original base revision so a newer cloud version is not silently overwritten', async () => {
    localStorage.clear();
    useProjectStore.getState().resetProjects();
    writeWorkspaceDraft({
      ownerId: 'user-a',
      kind: 'project',
      documentId: 'p1',
      localRevision: 5,
      baseServerRevision: 1,
      document: { ...createFallbackConfig(), id: 'p1', name: '本地草稿' },
    });
    vi.spyOn(projectRepository, 'load').mockResolvedValue({
      status: 'ok',
      config: { ...createFallbackConfig(), id: 'p1', name: 'p1' },
      version: { revision: 2, updatedAt: 'cloud-2' },
    });
    const saveSpy = vi.spyOn(projectRepository, 'save').mockImplementation(async (_id, _config, expected) => {
      if (expected?.revision !== 2) {
        throw new DocumentWriteError('conflict', '云端已有更新的版本，本次保存未覆盖本地内容。请选择恢复方式。');
      }
      return { revision: 3, updatedAt: 'save-3' };
    });

    render(<App />);
    await waitFor(() => expect(screen.getByText('恢复本地草稿')).toBeTruthy(), { timeout: 5000 });
    fireEvent.click(screen.getByText('恢复本地草稿'));
    await flush();

    expect(useHarnessStore.getState().config.name).toBe('本地草稿');
    // 恢复草稿后必须回到草稿的原始基线，而不是沿用云端最新版本
    expect(useProjectStore.getState().currentProjectVersion).toEqual({ revision: 1, updatedAt: 'cloud-2' });

    await waitFor(
      () => expect(useHarnessStore.getState().saveState.status).toBe('error'),
      { timeout: 5000 },
    );
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.mock.calls[0]?.[2]).toEqual({ revision: 1, updatedAt: 'cloud-2' });
    expect(screen.getByText('保存冲突')).toBeTruthy();
    expect(useHarnessStore.getState().config.name).toBe('本地草稿');
  });

  it('treats a legacy draft without a confirmable baseline as a manual conflict', async () => {
    localStorage.clear();
    useProjectStore.getState().resetProjects();
    localStorage.setItem('wh_draft_v1:user-a:project:p1', JSON.stringify({
      version: 1,
      ownerId: 'user-a',
      kind: 'project',
      documentId: 'p1',
      revision: 5,
      baseUpdatedAt: 1,
      savedAt: 11,
      document: { ...createFallbackConfig(), id: 'p1', name: '旧格式草稿' },
    }));
    vi.spyOn(projectRepository, 'load').mockResolvedValue({
      status: 'ok',
      config: { ...createFallbackConfig(), id: 'p1', name: 'p1' },
      version: { revision: 2, updatedAt: 'cloud-2' },
    });
    const saveSpy = vi.spyOn(projectRepository, 'save').mockResolvedValue({ revision: 3, updatedAt: 'save-3' });

    render(<App />);
    await waitFor(() => expect(screen.getByText('恢复本地草稿')).toBeTruthy(), { timeout: 5000 });
    fireEvent.click(screen.getByText('恢复本地草稿'));
    await flush();

    expect(useHarnessStore.getState().config.name).toBe('旧格式草稿');
    expect(useProjectStore.getState().currentProjectVersion).toBeNull();
    expect(screen.getByText('保存冲突')).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 2400));
    expect(saveSpy).not.toHaveBeenCalled();
    expect(useHarnessStore.getState().config.name).toBe('旧格式草稿');
  });
  it.each(['logout', 'role-revoked', 'new-edit'] as const)('ignores a pending conflict read after %s', async (change) => {
    vi.spyOn(projectRepository, 'save').mockRejectedValue(new DocumentWriteError('conflict', 'Version conflict'));
    const gate = deferred<Awaited<ReturnType<typeof projectRepository.load>>>();
    vi.spyOn(projectRepository, 'load').mockReturnValue(gate.promise);
    render(<App />);
    await flush();
    act(() => { useHarnessStore.getState().setConfig({ name: '本地修改' }); });
    await waitFor(() => expect(screen.getByText('保存冲突')).toBeTruthy(), { timeout: 4000 });
    fireEvent.click(screen.getByText('读取云端版本'));
    fireEvent.click(screen.getByText('确定读取云端'));
    act(() => {
      if (change === 'logout') useUserStore.setState({ currentUser: null });
      else if (change === 'role-revoked') useUserStore.setState({ currentUser: { ...useUserStore.getState().currentUser!, role: 'sales' } });
      else useHarnessStore.getState().setConfig({ name: '读取期间的新修改' });
    });
    await flush();
    const configAfterLogout = useHarnessStore.getState().config;
    await act(async () => { gate.resolve({ status: 'ok', config: { ...createFallbackConfig(), id: 'p1', name: '旧账号云端内容' }, version: { revision: 8, updatedAt: 'old' } }); });
    expect(useHarnessStore.getState().config).toBe(configAfterLogout);
    expect(useProjectStore.getState().currentProjectVersion).toBeNull();
  });

});

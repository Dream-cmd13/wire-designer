import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCachedProjects, getCachedProjects, setCachedProjects } from '@/lib/projectListCache';
import { DocumentWriteError } from '@/lib/documentWriteError';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';
import type { ProjectLoadResult } from '@/repositories/projectRepository';
import type { Project } from '@/types/user';

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(async () => ({ revision: 1, updatedAt: '2026-01-01T00:00:00.000Z' })),
  listProjects: vi.fn(async () => [] as Project[]),
  updateProject: vi.fn(async () => ({ revision: 2, updatedAt: '2026-01-01T00:00:00.000Z' })),
  remove: vi.fn(async (): Promise<void> => undefined),
  save: vi.fn(async () => ({ revision: 2, updatedAt: '2026-01-01T00:00:00.000Z' })),
  load: vi.fn(async (): Promise<ProjectLoadResult> => ({ status: 'missing' })),
}));

vi.mock('@/repositories/projectRepository', () => ({
  projectRepository: {
    listProjects: mocks.listProjects,
    createProject: mocks.createProject,
    updateProject: mocks.updateProject,
    load: mocks.load,
    save: mocks.save,
    remove: mocks.remove,
  },
}));

import { useProjectStore } from '@/stores/projectStore';
import { useUserStore } from '@/stores/userStore';

function setCurrentUser(id: string | null): void {
  useUserStore.setState({
    currentUser: id ? { id, name: id, email: `${id}@test`, createdAt: 1 } : null,
    authReady: true,
  });
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

const deleteVersion = { revision: 3, updatedAt: '2026-01-01T00:00:00.000Z' };

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function installDeleteFixture() {
  const first: Project = { id: 'project-a', userId: 'user-a', name: 'new', description: '', createdAt: 1, updatedAt: 2 };
  const second = { ...first, id: 'project-b' };
  const projects = [first, second];
  setCurrentUser(first.userId);
  setCachedProjects(first.userId, projects);
  useProjectStore.setState({ projects, projectsStatus: 'success' });
  useProjectStore.getState().setCurrentProject(first);
  useProjectStore.getState().setCurrentProjectVersion(deleteVersion);
  mocks.load.mockResolvedValue({ status: 'ok', config: { ...createFallbackConfig(), id: first.id }, version: deleteVersion });
  return { first, second, projects };
}

describe('project store', () => {
  beforeEach(() => {
    const mock = createMockStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: mock,
      writable: true,
      configurable: true,
    });
    mocks.createProject.mockReset();
    mocks.listProjects.mockReset();
    mocks.updateProject.mockClear();
    mocks.remove.mockReset();
    mocks.load.mockReset();
    clearCachedProjects();
    setCurrentUser(null);
    useProjectStore.getState().resetProjects();
  });

  it('uses one id for project metadata and its HarnessConfig', async () => {
    setCurrentUser('user-1');
    const initial = { ...createFallbackConfig(), id: 'template-id', name: 'Template' };

    const created = await useProjectStore.getState().createProject(
      'user-1',
      'New project',
      'Description',
      initial,
    );
    expect(created).not.toBeNull();
    if (!created) throw new Error('Expected a created project');
    const { project, version } = created;

    expect(mocks.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: project.id }),
      expect.objectContaining({ id: project.id, name: 'New project' }),
    );
    expect(project).not.toHaveProperty('harnessConfigId');
    expect(project).not.toHaveProperty('status');
    expect(version.revision).toBe(1);
    expect(useProjectStore.getState().currentProjectVersion).toEqual(version);
  });

  it('creates a project without activating it when requested', async () => {
    setCurrentUser('user-1');
    const currentProject: Project = {
      id: 'p-current',
      userId: 'user-1',
      name: 'Current',
      description: '',
      createdAt: 1,
      updatedAt: 1,
    };
    useProjectStore.getState().setCurrentProject(currentProject);

    const created = await useProjectStore.getState().createProject(
      'user-1',
      'Imported',
      'from file',
      { ...createFallbackConfig(), id: 'template-id' },
      { activate: false },
    );

    expect(created).not.toBeNull();
    expect(useProjectStore.getState().projects.map((project) => project.id)).toContain(created!.project.id);
    expect(useProjectStore.getState().currentProject?.id).toBe('p-current');
  });

  it('keeps a newly created project when an earlier list snapshot arrives afterwards', async () => {
    const userId = 'user-a';
    setCurrentUser(userId);
    const staleList = deferred<Project[]>();
    const freshList = deferred<Project[]>();
    mocks.listProjects.mockReturnValueOnce(staleList.promise).mockReturnValueOnce(freshList.promise);
    const store = useProjectStore.getState();
    const staleLoad = store.loadProjects(userId);
    const created = await store.createProject(userId, 'new', '', createFallbackConfig());
    if (!created) throw new Error('Expected a created project');

    staleList.resolve([]);
    await staleLoad;
    expect(useProjectStore.getState().projects).toEqual([created.project]);
    expect(getCachedProjects(userId)).toEqual([created.project]);

    const refresh = store.loadProjects(userId);
    expect(mocks.listProjects).toHaveBeenCalledTimes(2);
    freshList.resolve([created.project]);
    await refresh;
    expect(useProjectStore.getState()).toMatchObject({ projects: [created.project], projectsStatus: 'success' });
  });

  it('keeps a single project ID when a list already includes the new row before creation returns', async () => {
    const userId = 'user-a';
    setCurrentUser(userId);
    const pendingCreate = deferred<{ revision: number; updatedAt: string }>();
    let remoteProject: Project | undefined;
    mocks.createProject.mockImplementationOnce((project?: Project) => {
      if (project) remoteProject = { ...project, createdAt: 100, updatedAt: 100 };
      return pendingCreate.promise;
    });
    const store = useProjectStore.getState();
    const creation = store.createProject(userId, 'new', '', createFallbackConfig(), { activate: false });
    if (!remoteProject) throw new Error('Expected the server to receive the new project');
    mocks.listProjects.mockResolvedValueOnce([remoteProject]);
    await store.loadProjects(userId);
    pendingCreate.resolve({ revision: 1, updatedAt: '2026-01-01T00:00:00.000Z' });
    await creation;

    expect(useProjectStore.getState().projects).toEqual([remoteProject]);
    expect(getCachedProjects(userId)).toEqual([remoteProject]);
    expect(useProjectStore.getState().currentProject).toBeNull();
  });

  it.each(['user-new', null])('discards creation after switching to %s', async (nextUser) => {
    setCurrentUser('user-old');
    let resolveCreate: () => void = () => {};
    mocks.createProject.mockReturnValue(new Promise((resolve) => {
      resolveCreate = () => resolve({ revision: 1, updatedAt: '2026-01-01T00:00:00.000Z' });
    }));

    const creation = useProjectStore.getState().createProject(
      'user-old',
      'Old Account Project',
      '',
      createFallbackConfig(),
    );
    setCurrentUser(nextUser);
    resolveCreate();
    const created = await creation;

    expect(created).toBeNull();
    expect(useProjectStore.getState().projects).toEqual([]);
    expect(useProjectStore.getState().currentProject).toBeNull();
  });

  it('does not submit a create request from a stale caller', async () => {
    setCurrentUser('user-new');
    await expect(useProjectStore.getState().createProject(
      'user-old', 'Stale project', '', createFallbackConfig(),
    )).resolves.toBeNull();
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it('implements SWR by showing cached projects immediately while fetching remote updates', async () => {
    const cachedItem: Project = {
      id: 'p-cached',
      userId: 'user-swr',
      name: 'Cached Project',
      description: 'from cache',
      createdAt: 100,
      updatedAt: 200,
    };
    setCachedProjects('user-swr', [cachedItem]);
    setCurrentUser('user-swr');

    let resolveRemote: (val: Project[]) => void = () => {};
    mocks.listProjects.mockReturnValue(new Promise<Project[]>((resolve) => {
      resolveRemote = resolve;
    }));

    const loadPromise = useProjectStore.getState().loadProjects('user-swr');

    // Immediately shows cached items and loading status
    expect(useProjectStore.getState().projects).toEqual([cachedItem]);
    expect(useProjectStore.getState().projectsStatus).toBe('loading');

    // When remote returns updated list
    const remoteItem: Project = { ...cachedItem, name: 'Updated Project from Remote', updatedAt: 300 };
    resolveRemote([remoteItem]);
    await loadPromise;

    expect(useProjectStore.getState().projects).toEqual([remoteItem]);
    expect(useProjectStore.getState().projectsStatus).toBe('success');
  });

  it('discards a stale response that arrives after the account changed', async () => {
    setCurrentUser('user-old');
    let resolveRemote: (val: Project[]) => void = () => {};
    mocks.listProjects.mockReturnValue(new Promise<Project[]>((resolve) => {
      resolveRemote = resolve;
    }));

    const loadPromise = useProjectStore.getState().loadProjects('user-old');
    setCurrentUser('user-new');

    resolveRemote([{
      id: 'p-old',
      userId: 'user-old',
      name: 'Old Account Project',
      description: '',
      createdAt: 1,
      updatedAt: 2,
    }]);
    await loadPromise;

    expect(useProjectStore.getState().projects).toEqual([]);
    expect(useProjectStore.getState().projectsStatus).not.toBe('success');
  });

  it('discards responses from a previous session even when the same account returns', async () => {
    setCurrentUser('user-a');
    let resolveRemote: (val: Project[]) => void = () => {};
    mocks.listProjects.mockReturnValue(new Promise<Project[]>((resolve) => {
      resolveRemote = resolve;
    }));

    const loadPromise = useProjectStore.getState().loadProjects('user-a');
    setCurrentUser('user-b');
    useProjectStore.getState().resetProjects();
    setCurrentUser('user-a');

    resolveRemote([{
      id: 'p-stale',
      userId: 'user-a',
      name: 'Stale Project',
      description: '',
      createdAt: 1,
      updatedAt: 2,
    }]);
    await loadPromise;

    expect(useProjectStore.getState().projects).toEqual([]);
    expect(useProjectStore.getState().projectsStatus).not.toBe('success');
  });

  it('starts a fresh request after a session reset instead of reusing the old promise', async () => {
    setCurrentUser('user-a');
    const pending: Array<(value: Project[]) => void> = [];
    mocks.listProjects.mockImplementation(() => new Promise<Project[]>((resolve) => {
      pending.push(resolve);
    }));

    const first = useProjectStore.getState().loadProjects('user-a');
    useProjectStore.getState().resetProjects();
    const second = useProjectStore.getState().loadProjects('user-a');

    expect(mocks.listProjects).toHaveBeenCalledTimes(2);

    pending[1]([{ id: 'p-new', userId: 'user-a', name: 'New', description: '', createdAt: 2, updatedAt: 3 }]);
    await second;
    pending[0]([{ id: 'p-stale', userId: 'user-a', name: 'Stale', description: '', createdAt: 1, updatedAt: 2 }]);
    await first;

    expect(useProjectStore.getState().projects.map((project) => project.id)).toEqual(['p-new']);
    expect(useProjectStore.getState().projectsStatus).toBe('success');
  });

  it('does not inject a created project from a previous session of the same account', async () => {
    setCurrentUser('user-a');
    let resolveCreate: () => void = () => {};
    mocks.createProject.mockReturnValue(new Promise((resolve) => {
      resolveCreate = () => resolve({ revision: 1, updatedAt: '2026-01-01T00:00:00.000Z' });
    }));

    const creation = useProjectStore.getState().createProject(
      'user-a',
      'Stale creation',
      '',
      createFallbackConfig(),
    );
    setCurrentUser('user-b');
    useProjectStore.getState().resetProjects();
    setCurrentUser('user-a');
    resolveCreate();

    await expect(creation).resolves.toBeNull();
    expect(useProjectStore.getState().projects).toEqual([]);
    expect(useProjectStore.getState().currentProject).toBeNull();
  });

  it('retains cached projects and surfaces error when remote fetch fails', async () => {
    const cachedItem = {
      id: 'p-cached',
      userId: 'user-err',
      name: 'Cached Project',
      description: 'from cache',
      createdAt: 100,
      updatedAt: 200,
    };
    setCachedProjects('user-err', [cachedItem]);
    setCurrentUser('user-err');
    mocks.listProjects.mockRejectedValue(new Error('Network offline'));

    await useProjectStore.getState().loadProjects('user-err');

    // Retains cached projects
    expect(useProjectStore.getState().projects).toEqual([cachedItem]);
    expect(useProjectStore.getState().projectsStatus).toBe('error');
    expect(useProjectStore.getState().projectsError).toBeTruthy();
  });

  it('deduplicates in-flight load requests for the same user', async () => {
    setCurrentUser('user-dup');
    let callCount = 0;
    mocks.listProjects.mockImplementation(async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 10));
      return [];
    });

    const [p1, p2] = [
      useProjectStore.getState().loadProjects('user-dup'),
      useProjectStore.getState().loadProjects('user-dup'),
    ];

    await Promise.all([p1, p2]);
    expect(callCount).toBe(1);
  });

  it.each(['success', 'error'])('discards an invalidated list %s after deletion and lets the current refresh settle', async (lateResult) => {
    const { first, second, projects } = installDeleteFixture();
    const staleList = deferred<Project[]>();
    const freshList = deferred<Project[]>();
    mocks.listProjects.mockReturnValueOnce(staleList.promise).mockReturnValueOnce(freshList.promise);
    const store = useProjectStore.getState();
    const staleLoad = store.loadProjects(first.userId);

    await store.deleteProject(first.id);
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(first.id, deleteVersion);
    expect(useProjectStore.getState().currentProject).toBeNull();
    expect(useProjectStore.getState().projects.map((project) => project.id)).toEqual([second.id]);
    expect(getCachedProjects(first.userId)?.map((project) => project.id)).toEqual([second.id]);

    if (lateResult === 'success') staleList.resolve(projects);
    else staleList.reject(new Error('Network offline'));
    await staleLoad;
    expect(useProjectStore.getState()).toMatchObject({ projects: [second], projectsStatus: 'loading', projectsError: null });
    expect(getCachedProjects(first.userId)).toEqual([second]);
    expect(useProjectStore.getState().currentProjectVersion).toBeNull();

    const joinedRefresh = store.loadProjects(first.userId);
    expect(mocks.listProjects).toHaveBeenCalledTimes(2);
    freshList.resolve([second]);
    await joinedRefresh;
    expect(useProjectStore.getState()).toMatchObject({ projects: [second], projectsStatus: 'success', projectsError: null });
    expect(getCachedProjects(first.userId)).toEqual([second]);
  });

  it('keeps the latest forced refresh when the older request arrives last', async () => {
    const { first, second, projects } = installDeleteFixture();
    const staleList = deferred<Project[]>();
    mocks.listProjects.mockReturnValueOnce(staleList.promise).mockResolvedValueOnce([second]);
    const store = useProjectStore.getState();
    const staleLoad = store.loadProjects(first.userId);
    await store.loadProjects(first.userId, { force: true });
    staleList.resolve(projects);
    await staleLoad;

    expect(useProjectStore.getState().projects).toEqual([second]);
    expect(getCachedProjects(first.userId)).toEqual([second]);
  });

  it('keeps the filtered cache if reconciliation fails and starts a new normal refresh', async () => {
    const { first, second, projects } = installDeleteFixture();
    const staleList = deferred<Project[]>();
    const reconcileList = deferred<Project[]>();
    mocks.listProjects.mockReturnValueOnce(staleList.promise).mockReturnValueOnce(reconcileList.promise).mockResolvedValueOnce([second]);
    const store = useProjectStore.getState();
    const staleLoad = store.loadProjects(first.userId);
    await store.deleteProject(first.id);
    const reconciliation = store.loadProjects(first.userId);
    reconcileList.reject(new Error('Network offline'));
    await reconciliation;
    expect(useProjectStore.getState()).toMatchObject({ projects: [second], projectsStatus: 'error' });
    expect(getCachedProjects(first.userId)).toEqual([second]);

    await store.loadProjects(first.userId);
    staleList.resolve(projects);
    await staleLoad;
    expect(mocks.listProjects).toHaveBeenCalledTimes(3);
    expect(useProjectStore.getState()).toMatchObject({ projects: [second], projectsStatus: 'success', projectsError: null });
    expect(getCachedProjects(first.userId)).toEqual([second]);
  });

  it('retains the list and cache on delete failure and lets the pending list finish', async () => {
    const { first, projects } = installDeleteFixture();
    const pendingList = deferred<Project[]>();
    mocks.listProjects.mockReturnValueOnce(pendingList.promise);
    mocks.remove.mockRejectedValueOnce(new DocumentWriteError('conflict', 'Version conflict'));
    const store = useProjectStore.getState();
    const loading = store.loadProjects(first.userId);
    await expect(store.deleteProject(first.id)).rejects.toThrow('Version conflict');
    expect(getCachedProjects(first.userId)).toEqual(projects);
    expect(useProjectStore.getState()).toMatchObject({ projects, projectsStatus: 'loading', currentProject: first });
    pendingList.resolve(projects);
    await loading;
    expect(useProjectStore.getState()).toMatchObject({ projects, projectsStatus: 'success' });
    expect(mocks.listProjects).toHaveBeenCalledTimes(1);
  });

  it.each(['load', 'remove'])('removes only the missing project when %s finds it already gone', async (operation) => {
    const { first, second } = installDeleteFixture();
    if (operation === 'load') mocks.load.mockResolvedValueOnce({ status: 'missing' });
    else mocks.remove.mockRejectedValueOnce(new DocumentWriteError('missing', 'Document not found'));
    await useProjectStore.getState().deleteProject(first.id);
    expect(useProjectStore.getState().projects).toEqual([second]);
    expect(getCachedProjects(first.userId)).toEqual([second]);
  });

  it.each(['user-b', 'user-a'])('ignores a delete response after the session changes to %s', async (nextUser) => {
    const { first, projects } = installDeleteFixture();
    const pendingDelete = deferred<void>();
    mocks.remove.mockReturnValueOnce(pendingDelete.promise);
    const deletion = useProjectStore.getState().deleteProject(first.id);
    await vi.waitFor(() => expect(mocks.remove).toHaveBeenCalledOnce());

    setCurrentUser(nextUser);
    useProjectStore.getState().resetProjects();
    const visibleProjects = nextUser === first.userId ? projects : [{ ...first, id: 'other-project', userId: nextUser }];
    mocks.listProjects.mockResolvedValueOnce(visibleProjects);
    await useProjectStore.getState().loadProjects(nextUser);
    pendingDelete.resolve();
    await deletion;

    expect(useProjectStore.getState()).toMatchObject({ projects: visibleProjects, projectsStatus: 'success' });
    expect(getCachedProjects(nextUser)).toEqual(visibleProjects);
    expect(getCachedProjects(first.userId)).toEqual(projects);
  });

  it('does not save a config that belongs to another project', async () => {
    const save = vi.fn(async () => ({ revision: 2, updatedAt: '2026-01-01T00:00:00.000Z' }));
    const repository = await import('@/repositories/projectRepository');
    vi.spyOn(repository.projectRepository, 'save').mockImplementation(save);
    useProjectStore.getState().setCurrentProject({
      id: 'p2',
      userId: 'user-1',
      name: 'P2',
      description: '',
      createdAt: 1,
      updatedAt: 1,
    });

    await useProjectStore.getState().saveCurrentConfig({ ...createFallbackConfig(), id: 'p1' });

    expect(save).not.toHaveBeenCalled();
  });

  it('passes the tracked version to the save RPC and updates the baseline', async () => {
    setCurrentUser('user-1');
    const repository = await import('@/repositories/projectRepository');
    const save = vi.spyOn(repository.projectRepository, 'save')
      .mockResolvedValue({ revision: 7, updatedAt: '2026-02-02T00:00:00.000Z' });
    useProjectStore.getState().setCurrentProject({
      id: 'p1',
      userId: 'user-1',
      name: 'P1',
      description: '',
      createdAt: 1,
      updatedAt: 1,
    });
    useProjectStore.getState().setCurrentProjectVersion({ revision: 6, updatedAt: '2026-01-01T00:00:00.000Z' });

    await useProjectStore.getState().saveCurrentConfig({ ...createFallbackConfig(), id: 'p1' });

    expect(save).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ id: 'p1' }),
      { revision: 6, updatedAt: '2026-01-01T00:00:00.000Z' },
    );
    expect(useProjectStore.getState().currentProjectVersion).toEqual({ revision: 7, updatedAt: '2026-02-02T00:00:00.000Z' });
  });

  it('resets projects and status on user reset', () => {
    useProjectStore.setState({
      projects: [{ id: 'p1', userId: 'u1', name: 'P', description: '', createdAt: 1, updatedAt: 1 }],
      projectsStatus: 'success',
      projectsError: 'some error',
    });

    useProjectStore.getState().resetProjects();

    expect(useProjectStore.getState().projects).toEqual([]);
    expect(useProjectStore.getState().projectsStatus).toBe('idle');
    expect(useProjectStore.getState().projectsError).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCachedProjects, setCachedProjects } from '@/lib/projectListCache';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(async () => undefined),
  listProjects: vi.fn(async () => []),
  updateProject: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
}));

vi.mock('@/repositories/projectRepository', () => ({
  projectRepository: {
    listProjects: mocks.listProjects,
    createProject: mocks.createProject,
    updateProject: mocks.updateProject,
    load: vi.fn(async () => ({ status: 'missing' })),
    save: vi.fn(async () => undefined),
    remove: mocks.remove,
    emergencySave: vi.fn(),
  },
}));

import { useProjectStore } from '@/stores/projectStore';

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

describe('project store', () => {
  beforeEach(() => {
    const mock = createMockStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: mock,
      writable: true,
      configurable: true,
    });
    mocks.createProject.mockClear();
    mocks.listProjects.mockClear();
    mocks.updateProject.mockClear();
    mocks.remove.mockClear();
    clearCachedProjects();
    useProjectStore.getState().resetProjects();
  });

  it('uses one id for project metadata and its HarnessConfig', async () => {
    const initial = { ...createFallbackConfig(), id: 'template-id', name: 'Template' };

    const project = await useProjectStore.getState().createProject(
      'user-1',
      'New project',
      'Description',
      initial,
    );

    expect(mocks.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: project.id }),
      expect.objectContaining({ id: project.id, name: 'New project' }),
    );
    expect(project).not.toHaveProperty('harnessConfigId');
    expect(project).not.toHaveProperty('status');
  });

  it('implements SWR by showing cached projects immediately while fetching remote updates', async () => {
    const cachedItem = {
      id: 'p-cached',
      userId: 'user-swr',
      name: 'Cached Project',
      description: 'from cache',
      createdAt: 100,
      updatedAt: 200,
    };
    setCachedProjects('user-swr', [cachedItem]);

    let resolveRemote: (val: typeof cachedItem[]) => void = () => {};
    mocks.listProjects.mockReturnValue(new Promise((resolve) => {
      resolveRemote = resolve;
    }));

    const loadPromise = useProjectStore.getState().loadProjects('user-swr');

    // Immediately shows cached items and loading status
    expect(useProjectStore.getState().projects).toEqual([cachedItem]);
    expect(useProjectStore.getState().projectsStatus).toBe('loading');

    // When remote returns updated list
    const remoteItem = { ...cachedItem, name: 'Updated Project from Remote', updatedAt: 300 };
    resolveRemote([remoteItem]);
    await loadPromise;

    expect(useProjectStore.getState().projects).toEqual([remoteItem]);
    expect(useProjectStore.getState().projectsStatus).toBe('success');
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
    mocks.listProjects.mockRejectedValue(new Error('Network offline'));

    await useProjectStore.getState().loadProjects('user-err');

    // Retains cached projects
    expect(useProjectStore.getState().projects).toEqual([cachedItem]);
    expect(useProjectStore.getState().projectsStatus).toBe('error');
    expect(useProjectStore.getState().projectsError).toBeTruthy();
  });

  it('deduplicates in-flight load requests for the same user', async () => {
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

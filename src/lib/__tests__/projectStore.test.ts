import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(async () => undefined),
}));

vi.mock('@/repositories/projectRepository', () => ({
  projectRepository: {
    listProjects: vi.fn(async () => []),
    createProject: mocks.createProject,
    updateProject: vi.fn(async () => undefined),
    load: vi.fn(async () => ({ status: 'missing' })),
    save: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    emergencySave: vi.fn(),
  },
}));

import { useProjectStore } from '@/stores/projectStore';

describe('project store', () => {
  beforeEach(() => {
    mocks.createProject.mockClear();
    useProjectStore.setState({ projects: [], currentProject: null });
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
});

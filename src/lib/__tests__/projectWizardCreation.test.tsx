// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectWizard } from '@/components/project/ProjectWizard';
import { projectRepository } from '@/repositories/projectRepository';
import { useUserStore } from '@/stores/userStore';
import { useProjectStore } from '@/stores/projectStore';
import { useHarnessStore } from '@/stores/harnessStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { DocumentWriteError } from '@/lib/documentWriteError';

const version = { revision: 1, updatedAt: '2026-01-01T00:00:00.000Z' };

function deferredCreate() {
  let resolve!: (value: typeof version) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<typeof version>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderCreateStep(onComplete = vi.fn(), onCancel = vi.fn()) {
  render(<ProjectWizard onComplete={onComplete} onCancel={onCancel} />);
  fireEvent.change(screen.getByPlaceholderText('如：无人机电源线束'), { target: { value: '测试项目' } });
  for (let step = 1; step <= 3; step += 1) fireEvent.click(screen.getByRole('button', { name: '下一步' }));
  return screen.getByRole('button', { name: '创建项目' });
}

function signIn(id: string | null): void {
  useUserStore.setState({
    currentUser: id ? { id, name: id, email: `${id}@test`, createdAt: 1 } : null,
    authReady: true,
  });
}

describe('project wizard creation', () => {
  beforeEach(() => {
    vi.spyOn(useCatalogStore.getState(), 'initialize').mockResolvedValue(undefined);
    useProjectStore.getState().resetProjects();
    signIn('user-old');
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each(['user-new', null, 'user-old'])('does not replace the workspace after resetting the session to %s', async (nextUser) => {
    const pendingCreate = deferredCreate();
    vi.spyOn(projectRepository, 'createProject').mockReturnValue(pendingCreate.promise);
    const replaceDocument = vi.spyOn(useHarnessStore.getState(), 'replaceDocument');
    const onComplete = vi.fn();
    fireEvent.click(renderCreateStep(onComplete));
    expect(projectRepository.createProject).toHaveBeenCalledOnce();

    await act(async () => {
      signIn(nextUser);
      useProjectStore.getState().resetProjects();
      pendingCreate.resolve(version);
    });

    expect(replaceDocument).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(useProjectStore.getState().currentProject).toBeNull();
  });

  it('opens the created document and completes while the account is unchanged', async () => {
    vi.spyOn(projectRepository, 'createProject').mockResolvedValue(version);
    const replaceDocument = vi.spyOn(useHarnessStore.getState(), 'replaceDocument').mockImplementation(() => {});
    const onComplete = vi.fn();
    fireEvent.click(renderCreateStep(onComplete));
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(replaceDocument).toHaveBeenCalledOnce();
    expect(replaceDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: useProjectStore.getState().currentProject?.id }),
      { markSaved: true },
    );
  });

  it('offers to refresh the project list when the creation outcome is unknown', async () => {
    const create = vi.spyOn(projectRepository, 'createProject');
    const pendingCreate = deferredCreate();
    create.mockReturnValue(pendingCreate.promise);
    const listProjects = vi.spyOn(projectRepository, 'listProjects').mockResolvedValue([]);
    const onCancel = vi.fn();
    fireEvent.click(renderCreateStep(vi.fn(), onCancel));
    const failure = new DocumentWriteError('network', 'Network disconnected');
    await act(async () => {
      pendingCreate.reject(failure);
    });

    expect(await screen.findByText(/请先返回项目列表/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '创建项目' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '返回项目列表' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(listProjects).toHaveBeenCalledExactlyOnceWith('user-old');
    expect(create).toHaveBeenCalledOnce();
  });
});

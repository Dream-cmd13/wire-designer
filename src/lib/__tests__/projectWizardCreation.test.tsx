import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectWizard } from '@/components/project/ProjectWizard';
import { projectRepository } from '@/repositories/projectRepository';
import { useUserStore } from '@/stores/userStore';
import { useProjectStore } from '@/stores/projectStore';
import { useHarnessStore } from '@/stores/harnessStore';

vi.mock('@/stores/userStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/userStore')>();
  return { ...actual, useUserStore: Object.assign(() => actual.useUserStore.getState(), actual.useUserStore) };
});
vi.mock('@/stores/projectStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/projectStore')>();
  return { ...actual, useProjectStore: Object.assign(() => actual.useProjectStore.getState(), actual.useProjectStore) };
});
vi.mock('@/stores/harnessStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/harnessStore')>();
  return { ...actual, useHarnessStore: Object.assign(() => actual.useHarnessStore.getState(), actual.useHarnessStore) };
});
vi.mock('@/stores/catalogStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/catalogStore')>();
  return { ...actual, useCatalogStore: (selector: (state: ReturnType<typeof actual.useCatalogStore.getState>) => unknown) => selector(actual.useCatalogStore.getState()) };
});

// Exercise the actual event handler without a DOM; keep all stores real.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const hooks = {
    useEffect: vi.fn(),
    useState: (initial: unknown) => [initial === 1 ? 4 : initial, vi.fn()],
  };
  return { ...actual, ...hooks, default: { ...actual, ...hooks } };
});

function findButtons(node: ReactNode): Array<() => void> {
  if (Array.isArray(node)) return node.flatMap(findButtons);
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) return [];
  return [
    ...(node.type === 'button' && node.props.onClick ? [node.props.onClick] : []),
    ...findButtons(node.props.children),
  ];
}

function signIn(id: string | null): void {
  useUserStore.setState({
    currentUser: id ? { id, name: id, email: `${id}@test`, createdAt: 1 } : null,
    authReady: true,
  });
}

describe('project wizard creation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useProjectStore.getState().resetProjects();
    signIn('user-old');
  });

  it.each(['user-new', null])('does not replace the workspace after switching to %s', async (nextUser) => {
    let resolveCreate!: () => void;
    vi.spyOn(projectRepository, 'createProject').mockImplementation(() => new Promise<void>((resolve) => {
      resolveCreate = resolve;
    }));
    const replaceDocument = vi.spyOn(useHarnessStore.getState(), 'replaceDocument');
    const onComplete = vi.fn();
    const tree = ProjectWizard({ onComplete, onCancel: vi.fn() });
    findButtons(tree).at(-1)!();
    expect(projectRepository.createProject).toHaveBeenCalledOnce();

    signIn(nextUser);
    useProjectStore.getState().resetProjects();
    resolveCreate();
    // Flush the repository, store and event-handler continuations.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(replaceDocument).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(useProjectStore.getState().currentProject).toBeNull();
  });

  it('opens the created document and completes while the account is unchanged', async () => {
    vi.spyOn(projectRepository, 'createProject').mockResolvedValue(undefined);
    const replaceDocument = vi.spyOn(useHarnessStore.getState(), 'replaceDocument').mockImplementation(() => {});
    const onComplete = vi.fn();
    const tree = ProjectWizard({ onComplete, onCancel: vi.fn() });
    findButtons(tree).at(-1)!();
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(replaceDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: useProjectStore.getState().currentProject?.id }),
      { markSaved: true },
    );
  });
});

import { create } from 'zustand';
import { DocumentWriteError } from '@/lib/documentWriteError';
import { getCachedProjects, getProjectListDeletionToken, removeCachedProject, setCachedProjects } from '@/lib/projectListCache';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import type { DocumentVersion } from '@/types/document';
import type { Project } from '@/types/user';
import type { HarnessConfig } from '@/types/harness';
import {
  projectRepository,
  type ProjectLoadResult,
} from '@/repositories/projectRepository';
import { useUserStore } from '@/stores/userStore';

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export type ProjectsStatus = 'idle' | 'loading' | 'success' | 'error';

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  /** 当前项目最近一次从云端读取到的版本；null 表示尚未建立云端基线。 */
  currentProjectVersion: DocumentVersion | null;
  projectsStatus: ProjectsStatus;
  projectsError: string | null;

  // --- Project CRUD ---
  loadProjects: (userId: string, options?: { force?: boolean }) => Promise<void>;
  createProject: (
    userId: string,
    name: string,
    description: string,
    initialConfig: HarnessConfig,
    options?: { activate?: boolean }
  ) => Promise<{ project: Project; version: DocumentVersion } | null>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<boolean>;
  setCurrentProject: (project: Project | null) => void;
  setCurrentProjectVersion: (version: DocumentVersion | null) => void;
  resetProjects: () => void;

  // --- Config management ---
  saveCurrentConfig: (config: HarnessConfig) => Promise<void>;
  loadCurrentConfig: () => Promise<ProjectLoadResult>;

  // --- Query ---
  getUserProjects: (userId: string) => Project[];
}

let inFlightLoad: { userId: string; promise: Promise<void> } | null = null;
let projectSessionGeneration = 0;
let listRequestSequence = 0;

function isCurrentUser(userId: string): boolean {
  return useUserStore.getState().currentUser?.id === userId;
}

function isCurrentSession(userId: string, generation: number): boolean {
  return generation === projectSessionGeneration && isCurrentUser(userId);
}

function invalidateProjectListRequests(): void {
  listRequestSequence += 1;
  inFlightLoad = null;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projects: [],
  currentProject: null,
  currentProjectVersion: null,
  projectsStatus: 'idle',
  projectsError: null,

  loadProjects: async (userId, options) => {
    if (!userId) return;
    if (!isCurrentUser(userId)) return;
    if (!options?.force && inFlightLoad?.userId === userId) return inFlightLoad.promise;

    const generation = projectSessionGeneration;
    const request = ++listRequestSequence;
    const isCurrentRequest = () => request === listRequestSequence && isCurrentSession(userId, generation);
    const currentProjects = get().projects;
    const hasCurrentProjectsForUser = currentProjects.length > 0
      && currentProjects.every((project) => project.userId === userId);

    if (!hasCurrentProjectsForUser) {
      const cached = getCachedProjects(userId);
      if (cached && cached.length > 0) {
        set({ projects: cached, projectsStatus: 'loading', projectsError: null });
      } else {
        set({ projects: [], projectsStatus: 'loading', projectsError: null });
      }
    } else {
      set({ projectsStatus: 'loading', projectsError: null });
    }

    const loadPromise = (async () => {
      while (isCurrentRequest()) {
        const deletionToken = getProjectListDeletionToken(userId);
        const result = await projectRepository.listProjects(userId).then(
          (projects) => ({ projects }),
          (error: unknown) => ({ error }),
        );
        if (!isCurrentRequest()) return;
        if ('projects' in result) setCachedProjects(userId, result.projects, deletionToken);
        if (deletionToken !== getProjectListDeletionToken(userId)) {
          set({ projects: getCachedProjects(userId) ?? [] });
          continue;
        }
        if ('error' in result) {
          const message = getUserErrorMessage(result.error, '项目列表暂时无法加载，请检查网络后重试。');
          set({ projectsStatus: 'error', projectsError: message });
          return;
        }
        set({ projects: result.projects, projectsStatus: 'success', projectsError: null });
        return;
      }
    })();

    inFlightLoad = { userId, promise: loadPromise };
    void loadPromise.finally(() => {
      if (inFlightLoad?.promise === loadPromise) {
        inFlightLoad = null;
      }
    });
    return loadPromise;
  },

  createProject: async (userId, name, description, initialConfig, options) => {
    if (!isCurrentUser(userId)) return null;
    const generation = projectSessionGeneration;
    const projectId = generateId();
    const newProject: Project = {
      id: projectId,
      userId,
      name,
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const configToSave = { ...initialConfig, id: projectId, name };
    const version = await projectRepository.createProject(newProject, configToSave);
    if (!isCurrentSession(userId, generation)) return null;
    invalidateProjectListRequests();
    const state = get();
    const project = state.projects.find((entry) => entry.id === projectId && entry.userId === userId) ?? newProject;
    const projects = project === newProject ? [...state.projects, project] : state.projects;
    const cached = getCachedProjects(userId) ?? state.projects.filter((entry) => entry.userId === userId);
    if (!cached.some((entry) => entry.id === projectId)) setCachedProjects(userId, [...cached, project]);
    set({
      projects,
      currentProject: options?.activate === false ? state.currentProject : project,
      currentProjectVersion: options?.activate === false ? state.currentProjectVersion : version,
    });
    if (state.projectsStatus === 'loading') void get().loadProjects(userId);
    return { project, version };
  },

  updateProject: async (id, updates) => {
    const state = get();
    if (Object.keys(updates).length === 0) return;
    let expected = state.currentProject?.id === id ? state.currentProjectVersion : null;
    if (!expected) {
      // 未跟踪版本的项目（如项目列表页）：先读当前版本，更新本身仍是原子版本校验。
      const loaded = await projectRepository.load(id);
      if (loaded.status !== 'ok') {
        throw new Error('项目不存在或无法读取，更新失败。');
      }
      expected = loaded.version;
    }
    const version = await projectRepository.updateProject(id, updates, expected);
    const after = get();
    const updatedProjects = after.projects.map((project) =>
      project.id === id ? { ...project, ...updates, updatedAt: Date.now() } : project
    );
    const target = after.projects.find((project) => project.id === id);
    if (target?.userId) {
      setCachedProjects(
        target.userId,
        updatedProjects.filter((project) => project.userId === target.userId),
      );
    }
    set({
      projects: updatedProjects,
      currentProject:
        after.currentProject?.id === id
          ? { ...after.currentProject, ...updates, updatedAt: Date.now() }
          : after.currentProject,
      currentProjectVersion: after.currentProject?.id === id ? version : after.currentProjectVersion,
    });
  },

  deleteProject: async (id) => {
    const userId = useUserStore.getState().currentUser?.id;
    if (!userId) return false;
    const generation = projectSessionGeneration;
    try {
      const loaded = await projectRepository.load(id);
      if (!isCurrentSession(userId, generation)) return false;
      if (loaded.status !== 'missing') await projectRepository.remove(id, loaded.version);
    } catch (error) {
      if (!isCurrentSession(userId, generation)) return false;
      if (!(error instanceof DocumentWriteError && error.code === 'missing')) throw error;
    }
    if (!isCurrentSession(userId, generation)) return false;

    invalidateProjectListRequests();
    const state = get();
    const projects = state.projects.filter((project) => project.id !== id || project.userId !== userId);
    removeCachedProject(userId, id);
    const closingProject = state.currentProject?.id === id && state.currentProject.userId === userId;
    set({
      projects,
      ...(closingProject ? { currentProject: null, currentProjectVersion: null } : {}),
    });
    if (state.projectsStatus === 'loading') void get().loadProjects(userId);
    return true;
  },

  resetProjects: () => {
    projectSessionGeneration += 1;
    inFlightLoad = null;
    set({
      projects: [],
      currentProject: null,
      currentProjectVersion: null,
      projectsStatus: 'idle',
      projectsError: null,
    });
  },

  setCurrentProject: (project) => set((state) => ({
    currentProject: project,
    currentProjectVersion: project && state.currentProject?.id === project.id
      ? state.currentProjectVersion
      : null,
  })),

  setCurrentProjectVersion: (currentProjectVersion) => set({ currentProjectVersion }),

  saveCurrentConfig: async (config) => {
    const { currentProject, currentProjectVersion } = get();
    if (!currentProject || currentProject.id !== config.id) return;
    const generation = projectSessionGeneration;
    const version = await projectRepository.save(currentProject.id, config, currentProjectVersion);
    const state = get();
    if (!isCurrentSession(currentProject.userId, generation) || state.currentProject?.id !== currentProject.id) return;
    if (state.currentProject.name === config.name) {
      set({ currentProjectVersion: version });
      return;
    }

    const updatedProject = { ...state.currentProject, name: config.name, updatedAt: config.updatedAt };
    const projects = state.projects.map((project) => project.id === updatedProject.id ? updatedProject : project);
    setCachedProjects(updatedProject.userId, projects.filter((project) => project.userId === updatedProject.userId));
    set({ projects, currentProject: updatedProject, currentProjectVersion: version });
  },

  loadCurrentConfig: async () => {
    const { currentProject } = get();
    if (!currentProject) return { status: 'missing' };
    return projectRepository.load(currentProject.id);
  },

  getUserProjects: (userId) =>
    get().projects
      .filter((project) => project.userId === userId)
      .sort((a, b) => b.updatedAt - a.updatedAt),
}));

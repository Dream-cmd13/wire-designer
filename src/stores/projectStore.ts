import { create } from 'zustand';
import { getCachedProjects, setCachedProjects } from '@/lib/projectListCache';
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
  deleteProject: (id: string) => Promise<void>;
  setCurrentProject: (project: Project | null) => void;
  setCurrentProjectVersion: (version: DocumentVersion | null) => void;
  resetProjects: () => void;

  // --- Config management ---
  saveCurrentConfig: (config: HarnessConfig) => Promise<void>;
  loadCurrentConfig: () => Promise<ProjectLoadResult>;

  // --- Query ---
  getUserProjects: (userId: string) => Project[];
}

const inFlightLoads = new Map<string, Promise<void>>();
let projectSessionGeneration = 0;

function isCurrentUser(userId: string): boolean {
  return useUserStore.getState().currentUser?.id === userId;
}

function isCurrentSession(userId: string, generation: number): boolean {
  return generation === projectSessionGeneration && isCurrentUser(userId);
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

    const generation = projectSessionGeneration;
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

    if (!options?.force && inFlightLoads.has(userId)) {
      return inFlightLoads.get(userId)!;
    }

    const loadPromise = (async () => {
      try {
        const remoteProjects = await projectRepository.listProjects(userId);
        if (!isCurrentSession(userId, generation)) return;
        setCachedProjects(userId, remoteProjects);
        set({
          projects: remoteProjects,
          projectsStatus: 'success',
          projectsError: null,
        });
      } catch (error) {
        if (!isCurrentSession(userId, generation)) return;
        const message = getUserErrorMessage(error, '项目列表暂时无法加载，请检查网络后重试。');
        set({
          projectsStatus: 'error',
          projectsError: message,
        });
      }
    })();

    inFlightLoads.set(userId, loadPromise);
    void loadPromise.finally(() => {
      if (inFlightLoads.get(userId) === loadPromise) {
        inFlightLoads.delete(userId);
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
    const updatedProjects = [...get().projects.filter((project) => project.userId === userId), newProject];
    setCachedProjects(userId, updatedProjects);
    set((state) => ({
      projects: [...state.projects, newProject],
      currentProject: options?.activate === false ? state.currentProject : newProject,
      currentProjectVersion: options?.activate === false ? state.currentProjectVersion : version,
    }));
    return { project: newProject, version };
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
    const loaded = await projectRepository.load(id);
    if (loaded.status !== 'missing') {
      await projectRepository.remove(id, loaded.version);
    }
    const state = get();
    const target = state.projects.find((project) => project.id === id);
    const updatedProjects = state.projects.filter((project) => project.id !== id);
    if (target?.userId) {
      setCachedProjects(
        target.userId,
        updatedProjects.filter((project) => project.userId === target.userId),
      );
    }
    set({
      projects: updatedProjects,
      currentProject: state.currentProject?.id === id ? null : state.currentProject,
    });
  },

  resetProjects: () => {
    projectSessionGeneration += 1;
    inFlightLoads.clear();
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
    const version = await projectRepository.save(currentProject.id, config, currentProjectVersion);
    if (
      useProjectStore.getState().currentProject?.id === currentProject.id
    ) {
      set({ currentProjectVersion: version });
    }
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

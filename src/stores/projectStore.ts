import { create } from 'zustand';
import { getCachedProjects, setCachedProjects } from '@/lib/projectListCache';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import type { Project } from '@/types/user';
import type { HarnessConfig } from '@/types/harness';
import {
  projectRepository,
  type ProjectLoadResult,
} from '@/repositories/projectRepository';

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
  projectsStatus: ProjectsStatus;
  projectsError: string | null;

  // --- Project CRUD ---
  loadProjects: (userId: string, options?: { force?: boolean }) => Promise<void>;
  createProject: (
    userId: string,
    name: string,
    description: string,
    initialConfig: HarnessConfig
  ) => Promise<Project>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setCurrentProject: (project: Project | null) => void;
  resetProjects: () => void;

  // --- Config management ---
  saveCurrentConfig: (config: HarnessConfig) => Promise<void>;
  loadCurrentConfig: () => Promise<ProjectLoadResult>;

  // --- Query ---
  getUserProjects: (userId: string) => Project[];
}

const inFlightLoads = new Map<string, Promise<void>>();

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projects: [],
  currentProject: null,
  projectsStatus: 'idle',
  projectsError: null,

  loadProjects: async (userId, options) => {
    if (!userId) return;

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
        setCachedProjects(userId, remoteProjects);
        set({
          projects: remoteProjects,
          projectsStatus: 'success',
          projectsError: null,
        });
      } catch (error) {
        const message = getUserErrorMessage(error, '获取项目列表失败');
        set({
          projectsStatus: 'error',
          projectsError: message,
        });
      } finally {
        inFlightLoads.delete(userId);
      }
    })();

    inFlightLoads.set(userId, loadPromise);
    return loadPromise;
  },

  createProject: async (userId, name, description, initialConfig) => {
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
    await projectRepository.createProject(newProject, configToSave);
    const updatedProjects = [...get().projects.filter((project) => project.userId === userId), newProject];
    setCachedProjects(userId, updatedProjects);
    set((state) => ({
      projects: [...state.projects, newProject],
      currentProject: newProject,
    }));
    return newProject;
  },

  updateProject: async (id, updates) => {
    await projectRepository.updateProject(id, updates);
    const state = get();
    const updatedProjects = state.projects.map((project) =>
      project.id === id ? { ...project, ...updates, updatedAt: Date.now() } : project
    );
    const target = state.projects.find((project) => project.id === id);
    if (target?.userId) {
      setCachedProjects(
        target.userId,
        updatedProjects.filter((project) => project.userId === target.userId),
      );
    }
    set({
      projects: updatedProjects,
      currentProject:
        state.currentProject?.id === id
          ? { ...state.currentProject, ...updates, updatedAt: Date.now() }
          : state.currentProject,
    });
  },

  deleteProject: async (id) => {
    await projectRepository.remove(id);
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
    set({
      projects: [],
      currentProject: null,
      projectsStatus: 'idle',
      projectsError: null,
    });
  },

  setCurrentProject: (project) => set({ currentProject: project }),

  saveCurrentConfig: async (config) => {
    const { currentProject } = get();
    if (currentProject) {
      await projectRepository.save(currentProject.id, config);
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

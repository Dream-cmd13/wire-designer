import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;

  // --- Project CRUD ---
  createProject: (
    userId: string,
    name: string,
    description: string,
    initialConfig: HarnessConfig
  ) => Promise<Project>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setCurrentProject: (project: Project | null) => void;

  // --- Config management ---
  saveCurrentConfig: (config: HarnessConfig) => Promise<void>;
  loadCurrentConfig: () => Promise<ProjectLoadResult>;

  // --- Query ---
  getUserProjects: (userId: string) => Project[];
}

type PersistedProjectState = Pick<ProjectState, 'projects' | 'currentProject'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function mergePersistedProjectState(
  persisted: unknown,
  current: PersistedProjectState,
): PersistedProjectState {
  if (!isRecord(persisted) || !Array.isArray(persisted.projects)) {
    return { ...current, currentProject: null };
  }

  return {
    ...current,
    projects: persisted.projects as Project[],
    currentProject: null,
  };
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      currentProject: null,

      createProject: async (userId, name, description, initialConfig) => {
        const projectId = generateId();
        const configId = generateId();
        const newProject: Project = {
          id: projectId,
          userId,
          name,
          description,
          harnessConfigId: configId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          status: 'draft',
        };
        const configToSave = { ...initialConfig, id: configId };
        await projectRepository.save(projectId, configToSave);
        set((state) => ({
          projects: [...state.projects, newProject],
          currentProject: newProject,
        }));
        return newProject;
      },

      updateProject: async (id, updates) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
          ),
          currentProject:
            state.currentProject?.id === id
              ? { ...state.currentProject, ...updates, updatedAt: Date.now() }
              : state.currentProject,
        }));
      },

      deleteProject: async (id) => {
        await projectRepository.remove(id);
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          currentProject: state.currentProject?.id === id ? null : state.currentProject,
        }));
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
          .filter((p) => p.userId === userId)
          .sort((a, b) => b.updatedAt - a.updatedAt),
    }),
    {
      name: 'harness-projects',
      partialize: (state) => ({ projects: state.projects }),
      merge: (persisted, current) => ({
        ...current,
        ...mergePersistedProjectState(persisted, current),
      }),
    }
  )
);

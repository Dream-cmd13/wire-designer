import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project } from '@/types/user';
import type { HarnessConfig } from '@/types/harness';

const generateId = (): string =>
  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// Project configs are stored separately to avoid nesting issues with persist
const PROJECT_CONFIG_PREFIX = 'harness-project-config-';

export function saveProjectConfig(projectId: string, config: HarnessConfig) {
  localStorage.setItem(PROJECT_CONFIG_PREFIX + projectId, JSON.stringify(config));
}

export function loadProjectConfig(projectId: string): HarnessConfig | null {
  try {
    const data = localStorage.getItem(PROJECT_CONFIG_PREFIX + projectId);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function deleteProjectConfig(projectId: string) {
  localStorage.removeItem(PROJECT_CONFIG_PREFIX + projectId);
}

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;

  // --- Project CRUD ---
  createProject: (
    userId: string,
    name: string,
    description: string,
    initialConfig: HarnessConfig
  ) => Project;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setCurrentProject: (project: Project | null) => void;

  // --- Config management ---
  saveCurrentConfig: (config: HarnessConfig) => void;
  loadCurrentConfig: () => HarnessConfig | null;

  // --- Query ---
  getUserProjects: (userId: string) => Project[];
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      currentProject: null,

      createProject: (userId, name, description, initialConfig) => {
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
        // Save config separately
        const configToSave = { ...initialConfig, id: configId };
        saveProjectConfig(projectId, configToSave);
        set((state) => ({
          projects: [...state.projects, newProject],
          currentProject: newProject,
        }));
        return newProject;
      },

      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
          ),
          currentProject:
            state.currentProject?.id === id
              ? { ...state.currentProject, ...updates, updatedAt: Date.now() }
              : state.currentProject,
        })),

      deleteProject: (id) => {
        deleteProjectConfig(id);
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          currentProject: state.currentProject?.id === id ? null : state.currentProject,
        }));
      },

      setCurrentProject: (project) => set({ currentProject: project }),

      saveCurrentConfig: (config) => {
        const { currentProject } = get();
        if (currentProject) {
          saveProjectConfig(currentProject.id, config);
        }
      },

      loadCurrentConfig: () => {
        const { currentProject } = get();
        if (!currentProject) return null;
        return loadProjectConfig(currentProject.id);
      },

      getUserProjects: (userId) =>
        get().projects
          .filter((p) => p.userId === userId)
          .sort((a, b) => b.updatedAt - a.updatedAt),
    }),
    { name: 'harness-projects' }
  )
);

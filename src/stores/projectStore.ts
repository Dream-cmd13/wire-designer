import { create } from 'zustand';
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
  loadProjects: (userId: string) => Promise<void>;
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

export const useProjectStore = create<ProjectState>()((set, get) => ({
      projects: [],
      currentProject: null,

      loadProjects: async (userId) => {
        const projects = await projectRepository.listProjects(userId);
        set({ projects });
      },

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
        await projectRepository.createProject(newProject, configToSave);
        set((state) => ({
          projects: [...state.projects, newProject],
          currentProject: newProject,
        }));
        return newProject;
      },

      updateProject: async (id, updates) => {
        await projectRepository.updateProject(id, updates);
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
    }));

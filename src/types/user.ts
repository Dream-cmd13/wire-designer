// ============================================================
// User & Project Management Types
// ============================================================

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  createdAt: number;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppState {
  currentUser: User | null;
  currentProject: Project | null;
  view: 'projectList' | 'designer' | 'wizard';
}

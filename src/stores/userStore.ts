import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types/user';

const generateId = (): string =>
  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

interface UserState {
  users: User[];
  currentUser: User | null;

  // --- Auth ---
  login: (email: string, password: string) => User | null;
  register: (name: string, email: string, password: string) => User | null;
  logout: () => void;
  switchUser: (userId: string) => void;

  // --- User CRUD ---
  addUser: (user: User) => void;
  updateUser: (id: string, updates: Partial<User>) => void;
  removeUser: (id: string) => void;

  // --- Session ---
  getCurrentUser: () => User | null;
}

// Simple password storage (demo only - not secure)
const USER_PASSWORDS_KEY = 'harness-user-passwords';

function getPasswords(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(USER_PASSWORDS_KEY) || '{}');
  } catch {
    return {};
  }
}

function setPasswords(pwds: Record<string, string>) {
  localStorage.setItem(USER_PASSWORDS_KEY, JSON.stringify(pwds));
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      users: [],
      currentUser: null,

      login: (email, password) => {
        const user = get().users.find((u) => u.email === email);
        const passwords = getPasswords();
        if (user && passwords[user.id] === password) {
          set({ currentUser: user });
          return user;
        }
        return null;
      },

      register: (name, email, password) => {
        if (get().users.some((u) => u.email === email)) {
          return null; // Email already exists
        }
        const newUser: User = {
          id: generateId(),
          name,
          email,
          createdAt: Date.now(),
        };
        const passwords = getPasswords();
        passwords[newUser.id] = password;
        setPasswords(passwords);
        set((state) => ({
          users: [...state.users, newUser],
          currentUser: newUser,
        }));
        return newUser;
      },

      logout: () => set({ currentUser: null }),

      switchUser: (userId) => {
        const user = get().users.find((u) => u.id === userId);
        if (user) set({ currentUser: user });
      },

      addUser: (user) =>
        set((state) => ({
          users: [...state.users, user],
        })),

      updateUser: (id, updates) =>
        set((state) => ({
          users: state.users.map((u) => (u.id === id ? { ...u, ...updates } : u)),
        })),

      removeUser: (id) =>
        set((state) => ({
          users: state.users.filter((u) => u.id !== id),
          currentUser: state.currentUser?.id === id ? null : state.currentUser,
        })),

      getCurrentUser: () => get().currentUser,
    }),
    { name: 'harness-users' }
  )
);

import { create } from 'zustand';
import type { HarnessConfig } from '@/types/harness';

interface HistoryState {
  past: HarnessConfig[];
  future: HarnessConfig[];
  lastRecorded: number;
  paused: boolean;
  pushState: (config: HarnessConfig) => void;
  undo: (current: HarnessConfig) => HarnessConfig | null;
  redo: (current: HarnessConfig) => HarnessConfig | null;
  clear: () => void;
  pause: () => void;
  resume: () => void;
}

const MAX_HISTORY = 50;
const DEBOUNCE_MS = 300;

function cloneConfig(config: HarnessConfig): HarnessConfig {
  return JSON.parse(JSON.stringify(config)) as HarnessConfig;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  lastRecorded: 0,
  paused: false,

  pushState: (config) => {
    const now = Date.now();
    const state = get();

    if (state.paused) {
      return;
    }

    if (now - state.lastRecorded < DEBOUNCE_MS) {
      const newPast = [...state.past];
      if (newPast.length > 0) {
        newPast[newPast.length - 1] = cloneConfig(config);
      }
      set({ past: newPast, future: [], lastRecorded: now });
      return;
    }

    const newPast = [...state.past, cloneConfig(config)];
    if (newPast.length > MAX_HISTORY) {
      newPast.shift();
    }

    set({ past: newPast, future: [], lastRecorded: now });
  },

  undo: (current) => {
    const state = get();
    if (state.past.length === 0) return null;

    const newPast = [...state.past];
    const previous = newPast.pop()!;
    const newFuture = [cloneConfig(current), ...state.future];

    if (newFuture.length > MAX_HISTORY) {
      newFuture.pop();
    }

    set({ past: newPast, future: newFuture });
    return previous;
  },

  redo: (current) => {
    const state = get();
    if (state.future.length === 0) return null;

    const newFuture = [...state.future];
    const next = newFuture.shift()!;
    const newPast = [...state.past, cloneConfig(current)];

    if (newPast.length > MAX_HISTORY) {
      newPast.shift();
    }

    set({ past: newPast, future: newFuture });
    return next;
  },

  clear: () => set({ past: [], future: [], lastRecorded: 0, paused: false }),
  pause: () => set({ paused: true }),
  resume: () => set({ paused: false }),
}));

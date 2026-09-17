import { create } from 'zustand';
import { finishedHarnessMaterialRepository } from '@/repositories/finishedHarnessMaterialRepository';
import type { FinishedHarnessMaterial } from '@/types/finishedHarnessMaterial';

interface FinishedHarnessState {
  items: FinishedHarnessMaterial[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
  getById: (id: string) => FinishedHarnessMaterial | undefined;
  getByPlatformNo: (platformNo: string) => FinishedHarnessMaterial | undefined;
}

export const useFinishedHarnessStore = create<FinishedHarnessState>((set, get) => ({
  items: [],
  loading: false,
  refreshing: false,
  error: null,

  async load(force = false) {
    const existing = get().items;
    if (existing.length > 0 && !force) {
      return;
    }

    if (existing.length === 0) {
      set({ loading: true });
    } else if (force) {
      set({ refreshing: true });
    }

    try {
      const items = await finishedHarnessMaterialRepository.list();
      set({ items, error: null });
    } catch (cause) {
      if (existing.length === 0) {
        set({ items: [] });
      }
      set({
        error: cause instanceof Error ? cause.message : '加载成品线束物料失败',
      });
    } finally {
      set({ loading: false, refreshing: false });
    }
  },

  getById(id: string) {
    return get().items.find((item) => item.id === id);
  },

  getByPlatformNo(platformNo: string) {
    return get().items.find((item) => item.platformNo === platformNo);
  },
}));

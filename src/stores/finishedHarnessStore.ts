import { create } from 'zustand';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
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
  reset: () => void;
}

let loadEpoch = 0;

export const useFinishedHarnessStore = create<FinishedHarnessState>((set, get) => ({
  items: [],
  loading: false,
  refreshing: false,
  error: null,

  async load(force = false) {
    const epoch = loadEpoch;
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
      if (epoch !== loadEpoch) return;
      set({ items, error: null });
    } catch (cause) {
      if (epoch !== loadEpoch) return;
      console.error('加载成品线束物料失败:', cause);
      if (existing.length === 0) {
        set({ items: [] });
      }
      set({
        error: getUserErrorMessage(cause, '成品线束物料暂时无法加载，请稍后重试。'),
      });
    } finally {
      if (epoch === loadEpoch) {
        set({ loading: false, refreshing: false });
      }
    }
  },

  getById(id) {
    return get().items.find((item) => item.id === id);
  },

  getByPlatformNo(platformNo) {
    return get().items.find((item) => item.platformNo === platformNo);
  },

  reset: () => {
    loadEpoch += 1;
    set({ items: [], loading: false, refreshing: false, error: null });
  },
}));

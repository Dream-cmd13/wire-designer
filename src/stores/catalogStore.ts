import { create } from 'zustand';
import { catalogRepository } from '@/lib/catalogRepository';
import { setCatalogSnapshot } from '@/lib/catalogRuntime';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import type { CatalogSnapshot } from '@/types/catalog';

type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

interface CatalogState {
  snapshot: CatalogSnapshot | null;
  status: CatalogStatus;
  refreshing: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  reload: () => Promise<void>;
  refreshIfStale: (maxAgeMs?: number) => Promise<void>;
}

let loadingPromise: Promise<void> | null = null;

async function load(
  set: (state: Partial<CatalogState>) => void,
  options?: { isReload?: boolean },
): Promise<void> {
  if (options?.isReload) {
    set({ refreshing: true, error: null });
  } else {
    set({ status: 'loading', error: null });
  }
  try {
    const snapshot = await catalogRepository.loadSnapshot();
    setCatalogSnapshot(snapshot);
    set({ snapshot, status: 'ready', refreshing: false, error: null });
  } catch (error) {
    console.error('目录数据加载失败:', error);
    const message = getUserErrorMessage(error, '物料暂时无法加载，请联系管理员处理。');
    set({ status: 'error', refreshing: false, error: message });
    throw error instanceof Error ? error : new Error(message);
  }
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  snapshot: null,
  status: 'idle',
  refreshing: false,
  error: null,

  initialize: async () => {
    if (get().status === 'ready') return;
    if (!loadingPromise) {
      loadingPromise = load(set).finally(() => {
        loadingPromise = null;
      });
    }
    await loadingPromise;
  },

  reload: async () => {
    if (!loadingPromise) {
      const isReload = get().status === 'ready';
      loadingPromise = load(set, { isReload }).finally(() => {
        loadingPromise = null;
      });
    }
    await loadingPromise;
  },

  refreshIfStale: async (maxAgeMs = 55 * 60 * 1000) => {
    const snapshot = get().snapshot;
    if (!snapshot || Date.now() - snapshot.loadedAt < maxAgeMs) return;
    await get().reload();
  },
}));

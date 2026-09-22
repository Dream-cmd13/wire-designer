import { create } from 'zustand';
import { catalogRepository } from '@/lib/catalogRepository';
import { clearCatalogSnapshot, setCatalogSnapshot } from '@/lib/catalogRuntime';
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
  reset: () => void;
}

let loadingPromise: Promise<void> | null = null;
let loadEpoch = 0;

async function load(
  set: (state: Partial<CatalogState>) => void,
  options?: { isReload?: boolean },
): Promise<void> {
  const epoch = loadEpoch;
  if (options?.isReload) {
    set({ refreshing: true, error: null });
  } else {
    set({ status: 'loading', error: null });
  }
  try {
    const snapshot = await catalogRepository.loadSnapshot();
    if (epoch !== loadEpoch) return;
    setCatalogSnapshot(snapshot);
    set({ snapshot, status: 'ready', refreshing: false, error: null });
  } catch (error) {
    if (epoch !== loadEpoch) return;
    console.error('目录数据加载失败:', error);
    const message = getUserErrorMessage(error, '物料暂时无法加载，请联系管理员处理。');
    set({ status: 'error', refreshing: false, error: message });
    throw error instanceof Error ? error : new Error(message);
  }
}

function startLoad(
  set: (state: Partial<CatalogState>) => void,
  options?: { isReload?: boolean },
): Promise<void> {
  if (!loadingPromise) {
    const task = load(set, options);
    loadingPromise = task;
    const release = () => {
      if (loadingPromise === task) {
        loadingPromise = null;
      }
    };
    task.then(release, release);
  }
  return loadingPromise;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  snapshot: null,
  status: 'idle',
  refreshing: false,
  error: null,

  initialize: async () => {
    if (get().status === 'ready') return;
    await startLoad(set);
  },

  reload: async () => {
    await startLoad(set, { isReload: get().status === 'ready' });
  },

  refreshIfStale: async (maxAgeMs = 55 * 60 * 1000) => {
    const snapshot = get().snapshot;
    if (!snapshot || Date.now() - snapshot.loadedAt < maxAgeMs) return;
    await get().reload();
  },

  reset: () => {
    loadEpoch += 1;
    loadingPromise = null;
    clearCatalogSnapshot();
    set({ snapshot: null, status: 'idle', refreshing: false, error: null });
  },
}));

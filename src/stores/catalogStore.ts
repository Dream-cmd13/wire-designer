import { create } from 'zustand';
import { catalogRepository } from '@/lib/catalogRepository';
import { setCatalogSnapshot } from '@/lib/catalogRuntime';
import type { CatalogSnapshot } from '@/types/catalog';

type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

interface CatalogState {
  snapshot: CatalogSnapshot | null;
  status: CatalogStatus;
  error: string | null;
  initialize: () => Promise<void>;
  reload: () => Promise<void>;
}

let loadingPromise: Promise<void> | null = null;

async function load(set: (state: Partial<CatalogState>) => void): Promise<void> {
  set({ status: 'loading', error: null });
  try {
    const snapshot = await catalogRepository.loadSnapshot();
    setCatalogSnapshot(snapshot);
    set({ snapshot, status: 'ready', error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : '目录数据加载失败。';
    set({ status: 'error', error: message });
    throw error instanceof Error ? error : new Error(message);
  }
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  snapshot: null,
  status: 'idle',
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
    if (loadingPromise) await loadingPromise;
    loadingPromise = load(set).finally(() => {
      loadingPromise = null;
    });
    await loadingPromise;
  },
}));

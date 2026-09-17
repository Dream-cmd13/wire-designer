import { create } from 'zustand';
import { priceRepository, type MaterialPrice, type PriceBook } from '@/repositories/priceRepository';
interface PriceState {
  book: PriceBook | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  load: (options?: { forceRefresh?: boolean }) => Promise<void>;
  merge: (prices: MaterialPrice[], source: string) => Promise<void>;
}
export const usePriceStore = create<PriceState>((set, get) => ({
  book: null,
  loading: false,
  refreshing: false,
  error: null,
  async load(options = {}) {
    const hasExisting = Boolean(get().book);
    if (!hasExisting) {
      set({ loading: true });
    } else if (options.forceRefresh) {
      set({ refreshing: true });
    }
    try {
      const book = await priceRepository.load();
      set({ book, error: null });
    } catch (error) {
      if (!hasExisting) {
        set({ book: null });
      }
      set({ error: error instanceof Error ? error.message : '读取共享价格失败' });
    } finally {
      set({ loading: false, refreshing: false });
    }
  },
  async merge(prices, source) {
    set({ loading: true });
    try { set({ book: await priceRepository.merge(prices, source), error: null }); }
    catch (error) {
      set({ error: error instanceof Error ? error.message : '保存共享价格失败' });
      throw error;
    } finally { set({ loading: false }); }
  },
}));

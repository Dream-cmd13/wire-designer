import { create } from 'zustand';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
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
      console.error('读取共享价格失败:', error);
      if (!hasExisting) {
        set({ book: null });
      }
      set({ error: getUserErrorMessage(error, '物料价格暂时无法加载，请稍后重试。') });
    } finally {
      set({ loading: false, refreshing: false });
    }
  },
  async merge(prices, source) {
    set({ loading: true });
    try { set({ book: await priceRepository.merge(prices, source), error: null }); }
    catch (error) {
      console.error('保存共享价格失败:', error);
      set({ error: getUserErrorMessage(error, '价格保存失败，请保持页面打开并重试。') });
      throw error;
    } finally { set({ loading: false }); }
  },
}));

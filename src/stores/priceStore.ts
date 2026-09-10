import { create } from 'zustand';
import { priceRepository, type MaterialPrice, type PriceBook } from '@/repositories/priceRepository';
interface PriceState {
  book: PriceBook | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  merge: (prices: MaterialPrice[], source: string) => Promise<void>;
}
export const usePriceStore = create<PriceState>((set) => ({
  book: null, loading: false, error: null,
  async load() {
    set({ loading: true });
    try { set({ book: await priceRepository.load(), error: null }); }
    catch (error) { set({ book: null, error: error instanceof Error ? error.message : '读取本机价格失败' }); }
    finally { set({ loading: false }); }
  },
  async merge(prices, source) {
    set({ loading: true });
    try { set({ book: await priceRepository.merge(prices, source), error: null }); }
    catch (error) {
      set({ error: error instanceof Error ? error.message : '保存本机价格失败' });
      throw error;
    } finally { set({ loading: false }); }
  },
}));

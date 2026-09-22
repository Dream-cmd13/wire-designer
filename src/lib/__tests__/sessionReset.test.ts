import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCatalogSnapshot } from '@/lib/catalogRuntime';

const mocks = vi.hoisted(() => ({
  loadSnapshot: vi.fn(),
  priceLoad: vi.fn(),
  priceMerge: vi.fn(),
  finishedList: vi.fn(),
}));

vi.mock('@/lib/catalogRepository', () => ({
  catalogRepository: { loadSnapshot: mocks.loadSnapshot },
}));

vi.mock('@/repositories/priceRepository', () => ({
  priceRepository: { load: mocks.priceLoad, merge: mocks.priceMerge },
}));

vi.mock('@/repositories/finishedHarnessMaterialRepository', () => ({
  finishedHarnessMaterialRepository: { list: mocks.finishedList },
}));

import { useCatalogStore } from '@/stores/catalogStore';
import { useFinishedHarnessStore } from '@/stores/finishedHarnessStore';
import { usePriceStore } from '@/stores/priceStore';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('session data reset', () => {
  beforeEach(() => {
    mocks.loadSnapshot.mockReset();
    mocks.priceLoad.mockReset();
    mocks.priceMerge.mockReset();
    mocks.finishedList.mockReset();
    useCatalogStore.getState().reset();
    usePriceStore.getState().reset();
    useFinishedHarnessStore.getState().reset();
  });

  it('clears catalog, price and finished harness state on reset', () => {
    useCatalogStore.setState({
      snapshot: { connectors: [], wires: [], overmolds: [], loadedAt: Date.now() } as never,
      status: 'ready',
      error: '旧错误',
    });
    usePriceStore.setState({
      book: { importedAt: '', sourceName: '', prices: [] },
      loading: true,
      error: '旧错误',
    });
    useFinishedHarnessStore.setState({
      items: [{ id: 'old' } as never],
      loading: true,
      error: '旧错误',
    });

    useCatalogStore.getState().reset();
    usePriceStore.getState().reset();
    useFinishedHarnessStore.getState().reset();

    expect(useCatalogStore.getState()).toMatchObject({
      snapshot: null,
      status: 'idle',
      refreshing: false,
      error: null,
    });
    expect(getCatalogSnapshot()).toBeNull();
    expect(usePriceStore.getState()).toMatchObject({ book: null, loading: false, error: null });
    expect(useFinishedHarnessStore.getState()).toMatchObject({ items: [], loading: false, error: null });
  });

  it('drops an in-flight catalog response that resolves after reset', async () => {
    const pending = deferred<unknown>();
    mocks.loadSnapshot.mockReturnValue(pending.promise);

    const task = useCatalogStore.getState().initialize();
    useCatalogStore.getState().reset();
    pending.resolve({ connectors: [], wires: [], overmolds: [], loadedAt: Date.now() });
    await task;

    expect(useCatalogStore.getState().snapshot).toBeNull();
    expect(useCatalogStore.getState().status).toBe('idle');
    expect(getCatalogSnapshot()).toBeNull();
  });

  it('drops an in-flight price response that resolves after reset', async () => {
    const pending = deferred<unknown>();
    mocks.priceLoad.mockReturnValue(pending.promise);

    const task = usePriceStore.getState().load();
    usePriceStore.getState().reset();
    pending.resolve({ importedAt: '', sourceName: '', prices: [] });
    await task;

    expect(usePriceStore.getState().book).toBeNull();
    expect(usePriceStore.getState().loading).toBe(false);
  });

  it('drops an in-flight finished harness response that resolves after reset', async () => {
    const pending = deferred<unknown>();
    mocks.finishedList.mockReturnValue(pending.promise);

    const task = useFinishedHarnessStore.getState().load();
    useFinishedHarnessStore.getState().reset();
    pending.resolve([{ id: 'stale' }]);
    await task;

    expect(useFinishedHarnessStore.getState().items).toEqual([]);
    expect(useFinishedHarnessStore.getState().loading).toBe(false);
  });
});

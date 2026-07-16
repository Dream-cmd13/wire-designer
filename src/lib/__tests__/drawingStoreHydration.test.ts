import { afterEach, describe, expect, it, vi } from 'vitest';

describe('drawing store hydration', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
    Reflect.deleteProperty(globalThis, 'window');
    vi.resetModules();
  });

  it('settles rejected hydration and recovers to an empty in-memory library', async () => {
    const storage = {
      getItem: vi.fn(() => Promise.reject(new Error('storage read failed'))),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: storage },
    });
    const { hydrateDrawingStore, useDrawingStore } = await import('@/stores/drawingStore');
    expect(useDrawingStore.persist).toBeDefined();
    useDrawingStore.setState({
      documents: { stale: { id: 'stale' } as never },
      activeDocumentId: 'stale',
      saveState: 'saved',
    });

    await expect(hydrateDrawingStore()).resolves.toBe('recovered');

    expect(useDrawingStore.getState()).toMatchObject({
      documents: {},
      activeDocumentId: null,
      saveState: 'saved',
    });
    expect(storage.removeItem).toHaveBeenCalledWith('standalone-drawing-library:anonymous');
  });

  it('recovers when browser storage is unavailable and persist API is missing', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: Object.defineProperty({}, 'localStorage', {
        get: () => { throw new Error('storage unavailable'); },
      }),
    });
    const { hydrateDrawingStore, useDrawingStore } = await import('@/stores/drawingStore');
    expect(useDrawingStore.persist).toBeDefined();
    useDrawingStore.setState({
      documents: { stale: { id: 'stale' } as never },
      activeDocumentId: 'stale',
      saveState: 'saved',
    });

    await expect(hydrateDrawingStore()).resolves.toBe('recovered');
    expect(useDrawingStore.getState()).toMatchObject({
      documents: {},
      activeDocumentId: null,
      saveState: 'saved',
    });
  });
});

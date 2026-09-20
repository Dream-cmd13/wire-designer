import { describe, expect, it, beforeEach, vi } from 'vitest';
import { hydrateDrawingStore, resetDrawingStore, useDrawingStore } from '@/stores/drawingStore';
import { drawingDocumentRepository } from '@/repositories/drawingDocumentRepository';
import { createBlankDrawingDocument } from '@/lib/drawingDocument';
import type { DrawingDocument } from '@/types/drawing';

describe('drawing store hydration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useDrawingStore.setState({ documents: {}, activeDocumentId: null, saveState: 'saved' });
  });

  it('clears stale in-memory documents for anonymous sessions', async () => {
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

  it('reports a failed load instead of claiming the library is empty', async () => {
    vi.spyOn(drawingDocumentRepository, 'list').mockRejectedValue(new Error('network down'));
    useDrawingStore.setState({
      documents: { stale: { id: 'stale' } as never },
      activeDocumentId: 'stale',
      saveState: 'saved',
    });

    await expect(hydrateDrawingStore('user-without-configured-db')).resolves.toBe('failed');
    const state = useDrawingStore.getState();
    expect(state).toMatchObject({
      documents: {},
      activeDocumentId: null,
      saveState: 'saved',
    });
    expect(state.hydrationError).toContain('网络连接失败');
  });

  it('clears the load error after a successful retry', async () => {
    const list = vi.spyOn(drawingDocumentRepository, 'list')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue([createBlankDrawingDocument('恢复后的图纸')]);

    await expect(hydrateDrawingStore('user-a')).resolves.toBe('failed');
    expect(useDrawingStore.getState().hydrationError).not.toBeNull();

    await expect(hydrateDrawingStore('user-a')).resolves.toBe('hydrated');
    expect(list).toHaveBeenCalledTimes(2);
    const state = useDrawingStore.getState();
    expect(state.hydrationError).toBeNull();
    expect(Object.keys(state.documents)).toHaveLength(1);
  });

  it('discards hydration results that arrive after the store was reset for another account', async () => {
    let resolveList: (value: DrawingDocument[]) => void = () => {};
    vi.spyOn(drawingDocumentRepository, 'list').mockReturnValue(new Promise((resolve) => {
      resolveList = resolve;
    }));

    const hydration = hydrateDrawingStore('user-old');
    resetDrawingStore();
    resolveList([createBlankDrawingDocument('旧账号图纸')]);
    await hydration;

    expect(useDrawingStore.getState()).toMatchObject({
      documents: {},
      activeDocumentId: null,
      saveState: 'saved',
    });
  });

  it('keeps the newest hydration when two accounts hydrate out of order', async () => {
    const documentA = createBlankDrawingDocument('账号 A 图纸');
    const documentB = createBlankDrawingDocument('账号 B 图纸');
    const pending: Array<(value: DrawingDocument[]) => void> = [];
    vi.spyOn(drawingDocumentRepository, 'list').mockImplementation(() => new Promise((resolve) => {
      pending.push(resolve);
    }));

    const hydrationA = hydrateDrawingStore('user-a');
    const hydrationB = hydrateDrawingStore('user-b');
    pending[1]([documentB]);
    await hydrationB;
    pending[0]([documentA]);
    await hydrationA;

    const state = useDrawingStore.getState();
    expect(state.activeDocumentId).toBe(documentB.id);
    expect(Object.keys(state.documents)).toEqual([documentB.id]);
  });
});

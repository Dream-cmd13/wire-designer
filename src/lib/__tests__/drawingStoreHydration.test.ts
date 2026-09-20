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

  it('recovers to an empty in-memory library when the database is unavailable', async () => {
    vi.spyOn(drawingDocumentRepository, 'list').mockRejectedValue(new Error('database unavailable'));
    useDrawingStore.setState({
      documents: { stale: { id: 'stale' } as never },
      activeDocumentId: 'stale',
      saveState: 'saved',
    });

    await expect(hydrateDrawingStore('user-without-configured-db')).resolves.toBe('recovered');
    expect(useDrawingStore.getState()).toMatchObject({
      documents: {},
      activeDocumentId: null,
      saveState: 'saved',
    });
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

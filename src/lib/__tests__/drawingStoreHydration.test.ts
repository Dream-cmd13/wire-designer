import { describe, expect, it, beforeEach, vi } from 'vitest';
import { hydrateDrawingStore, useDrawingStore } from '@/stores/drawingStore';
import { drawingDocumentRepository } from '@/repositories/drawingDocumentRepository';

describe('drawing store hydration', () => {
  beforeEach(() => {
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
});

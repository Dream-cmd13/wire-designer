// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlankDrawingDocument } from '@/lib/drawingDocument';
import { listWorkspaceDrafts, workspaceDraftKey, writeWorkspaceDraft } from '@/lib/workspaceDraftCache';
import { drawingDocumentRepository } from '@/repositories/drawingDocumentRepository';
import { flushDrawingDrafts, hydrateDrawingStore, resetDrawingStore, useDrawingStore } from '@/stores/drawingStore';

describe('local drawing persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.clear();
    resetDrawingStore();
    vi.spyOn(drawingDocumentRepository, 'list').mockRejectedValue(new Error('offline'));
    vi.spyOn(drawingDocumentRepository, 'save').mockRejectedValue(new Error('offline'));
    vi.spyOn(drawingDocumentRepository, 'remove').mockRejectedValue(new Error('offline'));
  });

  afterEach(() => {
    resetDrawingStore();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('opens without cloud access and restores edited drawings after a reload', async () => {
    await expect(hydrateDrawingStore('user-a')).resolves.not.toBe('failed');
    const document = useDrawingStore.getState().createDocument('本地图纸');
    useDrawingStore.getState().updateDocument({ ...document, name: '本地修改' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(useDrawingStore.getState().saveState).toBe('saved');
    resetDrawingStore();
    await hydrateDrawingStore('user-a');
    expect(useDrawingStore.getState().documents[document.id]?.name).toBe('本地修改');
    expect(drawingDocumentRepository.list).not.toHaveBeenCalled();
    expect(drawingDocumentRepository.save).not.toHaveBeenCalled();
  });

  it('restores a draft without a cloud baseline and keeps all original copies', async () => {
    const document = createBlankDrawingDocument('未同步的草稿');
    writeWorkspaceDraft({ ownerId: 'user-a', kind: 'drawing', documentId: document.id, localRevision: 20, baseServerRevision: null, document });
    const key = workspaceDraftKey('user-a', 'drawing', document.id);
    const original = localStorage.getItem(key);
    await hydrateDrawingStore('user-a');
    expect(useDrawingStore.getState().documents[document.id]).toEqual(document);
    expect(useDrawingStore.getState().saveState).toBe('saved');
    expect(localStorage.getItem(key)).toBe(original);
    await expect(useDrawingStore.getState().saveActiveDocument()).resolves.toBeUndefined();
    expect(drawingDocumentRepository.save).not.toHaveBeenCalled();
  });

  it('persists anonymous drawings and isolates them from signed-in accounts', async () => {
    await hydrateDrawingStore();
    const document = useDrawingStore.getState().createDocument('匿名本地图纸');
    useDrawingStore.getState().updateDocument({ ...document, name: '匿名修改' });
    expect(flushDrawingDrafts().ok).toBe(true);
    resetDrawingStore();
    await hydrateDrawingStore('user-a');
    expect(useDrawingStore.getState().documents[document.id]).toBeUndefined();
    await hydrateDrawingStore();
    expect(useDrawingStore.getState().documents[document.id]?.name).toBe('匿名修改');
  });

  it('reports storage failures and permits a manual retry without losing the document', async () => {
    await hydrateDrawingStore('user-a');
    const document = useDrawingStore.getState().createDocument('保留内容');
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    useDrawingStore.getState().updateDocument({ ...document, name: '最新内容' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(useDrawingStore.getState().saveState).toBe('error');
    expect(useDrawingStore.getState().draftError).toContain('本地存储空间不足');
    await expect(useDrawingStore.getState().saveActiveDocument()).rejects.toThrow();
    write.mockRestore();
    await useDrawingStore.getState().saveActiveDocument();
    expect(useDrawingStore.getState().saveState).toBe('saved');
    expect(listWorkspaceDrafts('user-a', 'drawing')[0]?.document.name).toBe('最新内容');
  });
});

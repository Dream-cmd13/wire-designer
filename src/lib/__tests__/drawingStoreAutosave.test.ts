// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushDrawingDrafts, flushDrawingSaves, hasPendingDrawingChanges, hydrateDrawingStore, resetDrawingStore, useDrawingStore } from '@/stores/drawingStore';
import { listCorruptWorkspaceDrafts, readWorkspaceDraft, workspaceDraftKey } from '@/lib/workspaceDraftCache';

describe('local drawing autosave reliability', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    resetDrawingStore();
    await hydrateDrawingStore('user-a');
  });

  afterEach(() => {
    resetDrawingStore();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('coalesces rapid edits into the newest local snapshot', async () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const document = useDrawingStore.getState().createDocument('图纸');
    for (const name of ['v1', 'v2', 'v3']) useDrawingStore.getState().updateDocument({ ...document, name });
    expect(hasPendingDrawingChanges()).toBe(true);
    expect(useDrawingStore.getState().saveState).toBe('dirty');
    await vi.advanceTimersByTimeAsync(500);
    expect(write).toHaveBeenCalledTimes(1);
    expect(readWorkspaceDraft('user-a', 'drawing', document.id)?.document.name).toBe('v3');
    expect(hasPendingDrawingChanges()).toBe(false);
    expect(useDrawingStore.getState().saveState).toBe('saved');
  });

  it('does not persist an untouched blank document until manual save', async () => {
    const document = useDrawingStore.getState().createDocument('未命名线束图');
    await vi.advanceTimersByTimeAsync(2000);
    expect(readWorkspaceDraft('user-a', 'drawing', document.id)).toBeNull();
    await useDrawingStore.getState().saveActiveDocument();
    expect(readWorkspaceDraft('user-a', 'drawing', document.id)?.document).toEqual(document);
  });

  it('flushes the newest edits before unload without waiting for the timer', () => {
    const document = useDrawingStore.getState().createDocument('图纸');
    useDrawingStore.getState().updateDocument({ ...document, name: '立即保存' });
    expect(flushDrawingDrafts()).toEqual({ ok: true });
    expect(readWorkspaceDraft('user-a', 'drawing', document.id)?.document.name).toBe('立即保存');
    expect(hasPendingDrawingChanges()).toBe(false);
  });

  it('flushes pending edits through the save entry point', async () => {
    const document = useDrawingStore.getState().createDocument('图纸');
    useDrawingStore.getState().updateDocument({ ...document, name: '立即保存' });
    await flushDrawingSaves();
    expect(readWorkspaceDraft('user-a', 'drawing', document.id)?.document.name).toBe('立即保存');
  });

  it('saves the previous drawing before replacing the in-memory canvas', async () => {
    const document = useDrawingStore.getState().createDocument('旧图纸');
    useDrawingStore.getState().updateDocument({ ...document, name: '保留旧内容' });
    useDrawingStore.getState().replaceWithNewDocument('新图纸');
    expect(readWorkspaceDraft('user-a', 'drawing', document.id)?.document.name).toBe('保留旧内容');
    resetDrawingStore();
    await hydrateDrawingStore('user-a');
    expect(useDrawingStore.getState().documents[document.id]?.name).toBe('保留旧内容');
  });

  it('cancels scheduled writes on account reset', async () => {
    const document = useDrawingStore.getState().createDocument('账号 A');
    useDrawingStore.getState().updateDocument({ ...document, name: '待保存' });
    resetDrawingStore();
    await hydrateDrawingStore('user-b');
    await vi.advanceTimersByTimeAsync(2000);
    expect(readWorkspaceDraft('user-b', 'drawing', document.id)).toBeNull();
    expect(useDrawingStore.getState().documents).toEqual({});
  });

  it('keeps corrupt raw content when saving a valid drawing at the same key', async () => {
    const document = useDrawingStore.getState().createDocument('图纸');
    const corruptRaw = '{broken';
    localStorage.setItem(workspaceDraftKey('user-a', 'drawing', document.id), corruptRaw);
    useDrawingStore.getState().updateDocument({ ...document, name: '修订内容' });
    await vi.advanceTimersByTimeAsync(500);
    expect(listCorruptWorkspaceDrafts('user-a', 'drawing').map((draft) => draft.raw)).toEqual([corruptRaw]);
    expect(readWorkspaceDraft('user-a', 'drawing', document.id)?.document.name).toBe('修订内容');
  });

  it('keeps a failed snapshot dirty and recovers on the next edit', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const document = useDrawingStore.getState().createDocument('图纸');
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    useDrawingStore.getState().updateDocument({ ...document, name: 'v1' });
    await vi.advanceTimersByTimeAsync(500);
    expect(hasPendingDrawingChanges()).toBe(true);
    expect(useDrawingStore.getState().saveState).toBe('error');
    write.mockRestore();
    useDrawingStore.getState().updateDocument({ ...document, name: 'v2' });
    await vi.advanceTimersByTimeAsync(500);
    expect(useDrawingStore.getState().saveState).toBe('saved');
    expect(useDrawingStore.getState().draftError).toBeNull();
    expect(readWorkspaceDraft('user-a', 'drawing', document.id)?.document.name).toBe('v2');
  });

  it('reports a failed earlier drawing even when the active imported drawing saves successfully', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const earlier = useDrawingStore.getState().createDocument('原图纸');
    useDrawingStore.getState().updateDocument({ ...earlier, name: '原图纸未保存修改' });
    const imported = useDrawingStore.getState().createDocument('导入的图纸');
    useDrawingStore.getState().updateDocument(imported);
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.includes(earlier.id)) throw new DOMException('full', 'QuotaExceededError');
      setItem.call(this, key, value);
    });

    await expect(useDrawingStore.getState().saveActiveDocument()).rejects.toThrow();
    expect(readWorkspaceDraft('user-a', 'drawing', imported.id)?.document).toEqual(imported);
    expect(useDrawingStore.getState().saveState).toBe('error');
    expect(hasPendingDrawingChanges(earlier.id)).toBe(true);
    expect(useDrawingStore.getState().documents[earlier.id]?.name).toBe('原图纸未保存修改');
  });
});

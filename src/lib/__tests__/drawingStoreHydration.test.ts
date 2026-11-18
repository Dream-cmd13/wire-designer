// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateDrawingStore, resetDrawingStore, useDrawingStore } from '@/stores/drawingStore';
import { createBlankDrawingDocument } from '@/lib/drawingDocument';
import { currentDraftInstanceId, listCorruptWorkspaceDrafts, workspaceDraftKey } from '@/lib/workspaceDraftCache';

describe('local drawing store hydration', () => {
  beforeEach(() => { localStorage.clear(); resetDrawingStore(); });
  afterEach(() => { resetDrawingStore(); vi.restoreAllMocks(); });

  it('starts empty when the current account has no local drawings', async () => {
    useDrawingStore.setState({ documents: { stale: { id: 'stale' } as never }, activeDocumentId: 'stale' });
    await expect(hydrateDrawingStore()).resolves.toBe('recovered');
    expect(useDrawingStore.getState()).toMatchObject({ documents: {}, activeDocumentId: null, saveState: 'saved' });
  });

  it('reports blocked local storage and recovers when it becomes available', async () => {
    const read = vi.spyOn(Storage.prototype, 'length', 'get').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    await expect(hydrateDrawingStore('user-a')).resolves.toBe('failed');
    expect(useDrawingStore.getState().hydrationError).toContain('浏览器阻止了本机存储');
    read.mockRestore();
    await expect(hydrateDrawingStore('user-a')).resolves.toBe('recovered');
    expect(useDrawingStore.getState().hydrationError).toBeNull();
  });

  it('restores the newest window copy and retains every original snapshot', async () => {
    const document = createBlankDrawingDocument('较旧副本');
    const snapshots = [
      { instanceId: 'window-a', savedAt: 10, document },
      { instanceId: 'window-b', savedAt: 20, document: { ...document, name: '最新副本' } },
    ];
    for (const snapshot of snapshots) {
      localStorage.setItem(workspaceDraftKey('user-a', 'drawing', document.id, snapshot.instanceId), JSON.stringify({
        version: 2, ownerId: 'user-a', kind: 'drawing', documentId: document.id, draftId: snapshot.instanceId, localRevision: 5, baseServerRevision: null, ...snapshot,
      }));
    }
    await hydrateDrawingStore('user-a');
    expect(useDrawingStore.getState().documents[document.id]?.name).toBe('最新副本');
    expect(localStorage.length).toBe(2);
    useDrawingStore.getState().renameDocument(document.id, '当前窗口修订');
    await useDrawingStore.getState().saveActiveDocument();
    expect(currentDraftInstanceId()).not.toBe('window-a');
    expect(localStorage.length).toBe(3);
    for (const snapshot of snapshots) {
      const raw = localStorage.getItem(workspaceDraftKey('user-a', 'drawing', document.id, snapshot.instanceId));
      expect(JSON.parse(raw!).document).toEqual(snapshot.document);
    }
  });

  it('recovers legacy drafts without a cloud baseline and leaves their raw data intact', async () => {
    const document = createBlankDrawingDocument('旧版本草稿');
    const key = `wh_draft_v1:user-a:drawing:${document.id}`;
    const raw = JSON.stringify({ version: 1, ownerId: 'user-a', kind: 'drawing', documentId: document.id, revision: 9, savedAt: 10, document });
    localStorage.setItem(key, raw);
    await expect(hydrateDrawingStore('user-a')).resolves.toBe('hydrated');
    expect(useDrawingStore.getState().documents[document.id]).toEqual(document);
    expect(useDrawingStore.getState().saveState).toBe('saved');
    expect(localStorage.getItem(key)).toBe(raw);
  });

  it('isolates corrupt snapshots while preserving their raw data', async () => {
    const key = workspaceDraftKey('user-a', 'drawing', 'broken');
    localStorage.setItem(key, '{broken');
    await hydrateDrawingStore('user-a');
    expect(useDrawingStore.getState().documents).toEqual({});
    expect(listCorruptWorkspaceDrafts('user-a', 'drawing')[0]?.raw).toBe('{broken');
  });
});

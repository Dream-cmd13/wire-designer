import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flushDrawingDrafts,
  flushDrawingSaves,
  hydrateDrawingStore,
  resetDrawingStore,
  restoreDrawingDraft,
  useDrawingStore,
} from '@/stores/drawingStore';
import { drawingDocumentRepository } from '@/repositories/drawingDocumentRepository';
import { createBlankDrawingDocument } from '@/lib/drawingDocument';
import { listCorruptWorkspaceDrafts, readWorkspaceDraft, removeWorkspaceDraft, workspaceDraftKey, writeWorkspaceDraft } from '@/lib/workspaceDraftCache';
import type { DrawingDocument } from '@/types/drawing';

interface SaveCall {
  ownerId: string;
  document: DrawingDocument;
}

function createMockStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}

let saveCalls: SaveCall[];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function startEditing(name: string): Promise<DrawingDocument> {
  const document = useDrawingStore.getState().createDocument('图纸') as DrawingDocument;
  useDrawingStore.getState().updateDocument({ ...document, name, updatedAt: 10 });
  return document;
}

describe('drawing autosave reliability', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'localStorage', {
      value: createMockStorage(),
      writable: true,
      configurable: true,
    });
    resetDrawingStore();
    saveCalls = [];
    vi.spyOn(drawingDocumentRepository, 'list').mockResolvedValue([]);
    await hydrateDrawingStore('user-a');
  });

  afterEach(() => {
    useDrawingStore.setState({ documents: {}, activeDocumentId: null, saveState: 'saved' });
    vi.useRealTimers();
  });

  it('saves the latest edits made while a save request is in flight', async () => {
    const gate = deferred();
    vi.spyOn(drawingDocumentRepository, 'save').mockImplementation(async (ownerId, document) => {
      saveCalls.push({ ownerId, document });
      if (saveCalls.length === 1) await gate.promise;
    });

    const created = await startEditing('v1');
    await vi.advanceTimersByTimeAsync(500);
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0]?.document.name).toBe('v1');

    useDrawingStore.getState().updateDocument({ ...created, name: 'v2', updatedAt: 11 });
    gate.resolve();
    await flushDrawingSaves();

    expect(saveCalls.map((call) => call.document.name)).toEqual(['v1', 'v2']);
    expect(useDrawingStore.getState().saveState).toBe('saved');
  });

  it('coalesces rapid edits and only writes the newest snapshot', async () => {
    const save = vi.spyOn(drawingDocumentRepository, 'save').mockImplementation(async (ownerId, document) => {
      saveCalls.push({ ownerId, document });
    });

    const created = await startEditing('v1');
    useDrawingStore.getState().updateDocument({ ...created, name: 'v2', updatedAt: 10 });
    useDrawingStore.getState().updateDocument({ ...created, name: 'v3', updatedAt: 10 });
    await vi.advanceTimersByTimeAsync(500);
    await flushDrawingSaves();

    expect(save).toHaveBeenCalledTimes(1);
    expect(saveCalls[0]?.document.name).toBe('v3');
    expect(useDrawingStore.getState().saveState).toBe('saved');
  });

  it('reports failures without tight retries and recovers on the next edit', async () => {
    const save = vi.spyOn(drawingDocumentRepository, 'save')
      .mockRejectedValueOnce(new Error('网络错误'))
      .mockImplementation(async (ownerId, document) => {
        saveCalls.push({ ownerId, document });
      });

    const created = await startEditing('v1');
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(useDrawingStore.getState().saveState).toBe('error');

    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);

    useDrawingStore.getState().updateDocument({ ...created, name: 'v2', updatedAt: 11 });
    await vi.advanceTimersByTimeAsync(500);
    expect(useDrawingStore.getState().saveState).toBe('saved');
    expect(saveCalls.at(-1)?.document.name).toBe('v2');
  });

  it('retries a failed save through the manual save entry', async () => {
    const save = vi.spyOn(drawingDocumentRepository, 'save')
      .mockRejectedValueOnce(new Error('网络错误'))
      .mockImplementation(async (ownerId, document) => {
        saveCalls.push({ ownerId, document });
      });

    await startEditing('v1');
    await vi.advanceTimersByTimeAsync(500);
    expect(useDrawingStore.getState().saveState).toBe('error');

    await useDrawingStore.getState().saveActiveDocument();

    expect(save).toHaveBeenCalledTimes(2);
    expect(useDrawingStore.getState().saveState).toBe('saved');
    expect(saveCalls.at(-1)?.document.name).toBe('v1');
  });

  it('keeps at most one in-flight request per document when manual and auto saves overlap', async () => {
    let active = 0;
    let maxActive = 0;
    const gate = deferred();
    const save = vi.spyOn(drawingDocumentRepository, 'save').mockImplementation(async (ownerId, document) => {
      saveCalls.push({ ownerId, document });
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (saveCalls.length === 1) await gate.promise;
      active -= 1;
    });

    const created = await startEditing('v1');
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);

    const manual = useDrawingStore.getState().saveActiveDocument();
    useDrawingStore.getState().updateDocument({ ...created, name: 'v2', updatedAt: 11 });
    gate.resolve();
    await manual;
    await flushDrawingSaves();

    expect(maxActive).toBe(1);
    expect(saveCalls.map((call) => call.document.name)).toEqual(['v1', 'v2']);
    expect(useDrawingStore.getState().saveState).toBe('saved');
  });

  it('does not let in-flight saves resurrect a removed document', async () => {
    const gate = deferred();
    const save = vi.spyOn(drawingDocumentRepository, 'save').mockImplementation(async (ownerId, document) => {
      saveCalls.push({ ownerId, document });
      await gate.promise;
    });
    const remove = vi.spyOn(drawingDocumentRepository, 'remove').mockResolvedValue();

    const created = await startEditing('v1');
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);

    useDrawingStore.getState().removeDocument(created.id);
    gate.resolve();
    await vi.advanceTimersByTimeAsync(10);
    await flushDrawingSaves();
    await vi.advanceTimersByTimeAsync(10);

    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('user-a', created.id);
    expect(useDrawingStore.getState().documents[created.id]).toBeUndefined();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('waits for pending edits immediately through flushDrawingSaves', async () => {
    vi.spyOn(drawingDocumentRepository, 'save').mockImplementation(async (ownerId, document) => {
      saveCalls.push({ ownerId, document });
    });

    await startEditing('v1');
    await flushDrawingSaves();

    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0]?.document.name).toBe('v1');
    expect(useDrawingStore.getState().saveState).toBe('saved');
  });

  it('drops stale save results after the drawing session is reset', async () => {
    const gate = deferred();
    vi.spyOn(drawingDocumentRepository, 'save').mockImplementation(async (ownerId, document) => {
      saveCalls.push({ ownerId, document });
      await gate.promise;
    });

    await startEditing('v1');
    await vi.advanceTimersByTimeAsync(500);
    resetDrawingStore();
    gate.resolve();
    await vi.advanceTimersByTimeAsync(10);

    expect(useDrawingStore.getState()).toMatchObject({
      documents: {},
      activeDocumentId: null,
      saveState: 'saved',
    });
  });

  it('keeps a local draft while the cloud save is still pending', async () => {
    const gate = deferred();
    vi.spyOn(drawingDocumentRepository, 'save').mockImplementation(async () => {
      await gate.promise;
    });

    const created = await startEditing('v1');
    await vi.advanceTimersByTimeAsync(1000);

    const draft = readWorkspaceDraft('user-a', 'drawing', created.id);
    expect(draft?.revision).toBe(2);
    expect((draft?.document as DrawingDocument).name).toBe('v1');

    gate.resolve();
    await vi.advanceTimersByTimeAsync(10);
    expect(readWorkspaceDraft('user-a', 'drawing', created.id)).toBeNull();
  });

  it('keeps the draft after a failed save so it can be recovered in the same account', async () => {
    vi.spyOn(drawingDocumentRepository, 'save').mockRejectedValue(new Error('网络错误'));

    const created = await startEditing('v1');
    await vi.advanceTimersByTimeAsync(1000);

    expect(useDrawingStore.getState().saveState).toBe('error');
    const draft = readWorkspaceDraft('user-a', 'drawing', created.id);
    expect(draft?.revision).toBe(2);

    resetDrawingStore();
    expect(readWorkspaceDraft('user-a', 'drawing', created.id)?.revision).toBe(2);
    removeWorkspaceDraft('user-a', 'drawing', created.id);
  });

  it('writes the newest snapshot immediately through flushDrawingDrafts', async () => {
    vi.spyOn(drawingDocumentRepository, 'save').mockRejectedValue(new Error('网络错误'));

    const created = await startEditing('v1');
    useDrawingStore.getState().updateDocument({ ...created, name: 'v2', updatedAt: 12 });
    const result = flushDrawingDrafts();

    expect(result.ok).toBe(true);
    expect((readWorkspaceDraft('user-a', 'drawing', created.id)?.document as DrawingDocument).name)
      .toBe('v2');
  });

  it('keeps a corrupt draft while autosave backs up and then saves the same document', async () => {
    const gate = deferred();
    vi.spyOn(drawingDocumentRepository, 'save').mockImplementation(async () => {
      await gate.promise;
    });

    const created = await startEditing('v1');
    const corruptRaw = JSON.stringify({
      version: 1,
      ownerId: 'user-a',
      kind: 'drawing',
      documentId: created.id,
      revision: 1,
      baseUpdatedAt: 1,
      savedAt: 1,
      document: { schemaVersion: 1, id: created.id, name: '损坏草稿', updatedAt: 1, objects: [null] },
    });
    localStorage.setItem(workspaceDraftKey('user-a', 'drawing', created.id), corruptRaw);

    await vi.advanceTimersByTimeAsync(1000);

    expect(listCorruptWorkspaceDrafts('user-a', 'drawing').map((entry) => entry.raw)).toEqual([corruptRaw]);
    expect(readWorkspaceDraft('user-a', 'drawing', created.id)?.revision).toBe(2);

    gate.resolve();
    await vi.advanceTimersByTimeAsync(10);

    expect(readWorkspaceDraft('user-a', 'drawing', created.id)).toBeNull();
    expect(listCorruptWorkspaceDrafts('user-a', 'drawing').map((entry) => entry.raw)).toEqual([corruptRaw]);
  });

  it('reports draft storage failures instead of silently claiming a backup', async () => {
    vi.spyOn(drawingDocumentRepository, 'save').mockRejectedValue(new Error('网络错误'));
    vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    await startEditing('v1');
    const result = flushDrawingDrafts();

    expect(result.ok).toBe(false);
    expect(useDrawingStore.getState().draftError).toContain('本地存储空间不足');
  });

  it('marks the document dirty immediately after an edit', async () => {
    vi.spyOn(drawingDocumentRepository, 'save').mockResolvedValue();
    const document = await startEditing('v1');
    await vi.advanceTimersByTimeAsync(500);
    expect(useDrawingStore.getState().saveState).toBe('saved');

    useDrawingStore.getState().updateDocument({ ...document, name: 'v2', updatedAt: 11 });

    expect(useDrawingStore.getState().saveState).toBe('dirty');
  });

  it('does not persist or back up an untouched blank document', async () => {
    const save = vi.spyOn(drawingDocumentRepository, 'save').mockResolvedValue();
    const created = useDrawingStore.getState().createDocument('未命名线束图') as DrawingDocument;

    await vi.advanceTimersByTimeAsync(2000);

    expect(save).not.toHaveBeenCalled();
    expect(readWorkspaceDraft('user-a', 'drawing', created.id)).toBeNull();
    expect(useDrawingStore.getState().saveState).toBe('saved');
  });

  it('persists a blank document when the user saves it manually', async () => {
    vi.spyOn(drawingDocumentRepository, 'save').mockImplementation(async (ownerId, document) => {
      saveCalls.push({ ownerId, document });
    });
    const created = useDrawingStore.getState().createDocument('未命名线束图') as DrawingDocument;

    await useDrawingStore.getState().saveActiveDocument();

    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0]?.document.id).toBe(created.id);
    expect(useDrawingStore.getState().saveState).toBe('saved');
  });

  it('saves a blank document as soon as it is edited', async () => {
    vi.spyOn(drawingDocumentRepository, 'save').mockImplementation(async (ownerId, document) => {
      saveCalls.push({ ownerId, document });
    });
    const created = useDrawingStore.getState().createDocument('未命名线束图') as DrawingDocument;
    useDrawingStore.getState().updateDocument({ ...created, name: '开始编辑', updatedAt: 20 });

    await vi.advanceTimersByTimeAsync(500);

    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0]?.document.name).toBe('开始编辑');
  });

  it('clears a restored draft whose revision is higher than the in-memory revision', async () => {
    vi.spyOn(drawingDocumentRepository, 'save').mockResolvedValue();
    const document = { ...createBlankDrawingDocument('云端版本'), id: 'doc-restored' };
    writeWorkspaceDraft({
      ownerId: 'user-a',
      kind: 'drawing',
      documentId: document.id,
      revision: 20,
      baseUpdatedAt: 1,
      document,
    });

    restoreDrawingDraft(document, 20);
    expect(readWorkspaceDraft('user-a', 'drawing', document.id)?.revision).toBe(20);

    await vi.advanceTimersByTimeAsync(500);

    expect(readWorkspaceDraft('user-a', 'drawing', document.id)).toBeNull();
    expect(useDrawingStore.getState().saveState).toBe('saved');
  });
});

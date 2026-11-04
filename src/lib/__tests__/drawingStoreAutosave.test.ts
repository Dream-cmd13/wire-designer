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
import { DocumentWriteError } from '@/lib/documentWriteError';
import { listCorruptWorkspaceDrafts, readWorkspaceDraft, removeWorkspaceDraft, workspaceDraftKey, writeWorkspaceDraft } from '@/lib/workspaceDraftCache';
import type { DocumentVersion } from '@/types/document';
import type { DrawingDocument } from '@/types/drawing';

interface SaveCall {
  ownerId: string;
  document: DrawingDocument;
  expected: DocumentVersion | null;
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
let saveVersionCounter: number;

function nextVersion(): DocumentVersion {
  saveVersionCounter += 1;
  return { revision: saveVersionCounter, updatedAt: `saved-${saveVersionCounter}` };
}

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
    saveVersionCounter = 0;
    vi.spyOn(drawingDocumentRepository, 'list').mockResolvedValue([]);
    await hydrateDrawingStore('user-a');
  });

  afterEach(() => {
    useDrawingStore.setState({ documents: {}, activeDocumentId: null, saveState: 'saved', saveConflict: null });
    vi.useRealTimers();
  });

  it('saves the latest edits made while a save request is in flight', async () => {
    const gate = deferred();
    vi.spyOn(drawingDocumentRepository, 'save').mockImplementation(async (ownerId, document, expected) => {
      saveCalls.push({ ownerId, document, expected });
      if (saveCalls.length === 1) await gate.promise;
      return nextVersion();
    });

    const created = await startEditing('v1');
    await vi.advanceTimersByTimeAsync(500);
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0]?.document.name).toBe('v1');
    expect(saveCalls[0]?.expected).toBeNull();

    useDrawingStore.getState().updateDocument({ ...created, name: 'v2', updatedAt: 11 });
    gate.resolve();
    await flushDrawingSaves();

    expect(saveCalls.map((call) => call.document.name)).toEqual(['v1', 'v2']);
    expect(saveCalls[1]?.expected).toEqual({ revision: 1, updatedAt: 'saved-1' });
    expect(useDrawingStore.getState().saveState).toBe('saved');
  });

  it('coalesces rapid edits and only writes the newest snapshot', async () => {
    const save = vi.spyOn(drawingDocumentRepository, 'save').mockImplementation(async (ownerId, document, expected) => {
      saveCalls.push({ ownerId, document, expected });
      return nextVersion();
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
      .mockImplementation(async (ownerId, document, expected) => {
        saveCalls.push({ ownerId, document, expected });
        return nextVersion();
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
      .mockImplementation(async (ownerId, document, expected) => {
        saveCalls.push({ ownerId, document, expected });
        return nextVersion();
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
    const save = vi.spyOn(drawingDocumentRepository, 'save').mockImplementation(async (ownerId, document, expected) => {
      saveCalls.push({ ownerId, document, expected });
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (saveCalls.length === 1) await gate.promise;
      active -= 1;
      return nextVersion();
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
    const save = vi.spyOn(drawingDocumentRepository, 'save').mockImplementation(async (ownerId, document, expected) => {
      saveCalls.push({ ownerId, document, expected });
      await gate.promise;
      return nextVersion();
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
    expect(remove).toHaveBeenCalledWith('user-a', created.id, expect.objectContaining({ revision: expect.any(Number) }));
    expect(useDrawingStore.getState().documents[created.id]).toBeUndefined();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('waits for pending edits immediately through flushDrawingSaves', async () => {
    vi.spyOn(drawingDocumentRepository, 'save').mockImplementation(async (ownerId, document, expected) => {
      saveCalls.push({ ownerId, document, expected });
      return nextVersion();
    });

    await startEditing('v1');
    await flushDrawingSaves();

    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0]?.document.name).toBe('v1');
    expect(useDrawingStore.getState().saveState).toBe('saved');
  });

  it('drops stale save results after the drawing session is reset', async () => {
    const gate = deferred();
    vi.spyOn(drawingDocumentRepository, 'save').mockImplementation(async (ownerId, document, expected) => {
      saveCalls.push({ ownerId, document, expected });
      await gate.promise;
      return nextVersion();
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
      return nextVersion();
    });

    const created = await startEditing('v1');
    await vi.advanceTimersByTimeAsync(1000);

    const draft = readWorkspaceDraft('user-a', 'drawing', created.id);
    expect(draft?.localRevision).toBe(2);
    expect(draft?.baseServerRevision).toBeNull();
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
    expect(draft?.localRevision).toBe(2);

    resetDrawingStore();
    expect(readWorkspaceDraft('user-a', 'drawing', created.id)?.localRevision).toBe(2);
    removeWorkspaceDraft('user-a', 'drawing', created.id, draft?.draftId);
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
      return nextVersion();
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
    expect(readWorkspaceDraft('user-a', 'drawing', created.id)?.localRevision).toBe(2);

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
    vi.spyOn(drawingDocumentRepository, 'save').mockResolvedValue(nextVersion());
    const document = await startEditing('v1');
    await vi.advanceTimersByTimeAsync(500);
    expect(useDrawingStore.getState().saveState).toBe('saved');

    useDrawingStore.getState().updateDocument({ ...document, name: 'v2', updatedAt: 11 });

    expect(useDrawingStore.getState().saveState).toBe('dirty');
  });

  it('does not persist or back up an untouched blank document', async () => {
    const save = vi.spyOn(drawingDocumentRepository, 'save').mockResolvedValue(nextVersion());
    const created = useDrawingStore.getState().createDocument('未命名线束图') as DrawingDocument;

    await vi.advanceTimersByTimeAsync(2000);

    expect(save).not.toHaveBeenCalled();
    expect(readWorkspaceDraft('user-a', 'drawing', created.id)).toBeNull();
    expect(useDrawingStore.getState().saveState).toBe('saved');
  });

  it('persists a blank document when the user saves it manually', async () => {
    vi.spyOn(drawingDocumentRepository, 'save').mockImplementation(async (ownerId, document, expected) => {
      saveCalls.push({ ownerId, document, expected });
      return nextVersion();
    });
    const created = useDrawingStore.getState().createDocument('未命名线束图') as DrawingDocument;

    await useDrawingStore.getState().saveActiveDocument();

    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0]?.document.id).toBe(created.id);
    expect(saveCalls[0]?.expected).toBeNull();
    expect(useDrawingStore.getState().saveState).toBe('saved');
  });

  it('saves a blank document as soon as it is edited', async () => {
    vi.spyOn(drawingDocumentRepository, 'save').mockImplementation(async (ownerId, document, expected) => {
      saveCalls.push({ ownerId, document, expected });
      return nextVersion();
    });
    const created = useDrawingStore.getState().createDocument('未命名线束图') as DrawingDocument;
    useDrawingStore.getState().updateDocument({ ...created, name: '开始编辑', updatedAt: 20 });

    await vi.advanceTimersByTimeAsync(500);

    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0]?.document.name).toBe('开始编辑');
  });

  it('clears a restored draft whose revision is higher than the in-memory revision', async () => {
    vi.spyOn(drawingDocumentRepository, 'save').mockResolvedValue(nextVersion());
    const document = { ...createBlankDrawingDocument('云端版本'), id: 'doc-restored' };
    writeWorkspaceDraft({
      ownerId: 'user-a',
      kind: 'drawing',
      documentId: document.id,
      localRevision: 20,
      baseServerRevision: 1,
      document,
    });

    restoreDrawingDraft(document, 20, 1);
    expect(readWorkspaceDraft('user-a', 'drawing', document.id)?.localRevision).toBe(20);

    await vi.advanceTimersByTimeAsync(500);

    expect(readWorkspaceDraft('user-a', 'drawing', document.id)).toBeNull();
    expect(useDrawingStore.getState().saveState).toBe('saved');
  });

  it('pauses autosave and keeps local content when the cloud version conflicts', async () => {
    const conflict = new DocumentWriteError('conflict', '云端已有更新的版本，本次保存未覆盖本地内容。请选择恢复方式。');
    const save = vi.spyOn(drawingDocumentRepository, 'save').mockRejectedValue(conflict);

    const created = await startEditing('v1');
    await vi.advanceTimersByTimeAsync(500);

    expect(save).toHaveBeenCalledTimes(1);
    expect(useDrawingStore.getState().saveConflict).toEqual({ documentId: created.id, kind: 'conflict' });
    expect(useDrawingStore.getState().documents[created.id]?.name).toBe('v1');

    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);

    expect(readWorkspaceDraft('user-a', 'drawing', created.id)?.localRevision).toBe(2);
  });

  it('pauses autosave and offers recovery when the cloud drawing was deleted', async () => {
    const missing = new DocumentWriteError('missing', '该文档已在云端被删除，本次保存未写入；本地内容仍保留。');
    const save = vi.spyOn(drawingDocumentRepository, 'save').mockRejectedValue(missing);

    const created = await startEditing('v1');
    await vi.advanceTimersByTimeAsync(500);

    expect(save).toHaveBeenCalledTimes(1);
    expect(useDrawingStore.getState().saveConflict).toEqual({ documentId: created.id, kind: 'missing' });
    expect(useDrawingStore.getState().saveState).toBe('error');
    expect(useDrawingStore.getState().documents[created.id]?.name).toBe('v1');

    // 云端删除不能触发自动重试，也不能复活旧记录
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(readWorkspaceDraft('user-a', 'drawing', created.id)?.localRevision).toBe(2);
  });

  it('reads the cloud version only after an explicit conflict resolution', async () => {
    const conflict = new Error('Version conflict') as Error & { code?: string };
    conflict.code = 'P0002';
    vi.spyOn(drawingDocumentRepository, 'save').mockRejectedValue(conflict);
    const cloudDocument = { ...createBlankDrawingDocument('云端最新'), id: 'drawing-conflict' };
    const load = vi.spyOn(drawingDocumentRepository, 'load').mockResolvedValue({
      document: cloudDocument,
      version: { revision: 9, updatedAt: 'cloud-9' },
    });

    useDrawingStore.setState({
      documents: { [cloudDocument.id]: { ...createBlankDrawingDocument('本地修改'), id: cloudDocument.id } },
      activeDocumentId: cloudDocument.id,
      saveState: 'error',
      saveConflict: { documentId: cloudDocument.id, kind: 'conflict' },
    });

    const result = await useDrawingStore.getState().resolveConflictReadCloud(cloudDocument.id);

    expect(load).toHaveBeenCalledWith(cloudDocument.id);
    expect(result).toBe('replaced');
    expect(useDrawingStore.getState().saveConflict).toBeNull();
    expect(useDrawingStore.getState().documents[cloudDocument.id]?.name).toBe('云端最新');
    expect(useDrawingStore.getState().saveState).toBe('saved');
  });

  it('saves the conflicted local content as a new drawing with a fresh id', async () => {
    vi.spyOn(drawingDocumentRepository, 'save').mockImplementation(async (ownerId, document, expected) => {
      saveCalls.push({ ownerId, document, expected });
      return nextVersion();
    });
    const original = { ...createBlankDrawingDocument('冲突图纸'), id: 'drawing-original' };
    useDrawingStore.setState({
      documents: { [original.id]: original },
      activeDocumentId: original.id,
      saveState: 'error',
      saveConflict: { documentId: original.id, kind: 'conflict' },
    });

    const copy = await useDrawingStore.getState().saveAsNewDocument(original.id);

    expect(copy).not.toBeNull();
    expect(copy!.id).not.toBe(original.id);
    expect(copy!.name).toContain('本地副本');
    await flushDrawingSaves();
    expect(saveCalls.at(-1)?.document.id).toBe(copy!.id);
    expect(saveCalls.at(-1)?.expected).toBeNull();
    expect(useDrawingStore.getState().activeDocumentId).toBe(copy!.id);
  });

  it('pauses autosave for a legacy draft without a baseline and never recreates a deleted drawing id', async () => {
    const save = vi.spyOn(drawingDocumentRepository, 'save').mockResolvedValue(nextVersion());
    const document = { ...createBlankDrawingDocument('旧草稿'), id: 'drawing-legacy-deleted' };

    restoreDrawingDraft(document, 20, null);

    expect(useDrawingStore.getState().saveConflict).toEqual({ documentId: document.id, kind: 'unconfirmed' });
    expect(useDrawingStore.getState().saveState).toBe('error');
    expect(useDrawingStore.getState().documents[document.id]?.name).toBe('旧草稿');

    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();

    // 只有用户明确“另存为新图纸”才生成新 ID 创建
    const copy = await useDrawingStore.getState().saveAsNewDocument(document.id);
    expect(copy).not.toBeNull();
    expect(copy!.id).not.toBe(document.id);
    await flushDrawingSaves();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[1].id).toBe(copy!.id);
    expect(save.mock.calls[0]?.[2]).toBeNull();
    expect(save.mock.calls.every(([, saved]) => saved.id !== document.id)).toBe(true);
  });

  it('rejects manual save instead of reporting success when the first attempt conflicts or the cloud row is gone', async () => {
    const save = vi.spyOn(drawingDocumentRepository, 'save')
      .mockRejectedValue(new DocumentWriteError('conflict', '云端已有更新的版本，本次保存未覆盖本地内容。'));
    const first = useDrawingStore.getState().createDocument('第一张') as DrawingDocument;

    await expect(useDrawingStore.getState().saveActiveDocument()).rejects.toThrow(/版本冲突/);
    expect(useDrawingStore.getState().saveConflict).toEqual({ documentId: first.id, kind: 'conflict' });

    save.mockRejectedValue(new DocumentWriteError('missing', '该文档已在云端被删除，本次保存未写入。'));
    const second = useDrawingStore.getState().createDocument('第二张') as DrawingDocument;

    await expect(useDrawingStore.getState().saveActiveDocument()).rejects.toThrow(/云端删除/);
    expect(useDrawingStore.getState().saveConflict).toEqual({ documentId: second.id, kind: 'missing' });
  });
  it('waits for a new copy to persist and backs it up before the request finishes', async () => {
    const gate = deferred();
    vi.spyOn(drawingDocumentRepository, 'save').mockImplementation(async () => {
      await gate.promise;
      return nextVersion();
    });
    const original = { ...createBlankDrawingDocument('冲突图纸'), id: 'copy-source' };
    useDrawingStore.setState({ documents: { [original.id]: original }, activeDocumentId: original.id });
    let finished = false;
    const saving = Promise.resolve(useDrawingStore.getState().saveAsNewDocument(original.id))
      .then((copy) => { finished = true; return copy; });
    await Promise.resolve();
    expect(finished).toBe(false);
    const newId = useDrawingStore.getState().activeDocumentId!;
    expect(readWorkspaceDraft('user-a', 'drawing', newId)?.document).toMatchObject({ name: '冲突图纸（本地副本）' });
    gate.resolve();
    const copy = await saving;
    expect(copy?.id).toBe(newId);
    expect(useDrawingStore.getState().saveState).toBe('saved');
  });

  it.each(['network', 'forbidden'] as const)('rejects a failed new-copy save (%s) and retains its recovery draft', async (code) => {
    vi.spyOn(drawingDocumentRepository, 'save').mockRejectedValue(new DocumentWriteError(code, '云端保存失败'));
    const original = { ...createBlankDrawingDocument('冲突图纸'), id: 'copy-source' };
    useDrawingStore.setState({ documents: { [original.id]: original }, activeDocumentId: original.id });
    await expect(Promise.resolve(useDrawingStore.getState().saveAsNewDocument(original.id)))
      .rejects.toThrow(/保存失败/);
    const newId = useDrawingStore.getState().activeDocumentId!;
    expect(useDrawingStore.getState().saveState).toBe('error');
    expect(readWorkspaceDraft('user-a', 'drawing', newId)).not.toBeNull();
    expect(useDrawingStore.getState().documents[original.id]).toEqual(original);
  });

});

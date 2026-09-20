import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canApplyWorkspaceDraft,
  corruptWorkspaceDraftsToJson,
  listCorruptWorkspaceDrafts,
  listWorkspaceDrafts,
  readWorkspaceDraft,
  removeCorruptWorkspaceDraft,
  removeWorkspaceDraft,
  removeWorkspaceDraftIfRevisionAtMost,
  workspaceDraftKey,
  writeWorkspaceDraft,
} from '@/lib/workspaceDraftCache';
import { createBlankDrawingDocument } from '@/lib/drawingDocument';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';

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

function drawingDraft(ownerId: string, documentId: string, revision: number) {
  const document = { ...createBlankDrawingDocument('草稿'), id: documentId };
  return {
    ownerId,
    kind: 'drawing' as const,
    documentId,
    revision,
    baseUpdatedAt: 1,
    document,
  };
}

describe('workspace draft cache', () => {
  let storageMock: Storage;

  beforeEach(() => {
    storageMock = createMockStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: storageMock,
      writable: true,
      configurable: true,
    });
  });

  it('stores and reads drafts per account and document', () => {
    expect(writeWorkspaceDraft(drawingDraft('user-a', 'doc-1', 3)).ok).toBe(true);
    expect(writeWorkspaceDraft(drawingDraft('user-b', 'doc-1', 1)).ok).toBe(true);

    expect(readWorkspaceDraft('user-a', 'drawing', 'doc-1')?.revision).toBe(3);
    expect(readWorkspaceDraft('user-b', 'drawing', 'doc-1')?.revision).toBe(1);
    expect(readWorkspaceDraft('user-a', 'drawing', 'doc-2')).toBeNull();
    expect(readWorkspaceDraft('user-b', 'project', 'doc-1')).toBeNull();
  });

  it('does not return corrupted or mismatched drafts', () => {
    const key = workspaceDraftKey('user-a', 'project', 'p1');
    localStorage.setItem(key, '{not json');
    expect(readWorkspaceDraft('user-a', 'project', 'p1')).toBeNull();

    localStorage.setItem(key, JSON.stringify({
      version: 1,
      ownerId: 'user-b',
      kind: 'project',
      documentId: 'p1',
      revision: 1,
      baseUpdatedAt: 1,
      savedAt: 1,
      document: createFallbackConfig(),
    }));
    expect(readWorkspaceDraft('user-a', 'project', 'p1')).toBeNull();
  });

  it('isolates a corrupt draft into a separate key instead of deleting it', () => {
    const draft = drawingDraft('user-a', 'doc-broken', 1);
    draft.document = { ...draft.document, objects: [null] } as unknown as typeof draft.document;
    writeWorkspaceDraft(draft);
    const draftKey = workspaceDraftKey('user-a', 'drawing', 'doc-broken');

    const corrupt = listCorruptWorkspaceDrafts('user-a', 'drawing');
    expect(corrupt).toHaveLength(1);
    expect(corrupt[0]).toMatchObject({ ownerId: 'user-a', kind: 'drawing', documentId: 'doc-broken' });
    expect(corrupt[0]!.key).toContain('wh_draft_corrupt_v1');
    expect(corrupt[0]!.key).not.toBe(draftKey);
    expect(JSON.parse(corrupt[0]!.raw)).toMatchObject({ documentId: 'doc-broken' });
    expect(corruptWorkspaceDraftsToJson(corrupt)).toContain('doc-broken');

    expect(localStorage.getItem(draftKey)).toBeNull();
    expect(readWorkspaceDraft('user-a', 'drawing', 'doc-broken')).toBeNull();
    expect(listWorkspaceDrafts('user-a', 'drawing')).toEqual([]);

    removeCorruptWorkspaceDraft(corrupt[0]!);
    expect(listCorruptWorkspaceDrafts('user-a', 'drawing')).toEqual([]);
  });

  it('does not let a new backup overwrite an isolated corrupt draft', () => {
    const documentId = 'doc-regression';
    const draftKey = workspaceDraftKey('user-a', 'drawing', documentId);
    const corruptRaw = JSON.stringify({ version: 1, ownerId: 'user-a', kind: 'drawing', documentId, revision: 1, baseUpdatedAt: 1, savedAt: 1, document: { schemaVersion: 1, id: documentId, name: 'x', updatedAt: 1, objects: [null] } });
    localStorage.setItem(draftKey, corruptRaw);

    expect(writeWorkspaceDraft(drawingDraft('user-a', documentId, 7)).ok).toBe(true);

    const valid = readWorkspaceDraft('user-a', 'drawing', documentId);
    expect(valid?.revision).toBe(7);
    const corrupt = listCorruptWorkspaceDrafts('user-a', 'drawing');
    expect(corrupt.map((entry) => entry.raw)).toEqual([corruptRaw]);

    expect(removeWorkspaceDraftIfRevisionAtMost('user-a', 'drawing', documentId, 7)).toBe(true);
    expect(readWorkspaceDraft('user-a', 'drawing', documentId)).toBeNull();
    expect(listCorruptWorkspaceDrafts('user-a', 'drawing').map((entry) => entry.raw)).toEqual([corruptRaw]);
  });

  it('still lists and allows discarding a corrupt draft when isolation fails', () => {
    const draftKey = workspaceDraftKey('user-a', 'drawing', 'doc-quota');
    const corruptRaw = '{"not":"a valid draft"}';
    localStorage.setItem(draftKey, corruptRaw);
    vi.spyOn(storageMock, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const corrupt = listCorruptWorkspaceDrafts('user-a', 'drawing');
    expect(corrupt).toHaveLength(1);
    expect(corrupt[0]).toMatchObject({
      ownerId: 'user-a',
      kind: 'drawing',
      documentId: 'doc-quota',
      raw: corruptRaw,
      isolated: false,
      key: draftKey,
    });
    expect(localStorage.getItem(draftKey)).toBe(corruptRaw);
    const exported = JSON.parse(corruptWorkspaceDraftsToJson(corrupt)) as Array<Record<string, unknown>>;
    expect(exported[0]).toMatchObject({ raw: corruptRaw, isolated: false });

    removeCorruptWorkspaceDraft(corrupt[0]!);
    expect(localStorage.getItem(draftKey)).toBeNull();
    expect(listCorruptWorkspaceDrafts('user-a', 'drawing')).toEqual([]);
  });

  it('does not delete a newer draft when discarding a stale corrupt prompt', () => {
    const documentId = 'doc-stale';
    const draftKey = workspaceDraftKey('user-a', 'drawing', documentId);
    const corruptRaw = '{"not":"a valid draft"}';
    localStorage.setItem(draftKey, corruptRaw);
    const setItem = vi.spyOn(storageMock, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const stalePrompt = listCorruptWorkspaceDrafts('user-a', 'drawing');
    expect(stalePrompt).toHaveLength(1);
    expect(stalePrompt[0]).toMatchObject({ isolated: false, raw: corruptRaw, key: draftKey });

    setItem.mockRestore();
    expect(writeWorkspaceDraft(drawingDraft('user-a', documentId, 5)).ok).toBe(true);
    expect(readWorkspaceDraft('user-a', 'drawing', documentId)?.revision).toBe(5);
    const quarantined = listCorruptWorkspaceDrafts('user-a', 'drawing');
    expect(quarantined.map((entry) => entry.raw)).toEqual([corruptRaw]);

    expect(removeCorruptWorkspaceDraft(stalePrompt[0]!)).toBe(false);
    expect(readWorkspaceDraft('user-a', 'drawing', documentId)?.revision).toBe(5);

    expect(removeCorruptWorkspaceDraft(quarantined[0]!)).toBe(true);
    expect(readWorkspaceDraft('user-a', 'drawing', documentId)?.revision).toBe(5);
    expect(listCorruptWorkspaceDrafts('user-a', 'drawing')).toEqual([]);
  });

  it('reports storage failures instead of claiming the draft is backed up', () => {
    vi.spyOn(storageMock, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const result = writeWorkspaceDraft(drawingDraft('user-a', 'doc-1', 1));

    expect(result.ok).toBe(false);
    expect(result.error).toContain('本地存储空间不足');
    expect(result.error).not.toContain('QuotaExceededError');
  });

  it('converts browser storage denial into a Chinese user message', () => {
    vi.spyOn(storageMock, 'setItem').mockImplementation(() => {
      throw new Error('Access is denied for this document');
    });

    const result = writeWorkspaceDraft(drawingDraft('user-a', 'doc-1', 1));

    expect(result.ok).toBe(false);
    expect(result.error).toContain('浏览器阻止了本机存储');
    expect(result.error).not.toContain('Access is denied');
  });

  it('keeps a newer draft when an older revision is confirmed', () => {
    writeWorkspaceDraft(drawingDraft('user-a', 'doc-1', 5));

    expect(removeWorkspaceDraftIfRevisionAtMost('user-a', 'drawing', 'doc-1', 4)).toBe(false);
    expect(readWorkspaceDraft('user-a', 'drawing', 'doc-1')?.revision).toBe(5);

    expect(removeWorkspaceDraftIfRevisionAtMost('user-a', 'drawing', 'doc-1', 5)).toBe(true);
    expect(readWorkspaceDraft('user-a', 'drawing', 'doc-1')).toBeNull();
  });

  it('lists only the drafts that belong to the requested account and kind', () => {
    writeWorkspaceDraft(drawingDraft('user-a', 'doc-1', 1));
    writeWorkspaceDraft(drawingDraft('user-a', 'doc-2', 2));
    writeWorkspaceDraft({
      ownerId: 'user-a',
      kind: 'project',
      documentId: 'p1',
      revision: 1,
      baseUpdatedAt: 0,
      document: createFallbackConfig(),
    });
    writeWorkspaceDraft(drawingDraft('user-b', 'doc-3', 1));

    expect(listWorkspaceDrafts('user-a', 'drawing').map((draft) => draft.documentId).sort())
      .toEqual(['doc-1', 'doc-2']);
    expect(listWorkspaceDrafts('user-b', 'drawing').map((draft) => draft.documentId))
      .toEqual(['doc-3']);
  });

  it('removes a draft explicitly', () => {
    writeWorkspaceDraft(drawingDraft('user-a', 'doc-1', 1));
    removeWorkspaceDraft('user-a', 'drawing', 'doc-1');
    expect(readWorkspaceDraft('user-a', 'drawing', 'doc-1')).toBeNull();
  });

  it('only applies a draft when account and document still match', () => {
    const draft = drawingDraft('user-a', 'doc-1', 1);

    expect(canApplyWorkspaceDraft(draft, { ownerId: 'user-a', documentId: 'doc-1' })).toBe(true);
    expect(canApplyWorkspaceDraft(draft, { ownerId: 'user-b', documentId: 'doc-1' })).toBe(false);
    expect(canApplyWorkspaceDraft(draft, { ownerId: null, documentId: 'doc-1' })).toBe(false);
    expect(canApplyWorkspaceDraft(draft, { ownerId: 'user-a', documentId: 'doc-2' })).toBe(false);
    expect(canApplyWorkspaceDraft(draft, { ownerId: 'user-a', documentId: null })).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canApplyWorkspaceDraft,
  listWorkspaceDrafts,
  readWorkspaceDraft,
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

  it('drops corrupted or mismatched drafts instead of returning them', () => {
    const key = workspaceDraftKey('user-a', 'project', 'p1');
    localStorage.setItem(key, '{not json');
    expect(readWorkspaceDraft('user-a', 'project', 'p1')).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();

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

  it('reports storage failures instead of claiming the draft is backed up', () => {
    vi.spyOn(storageMock, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const result = writeWorkspaceDraft(drawingDraft('user-a', 'doc-1', 1));

    expect(result.ok).toBe(false);
    expect(result.error).toContain('QuotaExceededError');
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

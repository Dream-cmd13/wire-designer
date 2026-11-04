import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { DraftWriteInput } from '@/lib/workspaceDraftCache';
let {
  canApplyWorkspaceDraft,
  corruptWorkspaceDraftsToJson,
  currentDraftInstanceId,
  listCorruptWorkspaceDrafts,
  listWorkspaceDrafts,
  readWorkspaceDraft,
  removeCorruptWorkspaceDraft,
  removeWorkspaceDraft,
  removeWorkspaceDraftForInstance,
  removeWorkspaceDraftIfRevisionAtMost,
  workspaceDraftKey,
  writeWorkspaceDraft,
} = await import('@/lib/workspaceDraftCache');
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

function drawingDraft(ownerId: string, documentId: string, localRevision: number, baseServerRevision: number | null = 1): DraftWriteInput {
  const document = { ...createBlankDrawingDocument('草稿'), id: documentId };
  return {
    ownerId,
    kind: 'drawing' as const,
    documentId,
    localRevision,
    baseServerRevision,
    document,
  };
}

async function useInstance(id: string): Promise<void> {
  sessionStorage.setItem('wh_draft_instance', id);
  vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValueOnce(id).mockImplementation(randomUUID) });
  vi.resetModules();
  ({ canApplyWorkspaceDraft, corruptWorkspaceDraftsToJson, currentDraftInstanceId,
    listCorruptWorkspaceDrafts, listWorkspaceDrafts, readWorkspaceDraft,
    removeCorruptWorkspaceDraft, removeWorkspaceDraft, removeWorkspaceDraftForInstance,
    removeWorkspaceDraftIfRevisionAtMost, workspaceDraftKey, writeWorkspaceDraft,
  } = await import('@/lib/workspaceDraftCache'));
  currentDraftInstanceId();
}

describe('workspace draft cache v2', () => {
  let storageMock: Storage;
  let sessionMock: Storage;

  beforeEach(async () => {
    storageMock = createMockStorage();
    sessionMock = createMockStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: storageMock,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: sessionMock,
      writable: true,
      configurable: true,
    });
    await useInstance('instance-a');
  });

  it('stores and reads drafts per account and document', () => {
    expect(writeWorkspaceDraft(drawingDraft('user-a', 'doc-1', 3)).ok).toBe(true);
    expect(writeWorkspaceDraft(drawingDraft('user-b', 'doc-1', 1)).ok).toBe(true);

    expect(readWorkspaceDraft('user-a', 'drawing', 'doc-1')?.localRevision).toBe(3);
    expect(readWorkspaceDraft('user-b', 'drawing', 'doc-1')?.localRevision).toBe(1);
    expect(readWorkspaceDraft('user-a', 'drawing', 'doc-2')).toBeNull();
    expect(readWorkspaceDraft('user-b', 'project', 'doc-1')).toBeNull();
    expect(currentDraftInstanceId()).toBe('instance-a');
  });

  it('never overwrites another window draft for the same document', async () => {
    writeWorkspaceDraft(drawingDraft('user-a', 'doc-1', 2));
    await useInstance('instance-b');
    writeWorkspaceDraft(drawingDraft('user-a', 'doc-1', 5));

    const drafts = listWorkspaceDrafts('user-a', 'drawing', 'doc-1');
    expect(drafts.map((draft) => draft.localRevision).sort()).toEqual([2, 5]);
    expect(new Set(drafts.map((draft) => draft.draftId)).size).toBe(2);

    const aDraft = drafts.find((draft) => draft.instanceId === 'instance-a')!;
    removeWorkspaceDraft('user-a', 'drawing', 'doc-1', aDraft.draftId);
    const remaining = listWorkspaceDrafts('user-a', 'drawing', 'doc-1');
    expect(remaining.map((draft) => draft.localRevision)).toEqual([5]);
  });

  it('isolates cloned sessionStorage and keeps the other page draft on save and reload', async () => {
    const parent = await import('@/lib/workspaceDraftCache');
    const parentId = parent.currentDraftInstanceId();
    parent.writeWorkspaceDraft(drawingDraft('user-a', 'cloned-page', 1));
    // A real opener copies sessionStorage; a new module simulates the child page runtime.
    vi.resetModules();
    const child = await import('@/lib/workspaceDraftCache');
    expect(child.currentDraftInstanceId()).not.toBe(parentId);
    child.writeWorkspaceDraft(drawingDraft('user-a', 'cloned-page', 1));
    expect(child.listWorkspaceDrafts('user-a', 'drawing', 'cloned-page')).toHaveLength(2);
    parent.removeWorkspaceDraftIfRevisionAtMost('user-a', 'drawing', 'cloned-page', 1);
    expect(child.listWorkspaceDrafts('user-a', 'drawing', 'cloned-page')).toHaveLength(1);
    vi.resetModules();
    const reloaded = await import('@/lib/workspaceDraftCache');
    expect(reloaded.currentDraftInstanceId()).not.toBe(child.currentDraftInstanceId());
    expect(reloaded.listWorkspaceDrafts('user-a', 'drawing', 'cloned-page')).toHaveLength(1);
  });

  it('keeps legacy v1 drafts as candidates until the user explicitly handles them', () => {
    const legacyKey = 'wh_draft_v1:user-a:drawing:doc-legacy';
    localStorage.setItem(legacyKey, JSON.stringify({
      version: 1,
      ownerId: 'user-a',
      kind: 'drawing',
      documentId: 'doc-legacy',
      revision: 4,
      baseUpdatedAt: 1,
      savedAt: 11,
      document: { ...createBlankDrawingDocument('旧草稿'), id: 'doc-legacy' },
    }));

    const candidates = listWorkspaceDrafts('user-a', 'drawing', 'doc-legacy');
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      draftId: 'legacy-v1',
      localRevision: 4,
      baseServerRevision: null,
    });

    // 写入新的 v2 草稿不会顺带删除尚未处理的旧草稿
    writeWorkspaceDraft(drawingDraft('user-a', 'doc-legacy', 9));
    expect(localStorage.getItem(legacyKey)).not.toBeNull();
    expect(listWorkspaceDrafts('user-a', 'drawing', 'doc-legacy').map((draft) => draft.localRevision).sort())
      .toEqual([4, 9]);

    // 用户明确丢弃旧候选时只删除旧键，保留 v2 草稿
    removeWorkspaceDraft('user-a', 'drawing', 'doc-legacy', 'legacy-v1');
    expect(localStorage.getItem(legacyKey)).toBeNull();
    expect(listWorkspaceDrafts('user-a', 'drawing', 'doc-legacy').map((draft) => draft.draftId))
      .toEqual([expect.any(String)]);
  });

  it('removing a legacy candidate never deletes other window v2 drafts', async () => {
    writeWorkspaceDraft(drawingDraft('user-a', 'doc-mixed', 2));
    await useInstance('instance-b');
    writeWorkspaceDraft(drawingDraft('user-a', 'doc-mixed', 5));
    localStorage.setItem('wh_draft_v1:user-a:drawing:doc-mixed', JSON.stringify({
      version: 1,
      ownerId: 'user-a',
      kind: 'drawing',
      documentId: 'doc-mixed',
      revision: 1,
      baseUpdatedAt: 1,
      savedAt: 9,
      document: { ...createBlankDrawingDocument('旧草稿'), id: 'doc-mixed' },
    }));

    expect(listWorkspaceDrafts('user-a', 'drawing', 'doc-mixed')).toHaveLength(3);
    removeWorkspaceDraft('user-a', 'drawing', 'doc-mixed', 'legacy-v1');

    const remaining = listWorkspaceDrafts('user-a', 'drawing', 'doc-mixed');
    expect(remaining.map((draft) => draft.instanceId).sort()).toEqual(['instance-a', 'instance-b']);
    expect(remaining.map((draft) => draft.localRevision).sort()).toEqual([2, 5]);
  });

  it('does not return corrupted or mismatched drafts', () => {
    const key = workspaceDraftKey('user-a', 'project', 'p1', 'instance-a');
    localStorage.setItem(key, '{not json');
    expect(readWorkspaceDraft('user-a', 'project', 'p1')).toBeNull();

    localStorage.setItem(key, JSON.stringify({
      version: 2,
      ownerId: 'user-b',
      kind: 'project',
      documentId: 'p1',
      draftId: 'x',
      instanceId: 'instance-a',
      localRevision: 1,
      baseServerRevision: null,
      savedAt: 1,
      document: createFallbackConfig(),
    }));
    expect(readWorkspaceDraft('user-a', 'project', 'p1')).toBeNull();
  });

  it('isolates a corrupt draft into a separate key instead of deleting it', () => {
    const draft = drawingDraft('user-a', 'doc-broken', 1);
    draft.document = { ...draft.document, objects: [null] } as unknown as typeof draft.document;
    writeWorkspaceDraft(draft);
    const draftKey = workspaceDraftKey('user-a', 'drawing', 'doc-broken', 'instance-a');

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
    const draftKey = workspaceDraftKey('user-a', 'drawing', documentId, 'instance-a');
    const corruptRaw = JSON.stringify({ version: 2, ownerId: 'user-a', kind: 'drawing', documentId, draftId: 'x', instanceId: 'instance-a', localRevision: 1, baseServerRevision: null, savedAt: 1, document: { schemaVersion: 1, id: documentId, name: 'x', updatedAt: 1, objects: [null] } });
    localStorage.setItem(draftKey, corruptRaw);

    expect(writeWorkspaceDraft(drawingDraft('user-a', documentId, 7)).ok).toBe(true);

    const valid = readWorkspaceDraft('user-a', 'drawing', documentId);
    expect(valid?.localRevision).toBe(7);
    const corrupt = listCorruptWorkspaceDrafts('user-a', 'drawing');
    expect(corrupt.map((entry) => entry.raw)).toEqual([corruptRaw]);

    expect(removeWorkspaceDraftIfRevisionAtMost('user-a', 'drawing', documentId, 7)).toBe(true);
    expect(readWorkspaceDraft('user-a', 'drawing', documentId)).toBeNull();
    expect(listCorruptWorkspaceDrafts('user-a', 'drawing').map((entry) => entry.raw)).toEqual([corruptRaw]);
  });

  it('still lists and allows discarding a corrupt draft when isolation fails', () => {
    const draftKey = workspaceDraftKey('user-a', 'drawing', 'doc-quota', 'instance-a');
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
    expect(readWorkspaceDraft('user-a', 'drawing', 'doc-1')?.localRevision).toBe(5);

    expect(removeWorkspaceDraftIfRevisionAtMost('user-a', 'drawing', 'doc-1', 5)).toBe(true);
    expect(readWorkspaceDraft('user-a', 'drawing', 'doc-1')).toBeNull();
  });

  it('does not clean another instance draft on confirmed save', async () => {
    writeWorkspaceDraft(drawingDraft('user-a', 'doc-1', 3));
    await useInstance('instance-b');
    writeWorkspaceDraft(drawingDraft('user-a', 'doc-1', 3));

    expect(removeWorkspaceDraftForInstance('user-a', 'drawing', 'doc-1', 'instance-b', 3)).toBe(true);
    expect(listWorkspaceDrafts('user-a', 'drawing', 'doc-1').map((draft) => draft.instanceId)).toEqual(['instance-a']);
    expect(removeWorkspaceDraftForInstance('user-a', 'drawing', 'doc-1', 'instance-b', 3)).toBe(false);
  });

  it('lists only the drafts that belong to the requested account and kind', () => {
    writeWorkspaceDraft(drawingDraft('user-a', 'doc-1', 1));
    writeWorkspaceDraft(drawingDraft('user-a', 'doc-2', 2));
    writeWorkspaceDraft({
      ownerId: 'user-a',
      kind: 'project',
      documentId: 'p1',
      localRevision: 1,
      baseServerRevision: null,
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
    expect(removeWorkspaceDraftIfRevisionAtMost('user-a', 'drawing', 'doc-1', 1)).toBe(true);
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

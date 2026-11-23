import { create } from 'zustand';
import { createBlankDrawingDocument, migrateLegacyDrawingTablePositions, patchDrawingObject } from '@/lib/drawingDocument';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import { listWorkspaceDrafts, removeWorkspaceDraft, writeWorkspaceDraft, type DraftWriteResult } from '@/lib/workspaceDraftCache';
import type { DrawingDocument, DrawingObject } from '@/types/drawing';

export type DrawingSaveState = 'saved' | 'dirty' | 'saving' | 'error';
export type DrawingHydrationResult = 'hydrated' | 'recovered' | 'failed';

const AUTO_SAVE_DELAY_MS = 500;
const ANONYMOUS_DRAWING_OWNER = 'anonymous';
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

interface DocumentSaveEntry {
  revision: number;
  savedRevision: number;
  error: string | null;
  pristine: boolean;
}

const documentSaves = new Map<string, DocumentSaveEntry>();

interface DrawingStore {
  ownerId: string | null;
  documents: Record<string, DrawingDocument>;
  activeDocumentId: string | null;
  saveState: DrawingSaveState;
  draftError: string | null;
  hydrationError: string | null;
  createDocument: (name?: string) => DrawingDocument;
  replaceWithNewDocument: (name?: string) => DrawingDocument;
  openDocument: (documentId: string) => void;
  updateDocument: (document: DrawingDocument) => void;
  updateObject: (objectId: string, patch: Partial<DrawingObject>) => void;
  removeDocument: (documentId: string) => void;
  renameDocument: (documentId: string, name: string) => void;
  saveActiveDocument: () => Promise<void>;
}

function getSaveEntry(documentId: string): DocumentSaveEntry {
  let entry = documentSaves.get(documentId);
  if (!entry) {
    entry = { revision: 0, savedRevision: 0, error: null, pristine: false };
    documentSaves.set(documentId, entry);
  }
  return entry;
}

function clearSaveScheduling(): void {
  if (autoSaveTimer !== null) clearTimeout(autoSaveTimer);
  autoSaveTimer = null;
  documentSaves.clear();
}

function syncSaveState(): void {
  const entries = [...documentSaves.values()];
  const saveState = entries.some((entry) => entry.error)
    ? 'error'
    : entries.some((entry) => entry.revision > entry.savedRevision) ? 'dirty' : 'saved';
  useDrawingStore.setState({ saveState });
}

/** 本地草稿就是正式保存内容；成功后不能再按云端同步逻辑清理。每个窗口只写自己的副本。 */
function writeDocumentSnapshot(documentId: string): DraftWriteResult {
  const entry = documentSaves.get(documentId);
  const { ownerId, documents } = useDrawingStore.getState();
  const document = documents[documentId];
  if (!entry || entry.revision <= entry.savedRevision) return { ok: true };
  if (document?.id !== documentId) return { ok: false, error: '图纸身份已变化，未能保存。' };
  const result = writeWorkspaceDraft({
    ownerId: ownerId ?? ANONYMOUS_DRAWING_OWNER,
    kind: 'drawing',
    documentId,
    localRevision: entry.revision,
    baseServerRevision: null,
    document,
  });
  entry.error = result.ok ? null : result.error ?? '图纸本地保存失败，请下载副本并重试。';
  if (result.ok) {
    entry.savedRevision = entry.revision;
    entry.pristine = false;
  }
  return result;
}

export function flushDrawingDrafts(): DraftWriteResult {
  if (autoSaveTimer !== null) clearTimeout(autoSaveTimer);
  autoSaveTimer = null;
  let result: DraftWriteResult = { ok: true };
  for (const documentId of documentSaves.keys()) {
    const saved = writeDocumentSnapshot(documentId);
    if (!saved.ok) result = saved;
  }
  useDrawingStore.setState({ draftError: result.ok ? null : result.error ?? '图纸本地保存失败。' });
  syncSaveState();
  return result;
}

function markDocumentEdited(documentId: string): void {
  const entry = getSaveEntry(documentId);
  entry.pristine = false;
  entry.revision += 1;
  entry.error = null;
  if (autoSaveTimer === null) {
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null;
      flushDrawingDrafts();
    }, AUTO_SAVE_DELAY_MS);
  }
}

export function hasPendingDrawingChanges(documentId?: string): boolean {
  const targetId = documentId ?? useDrawingStore.getState().activeDocumentId;
  const entry = targetId ? documentSaves.get(targetId) : undefined;
  return Boolean(entry && entry.revision > entry.savedRevision);
}

export const useDrawingStore = create<DrawingStore>((set, get) => ({
  ownerId: null,
  documents: {},
  activeDocumentId: null,
  saveState: 'saved',
  draftError: null,
  hydrationError: null,

  createDocument: (name) => {
    const document = createBlankDrawingDocument(name);
    getSaveEntry(document.id).pristine = true;
    set((state) => ({ documents: { ...state.documents, [document.id]: document }, activeDocumentId: document.id }));
    syncSaveState();
    return document;
  },

  replaceWithNewDocument: (name) => {
    const result = flushDrawingDrafts();
    if (!result.ok) throw new Error(result.error);
    clearSaveScheduling();
    set({ documents: {}, activeDocumentId: null });
    return get().createDocument(name);
  },

  openDocument: (documentId) => {
    if (!get().documents[documentId]) return;
    set({ activeDocumentId: documentId });
    syncSaveState();
  },

  updateDocument: (document) => {
    markDocumentEdited(document.id);
    set((state) => ({ documents: { ...state.documents, [document.id]: document }, activeDocumentId: document.id }));
    syncSaveState();
  },

  updateObject: (objectId, patch) => {
    const { activeDocumentId, documents } = get();
    const document = activeDocumentId ? documents[activeDocumentId] : undefined;
    if (!document) return;
    const next = patchDrawingObject(document, objectId, patch);
    if (next !== document) get().updateDocument(next);
  },

  removeDocument: (documentId) => {
    documentSaves.delete(documentId);
    removeWorkspaceDraft(get().ownerId ?? ANONYMOUS_DRAWING_OWNER, 'drawing', documentId);
    set((state) => {
      const documents = { ...state.documents };
      delete documents[documentId];
      const activeDocumentId = state.activeDocumentId === documentId ? Object.keys(documents)[0] ?? null : state.activeDocumentId;
      return { documents, activeDocumentId };
    });
    syncSaveState();
  },

  renameDocument: (documentId, name) => {
    const document = get().documents[documentId];
    if (document && name.trim()) get().updateDocument({ ...document, name: name.trim(), updatedAt: Date.now() });
  },

  saveActiveDocument: async () => {
    const { activeDocumentId } = get();
    if (!activeDocumentId) return;
    const entry = getSaveEntry(activeDocumentId);
    if (entry.pristine) entry.revision = entry.savedRevision + 1;
    const result = flushDrawingDrafts();
    if (!result.ok) throw new Error(result.error);
  },
}));

export async function flushDrawingSaves(): Promise<void> {
  flushDrawingDrafts();
}

export function resetDrawingStore(): void {
  clearSaveScheduling();
  useDrawingStore.setState({ ownerId: null, documents: {}, activeDocumentId: null, saveState: 'saved', draftError: null, hydrationError: null });
}

export function releaseDrawingStore(nextOwnerId: string | null): DraftWriteResult {
  const state = useDrawingStore.getState();
  if (state.ownerId === nextOwnerId) return { ok: true };
  const result = flushDrawingDrafts();
  if (result.ok) resetDrawingStore();
  return result;
}

export async function hydrateDrawingStore(ownerId: string | null = null): Promise<DrawingHydrationResult> {
  const release = releaseDrawingStore(ownerId);
  if (!release.ok) {
    useDrawingStore.setState({ hydrationError: release.error ?? '上一工作区的图纸未能保存，请检查浏览器存储后重试。' });
    return 'failed';
  }
  resetDrawingStore();
  useDrawingStore.setState({ ownerId });
  try {
    // listWorkspaceDrafts 对损坏记录进行隔离；存储被禁用则必须报错，不能误判为空库。
    void localStorage.length;
    const drafts = listWorkspaceDrafts(ownerId ?? ANONYMOUS_DRAWING_OWNER, 'drawing');
    const documents: Record<string, DrawingDocument> = {};
    for (const draft of drafts) {
      // 按实际保存时间取同一图纸最新的窗口副本，其他副本原样保留。
      if (documents[draft.documentId] || draft.document.id !== draft.documentId) continue;
      documents[draft.documentId] = draft.document as DrawingDocument;
      const entry = getSaveEntry(draft.documentId);
      entry.revision = draft.localRevision;
      entry.savedRevision = draft.localRevision;
    }
    for (const document of Object.values(documents)) {
      const migrated = migrateLegacyDrawingTablePositions(document);
      if (migrated === document) continue;
      documents[document.id] = migrated;
      markDocumentEdited(document.id);
    }
    // 迁移只改变内存及当前窗口副本，不删除旧草稿。
    useDrawingStore.setState({ documents, activeDocumentId: Object.keys(documents)[0] ?? null });
    syncSaveState();
    return Object.keys(documents).length ? 'hydrated' : 'recovered';
  } catch (error) {
    useDrawingStore.setState({ hydrationError: getUserErrorMessage(error, '本地图纸读取失败，请检查浏览器存储设置后重试。') });
    return 'failed';
  }
}

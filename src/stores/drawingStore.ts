import { create } from 'zustand';
import { createBlankDrawingDocument, migrateLegacyDrawingTablePositions, patchDrawingObject } from '@/lib/drawingDocument';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import {
  removeWorkspaceDraft,
  removeWorkspaceDraftIfRevisionAtMost,
  writeWorkspaceDraft,
  type DraftWriteResult,
} from '@/lib/workspaceDraftCache';
import { drawingDocumentRepository } from '@/repositories/drawingDocumentRepository';
import type { DrawingDocument, DrawingObject } from '@/types/drawing';

export type DrawingSaveState = 'saved' | 'dirty' | 'saving' | 'error';
export type DrawingHydrationResult = 'hydrated' | 'recovered' | 'failed';

const AUTO_SAVE_DELAY_MS = 500;
const DRAFT_WRITE_DELAY_MS = 1000;
const ANONYMOUS_DRAWING_OWNER = 'anonymous';

let activeDrawingOwner = ANONYMOUS_DRAWING_OWNER;
let hydrationToken = 0;
let saveSessionToken = 0;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let draftWriteTimer: ReturnType<typeof setTimeout> | null = null;

interface DocumentSaveEntry {
  revision: number;
  savedRevision: number;
  inFlight: Promise<void> | null;
  error: string | null;
}

const documentSaves = new Map<string, DocumentSaveEntry>();

interface DrawingStore {
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
    entry = { revision: 0, savedRevision: 0, inFlight: null, error: null };
    documentSaves.set(documentId, entry);
  }
  return entry;
}

function clearSaveScheduling(): void {
  if (autoSaveTimer !== null) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  if (draftWriteTimer !== null) {
    clearTimeout(draftWriteTimer);
    draftWriteTimer = null;
  }
  documentSaves.clear();
}

function setDraftError(message: string | null): void {
  if (useDrawingStore.getState().draftError !== message) {
    useDrawingStore.setState({ draftError: message });
  }
}

function writeDraftSnapshot(): DraftWriteResult {
  const ownerId = activeDrawingOwner;
  if (ownerId === ANONYMOUS_DRAWING_OWNER) return { ok: true };

  let failure: DraftWriteResult = { ok: true };
  for (const [documentId, entry] of documentSaves) {
    if (entry.revision <= entry.savedRevision) continue;
    const document = useDrawingStore.getState().documents[documentId];
    if (!document) continue;
    const result = writeWorkspaceDraft({
      ownerId,
      kind: 'drawing',
      documentId,
      revision: entry.revision,
      baseUpdatedAt: document.updatedAt,
      document,
    });
    if (!result.ok) failure = result;
  }
  setDraftError(failure.ok ? null : failure.error ?? '本地草稿备份失败。');
  return failure;
}

function scheduleDraftWrite(): void {
  if (draftWriteTimer !== null) return;
  draftWriteTimer = setTimeout(() => {
    draftWriteTimer = null;
    writeDraftSnapshot();
  }, DRAFT_WRITE_DELAY_MS);
}

export function flushDrawingDrafts(): DraftWriteResult {
  if (draftWriteTimer !== null) {
    clearTimeout(draftWriteTimer);
    draftWriteTimer = null;
  }
  return writeDraftSnapshot();
}

export function hasPendingDrawingChanges(documentId?: string): boolean {
  const targetId = documentId ?? useDrawingStore.getState().activeDocumentId;
  if (!targetId) return false;
  const entry = documentSaves.get(targetId);
  return Boolean(entry && entry.revision > entry.savedRevision);
}

export function restoreDrawingDraft(document: DrawingDocument, draftRevision: number): void {
  const entry = getSaveEntry(document.id);
  entry.revision = Math.max(entry.revision, draftRevision);
  entry.error = null;
  useDrawingStore.getState().updateDocument(document);
  syncSaveState();
}

function computeSaveState(): DrawingSaveState {
  const { activeDocumentId } = useDrawingStore.getState();
  if (!activeDocumentId) return 'saved';
  const entry = documentSaves.get(activeDocumentId);
  if (!entry) return 'saved';
  if (entry.error) return 'error';
  if (entry.revision > entry.savedRevision) return entry.inFlight ? 'saving' : 'dirty';
  return entry.inFlight ? 'saving' : 'saved';
}

function syncSaveState(): void {
  const next = computeSaveState();
  if (useDrawingStore.getState().saveState !== next) {
    useDrawingStore.setState({ saveState: next });
  }
}

async function persistDocument(ownerId: string, document: DrawingDocument): Promise<void> {
  if (ownerId === ANONYMOUS_DRAWING_OWNER) {
    throw new Error('请先登录后保存图纸。');
  }
  await drawingDocumentRepository.save(ownerId, document);
}

function startDocumentSave(documentId: string): Promise<void> {
  const entry = getSaveEntry(documentId);
  if (entry.inFlight) return entry.inFlight;
  if (entry.revision <= entry.savedRevision) return Promise.resolve();

  const sessionToken = saveSessionToken;
  const ownerId = activeDrawingOwner;

  const run = async (): Promise<void> => {
    while (true) {
      const current = documentSaves.get(documentId);
      if (!current || sessionToken !== saveSessionToken) return;
      if (current.revision <= current.savedRevision) return;
      const document = useDrawingStore.getState().documents[documentId];
      if (!document) return;

      const revision = current.revision;
      try {
        await persistDocument(ownerId, document);
      } catch (error) {
        if (sessionToken !== saveSessionToken) return;
        const after = documentSaves.get(documentId);
        if (!after) return;
        after.error = getUserErrorMessage(error, '图纸保存失败，请重试。');
        syncSaveState();
        return;
      }

      if (sessionToken !== saveSessionToken) return;
      const after = documentSaves.get(documentId);
      if (!after) return;
      after.savedRevision = Math.max(after.savedRevision, revision);
      after.error = null;
      removeWorkspaceDraftIfRevisionAtMost(ownerId, 'drawing', documentId, after.savedRevision);
      syncSaveState();
    }
  };

  const task = run();
  entry.inFlight = task;
  syncSaveState();
  void task.finally(() => {
    const after = documentSaves.get(documentId);
    if (after && after.inFlight === task) after.inFlight = null;
    syncSaveState();
  });
  return task;
}

function scheduleAutoSave(): void {
  if (autoSaveTimer !== null) return;
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    for (const [documentId, entry] of documentSaves) {
      if (entry.revision > entry.savedRevision && !entry.error) {
        void startDocumentSave(documentId);
      }
    }
  }, AUTO_SAVE_DELAY_MS);
}

function markDocumentEdited(documentId: string): void {
  const entry = getSaveEntry(documentId);
  entry.revision += 1;
  entry.error = null;
  scheduleAutoSave();
  scheduleDraftWrite();
}

export const useDrawingStore = create<DrawingStore>((set, get) => ({
  documents: {},
  activeDocumentId: null,
  saveState: 'saved',
  draftError: null,
  hydrationError: null,

  createDocument: (name) => {
    const document = createBlankDrawingDocument(name);
    markDocumentEdited(document.id);
    set((state) => ({
      documents: { ...state.documents, [document.id]: document },
      activeDocumentId: document.id,
    }));
    syncSaveState();
    return document;
  },

  replaceWithNewDocument: (name) => {
    const document = createBlankDrawingDocument(name);
    clearSaveScheduling();
    markDocumentEdited(document.id);
    set({ documents: { [document.id]: document }, activeDocumentId: document.id });
    syncSaveState();
    return document;
  },

  openDocument: (documentId) => {
    if (!get().documents[documentId]) return;
    set({ activeDocumentId: documentId });
    syncSaveState();
  },

  updateDocument: (document) => {
    markDocumentEdited(document.id);
    set((state) => ({
      documents: { ...state.documents, [document.id]: document },
      activeDocumentId: document.id,
    }));
    syncSaveState();
  },

  updateObject: (objectId, patch) => {
    const activeDocumentId = get().activeDocumentId;
    if (!activeDocumentId) return;
    const document = get().documents[activeDocumentId];
    if (!document) return;
    const next = patchDrawingObject(document, objectId, patch);
    if (next !== document) get().updateDocument(next);
  },

  removeDocument: (documentId) => {
    const entry = documentSaves.get(documentId);
    documentSaves.delete(documentId);
    set((state) => {
      const documents = { ...state.documents };
      delete documents[documentId];
      const nextId = state.activeDocumentId === documentId ? Object.keys(documents)[0] ?? null : state.activeDocumentId;
      return { documents, activeDocumentId: nextId };
    });
    syncSaveState();

    if (activeDrawingOwner === ANONYMOUS_DRAWING_OWNER) return;
    const ownerId = activeDrawingOwner;
    const sessionToken = saveSessionToken;
    removeWorkspaceDraft(ownerId, 'drawing', documentId);
    const removeFromServer = () => {
      if (sessionToken !== saveSessionToken) return;
      void drawingDocumentRepository.remove(ownerId, documentId).catch(() => {
        if (sessionToken === saveSessionToken) {
          useDrawingStore.setState({ saveState: 'error' });
        }
      });
    };
    if (entry?.inFlight) {
      void entry.inFlight.finally(removeFromServer);
    } else {
      removeFromServer();
    }
  },

  renameDocument: (documentId, name) => {
    const document = get().documents[documentId];
    if (!document || !name.trim()) return;
    get().updateDocument({ ...document, name: name.trim(), updatedAt: Date.now() });
  },

  saveActiveDocument: async () => {
    const activeDocumentId = get().activeDocumentId;
    if (!activeDocumentId) return;
    if (!get().documents[activeDocumentId]) return;
    await startDocumentSave(activeDocumentId);
    const entry = documentSaves.get(activeDocumentId);
    if (entry?.error) throw new Error(entry.error);
  },
}));

function migrateHydratedDrawingTablePositions(): void {
  const state = useDrawingStore.getState();
  const documents = { ...state.documents };
  const migratedDocumentIds: string[] = [];
  for (const [documentId, document] of Object.entries(state.documents)) {
    const migrated = migrateLegacyDrawingTablePositions(document);
    if (migrated === document) continue;
    documents[documentId] = migrated;
    migratedDocumentIds.push(documentId);
  }
  if (migratedDocumentIds.length === 0) return;
  useDrawingStore.setState({ documents });
  for (const documentId of migratedDocumentIds) markDocumentEdited(documentId);
  syncSaveState();
}

export async function flushDrawingSaves(): Promise<void> {
  const sessionToken = saveSessionToken;
  const tasks = [...documentSaves.keys()].map((documentId) => startDocumentSave(documentId));
  await Promise.allSettled(tasks);
  if (sessionToken !== saveSessionToken) return;
  syncSaveState();
}

export function resetDrawingStore(): void {
  hydrationToken += 1;
  saveSessionToken += 1;
  activeDrawingOwner = ANONYMOUS_DRAWING_OWNER;
  clearSaveScheduling();
  useDrawingStore.setState({
    documents: {},
    activeDocumentId: null,
    saveState: 'saved',
    draftError: null,
    hydrationError: null,
  });
}

export async function hydrateDrawingStore(ownerId?: string | null): Promise<DrawingHydrationResult> {
  activeDrawingOwner = ownerId || ANONYMOUS_DRAWING_OWNER;
  const token = ++hydrationToken;
  saveSessionToken += 1;
  clearSaveScheduling();
  useDrawingStore.setState({
    documents: {},
    activeDocumentId: null,
    saveState: 'saved',
    draftError: null,
    hydrationError: null,
  });
  if (!ownerId) return 'recovered';
  try {
    const loaded = await drawingDocumentRepository.list(ownerId);
    if (token !== hydrationToken) return 'recovered';
    const documents = Object.fromEntries(loaded.map((document) => [document.id, document]));
    useDrawingStore.setState({ documents, activeDocumentId: loaded[0]?.id ?? null, saveState: 'saved' });
    migrateHydratedDrawingTablePositions();
    return 'hydrated';
  } catch (error) {
    if (token !== hydrationToken) return 'recovered';
    useDrawingStore.setState({
      documents: {},
      activeDocumentId: null,
      saveState: 'saved',
      hydrationError: getUserErrorMessage(error, '图纸列表加载失败，请检查网络后重试。'),
    });
    return 'failed';
  }
}

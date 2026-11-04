import { create } from 'zustand';
import { createBlankDrawingDocument, createDrawingId, migrateLegacyDrawingTablePositions, patchDrawingObject } from '@/lib/drawingDocument';
import { toDocumentWriteError } from '@/lib/documentWriteError';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import {
  currentDraftInstanceId,
  listWorkspaceDrafts,
  removeWorkspaceDraft,
  removeWorkspaceDraftForInstance,
  writeWorkspaceDraft,
  type DraftWriteResult,
} from '@/lib/workspaceDraftCache';
import { drawingDocumentRepository } from '@/repositories/drawingDocumentRepository';
import type { DocumentVersion } from '@/types/document';
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
  /** 云端版本基线；null 表示尚未建立（本地新建或旧版草稿）。 */
  version: DocumentVersion | null;
  inFlight: Promise<void> | null;
  error: string | null;
  /** 版本冲突/云端删除/基线未知：暂停该文档自动保存，等待用户选择恢复方式。 */
  conflict: boolean;
  conflictKind: 'conflict' | 'missing' | 'unconfirmed';
  // 自动新建的空白图纸在首次编辑或手动保存前不落库、不写本地草稿。
  pristine: boolean;
}

const documentSaves = new Map<string, DocumentSaveEntry>();

interface DrawingStore {
  documents: Record<string, DrawingDocument>;
  activeDocumentId: string | null;
  saveState: DrawingSaveState;
  /** 当前活动图纸的版本冲突/云端删除/基线未知；存在时自动保存暂停，必须由用户选择恢复方式。 */
  saveConflict: { documentId: string; kind: 'conflict' | 'missing' | 'unconfirmed' } | null;
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
  /** 读取云端最新版本替换本地文档；用户必须明确确认后再调用。 */
  resolveConflictReadCloud: (documentId: string) => Promise<'replaced' | 'missing' | 'failed'>;
  /** 把当前文档另存为新图纸（新 ID，创建写入），并切换为活动文档。 */
  saveAsNewDocument: (documentId: string) => Promise<DrawingDocument | null>;
}

function getSaveEntry(documentId: string): DocumentSaveEntry {  let entry = documentSaves.get(documentId);
  if (!entry) {
    entry = {
      revision: 0,
      savedRevision: 0,
      version: null,
      inFlight: null,
      error: null,
      conflict: false,
      conflictKind: 'conflict',
      pristine: false,
    };
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

function conflictMessage(kind: 'conflict' | 'missing' | 'unconfirmed'): string {
  if (kind === 'missing') return '该图纸已在云端删除，请选择恢复方式（下载副本/读取云端/另存为新图纸）。';
  if (kind === 'unconfirmed') return '草稿缺少云端基线，请选择“读取云端版本”或“另存为新图纸”。';
  return '图纸存在版本冲突，请选择恢复方式。';
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
      localRevision: entry.revision,
      baseServerRevision: entry.version?.revision ?? null,
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

/** 恢复本地草稿：写入本地修订号与草稿记录的云端基线。
 * 基线不可确认（旧格式草稿）时暂停自动保存进入人工恢复，避免用原 ID 重新创建已删除图纸；
 * 只有用户明确“另存为新图纸”才生成新 ID。 */
export function restoreDrawingDraft(document: DrawingDocument, localRevision: number, baseServerRevision: number | null): void {
  const entry = getSaveEntry(document.id);
  entry.revision = Math.max(entry.revision, localRevision);
  entry.error = null;
  if (baseServerRevision === null) {
    entry.conflict = true;
    entry.conflictKind = 'unconfirmed';
    entry.version = null;
  } else {
    entry.conflict = false;
    entry.conflictKind = 'conflict';
    entry.version = entry.version?.revision === baseServerRevision
      ? entry.version
      : { revision: baseServerRevision, updatedAt: '' };
  }
  useDrawingStore.getState().updateDocument(document);
  syncSaveState();
}

function computeSaveState(): DrawingSaveState {
  const { activeDocumentId } = useDrawingStore.getState();
  if (!activeDocumentId) return 'saved';
  const entry = documentSaves.get(activeDocumentId);
  if (!entry) return 'saved';
  if (entry.conflict || entry.error) return 'error';
  if (entry.revision > entry.savedRevision) return entry.inFlight ? 'saving' : 'dirty';
  return entry.inFlight ? 'saving' : 'saved';
}

function syncSaveState(): void {
  const { activeDocumentId } = useDrawingStore.getState();
  const activeEntry = activeDocumentId ? documentSaves.get(activeDocumentId) : undefined;
  const next = computeSaveState();
  const nextConflict = activeEntry?.conflict
    ? { documentId: activeDocumentId!, kind: activeEntry.conflictKind }
    : null;
  const state = useDrawingStore.getState();
  if (
    state.saveState !== next
    || (state.saveConflict?.documentId ?? null) !== (nextConflict?.documentId ?? null)
    || (state.saveConflict?.kind ?? null) !== (nextConflict?.kind ?? null)
  ) {
    useDrawingStore.setState({ saveState: next, saveConflict: nextConflict });
  }
}

async function persistDocument(ownerId: string, document: DrawingDocument, version: DocumentVersion | null): Promise<DocumentVersion> {
  if (ownerId === ANONYMOUS_DRAWING_OWNER) {
    throw new Error('请先登录后保存图纸。');
  }
  return drawingDocumentRepository.save(ownerId, document, version);
}

function startDocumentSave(documentId: string): Promise<void> {
  const entry = getSaveEntry(documentId);
  if (entry.inFlight) return entry.inFlight;
  if (entry.conflict) return Promise.resolve();
  if (entry.revision <= entry.savedRevision) return Promise.resolve();

  const sessionToken = saveSessionToken;
  const ownerId = activeDrawingOwner;

  const run = async (): Promise<void> => {
    while (true) {
      if (sessionToken !== saveSessionToken || entry.conflict) return;
      if (entry.revision <= entry.savedRevision) return;
      if (!documentSaves.has(documentId)) return;
      const document = useDrawingStore.getState().documents[documentId];
      if (!document) return;

      const revision = entry.revision;
      try {
        // 使用 entry 对象本身记录结果：即使文档已被移除，也要保留本次保存返回的版本，
        // 供移除流程用准确版本删除云端记录，避免旧保存把已删除图纸写回。
        const version = await persistDocument(ownerId, document, entry.version);
        if (sessionToken !== saveSessionToken) return;
        entry.version = version;
        entry.savedRevision = Math.max(entry.savedRevision, revision);
        entry.error = null;
        entry.conflict = false;
        entry.conflictKind = 'conflict';
        entry.pristine = false;
        removeWorkspaceDraftForInstance(ownerId, 'drawing', documentId, currentDraftInstanceId(), entry.savedRevision);
        syncSaveState();
      } catch (error) {
        if (sessionToken !== saveSessionToken) return;
        const writeError = toDocumentWriteError(error, '图纸保存失败，请重试。');
        if (writeError.code === 'conflict' || writeError.code === 'missing') {
          // 云端版本冲突与云端已删除都暂停自动保存，保留本地内容等待用户恢复。
          entry.conflict = true;
          entry.conflictKind = writeError.code;
          entry.error = null;
        } else {
          entry.error = writeError.message;
        }
        syncSaveState();
        return;
      }
      if (!documentSaves.has(documentId)) return;
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
      if (entry.revision > entry.savedRevision && !entry.error && !entry.conflict) {
        void startDocumentSave(documentId);
      }
    }
  }, AUTO_SAVE_DELAY_MS);
}

function markDocumentCreated(documentId: string): void {
  const entry = getSaveEntry(documentId);
  entry.revision = 1;
  entry.savedRevision = 1;
  entry.version = null;
  entry.error = null;
  entry.conflict = false;
  entry.conflictKind = 'conflict';
  entry.pristine = true;
}

function markDocumentEdited(documentId: string): void {
  const entry = getSaveEntry(documentId);
  entry.pristine = false;
  entry.revision += 1;
  entry.error = null;
  scheduleAutoSave();
  scheduleDraftWrite();
}

export const useDrawingStore = create<DrawingStore>((set, get) => ({
  documents: {},
  activeDocumentId: null,
  saveState: 'saved',
  saveConflict: null,
  draftError: null,
  hydrationError: null,

  createDocument: (name) => {
    const document = createBlankDrawingDocument(name);
    markDocumentCreated(document.id);
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
    markDocumentCreated(document.id);
    set({ documents: { [document.id]: document }, activeDocumentId: document.id, saveState: 'saved', saveConflict: null });
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
    // 删除云端失败时不清理本地草稿，保留内容以便重试或恢复。
    const removeFromServer = () => {
      if (sessionToken !== saveSessionToken) return;
      if (!entry || !entry.version) {
        removeWorkspaceDraft(ownerId, 'drawing', documentId);
        return;
      }
      void drawingDocumentRepository.remove(ownerId, documentId, entry.version).then(
        () => removeWorkspaceDraft(ownerId, 'drawing', documentId),
        () => {
          if (sessionToken === saveSessionToken) {
            useDrawingStore.setState({ saveState: 'error' });
          }
        },
      );
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
    const entry = getSaveEntry(activeDocumentId);
    if (entry.conflict) {
      throw new Error(conflictMessage(entry.conflictKind));
    }
    if (entry.pristine) {
      // 用户显式保存空白图纸时才在云端建档。
      entry.pristine = false;
      entry.revision = entry.savedRevision + 1;
      syncSaveState();
    }
    await startDocumentSave(activeDocumentId);
    const after = documentSaves.get(activeDocumentId);
    // 冲突/云端删除会清空 error 并设置 conflict：手动保存和退出流程必须视为失败，
    // 不能返回成功让上层继续切换账号或丢弃本地状态。
    if (after?.conflict) throw new Error(conflictMessage(after.conflictKind));
    if (after?.error) throw new Error(after.error);
    if (after && after.revision > after.savedRevision) {
      throw new Error('图纸尚未完成保存，请稍后重试。');
    }
  },

  resolveConflictReadCloud: async (documentId) => {
    const entry = getSaveEntry(documentId);
    const sessionToken = saveSessionToken;
    try {
      const loaded = await drawingDocumentRepository.load(documentId);
      if (sessionToken !== saveSessionToken) return 'failed';
      if (!loaded) return 'missing';
      entry.version = loaded.version;
      entry.error = null;
      entry.conflict = false;
      entry.conflictKind = 'conflict';
      entry.revision = Math.max(entry.revision, entry.savedRevision + 1);
      entry.savedRevision = entry.revision;
      entry.pristine = false;
      const ownerId = activeDrawingOwner;
      if (ownerId !== ANONYMOUS_DRAWING_OWNER) {
        removeWorkspaceDraftForInstance(ownerId, 'drawing', documentId, currentDraftInstanceId(), entry.revision);
      }
      set((state) => ({
        documents: { ...state.documents, [documentId]: loaded.document },
        activeDocumentId: documentId,
      }));
      syncSaveState();
      return 'replaced';
    } catch {
      return 'failed';
    }
  },

  saveAsNewDocument: async (documentId) => {
    const document = get().documents[documentId];
    if (!document) return null;
    const copy = {
      ...document,
      id: createDrawingId(),
      name: `${document.name}（本地副本）`,
      updatedAt: Date.now(),
    };
    const entry = getSaveEntry(copy.id);
    entry.revision = 1;
    entry.savedRevision = 0;
    entry.version = null;
    entry.error = null;
    entry.conflict = false;
    entry.conflictKind = 'conflict';
    entry.pristine = false;
    set((state) => ({
      documents: { ...state.documents, [copy.id]: copy },
      activeDocumentId: copy.id,
    }));
    syncSaveState();
    // 先备份副本，再等待云端确认；失败时保留副本、草稿与可重试状态。
    writeDraftSnapshot();
    const sessionToken = saveSessionToken;
    await startDocumentSave(copy.id);
    if (sessionToken !== saveSessionToken || !documentSaves.has(copy.id)) return null;
    if (entry.conflict) throw new Error(conflictMessage(entry.conflictKind));
    if (entry.error) throw new Error(entry.error);
    if (entry.revision > entry.savedRevision) throw new Error('图纸尚未完成保存，请重试。');
    return copy;
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
  const tasks = [...documentSaves.entries()]
    .filter(([, entry]) => !entry.conflict)
    .map(([documentId]) => startDocumentSave(documentId));
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
    saveConflict: null,
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
    saveConflict: null,
    draftError: null,
    hydrationError: null,
  });
  if (!ownerId) return 'recovered';
  try {
    const loaded = await drawingDocumentRepository.list(ownerId);
    if (token !== hydrationToken) return 'recovered';
    const documents: Record<string, DrawingDocument> = {};
    for (const { document, version } of loaded) {
      documents[document.id] = document;
      const entry = getSaveEntry(document.id);
      entry.version = version;
    }
    useDrawingStore.setState({
      documents,
      activeDocumentId: loaded[0]?.document.id ?? null,
      saveState: 'saved',
    });
    migrateHydratedDrawingTablePositions();
    return 'hydrated';
  } catch (error) {
    if (token !== hydrationToken) return 'recovered';
    useDrawingStore.setState({
      documents: {},
      activeDocumentId: null,
      saveState: 'saved',
      saveConflict: null,
      hydrationError: getUserErrorMessage(error, '图纸列表加载失败，请检查网络后重试。'),
    });
    return 'failed';
  }
}

/** 当前账号的图纸草稿候选（包含其他窗口与旧版草稿），按保存时间倒序。 */
export function listDrawingDrafts(ownerId: string) {
  return listWorkspaceDrafts(ownerId, 'drawing');
}

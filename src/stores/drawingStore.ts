import { create } from 'zustand';
import { createBlankDrawingDocument, migrateLegacyDrawingTablePositions, patchDrawingObject } from '@/lib/drawingDocument';
import { drawingDocumentRepository } from '@/repositories/drawingDocumentRepository';
import type { DrawingDocument, DrawingObject } from '@/types/drawing';

type DrawingSaveState = 'saved' | 'dirty' | 'error';
export type DrawingHydrationResult = 'hydrated' | 'recovered';

const ANONYMOUS_DRAWING_OWNER = 'anonymous';
let activeDrawingOwner = ANONYMOUS_DRAWING_OWNER;

interface DrawingStore {
  documents: Record<string, DrawingDocument>;
  activeDocumentId: string | null;
  saveState: DrawingSaveState;
  createDocument: (name?: string) => DrawingDocument;
  replaceWithNewDocument: (name?: string) => DrawingDocument;
  openDocument: (documentId: string) => void;
  updateDocument: (document: DrawingDocument) => void;
  updateObject: (objectId: string, patch: Partial<DrawingObject>) => void;
  removeDocument: (documentId: string) => void;
  renameDocument: (documentId: string, name: string) => void;
  saveActiveDocument: () => Promise<void>;
  markSaved: () => void;
}

async function persistDocument(document: DrawingDocument): Promise<void> {
  if (activeDrawingOwner === ANONYMOUS_DRAWING_OWNER) {
    throw new Error('请先登录后保存图纸。');
  }
  await drawingDocumentRepository.save(activeDrawingOwner, document);
}

function reportSaveResult(document: DrawingDocument, success: boolean): void {
  const current = useDrawingStore.getState().documents[document.id];
  if (!current || current.updatedAt !== document.updatedAt) return;
  useDrawingStore.setState({ saveState: success ? 'saved' : 'error' });
}

export const useDrawingStore = create<DrawingStore>((set, get) => ({
  documents: {},
  activeDocumentId: null,
  saveState: 'saved',

  createDocument: (name) => {
    const document = createBlankDrawingDocument(name);
    set((state) => ({
      documents: { ...state.documents, [document.id]: document },
      activeDocumentId: document.id,
      saveState: 'dirty',
    }));
    return document;
  },

  replaceWithNewDocument: (name) => {
    const document = createBlankDrawingDocument(name);
    set({ documents: { [document.id]: document }, activeDocumentId: document.id, saveState: 'dirty' });
    return document;
  },

  openDocument: (documentId) => {
    if (!get().documents[documentId]) return;
    set({ activeDocumentId: documentId, saveState: 'saved' });
  },

  updateDocument: (document) => set((state) => ({
    documents: { ...state.documents, [document.id]: document },
    activeDocumentId: document.id,
    saveState: 'dirty',
  })),

  updateObject: (objectId, patch) => {
    const activeDocumentId = get().activeDocumentId;
    if (!activeDocumentId) return;
    const document = get().documents[activeDocumentId];
    if (!document) return;
    const next = patchDrawingObject(document, objectId, patch);
    if (next !== document) get().updateDocument(next);
  },

  removeDocument: (documentId) => {
    set((state) => {
      const documents = { ...state.documents };
      delete documents[documentId];
      const nextId = state.activeDocumentId === documentId ? Object.keys(documents)[0] ?? null : state.activeDocumentId;
      return { documents, activeDocumentId: nextId, saveState: 'dirty' };
    });
    if (activeDrawingOwner !== ANONYMOUS_DRAWING_OWNER) {
      void drawingDocumentRepository.remove(activeDrawingOwner, documentId).catch(() => {
        useDrawingStore.setState({ saveState: 'error' });
      });
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
    const document = get().documents[activeDocumentId];
    if (!document) return;
    try {
      await persistDocument(document);
      reportSaveResult(document, true);
    } catch (error) {
      reportSaveResult(document, false);
      throw error;
    }
  },

  markSaved: () => set({ saveState: 'saved' }),
}));

function migrateHydratedDrawingTablePositions(): void {
  const state = useDrawingStore.getState();
  const documents = { ...state.documents };
  let changed = false;
  for (const [documentId, document] of Object.entries(state.documents)) {
    const migrated = migrateLegacyDrawingTablePositions(document);
    if (migrated === document) continue;
    documents[documentId] = migrated;
    changed = true;
  }
  if (changed) useDrawingStore.setState({ documents, saveState: 'dirty' });
}

export async function hydrateDrawingStore(ownerId?: string | null): Promise<DrawingHydrationResult> {
  activeDrawingOwner = ownerId || ANONYMOUS_DRAWING_OWNER;
  useDrawingStore.setState({ documents: {}, activeDocumentId: null, saveState: 'saved' });
  if (!ownerId) return 'recovered';
  try {
    const loaded = await drawingDocumentRepository.list(ownerId);
    const documents = Object.fromEntries(loaded.map((document) => [document.id, document]));
    useDrawingStore.setState({ documents, activeDocumentId: loaded[0]?.id ?? null, saveState: 'saved' });
    migrateHydratedDrawingTablePositions();
    return 'hydrated';
  } catch {
    useDrawingStore.setState({ documents: {}, activeDocumentId: null, saveState: 'saved' });
    return 'recovered';
  }
}

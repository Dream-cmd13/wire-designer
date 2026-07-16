import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createBlankDrawingDocument, patchDrawingObject } from '@/lib/drawingDocument';
import type { DrawingDocument, DrawingObject } from '@/types/drawing';

type DrawingSaveState = 'saved' | 'dirty';
export type DrawingHydrationResult = 'hydrated' | 'recovered';

const hydrationErrorListeners = new Set<() => void>();

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
  markSaved: () => void;
}

export const useDrawingStore = create<DrawingStore>()(
  persist(
    (set, get) => ({
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
        set({
          documents: { [document.id]: document },
          activeDocumentId: document.id,
          saveState: 'dirty',
        });
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
        if (next === document) return;
        get().updateDocument(next);
      },
      removeDocument: (documentId) => set((state) => {
        const documents = { ...state.documents };
        delete documents[documentId];
        const nextId = state.activeDocumentId === documentId
          ? Object.keys(documents)[0] ?? null
          : state.activeDocumentId;
        return { documents, activeDocumentId: nextId, saveState: 'dirty' };
      }),
      renameDocument: (documentId, name) => {
        const document = get().documents[documentId];
        if (!document || !name.trim()) return;
        get().updateDocument({ ...document, name: name.trim(), updatedAt: Date.now() });
      },
      markSaved: () => set({ saveState: 'saved' }),
    }),
    {
      name: 'standalone-drawing-library',
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) hydrationErrorListeners.forEach((listener) => listener());
      },
      partialize: (state) => ({
        documents: state.documents,
        activeDocumentId: state.activeDocumentId,
      }),
    },
  ),
);

function resetDrawingLibraryAfterHydrationFailure() {
  try {
    useDrawingStore.setState({ documents: {}, activeDocumentId: null, saveState: 'saved' });
  } catch { /* The in-memory state is updated before a storage write can fail. */ }
}

export async function hydrateDrawingStore(): Promise<DrawingHydrationResult> {
  let persistApi: typeof useDrawingStore.persist | undefined;
  try { persistApi = useDrawingStore.persist; } catch { /* Treat inaccessible persistence as unavailable. */ }
  if (!persistApi) {
    resetDrawingLibraryAfterHydrationFailure();
    return 'recovered';
  }

  return new Promise((resolve) => {
    let settled = false;
    let unsubscribeSuccess: (() => void) | undefined;
    const settle = (result: DrawingHydrationResult) => {
      if (settled) return;
      settled = true;
      try { unsubscribeSuccess?.(); } catch { /* Settlement must not depend on persistence cleanup. */ }
      hydrationErrorListeners.delete(recover);
      resolve(result);
    };
    const recover = () => {
      void (async () => {
        try { await persistApi.clearStorage(); } catch { /* Ignore unavailable storage. */ }
        resetDrawingLibraryAfterHydrationFailure();
        settle('recovered');
      })();
    };
    hydrationErrorListeners.add(recover);
    try {
      unsubscribeSuccess = persistApi.onFinishHydration(() => settle('hydrated'));
      void Promise.resolve(persistApi.rehydrate()).catch(recover);
    } catch {
      recover();
    }
  });
}

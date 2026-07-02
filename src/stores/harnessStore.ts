import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  CanvasWireMaterial,
  ConnectorInstance,
  HarnessConfig,
  ProtectiveSleeve,
  SaveState,
  Selection,
} from '@/types/harness';
import { CONNECTORS } from '@/lib/data';
import { createDefaultWireSpec, lengthMmToCanvasWidth } from '@/lib/canvasMaterials';
import {
  generateId,
  updateMaterial as updateMaterialCommand,
  updateProtectiveSleeve as updateProtectiveSleeveCommand,
} from '@/lib/commands';
import { normalizeHarnessConfig } from '@/lib/normalizeHarnessConfig';

export function createDefaultConfig(): HarnessConfig {
  const connectorA: typeof CONNECTORS[number] = CONNECTORS[0]; // JST XH 2P
  const connectorB: typeof CONNECTORS[number] = CONNECTORS[2]; // JST XH 4P

  const connectorAId = 'connector-a';
  const connectorBId = 'connector-b';

  const materialId = generateId();
  const spec = createDefaultWireSpec();

  const material: CanvasWireMaterial = {
    id: materialId,
    name: 'W1',
    position: { x: 320, y: 220 },
    width: lengthMmToCanvasWidth(spec.lengthMm),
    spec,
    circuits: [
      {
        id: generateId(),
        start: { connectorId: connectorAId, connectorSide: 'right', pin: 1 },
        end: { connectorId: connectorBId, connectorSide: 'left', pin: 1 },
        color: 'red',
        signalName: 'VCC',
      },
      {
        id: generateId(),
        start: { connectorId: connectorAId, connectorSide: 'right', pin: 2 },
        end: { connectorId: connectorBId, connectorSide: 'left', pin: 2 },
        color: 'black',
        signalName: 'GND',
      },
    ],
    expandedByDefault: true,
  };

  return {
    schemaVersion: 3,
    id: generateId(),
    name: '未命名线束',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    connectors: [
      {
        id: connectorAId,
        position: { x: 80, y: 200 },
        connector: { ...connectorA },
        label: 'A端',
        jumpers: [],
      },
      {
        id: connectorBId,
        position: { x: 600, y: 200 },
        connector: { ...connectorB },
        label: 'B端',
        jumpers: [],
      },
    ],
    materials: [material],
    protectiveSleeves: [],
    quantity: 1,
    leadTime: 'standard',
  };
}

interface ReplaceDocumentOptions {
  markSaved?: boolean;
}

interface HarnessState {
  config: HarnessConfig;
  selection: Selection;
  saveState: SaveState;
  setConfig: (config: Partial<HarnessConfig>) => void;
  patchDocument: (partial: Partial<HarnessConfig>) => void;
  replaceDocument: (fullConfig: HarnessConfig, options?: ReplaceDocumentOptions) => void;
  markSaving: () => void;
  markSaved: () => void;
  markSaveError: (message: string) => void;

  // Connector actions
  addConnector: (connector: ConnectorInstance) => void;
  updateConnector: (id: string, updates: Partial<ConnectorInstance>) => void;
  removeConnector: (id: string) => void;

  // Material actions
  addMaterial: (material: CanvasWireMaterial) => void;
  updateMaterial: (id: string, updates: Partial<CanvasWireMaterial>) => void;
  removeMaterial: (id: string) => void;

  // Protective sleeve actions
  addProtectiveSleeve: (sleeve: ProtectiveSleeve) => void;
  updateProtectiveSleeve: (id: string, updates: Partial<ProtectiveSleeve>) => void;
  removeProtectiveSleeve: (id: string) => void;

  setSelection: (selection: Selection) => void;
  resetConfig: () => void;
}

function dirtyState() {
  return { status: 'dirty' } as const;
}

export const useHarnessStore = create<HarnessState>()(
  persist(
    (set) => ({
      config: createDefaultConfig(),
      selection: { kind: 'none' },
      saveState: { status: 'saved', savedAt: Date.now() },

      setConfig: (updates) =>
        set((state) => ({
          config: { ...state.config, ...updates, updatedAt: Date.now() },
          saveState: dirtyState(),
        })),

      patchDocument: (partial) =>
        set((state) => ({
          config: { ...state.config, ...partial, updatedAt: Date.now() },
          saveState: dirtyState(),
        })),

      replaceDocument: (fullConfig, options) =>
        set({
          config: fullConfig,
          selection: { kind: 'none' },
          saveState: options?.markSaved ? { status: 'saved', savedAt: Date.now() } : dirtyState(),
        }),

      markSaving: () => set({ saveState: { status: 'saving' } }),
      markSaved: () => set({ saveState: { status: 'saved', savedAt: Date.now() } }),
      markSaveError: (message) => set({ saveState: { status: 'error', message } }),

      addConnector: (connector) =>
        set((state) => ({
          config: {
            ...state.config,
            connectors: [...state.config.connectors, connector],
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),

      updateConnector: (id, updates) =>
        set((state) => ({
          config: {
            ...state.config,
            connectors: state.config.connectors.map((c) =>
              c.id === id ? { ...c, ...updates } : c,
            ),
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),

      removeConnector: (id) =>
        set((state) => {
          const nextSelection =
            state.selection.kind === 'connector' && state.selection.id === id
              ? ({ kind: 'none' } as const)
              : state.selection;

          // Clear pin refs in circuits, keep materials.
          const materials = state.config.materials.map((material) => {
            const nextCircuits = material.circuits
              .map((circuit) => {
                const next = { ...circuit };
                if (next.start?.connectorId === id) next.start = undefined;
                if (next.end?.connectorId === id) next.end = undefined;
                return next;
              })
              .filter((c) => c.start || c.end);
            return { ...material, circuits: nextCircuits };
          });

          return {
            config: {
              ...state.config,
              connectors: state.config.connectors.filter((c) => c.id !== id),
              materials,
              updatedAt: Date.now(),
            },
            selection: nextSelection,
            saveState: dirtyState(),
          };
        }),

      addMaterial: (material) =>
        set((state) => ({
          config: {
            ...state.config,
            materials: [...state.config.materials, material],
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),

      updateMaterial: (id, updates) =>
        set((state) => ({
            config: updateMaterialCommand(state.config, id, updates),
            saveState: dirtyState(),
        })),

      removeMaterial: (id) =>
        set((state) => ({
          config: {
            ...state.config,
            materials: state.config.materials.filter((item) => item.id !== id),
            protectiveSleeves: state.config.protectiveSleeves.map((sleeve) =>
              sleeve.attachedMaterialId === id
                ? { ...sleeve, attachedMaterialId: undefined }
                : sleeve,
            ),
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),

      addProtectiveSleeve: (sleeve) =>
        set((state) => ({
          config: {
            ...state.config,
            protectiveSleeves: [...state.config.protectiveSleeves, sleeve],
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),

      updateProtectiveSleeve: (id, updates) =>
        set((state) => ({
          config: updateProtectiveSleeveCommand(state.config, id, updates),
          saveState: dirtyState(),
        })),

      removeProtectiveSleeve: (id) =>
        set((state) => ({
          config: {
            ...state.config,
            protectiveSleeves: state.config.protectiveSleeves.filter((item) => item.id !== id),
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),

      setSelection: (selection) => set({ selection }),

      resetConfig: () =>
        set({
          config: createDefaultConfig(),
          selection: { kind: 'none' },
          saveState: dirtyState(),
        }),
    }),
    {
      name: 'harness-config',
      version: 3,
      partialize: (state) => ({ config: state.config, saveState: state.saveState }),
      // Normalize any persisted shape to v3. Non-v3 data is discarded
      // (the project is pre-release; legacy data is not needed).
      merge: (persisted, current) => {
        const incoming = persisted as Partial<{ config: unknown; saveState: SaveState }> | undefined;
        const normalizedConfig = incoming?.config
          ? normalizeHarnessConfig(incoming.config)
          : current.config;
        return {
          ...current,
          config: normalizedConfig,
          saveState: incoming?.saveState ?? current.saveState,
        };
      },
      // Defensive storage: catch quota exceeded and degrade gracefully.
      storage: createSafeStorage(),
    },
  ),
);

/**
 * Wraps zustand's default JSON storage with quota-exceeded handling.
 * On failure, sets a flag key the UI can detect and degrades to
 * in-memory-only mode (the in-memory state stays intact).
 *
 * Writes are synchronous (no debouncing) to avoid losing the last
 * draft when the page closes. For a single-user design tool the write
 * frequency is low enough that debouncing is premature optimization.
 */
function createSafeStorage() {
  return {
    getItem: (name: string) => {
      try {
        const v = localStorage.getItem(name);
        return v ? JSON.parse(v) : null;
      } catch {
        return null;
      }
    },
    setItem: (name: string, value: unknown) => {
      try {
        localStorage.setItem(name, JSON.stringify(value));
      } catch {
        // Quota exceeded — mark a flag the UI can read.
        try {
          localStorage.setItem('harness-config-quota-exceeded', '1');
        } catch {
          // Even the flag failed; nothing more we can do.
        }
      }
    },
    removeItem: (name: string) => {
      try {
        localStorage.removeItem(name);
      } catch {
        // ignored
      }
    },
  };
}

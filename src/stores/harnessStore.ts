import { create } from 'zustand';
import type {
  CanvasModel,
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
  removeConnector as removeConnectorCommand,
  removeMaterial as removeMaterialCommand,
  updateMaterial as updateMaterialCommand,
  updateProtectiveSleeve as updateProtectiveSleeveCommand,
} from '@/lib/commands';

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
    models: [],
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

  // Canvas model actions
  addModel: (model: CanvasModel) => void;
  updateModel: (id: string, updates: Partial<CanvasModel>) => void;
  removeModel: (id: string) => void;

  setSelection: (selection: Selection) => void;
  resetConfig: () => void;
}

function dirtyState() {
  return { status: 'dirty' } as const;
}

export const useHarnessStore = create<HarnessState>()(
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

          return {
            config: removeConnectorCommand(state.config, id),
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
          config: removeMaterialCommand(state.config, id),
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

      addModel: (model) =>
        set((state) => ({
          config: {
            ...state.config,
            models: [...state.config.models, model],
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),

      updateModel: (id, updates) =>
        set((state) => ({
          config: {
            ...state.config,
            models: state.config.models.map((item) =>
              item.id === id ? { ...item, ...updates } : item,
            ),
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),

      removeModel: (id) =>
        set((state) => ({
          config: {
            ...state.config,
            models: state.config.models.filter((item) => item.id !== id),
            updatedAt: Date.now(),
          },
          selection: state.selection.kind === 'model' && state.selection.id === id
            ? { kind: 'none' }
            : state.selection,
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
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Connection, HarnessConfig, HarnessNode, SaveState, Selection, Wire } from '@/types/harness';
import { CONNECTORS } from '@/lib/data';

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export function createDefaultConfig(): HarnessConfig {
  const nodeAId = 'node-a';
  const nodeBId = 'node-b';
  const nodeCId = 'node-c';
  const connA: typeof CONNECTORS[number] = CONNECTORS[0];
  const connB: typeof CONNECTORS[number] = CONNECTORS[0];
  const connC: typeof CONNECTORS[number] = CONNECTORS[4];

  const wire1Id = generateId();
  const wire2Id = generateId();
  const wire3Id = generateId();

  return {
    id: generateId(),
    name: '未命名线束',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nodes: [
      {
        id: nodeAId,
        type: 'connector',
        position: { x: 100, y: 200 },
        connector: connA,
        label: 'A端',
      },
      {
        id: nodeBId,
        type: 'connector',
        position: { x: 500, y: 100 },
        connector: connB,
        label: 'B端',
      },
      {
        id: nodeCId,
        type: 'connector',
        position: { x: 500, y: 300 },
        connector: connC,
        label: 'C端',
      },
    ],
    connections: [
      {
        id: 'conn-1',
        name: 'A-B 主线缆束',
        fromNodeId: nodeAId,
        toNodeId: nodeBId,
        wireIds: [wire1Id, wire2Id],
      },
      {
        id: 'conn-2',
        name: 'A-C 分支线缆',
        fromNodeId: nodeAId,
        toNodeId: nodeCId,
        wireIds: [wire3Id],
      },
    ],
    wires: [
      {
        id: wire1Id,
        name: 'W1',
        wireGauge: 26,
        wireType: 'silicone',
        wireColor: 'red',
        lengthMm: 300,
        fromConnectorId: nodeAId,
        fromPin: 1,
        toConnectorId: nodeBId,
        toPin: 1,
        signalName: 'VCC',
      },
      {
        id: wire2Id,
        name: 'W2',
        wireGauge: 26,
        wireType: 'silicone',
        wireColor: 'black',
        lengthMm: 300,
        fromConnectorId: nodeAId,
        fromPin: 2,
        toConnectorId: nodeBId,
        toPin: 2,
        signalName: 'GND',
      },
      {
        id: wire3Id,
        name: 'W3',
        wireGauge: 26,
        wireType: 'silicone',
        wireColor: 'blue',
        lengthMm: 300,
        fromConnectorId: nodeAId,
        fromPin: 1,
        toConnectorId: nodeCId,
        toPin: 1,
        signalName: 'SDA',
      },
    ],
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
  addNode: (node: HarnessNode) => void;
  updateNode: (id: string, updates: Partial<HarnessNode>) => void;
  removeNode: (id: string) => void;
  addConnection: (connection: Connection) => void;
  updateConnection: (id: string, updates: Partial<Connection>) => void;
  removeConnection: (id: string) => void;
  addWire: (wire: Wire) => void;
  updateWire: (id: string, updates: Partial<Wire>) => void;
  removeWire: (id: string) => void;
  setSelection: (selection: Selection) => void;
  setSelectedNode: (id: string | null) => void;
  setSelectedWire: (id: string | null) => void;
  resetConfig: () => void;
  selectedNodeId: string | null;
  selectedWireId: string | null;
  selectedBranchId: string | null;
  addBranch: (connection: Connection) => void;
  updateBranch: (id: string, updates: Partial<Connection>) => void;
  removeBranch: (id: string) => void;
  setSelectedBranch: (id: string | null) => void;
  branches: Connection[];
}

function dirtyState() {
  return { status: 'dirty' } as const;
}

export const useHarnessStore = create<HarnessState>()(
  persist(
    (set, get) => ({
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

      addNode: (node) =>
        set((state) => ({
          config: {
            ...state.config,
            nodes: [...state.config.nodes, node],
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),

      updateNode: (id, updates) =>
        set((state) => ({
          config: {
            ...state.config,
            nodes: state.config.nodes.map((node) => (
              node.id === id ? { ...node, ...updates } : node
            )),
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),

      removeNode: (id) =>
        set((state) => {
          const nextSelection =
            state.selection.kind === 'node' && state.selection.id === id
              ? { kind: 'none' as const }
              : state.selection;

          return {
            config: {
              ...state.config,
              nodes: state.config.nodes.filter((node) => node.id !== id),
              connections: state.config.connections.filter(
                (connection) => connection.fromNodeId !== id && connection.toNodeId !== id,
              ),
              wires: state.config.wires.filter(
                (wire) => wire.fromConnectorId !== id && wire.toConnectorId !== id,
              ),
              updatedAt: Date.now(),
            },
            selection: nextSelection,
            saveState: dirtyState(),
          };
        }),

      addConnection: (connection) =>
        set((state) => ({
          config: {
            ...state.config,
            connections: [...state.config.connections, connection],
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),

      updateConnection: (id, updates) =>
        set((state) => ({
          config: {
            ...state.config,
            connections: state.config.connections.map((connection) => (
              connection.id === id ? { ...connection, ...updates } : connection
            )),
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),

      removeConnection: (id) =>
        set((state) => {
          const removedConnection = state.config.connections.find((connection) => connection.id === id);
          const removedWireIds = new Set(removedConnection?.wireIds ?? []);
          const nextSelection =
            (state.selection.kind === 'connection' && state.selection.id === id)
            || (state.selection.kind === 'wire' && removedWireIds.has(state.selection.id))
              ? { kind: 'none' as const }
              : state.selection;

          return {
            config: {
              ...state.config,
              connections: state.config.connections.filter((connection) => connection.id !== id),
              wires: state.config.wires.filter((wire) => !removedWireIds.has(wire.id)),
              updatedAt: Date.now(),
            },
            selection: nextSelection,
            saveState: dirtyState(),
          };
        }),

      addWire: (wire) =>
        set((state) => ({
          config: {
            ...state.config,
            wires: [...state.config.wires, wire],
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),

      updateWire: (id, updates) =>
        set((state) => ({
          config: {
            ...state.config,
            wires: state.config.wires.map((wire) => (
              wire.id === id ? { ...wire, ...updates } : wire
            )),
            updatedAt: Date.now(),
          },
          saveState: dirtyState(),
        })),

      removeWire: (id) =>
        set((state) => ({
          config: {
            ...state.config,
            wires: state.config.wires.filter((wire) => wire.id !== id),
            connections: state.config.connections.map((connection) => ({
              ...connection,
              wireIds: connection.wireIds.filter((wireId) => wireId !== id),
            })),
            updatedAt: Date.now(),
          },
          selection:
            state.selection.kind === 'wire' && state.selection.id === id
              ? { kind: 'none' as const }
              : state.selection,
          saveState: dirtyState(),
        })),

      setSelection: (selection) => set({ selection }),
      setSelectedNode: (id) => set({ selection: id ? { kind: 'node', id } : { kind: 'none' } }),
      setSelectedWire: (id) => {
        if (!id) {
          set({ selection: { kind: 'none' } });
          return;
        }

        const state = get();
        if (state.config.connections.some((connection) => connection.id === id)) {
          set({ selection: { kind: 'connection', id } });
          return;
        }

        if (state.config.wires.some((wire) => wire.id === id)) {
          set({ selection: { kind: 'wire', id } });
          return;
        }

        set({ selection: { kind: 'none' } });
      },

      resetConfig: () =>
        set({
          config: createDefaultConfig(),
          selection: { kind: 'none' },
          saveState: dirtyState(),
        }),

      get selectedNodeId() {
        const selection = get().selection;
        return selection.kind === 'node' ? selection.id : null;
      },

      get selectedWireId() {
        const selection = get().selection;
        return selection.kind === 'connection' || selection.kind === 'wire' ? selection.id : null;
      },

      get selectedBranchId() {
        return get().selectedWireId;
      },

      get branches() {
        return get().config.connections;
      },

      addBranch: (connection) => get().addConnection(connection),
      updateBranch: (id, updates) => get().updateConnection(id, updates),
      removeBranch: (id) => get().removeConnection(id),
      setSelectedBranch: (id) => get().setSelectedWire(id),
    }),
    {
      name: 'harness-config',
      partialize: (state) => ({ config: state.config, saveState: state.saveState }),
    },
  ),
);

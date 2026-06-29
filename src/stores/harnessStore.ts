import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { HarnessConfig, HarnessNode, Connection, Wire } from '@/types/harness';
import { CONNECTORS } from '@/lib/data';

// ============================================================
// ID Generator
// ============================================================

const generateId = (): string =>
  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// ============================================================
// Default Configuration - T-type topology example
// 3 nodes: A(JST XH 2P), B(JST XH 2P), C(JST PH 2.0 2P)
// 2 connections:
//   A->B: Pin1->Pin1 VCC red, Pin2->Pin2 GND black
//   A->C: Pin1->Pin1 SDA blue
// ============================================================

const createDefaultConfig = (): HarnessConfig => {
  const nodeAId = 'node-a';
  const nodeBId = 'node-b';
  const nodeCId = 'node-c';
  const connA: typeof CONNECTORS[number] = CONNECTORS[0]; // JST XH 2P
  const connB: typeof CONNECTORS[number] = CONNECTORS[0]; // JST XH 2P
  const connC: typeof CONNECTORS[number] = CONNECTORS[4]; // JST PH 2.0 2P

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
};

// ============================================================
// Store Interface
// ============================================================

interface HarnessState {
  config: HarnessConfig;
  selectedNodeId: string | null;
  selectedWireId: string | null;

  // --- Config-level ---
  setConfig: (config: Partial<HarnessConfig>) => void;

  // --- Node operations ---
  addNode: (node: HarnessNode) => void;
  updateNode: (id: string, updates: Partial<HarnessNode>) => void;
  removeNode: (id: string) => void;

  // --- Connection operations ---
  addConnection: (connection: Connection) => void;
  updateConnection: (id: string, updates: Partial<Connection>) => void;
  removeConnection: (id: string) => void;

  // --- Wire operations ---
  addWire: (wire: Wire) => void;
  updateWire: (id: string, updates: Partial<Wire>) => void;
  removeWire: (id: string) => void;

  // --- Selection ---
  setSelectedNode: (id: string | null) => void;
  setSelectedWire: (id: string | null) => void;

  // --- Reset ---
  resetConfig: () => void;

  // ============================================================
  // Backward-compatible aliases (legacy components use "branch")
  // ============================================================

  /** @deprecated Use selectedWireId instead */
  selectedBranchId: string | null;
  /** @deprecated Use addConnection instead */
  addBranch: (connection: Connection) => void;
  /** @deprecated Use updateConnection instead */
  updateBranch: (id: string, updates: Partial<Connection>) => void;
  /** @deprecated Use removeConnection instead */
  removeBranch: (id: string) => void;
  /** @deprecated Use setSelectedWire instead */
  setSelectedBranch: (id: string | null) => void;
  /** @deprecated Use config.connections instead */
  branches: Connection[];
}

// ============================================================
// Store Implementation
// ============================================================

export const useHarnessStore = create<HarnessState>()(
  persist(
    (set, get) => ({
      config: createDefaultConfig(),
      selectedNodeId: null,
      selectedWireId: null,

      // --- Config-level ---
      setConfig: (updates) =>
        set((state) => ({
          config: { ...state.config, ...updates, updatedAt: Date.now() },
        })),

      // --- Node operations ---
      addNode: (node) =>
        set((state) => ({
          config: {
            ...state.config,
            nodes: [...state.config.nodes, node],
            updatedAt: Date.now(),
          },
        })),

      updateNode: (id, updates) =>
        set((state) => ({
          config: {
            ...state.config,
            nodes: state.config.nodes.map((n) =>
              n.id === id ? { ...n, ...updates } : n
            ),
            updatedAt: Date.now(),
          },
        })),

      removeNode: (id) =>
        set((state) => ({
          config: {
            ...state.config,
            nodes: state.config.nodes.filter((n) => n.id !== id),
            connections: state.config.connections.filter(
              (c) => c.fromNodeId !== id && c.toNodeId !== id
            ),
            wires: state.config.wires.filter(
              (w) => w.fromConnectorId !== id && w.toConnectorId !== id
            ),
            updatedAt: Date.now(),
          },
        })),

      // --- Connection operations ---
      addConnection: (connection) =>
        set((state) => ({
          config: {
            ...state.config,
            connections: [...state.config.connections, connection],
            updatedAt: Date.now(),
          },
        })),

      updateConnection: (id, updates) =>
        set((state) => ({
          config: {
            ...state.config,
            connections: state.config.connections.map((c) =>
              c.id === id ? { ...c, ...updates } : c
            ),
            updatedAt: Date.now(),
          },
        })),

      removeConnection: (id) =>
        set((state) => ({
          config: {
            ...state.config,
            connections: state.config.connections.filter((c) => c.id !== id),
            updatedAt: Date.now(),
          },
        })),

      // --- Wire operations ---
      addWire: (wire) =>
        set((state) => ({
          config: {
            ...state.config,
            wires: [...state.config.wires, wire],
            updatedAt: Date.now(),
          },
        })),

      updateWire: (id, updates) =>
        set((state) => ({
          config: {
            ...state.config,
            wires: state.config.wires.map((w) =>
              w.id === id ? { ...w, ...updates } : w
            ),
            updatedAt: Date.now(),
          },
        })),

      removeWire: (id) =>
        set((state) => ({
          config: {
            ...state.config,
            wires: state.config.wires.filter((w) => w.id !== id),
            // Also remove wire ID from any connections that reference it
            connections: state.config.connections.map((c) => ({
              ...c,
              wireIds: c.wireIds.filter((wid) => wid !== id),
            })),
            updatedAt: Date.now(),
          },
        })),

      // --- Selection ---
      setSelectedNode: (id) => set({ selectedNodeId: id }),
      setSelectedWire: (id) => set({ selectedWireId: id }),

      // --- Reset ---
      resetConfig: () =>
        set({
          config: createDefaultConfig(),
          selectedNodeId: null,
          selectedWireId: null,
        }),

      // ============================================================
      // Backward-compatible aliases
      // ============================================================

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
    { name: 'harness-config' }
  )
);

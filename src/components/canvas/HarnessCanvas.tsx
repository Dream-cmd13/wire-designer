import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  Background,
  ConnectionMode,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type EdgeTypes,
  type Node,
  type NodeMouseHandler,
  type NodeTypes,
  type OnNodeDrag,
  type IsValidConnection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { addConnector, attachMaterialEndpoint, addConnectorJumper, detachMaterialEndpoint, reassignMaterialEndpoint, generateId, getActiveConnectorSide, removeConnectorJumper } from '@/lib/commands';
import {
  CANVAS_MATERIAL_SLEEVE_CENTER_Y,
  createDefaultCanvasMaterial,
  lengthMmToCanvasWidth,
  placeSleeveAroundMaterials,
} from '@/lib/canvasMaterials';
import { useHarnessStore } from '@/stores/harnessStore';
import type {
  CanvasWireMaterial,
  ConnectorInstance,
  ConnectorSide,
  HarnessConfig,
  MaterialEndpoint,
  ProtectiveSleeve,
} from '@/types/harness';
import { ConnectorNode } from './ConnectorNode';
import { ContextMenu, type ContextMenuState } from './ContextMenu';
import { JumperEdge } from './JumperEdge';
import { setJumperContextMenuHandler } from './jumperContextMenu';
import { MaterialAttachmentEdge } from './MaterialAttachmentEdge';
import { ProtectiveSleeveDialog } from './ProtectiveSleeveDialog';
import { ProtectiveSleeveNode } from './ProtectiveSleeveNode';
import { WireMaterialDialog } from './WireMaterialDialog';
import { WireMaterialNode, type WireMaterialNodeData } from './WireMaterialNode';
import { CanvasModelDialog } from './CanvasModelDialog';
import {
  MaterialAccessoryDialog,
  type MaterialAccessoryKind,
} from './MaterialAccessoryDialog';
import {
  setMaterialConnectionPointHandler,
  type MaterialConnectionPoint,
} from './materialConnectionClick';

const nodeTypes: NodeTypes = {
  connector: ConnectorNode,
  material: WireMaterialNode,
  sleeve: ProtectiveSleeveNode,
};
const edgeTypes: EdgeTypes = {
  attachment: MaterialAttachmentEdge,
  jumper: JumperEdge,
};
const EMPTY_MATERIALS: CanvasWireMaterial[] = [];
const EMPTY_SLEEVES: ProtectiveSleeve[] = [];

// ============================================================
// Geometry helpers
// ============================================================

function parsePinFromHandleId(handleId?: string | null): number | undefined {
  if (!handleId) return undefined;
  const match = handleId.match(/pin-(\d+)$/);
  if (!match) return undefined;
  const pin = Number.parseInt(match[1], 10);
  return Number.isFinite(pin) && pin > 0 ? pin : undefined;
}

function parseSideFromHandleId(handleId?: string | null): ConnectorSide | undefined {
  if (!handleId) return undefined;
  if (handleId.startsWith('left')) return 'left';
  if (handleId.startsWith('right')) return 'right';
  return undefined;
}

function getConnectorHeight(instance: ConnectorInstance): number {
  const pinCount = instance.connector?.pinCount ?? 2;
  // All pins are rendered (no fold), so height reflects full pin count.
  return 52 + pinCount * 20 + 32;
}

function getVisiblePinCount(instance: ConnectorInstance): number {
  // All pins are rendered — no 6-pin cap.
  return instance.connector?.pinCount ?? 2;
}

function getMaterialEndpointPoint(
  material: CanvasWireMaterial,
  endpoint: MaterialEndpoint,
): { x: number; y: number } {
  return {
    x: endpoint === 'start' ? material.position.x : material.position.x + material.width,
    y: material.position.y + CANVAS_MATERIAL_SLEEVE_CENTER_Y,
  };
}

function getConnectorPinHandlePosition(
  instance: ConnectorInstance,
  side: ConnectorSide,
  pin: number,
): { x: number; y: number } {
  const clampedPin = Math.max(1, Math.min(pin, getVisiblePinCount(instance)));
  return {
    x: instance.position.x + (side === 'left' ? 0 : 200),
    y: instance.position.y + 52 + (clampedPin - 0.5) * 20,
  };
}

function resolveNearestConnectorHandle(
  instance: ConnectorInstance,
  point: { x: number; y: number },
  preferredSide?: ConnectorSide,
): { handle: string; distance: number; pin: number; side: ConnectorSide } | undefined {
  const activeSide = getActiveConnectorSide(
    useHarnessStore.getState().config,
    instance.id,
  );
  // Only consider the active side (or both if no side is locked).
  const sides: ConnectorSide[] = activeSide ? [activeSide] : ['left', 'right'];
  const visiblePinCount = getVisiblePinCount(instance);

  let best: { handle: string; distance: number; pin: number; side: ConnectorSide } | undefined;

  for (const side of sides) {
    // If a preferred side is given and it's in the allowed set, try it first.
    if (preferredSide && preferredSide !== side) continue;

    for (let pin = 1; pin <= visiblePinCount; pin += 1) {
      const pos = getConnectorPinHandlePosition(instance, side, pin);
      const distance = Math.hypot(point.x - pos.x, point.y - pos.y);
      if (!best || distance < best.distance) {
        best = { handle: `${side}-pin-${pin}`, distance, pin, side };
      }
    }
  }

  // If preferredSide was given but no match in allowed sides, try all allowed sides.
  if (!best && !preferredSide) {
    // already tried all
  }

  return best;
}

function distanceToRect(
  point: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number },
): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

// ============================================================
// Edge generation from config
// ============================================================

function buildEdges(config: HarnessConfig, canvasSelection: string | null): Edge[] {
  const edges: Edge[] = [];

  // Material circuit edges
  for (const material of config.materials) {
    for (const circuit of material.circuits) {
      if (circuit.start) {
        const edgeId = `${circuit.id}:start`;
        edges.push({
          id: edgeId,
          source: material.id,
          sourceHandle: 'start',
          target: circuit.start.connectorId,
          targetHandle: `${circuit.start.connectorSide}-pin-${circuit.start.pin}`,
          type: 'attachment',
          data: {
            materialId: material.id,
            circuitId: circuit.id,
            side: 'start' as const,
            solid: material.spec.kind === 'jacketed',
          },
          selected: canvasSelection === edgeId,
          reconnectable: 'target',
        });
      }
      if (circuit.end) {
        const edgeId = `${circuit.id}:end`;
        edges.push({
          id: edgeId,
          source: material.id,
          sourceHandle: 'end',
          target: circuit.end.connectorId,
          targetHandle: `${circuit.end.connectorSide}-pin-${circuit.end.pin}`,
          type: 'attachment',
          data: {
            materialId: material.id,
            circuitId: circuit.id,
            side: 'end' as const,
            solid: material.spec.kind === 'jacketed',
          },
          selected: canvasSelection === edgeId,
          reconnectable: 'target',
        });
      }
    }
  }

  // Jumper edges (one edge per jumper, connecting first to last pin)
  for (const instance of config.connectors) {
    for (const jumper of instance.jumpers) {
      if (jumper.pins.length < 2) continue;
      const sortedPins = [...jumper.pins].sort((a, b) => a - b);
      const firstPin = sortedPins[0];
      const lastPin = sortedPins[sortedPins.length - 1];
      const edgeId = `jumper:${jumper.id}`;
      edges.push({
        id: edgeId,
        source: instance.id,
        sourceHandle: `${jumper.side}-pin-${firstPin}`,
        target: instance.id,
        targetHandle: `${jumper.side}-pin-${lastPin}`,
        type: 'jumper',
        data: { connectorId: instance.id, jumperId: jumper.id },
        selected: canvasSelection === edgeId,
      });
    }
  }

  return edges;
}

function getMaterialConnectorIds(material: CanvasWireMaterial): Set<string> {
  const connectorIds = new Set<string>();
  for (const circuit of material.circuits) {
    if (circuit.start) connectorIds.add(circuit.start.connectorId);
    if (circuit.end) connectorIds.add(circuit.end.connectorId);
  }
  return connectorIds;
}

/**
 * Electronic wires form one display group when they share any connector.
 * Connected components are used so A↔B and B↔C also become one group.
 */
function getElectronicMaterialGroups(materials: CanvasWireMaterial[]): Map<string, string[]> {
  const electronic = materials.filter((material) => material.spec.kind === 'electronic');
  const connectorIdsByMaterial = new Map(
    electronic.map((material) => [material.id, getMaterialConnectorIds(material)]),
  );
  const visited = new Set<string>();
  const result = new Map<string, string[]>();

  for (const material of electronic) {
    if (visited.has(material.id)) continue;
    const group: CanvasWireMaterial[] = [];
    const queue = [material];
    visited.add(material.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      group.push(current);
      const currentConnectors = connectorIdsByMaterial.get(current.id) ?? new Set<string>();
      for (const candidate of electronic) {
        if (visited.has(candidate.id)) continue;
        const candidateConnectors = connectorIdsByMaterial.get(candidate.id) ?? new Set<string>();
        if ([...currentConnectors].some((connectorId) => candidateConnectors.has(connectorId))) {
          visited.add(candidate.id);
          queue.push(candidate);
        }
      }
    }

    const sortedIds = group
      .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
      .map((item) => item.id);
    for (const materialId of sortedIds) result.set(materialId, sortedIds);
  }

  return result;
}

// ============================================================
// Canvas Component
// ============================================================

interface SleeveDialogState {
  position: { x: number; y: number };
  materialId?: string;
  sleeveId?: string;
}

interface AccessoryDialogState {
  materialId: string;
  kind: MaterialAccessoryKind;
}

function HarnessCanvasInner() {
  const { config, selection, setSelection, updateConnector } = useHarnessStore();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [canvasSelection, setCanvasSelection] = useState<string | null>(null);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [newMaterialId, setNewMaterialId] = useState<string | null>(null);
  const [sleeveDialog, setSleeveDialog] = useState<SleeveDialogState | null>(null);
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [accessoryDialog, setAccessoryDialog] = useState<AccessoryDialogState | null>(null);
  const [pendingConnectionPoint, setPendingConnectionPoint] = useState<MaterialConnectionPoint | null>(null);
  const pendingConnectionPointRef = useRef<MaterialConnectionPoint | null>(null);
  const reconnectSucceeded = useRef(false);
  const hasAutoFitted = useRef(false);
  const { fitView, screenToFlowPosition } = useReactFlow();

  const materials = config.materials ?? EMPTY_MATERIALS;
  const sleeves = config.protectiveSleeves ?? EMPTY_SLEEVES;

  // Register the jumper context menu handler so ConnectorNode's jumper
  // SVG arcs can trigger this context menu (the arcs are drawn as node
  // overlays, not as React Flow edges, so onEdgeContextMenu doesn't fire).
  useEffect(() => {
    setJumperContextMenuHandler((jumperId, x, y) => {
      setContextMenu({ x, y, kind: 'jumper', jumperId });
    });
    return () => setJumperContextMenuHandler(null);
  }, []);

  // Build React Flow nodes from config.
  // React Flow 12's Node<T> requires T extends Record<string, unknown>;
  // our domain interfaces don't satisfy that constraint, so we bridge
  // with a centralized cast helper. This is the ONLY place the cast
  // happens — downstream components receive properly typed props.
  useEffect(() => {
    const electronicGroups = getElectronicMaterialGroups(materials);
    const connectorNodes: Node[] = config.connectors.map((instance) => ({
      id: instance.id,
      type: 'connector',
      position: instance.position,
      data: instance as unknown as Node['data'],
      selected: selection.kind === 'connector' && selection.id === instance.id,
    }));
    const materialNodes: Node[] = materials.map((material) => {
      const detailMaterialIds = electronicGroups.get(material.id) ?? [material.id];
      const nodeData: WireMaterialNodeData = {
        ...material,
        detailMaterialIds,
        showMergedDetails: detailMaterialIds[detailMaterialIds.length - 1] === material.id,
      };
      return {
        id: material.id,
        type: 'material',
        position: material.position,
        data: nodeData as unknown as Node['data'],
        selected: canvasSelection === material.id,
        dragHandle: '.wire-material-drag',
        zIndex: 2,
      };
    });
    const sleeveNodes: Node[] = sleeves.map((sleeve) => ({
      id: sleeve.id,
      type: 'sleeve',
      position: sleeve.position,
      data: sleeve as unknown as Node['data'],
      selected: canvasSelection === sleeve.id,
      zIndex: 4,
    }));

    setNodes([...connectorNodes, ...materialNodes, ...sleeveNodes]);
  }, [canvasSelection, config.connectors, materials, selection, setNodes, sleeves]);

  // Build edges from circuits and jumpers
  useEffect(() => {
    setEdges(buildEdges(config, canvasSelection));
  }, [config, canvasSelection, setEdges]);

  // Auto-fit view on first load
  useEffect(() => {
    if (nodes.length === 0) {
      hasAutoFitted.current = false;
      return;
    }
    if (hasAutoFitted.current) return;
    hasAutoFitted.current = true;
    const frameId = requestAnimationFrame(() => {
      fitView({ duration: 0, padding: 0.16 });
    });
    return () => cancelAnimationFrame(frameId);
  }, [fitView, nodes.length]);

  const currentFlowPosition = useCallback(() => (
    contextMenu?.flowPosition ?? { x: 220, y: 220 }
  ), [contextMenu]);

  // --- Add actions ---
  const handleAddConnector = useCallback(() => {
    const state = useHarnessStore.getState();
    const newConfig = addConnector(state.config, { position: currentFlowPosition() });
    state.replaceDocument(newConfig);
  }, [currentFlowPosition]);

  const handleAddCanvasWire = useCallback(() => {
    const id = generateId();
    useHarnessStore.getState().addMaterial(
      createDefaultCanvasMaterial(id, currentFlowPosition()),
    );
    setNewMaterialId(id);
    setEditingMaterialId(id);
    setCanvasSelection(id);
  }, [currentFlowPosition]);

  const handleAddProtectiveSleeve = useCallback((materialId?: string) => {
    setSleeveDialog({ position: currentFlowPosition(), materialId });
  }, [currentFlowPosition]);

  // --- Connection handling ---
  const handleAttachEndpoint = useCallback((
    materialId: string,
    endpoint: MaterialEndpoint,
    connectorId: string,
    side: ConnectorSide,
    pin: number,
  ) => {
    const state = useHarnessStore.getState();
    try {
      const nextConfig = attachMaterialEndpoint(state.config, {
        materialId,
        endpoint,
        connectorId,
        connectorSide: side,
        pin,
      });
      state.replaceDocument(nextConfig);
      setCanvasSelection(materialId);
    } catch {
      // Side conflict or pin out of range — ignore.
    }
  }, []);

  useEffect(() => {
    setMaterialConnectionPointHandler((point) => {
      const pending = pendingConnectionPointRef.current;
      if (!pending || pending.kind === point.kind) {
        pendingConnectionPointRef.current = point;
        setPendingConnectionPoint(point);
        return;
      }

      if (pending.kind === 'material' && point.kind === 'connector') {
        handleAttachEndpoint(
          pending.materialId,
          pending.endpoint,
          point.connectorId,
          point.connectorSide,
          point.pin,
        );
      } else if (pending.kind === 'connector' && point.kind === 'material') {
        handleAttachEndpoint(
          point.materialId,
          point.endpoint,
          pending.connectorId,
          pending.connectorSide,
          pending.pin,
        );
      }
      pendingConnectionPointRef.current = null;
      setPendingConnectionPoint(null);
    });
    return () => setMaterialConnectionPointHandler(null);
  }, [handleAttachEndpoint]);

  const handleAddJumper = useCallback((
    connectorId: string,
    side: ConnectorSide,
    pin1: number,
    pin2: number,
  ) => {
    const state = useHarnessStore.getState();
    try {
      const nextConfig = addConnectorJumper(state.config, connectorId, side, pin1, pin2);
      state.replaceDocument(nextConfig);
    } catch {
      // Invalid jumper — ignore.
    }
  }, []);

  const isValidConnection: IsValidConnection<Edge> = useCallback((connection) => {
    if (!connection.source || !connection.target) return false;

    const state = useHarnessStore.getState();
    const sourceIsMaterial = state.config.materials.some((m) => m.id === connection.source);
    const targetIsMaterial = state.config.materials.some((m) => m.id === connection.target);
    const sourceIsConnector = state.config.connectors.some((c) => c.id === connection.source);
    const targetIsConnector = state.config.connectors.some((c) => c.id === connection.target);

    // Material ↔ Connector: valid
    if (sourceIsMaterial && targetIsConnector) return true;
    if (targetIsMaterial && sourceIsConnector) return true;

    // Same connector pin ↔ pin: valid (jumper)
    if (sourceIsConnector && targetIsConnector && connection.source === connection.target) {
      const pin1 = parsePinFromHandleId(connection.sourceHandle);
      const pin2 = parsePinFromHandleId(connection.targetHandle);
      if (!pin1 || !pin2 || pin1 === pin2) return false;
      const side1 = parseSideFromHandleId(connection.sourceHandle);
      const side2 = parseSideFromHandleId(connection.targetHandle);
      return side1 === side2;
    }

    return false;
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;

    const state = useHarnessStore.getState();
    const sourceIsMaterial = state.config.materials.some((m) => m.id === connection.source);
    const targetIsMaterial = state.config.materials.some((m) => m.id === connection.target);
    const sourceIsConnector = state.config.connectors.some((c) => c.id === connection.source);
    const targetIsConnector = state.config.connectors.some((c) => c.id === connection.target);

    // Material → Connector
    if (sourceIsMaterial && targetIsConnector) {
      const endpoint: MaterialEndpoint = connection.sourceHandle === 'start' ? 'start' : 'end';
      const side = parseSideFromHandleId(connection.targetHandle);
      const pin = parsePinFromHandleId(connection.targetHandle);
      if (!side || !pin) return;
      handleAttachEndpoint(connection.source, endpoint, connection.target, side, pin);
      return;
    }

    // Connector → Material
    if (targetIsMaterial && sourceIsConnector) {
      const endpoint: MaterialEndpoint = connection.targetHandle === 'start' ? 'start' : 'end';
      const side = parseSideFromHandleId(connection.sourceHandle);
      const pin = parsePinFromHandleId(connection.sourceHandle);
      if (!side || !pin) return;
      handleAttachEndpoint(connection.target, endpoint, connection.source, side, pin);
      return;
    }

    // Same connector: jumper
    if (sourceIsConnector && targetIsConnector && connection.source === connection.target) {
      const pin1 = parsePinFromHandleId(connection.sourceHandle);
      const pin2 = parsePinFromHandleId(connection.targetHandle);
      const side1 = parseSideFromHandleId(connection.sourceHandle);
      if (!pin1 || !pin2 || !side1) return;
      handleAddJumper(connection.source, side1, pin1, pin2);
      return;
    }
  }, [handleAttachEndpoint, handleAddJumper]);

  // --- Edge reconnection (move endpoint to different pin) ---
  // Uses the atomic reassignMaterialEndpoint command so that any
  // validation failure (side lock, pin range, duplicate) leaves the
  // original connection untouched — no lossy detach-then-attach.
  const onReconnect = useCallback((oldEdge: Edge, connection: Connection) => {
    if (!connection.target) return;
    const state = useHarnessStore.getState();

    if (oldEdge.type === 'attachment' && oldEdge.data) {
      const { materialId, circuitId, side } = oldEdge.data as {
        materialId: string;
        circuitId: string;
        side: MaterialEndpoint;
      };
      const newSide = parseSideFromHandleId(connection.targetHandle);
      const newPin = parsePinFromHandleId(connection.targetHandle);
      if (!newSide || !newPin) return;

      const isConnector = state.config.connectors.some((c) => c.id === connection.target);
      if (!isConnector) return;

      reconnectSucceeded.current = true;

      // Atomic reassignment: returns original config on validation
      // failure, so the old connection is never lost.
      const nextConfig = reassignMaterialEndpoint(state.config, {
        materialId,
        circuitId,
        endpoint: side,
        connectorId: connection.target,
        connectorSide: newSide,
        pin: newPin,
      });

      if (nextConfig !== state.config) {
        state.replaceDocument(nextConfig);
      }
      return;
    }

    if (oldEdge.type === 'jumper' && oldEdge.data) {
      // Jumper reconnection is not supported in this version.
      reconnectSucceeded.current = true;
      return;
    }
  }, []);

  // --- Edge deletion via reconnect drag-away ---
  const handleDetachEndpoint = useCallback((edgeId: string) => {
    // edgeId format: `${circuitId}:start` or `${circuitId}:end`
    const sepIndex = edgeId.lastIndexOf(':');
    if (sepIndex === -1) return;
    const circuitId = edgeId.substring(0, sepIndex);
    const side = edgeId.substring(sepIndex + 1) as MaterialEndpoint;
    if (side !== 'start' && side !== 'end') return;

    const state = useHarnessStore.getState();
    // Find the material that owns this circuit
    const material = state.config.materials.find((m) =>
      m.circuits.some((c) => c.id === circuitId),
    );
    if (!material) return;

    const nextConfig = detachMaterialEndpoint(state.config, material.id, circuitId, side);
    state.replaceDocument(nextConfig);
    setCanvasSelection(null);
  }, []);

  const handleDeleteJumper = useCallback((jumperId: string) => {
    const state = useHarnessStore.getState();
    // Find the connector that owns this jumper
    const connector = state.config.connectors.find((c) =>
      c.jumpers.some((j) => j.id === jumperId),
    );
    if (!connector) return;

    const nextConfig = removeConnectorJumper(state.config, connector.id, jumperId);
    state.replaceDocument(nextConfig);
    setCanvasSelection(null);
  }, []);

  // --- Drag-stop: snap material endpoints to nearby connectors ---
  // IMPORTANT: re-read the latest config on every iteration. The store
  // updates after the first endpoint attaches; if we reuse the stale
  // snapshot for the second endpoint, the first one gets overwritten.
  const attachNearbyMaterialEndpoints = useCallback((material: CanvasWireMaterial) => {
    const endpointPoints: Array<{ endpoint: MaterialEndpoint; point: { x: number; y: number } }> = [
      { endpoint: 'start', point: getMaterialEndpointPoint(material, 'start') },
      { endpoint: 'end', point: getMaterialEndpointPoint(material, 'end') },
    ];

    let attachedAny = false;

    for (const { endpoint, point } of endpointPoints) {
      // Always read the freshest config from the store.
      const currentConfig = useHarnessStore.getState().config;
      const connectors = currentConfig.connectors;

      const candidates = connectors
        .map((connector) => {
          const distance = distanceToRect(point, {
            x: connector.position.x,
            y: connector.position.y,
            width: 200,
            height: getConnectorHeight(connector),
          });
          if (distance > 28) return undefined;
          const resolved = resolveNearestConnectorHandle(connector, point);
          if (!resolved) return undefined;
          return { connector, resolved };
        })
        .filter((c): c is { connector: ConnectorInstance; resolved: { handle: string; distance: number; pin: number; side: ConnectorSide } } => Boolean(c))
        .sort((a, b) => a.resolved.distance - b.resolved.distance);

      const nearest = candidates[0];
      if (nearest) {
        try {
          const nextConfig = attachMaterialEndpoint(currentConfig, {
            materialId: material.id,
            endpoint,
            connectorId: nearest.connector.id,
            connectorSide: nearest.resolved.side,
            pin: nearest.resolved.pin,
          });
          if (nextConfig !== currentConfig) {
            useHarnessStore.getState().replaceDocument(nextConfig);
            attachedAny = true;
          }
        } catch {
          // Side conflict — ignore.
        }
      }
    }

    if (attachedAny) {
      setCanvasSelection(material.id);
    }
  }, []);

  const onNodeDragStop: OnNodeDrag = useCallback((_, node) => {
    const state = useHarnessStore.getState();
    if (node.type === 'connector') {
      updateConnector(node.id, { position: node.position });
      return;
    }
    if (node.type === 'material') {
      const material = state.config.materials.find((item) => item.id === node.id);
      if (!material) return;
      state.updateMaterial(node.id, { position: node.position });
      attachNearbyMaterialEndpoints({ ...material, position: node.position });
      return;
    }
    if (node.type === 'sleeve') {
      const sleeve = state.config.protectiveSleeves.find((item) => item.id === node.id);
      if (!sleeve) return;
      const center = {
        x: node.position.x + sleeve.width / 2,
        y: node.position.y + sleeve.height / 2,
      };
      const targetMaterials = state.config.materials.filter((material) => {
        const materialCenterY = material.position.y + CANVAS_MATERIAL_SLEEVE_CENTER_Y;
        return (
          center.x >= material.position.x - 15
          && center.x <= material.position.x + material.width + 15
          && materialCenterY >= node.position.y
          && materialCenterY <= node.position.y + sleeve.height
        );
      });

      if (targetMaterials.length > 0) {
        const placement = placeSleeveAroundMaterials(targetMaterials, sleeve.width);
        state.updateProtectiveSleeve(node.id, {
          position: placement?.position ?? node.position,
          height: placement?.height ?? sleeve.height,
          attachedMaterialIds: targetMaterials.map((material) => material.id),
        });
      } else {
        state.updateProtectiveSleeve(node.id, {
          position: node.position,
          attachedMaterialIds: [],
        });
      }
    }
  }, [attachNearbyMaterialEndpoints, updateConnector]);

  // --- Selection ---
  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    if (node.type === 'connector') {
      setCanvasSelection(null);
      setSelection({ kind: 'connector', id: node.id });
      return;
    }
    if (node.type === 'material') {
      setSelection({ kind: 'material', id: node.id });
      setCanvasSelection(node.id);
      return;
    }
    if (node.type === 'sleeve') {
      setSelection({ kind: 'sleeve', id: node.id });
      setCanvasSelection(node.id);
      return;
    }
    setSelection({ kind: 'none' });
    setCanvasSelection(node.id);
  }, [setSelection]);

  const onEdgeClick: EdgeMouseHandler = useCallback((_, edge) => {
    setSelection({ kind: 'none' });
    setCanvasSelection(edge.id);
  }, [setSelection]);

  const onPaneClick = useCallback(() => {
    setCanvasSelection(null);
    setSelection({ kind: 'none' });
    setContextMenu(null);
    pendingConnectionPointRef.current = null;
    setPendingConnectionPoint(null);
  }, [setSelection]);

  const onPaneContextMenu = useCallback((event: ReactMouseEvent | MouseEvent) => {
    event.preventDefault();
    const x = 'clientX' in event ? event.clientX : 0;
    const y = 'clientY' in event ? event.clientY : 0;
    setContextMenu({
      x,
      y,
      kind: 'pane',
      flowPosition: screenToFlowPosition({ x, y }),
    });
  }, [screenToFlowPosition]);

  const onNodeContextMenu = useCallback((event: ReactMouseEvent, node: Node) => {
    event.preventDefault();
    if (node.type === 'material') {
      setCanvasSelection(node.id);
      setSelection({ kind: 'material', id: node.id });
      setContextMenu({ x: event.clientX, y: event.clientY, kind: 'material', materialId: node.id });
      return;
    }
    if (node.type === 'sleeve') {
      setCanvasSelection(node.id);
      setSelection({ kind: 'sleeve', id: node.id });
      setContextMenu({ x: event.clientX, y: event.clientY, kind: 'sleeve', sleeveId: node.id });
      return;
    }
    setSelection({ kind: 'connector', id: node.id });
    setContextMenu({ x: event.clientX, y: event.clientY, kind: 'connector', connectorId: node.id });
  }, [setSelection]);

  const onEdgeContextMenu = useCallback((event: ReactMouseEvent, edge: Edge) => {
    event.preventDefault();
    setCanvasSelection(edge.id);
    if (edge.type === 'jumper' && edge.data) {
      const { jumperId } = edge.data as { jumperId: string };
      setContextMenu({ x: event.clientX, y: event.clientY, kind: 'jumper', jumperId });
    } else {
      setContextMenu({ x: event.clientX, y: event.clientY, kind: 'attachment', attachmentId: edge.id });
    }
  }, []);

  const editingMaterial = materials.find((m) => m.id === editingMaterialId) ?? null;
  const editingSleeve = sleeves.find((item) => item.id === sleeveDialog?.sleeveId);
  const electronicGroups = getElectronicMaterialGroups(materials);
  const candidateMaterialIds = sleeveDialog?.materialId
    ? (electronicGroups.get(sleeveDialog.materialId) ?? [sleeveDialog.materialId])
    : materials.map((material) => material.id);
  const sleeveMaterialOptions = materials
    .filter((material) => candidateMaterialIds.includes(material.id))
    .map((material) => ({
      id: material.id,
      name: material.name,
      description: materialDescriptionForOption(material),
    }));

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onReconnectStart={() => {
          reconnectSucceeded.current = false;
        }}
        onReconnectEnd={(_, edge) => {
          if (!reconnectSucceeded.current) {
            if (edge.type === 'attachment') {
              handleDetachEndpoint(edge.id);
            }
          }
          reconnectSucceeded.current = false;
        }}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        connectionMode={ConnectionMode.Loose}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        attributionPosition="bottom-left"
        deleteKeyCode={null}
      >
        <Background color="#cbd5e1" gap={20} />
        <Controls />
      </ReactFlow>

      {pendingConnectionPoint && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-blue-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-blue-700 shadow">
          {pendingConnectionPoint.kind === 'material'
            ? '已选择线材端点，请点击连接器 PIN 点'
            : '已选择连接器 PIN 点，请点击线材端点'}
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onAddConnector={handleAddConnector}
          onAddCanvasWire={handleAddCanvasWire}
          onAddProtectiveSleeve={handleAddProtectiveSleeve}
          onAddModel={() => setModelDialogOpen(true)}
          onAddMaterialLabel={(materialId) => setAccessoryDialog({ materialId, kind: 'label' })}
          onAddMaterialNumberTube={(materialId) => setAccessoryDialog({ materialId, kind: 'number-tube' })}
          onEditConnector={(id) => setSelection({ kind: 'connector', id })}
          onChangeConnector={(id) => setSelection({ kind: 'connector', id })}
          onCopyConnector={(connectorId) => {
            const instance = config.connectors.find((c) => c.id === connectorId);
            if (!instance) return;
            const newInstance: ConnectorInstance = {
              ...instance,
              id: generateId(),
              position: { x: instance.position.x + 50, y: instance.position.y + 50 },
              label: `${instance.label}（副本）`,
              jumpers: [],
            };
            useHarnessStore.getState().addConnector(newInstance);
          }}
          onDeleteConnector={(id) => useHarnessStore.getState().removeConnector(id)}
          onEditMaterial={(id) => {
            setNewMaterialId(null);
            setEditingMaterialId(id);
          }}
          onDeleteMaterial={(id) => {
            useHarnessStore.getState().removeMaterial(id);
            setCanvasSelection(null);
          }}
          onEditSleeve={(id) => {
            const sleeve = sleeves.find((item) => item.id === id);
            if (!sleeve) return;
            setSleeveDialog({
              sleeveId: sleeve.id,
              position: sleeve.position,
              materialId: sleeve.attachedMaterialIds[0],
            });
          }}
          onDeleteSleeve={(id) => {
            useHarnessStore.getState().removeProtectiveSleeve(id);
            setCanvasSelection(null);
          }}
          onDetachEndpoint={handleDetachEndpoint}
          onDeleteJumper={handleDeleteJumper}
          onFitView={() => fitView({ duration: 300 })}
          hasSelection={selection.kind !== 'none' || canvasSelection !== null}
        />
      )}

      <WireMaterialDialog
        key={editingMaterialId ?? 'closed'}
        material={editingMaterial}
        onCancel={() => {
          if (newMaterialId) {
            useHarnessStore.getState().removeMaterial(newMaterialId);
          }
          setEditingMaterialId(null);
          setNewMaterialId(null);
        }}
        onConfirm={(updates) => {
          if (editingMaterialId) {
            useHarnessStore.getState().updateMaterial(editingMaterialId, updates);
          }
          setEditingMaterialId(null);
          setNewMaterialId(null);
        }}
      />

      <ProtectiveSleeveDialog
        key={sleeveDialog?.sleeveId ?? `${sleeveDialog?.materialId ?? 'pane'}-${sleeveDialog ? 'open' : 'closed'}`}
        isOpen={sleeveDialog !== null}
        editing={Boolean(sleeveDialog?.sleeveId)}
        initialType={
          sleeves.find((item) => item.id === sleeveDialog?.sleeveId)?.type
          ?? 'heat-shrink'
        }
        initialLengthMm={
          sleeves.find((item) => item.id === sleeveDialog?.sleeveId)?.lengthMm
          ?? 100
        }
        initialCorrugatedMaterial={
          sleeves.find((item) => item.id === sleeveDialog?.sleeveId)?.corrugatedMaterial
          ?? 'PP'
        }
        initialMaterialIds={
          editingSleeve?.attachedMaterialIds
          ?? (sleeveDialog?.materialId ? [sleeveDialog.materialId] : [])
        }
        materialOptions={sleeveMaterialOptions}
        onCancel={() => setSleeveDialog(null)}
        onConfirm={(type, lengthMm, corrugatedMaterial, materialIds) => {
          if (!sleeveDialog) return;
          const state = useHarnessStore.getState();
          const width = lengthMmToCanvasWidth(lengthMm);
          const attachedMaterials = materialIds
            .map((materialId) => state.config.materials.find((material) => material.id === materialId))
            .filter((material): material is CanvasWireMaterial => Boolean(material));
          const placement = placeSleeveAroundMaterials(attachedMaterials, width);
          const position = placement?.position ?? sleeveDialog.position;
          const height = placement?.height ?? 36;

          if (sleeveDialog.sleeveId) {
            state.updateProtectiveSleeve(sleeveDialog.sleeveId, {
              type,
              lengthMm,
              width,
              height,
              position,
              attachedMaterialIds: materialIds,
              corrugatedMaterial: type === 'corrugated' ? corrugatedMaterial : undefined,
            });
            setCanvasSelection(sleeveDialog.sleeveId);
          } else {
            const sleeve: ProtectiveSleeve = {
              id: generateId(),
              type,
              lengthMm,
              width,
              height,
              position,
              attachedMaterialIds: materialIds,
              corrugatedMaterial: type === 'corrugated' ? corrugatedMaterial : undefined,
            };
            state.addProtectiveSleeve(sleeve);
            setCanvasSelection(sleeve.id);
          }
          setSleeveDialog(null);
        }}
      />

      {modelDialogOpen && <CanvasModelDialog onClose={() => setModelDialogOpen(false)} />}

      {accessoryDialog && (() => {
        const material = materials.find((item) => item.id === accessoryDialog.materialId);
        if (!material) return null;
        return (
          <MaterialAccessoryDialog
            key={`${accessoryDialog.materialId}:${accessoryDialog.kind}`}
            kind={accessoryDialog.kind}
            materialName={material.name}
            onCancel={() => setAccessoryDialog(null)}
            onConfirm={(content, lengthMm) => {
              const state = useHarnessStore.getState();
              const current = state.config.materials.find((item) => item.id === material.id);
              if (!current) return;
              if (accessoryDialog.kind === 'label') {
                state.updateMaterial(material.id, {
                  labels: [
                    ...(current.labels ?? []),
                    {
                      id: generateId(),
                      material: '五防热敏纸标签纸',
                      content,
                      lengthMm,
                    },
                  ],
                });
              } else {
                state.updateMaterial(material.id, {
                  numberTubes: [
                    ...(current.numberTubes ?? []),
                    { id: generateId(), content, lengthMm },
                  ],
                });
              }
              setAccessoryDialog(null);
            }}
          />
        );
      })()}
    </div>
  );
}

function materialDescriptionForOption(material: CanvasWireMaterial): string {
  return material.spec.kind === 'electronic'
    ? `电子线 · ${material.spec.color} · ${material.spec.lengthMm}mm`
    : `护套线 · ${material.spec.coreCount}芯 · ${material.spec.lengthMm}mm`;
}

export function HarnessCanvas() {
  return (
    <ReactFlowProvider>
      <HarnessCanvasInner />
    </ReactFlowProvider>
  );
}

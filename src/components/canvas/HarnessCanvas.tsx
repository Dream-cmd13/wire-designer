import {
  Suspense,
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
import { addConnector, attachMaterialEndpoint, addConnectorJumper, detachMaterialEndpoint, reassignMaterialEndpoint, generateId, getActiveConnectorSide, removeConnectorJumper, removeMaterialCircuit } from '@/lib/commands';
import {
  CANVAS_MODEL_SIZE,
  createDefaultCanvasMaterial,
  lengthMmToCanvasWidth,
  placeSleeveAroundMaterials,
  getConnectorNodeWidth,
  getConnectorHeight,
  getConnectorPinHandlePosition,
  getMaterialEndpointPoint,
  getMaterialCenterY,
  segmentIntersectsRect,
  getVisiblePinCount,
} from '@/lib/canvasMaterials';
import { useHarnessStore } from '@/stores/harnessStore';
import type {
  CanvasModel,
  CanvasWireMaterial,
  ConnectorInstance,
  ConnectorSide,
  HarnessConfig,
  MaterialEndpoint,
  ProtectiveSleeve,
} from '@/types/harness';
import { ConnectorNode } from './ConnectorNode';
import { CanvasModelNode } from './CanvasModelNode';
import { ContextMenu, type ContextMenuState } from './ContextMenu';
import { JumperEdge } from './JumperEdge';
import { setJumperContextMenuHandler } from './jumperContextMenu';
import { MaterialAttachmentEdge } from './MaterialAttachmentEdge';
import { ProtectiveSleeveNode } from './ProtectiveSleeveNode';
import { WireMaterialNode, type WireMaterialNodeData } from './WireMaterialNode';
import { OvermoldPickerDialog } from '../shared/OvermoldPickerDialog';
import { MaterialAccessoryDialog, type MaterialAccessoryKind } from './MaterialAccessoryDialog';
import { ProtectiveSleeveDialog } from './ProtectiveSleeveDialog';
import { WireMaterialDialog } from './WireMaterialDialog';
import {
  setMaterialAccessoryContextMenuHandler,
  setMaterialAccessoryDialogHandler,
} from './materialAccessoryEvents';
import {
  setMaterialConnectionPointHandler,
  type MaterialConnectionPoint,
} from './materialConnectionClick';
import { DeleteConfirmToast } from '@/components/shared/DeleteConfirmToast';
import { PartPickerDialog } from '@/components/shared/PartPickerDialog';
import { UndoToast } from '@/components/shared/UndoToast';

const nodeTypes: NodeTypes = {
  connector: ConnectorNode,
  material: WireMaterialNode,
  sleeve: ProtectiveSleeveNode,
  model: CanvasModelNode,
};
const edgeTypes: EdgeTypes = {
  attachment: MaterialAttachmentEdge,
  jumper: JumperEdge,
};
const EMPTY_MATERIALS: CanvasWireMaterial[] = [];
const EMPTY_SLEEVES: ProtectiveSleeve[] = [];
const EMPTY_MODELS: CanvasModel[] = [];

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

function getModelRect(model: CanvasModel) {
  return {
    x: model.position.x,
    y: model.position.y,
    width: model.width,
    height: model.height,
  };
}

function findModelPlacement(
  config: HarnessConfig,
  flowPosition: { x: number; y: number },
): { x: number; y: number } {
  // Find the nearest connector to the click position
  let bestConnector: ConnectorInstance | undefined;
  let minDist = Infinity;

  for (const connector of config.connectors) {
    const cx = connector.position.x + getConnectorNodeWidth(connector) / 2;
    const cy = connector.position.y + getConnectorHeight(connector) / 2;
    const d = Math.hypot(cx - flowPosition.x, cy - flowPosition.y);
    if (d < minDist) {
      minDist = d;
      bestConnector = connector;
    }
  }

  if (bestConnector) {
    // Which side has active connections (where the wire exits the connector)
    const activeSide = getActiveConnectorSide(config, bestConnector.id) ?? 'right';
    const modelY = bestConnector.position.y;
    const connectorWidth = getConnectorNodeWidth(bestConnector);

    if (activeSide === 'right') {
      // Place overmold just to the RIGHT of the connector's right edge
      return {
        x: bestConnector.position.x + connectorWidth + 8,
        y: modelY,
      };
    } else {
      // Place overmold just to the LEFT of the connector's left edge
      return {
        x: bestConnector.position.x - CANVAS_MODEL_SIZE - 8,
        y: modelY,
      };
    }
  }

  // No connector: place at click position
  return {
    x: flowPosition.x - CANVAS_MODEL_SIZE / 2,
    y: flowPosition.y - CANVAS_MODEL_SIZE / 2,
  };
}

// ============================================================
// Edge generation from config
// ============================================================

function buildEdges(config: HarnessConfig, canvasSelection: string | null): Edge[] {
  const edges: Edge[] = [];
  const legacyNumberTubeRenderedMaterialIds = new Set<string>();

  // Material circuit edges
  for (const material of config.materials) {
    for (const circuit of material.circuits) {
      if (circuit.start) {
        const edgeId = `${circuit.id}:start`;
        const numberTubes = getAttachmentNumberTubes(
          material,
          circuit.id,
          'start',
          legacyNumberTubeRenderedMaterialIds,
        );
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
            routeOffset: circuit.route?.start,
            solid: material.spec.kind === 'jacketed',
            numberTubes: numberTubes.length > 0 ? numberTubes : undefined,
          },
          selected: canvasSelection === edgeId,
          reconnectable: 'target',
        });
      }
      if (circuit.end) {
        const edgeId = `${circuit.id}:end`;
        const numberTubes = getAttachmentNumberTubes(
          material,
          circuit.id,
          'end',
          legacyNumberTubeRenderedMaterialIds,
        );
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
            routeOffset: circuit.route?.end,
            solid: material.spec.kind === 'jacketed',
            numberTubes: numberTubes.length > 0 ? numberTubes : undefined,
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

function nodeStyleEqual(
  a: Node['style'] | undefined,
  b: Node['style'] | undefined,
) {
  const aWidth = a && 'width' in a ? a.width : undefined;
  const bWidth = b && 'width' in b ? b.width : undefined;
  const aHeight = a && 'height' in a ? a.height : undefined;
  const bHeight = b && 'height' in b ? b.height : undefined;
  return aWidth === bWidth && aHeight === bHeight;
}

function canReuseNode(prev: Node | undefined, next: Node) {
  if (!prev) return false;
  return (
    prev.type === next.type
    && prev.selected === next.selected
    && prev.dragHandle === next.dragHandle
    && prev.zIndex === next.zIndex
    && prev.position.x === next.position.x
    && prev.position.y === next.position.y
    && prev.data === next.data
    && nodeStyleEqual(prev.style, next.style)
  );
}

// ============================================================
// Canvas Component
// ============================================================

interface SleeveDialogState {
  position: { x: number; y: number };
  materialId?: string;
  sleeveId?: string;
}

interface ConnectorDialogState {
  position: { x: number; y: number };
}

interface AccessoryDialogState {
  materialId: string;
  kind: MaterialAccessoryKind;
  accessoryId?: string;
  circuitId?: string;
  endpoint?: MaterialEndpoint;
}

function getAttachmentNumberTubes(
  material: CanvasWireMaterial,
  circuitId: string,
  endpoint: MaterialEndpoint,
  legacyRenderedMaterialIds: Set<string>,
) {
  const numberTubes = material.numberTubes ?? [];
  const boundNumberTubes = numberTubes.filter(
    (tube) => tube.circuitId === circuitId && tube.endpoint === endpoint,
  );
  const legacyNumberTubes = numberTubes.filter((tube) => !tube.circuitId && !tube.endpoint);

  if (legacyNumberTubes.length === 0 || legacyRenderedMaterialIds.has(material.id)) {
    return boundNumberTubes;
  }

  legacyRenderedMaterialIds.add(material.id);
  return [...boundNumberTubes, ...legacyNumberTubes];
}

interface ModelLinkedGroup {
  modelId: string;
  connectorIds: Set<string>;
  materialIds: Set<string>;
}

function getModelLinkedGroups(config: HarnessConfig): ModelLinkedGroup[] {
  return config.models.map((model) => {
    const rect = getModelRect(model);
    const connectorIds = new Set<string>();
    const materialIds = new Set<string>();

    for (const material of config.materials) {
      for (const circuit of material.circuits) {
        for (const endpoint of ['start', 'end'] as const) {
          const ref = circuit[endpoint];
          if (!ref) continue;
          const connector = config.connectors.find((item) => item.id === ref.connectorId);
          if (!connector) continue;
          if (
            segmentIntersectsRect(
              getMaterialEndpointPoint(material, endpoint),
              getConnectorPinHandlePosition(connector, ref.connectorSide, ref.pin),
              rect,
            )
          ) {
            materialIds.add(material.id);
            connectorIds.add(connector.id);
          }
        }
      }
    }

    return {
      modelId: model.id,
      connectorIds,
      materialIds,
    };
  });
}

function getLinkedDragNodeIds(
  config: HarnessConfig,
  nodeId: string,
) {
  const groups = getModelLinkedGroups(config);
  if (groups.length === 0) return [nodeId];

  // Map each group to a set of all its member IDs
  const sets = groups.map((g) => {
    const s = new Set<string>();
    s.add(g.modelId);
    for (const cid of g.connectorIds) s.add(cid);
    for (const mid of g.materialIds) s.add(mid);
    return s;
  });

  // Transitively merge sets that share any overlap.
  // This satisfies the request that if a wire has two outer molds,
  // or a model spans multiple wires/connectors, they form a single unified block.
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        let hasOverlap = false;
        for (const item of sets[i]) {
          if (sets[j].has(item)) {
            hasOverlap = true;
            break;
          }
        }
        if (hasOverlap) {
          for (const item of sets[j]) {
            sets[i].add(item);
          }
          sets.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }

  // Find the merged set containing our dragged node ID
  const matchedSet = sets.find((s) => s.has(nodeId));
  if (!matchedSet) return [nodeId];

  return [...matchedSet];
}

function applyNodePositionsToConfig(
  config: HarnessConfig,
  positions: Map<string, { x: number; y: number }>,
) {
  const nextMaterials = config.materials.map((material) =>
    positions.has(material.id)
      ? { ...material, position: positions.get(material.id)! }
      : material,
  );
  const nextProtectiveSleeves = config.protectiveSleeves.map((sleeve) => {
    const attachedMaterials = sleeve.attachedMaterialIds
      .map((materialId) => nextMaterials.find((material) => material.id === materialId))
      .filter((material): material is CanvasWireMaterial => Boolean(material));
    const placement = placeSleeveAroundMaterials(attachedMaterials, sleeve.width);
    if (!placement) {
      return {
        ...sleeve,
        attachedMaterialIds: [],
        height: sleeve.height || 36,
      };
    }
    return {
      ...sleeve,
      position: placement.position,
      height: placement.height,
    };
  });

  return {
    ...config,
    connectors: config.connectors.map((connector) =>
      positions.has(connector.id)
        ? { ...connector, position: positions.get(connector.id)! }
        : connector,
    ),
    materials: nextMaterials,
    protectiveSleeves: nextProtectiveSleeves,
    models: config.models.map((model) =>
      positions.has(model.id)
        ? { ...model, position: positions.get(model.id)! }
        : model,
    ),
    updatedAt: Date.now(),
  };
}

function getSleevePreviewUpdates(
  config: HarnessConfig,
  positions: Map<string, { x: number; y: number }>,
) {
  const nextMaterials = config.materials.map((material) =>
    positions.has(material.id)
      ? { ...material, position: positions.get(material.id)! }
      : material,
  );

  return new Map(
    config.protectiveSleeves.map((sleeve) => {
      const attachedMaterials = sleeve.attachedMaterialIds
        .map((materialId) => nextMaterials.find((material) => material.id === materialId))
        .filter((material): material is CanvasWireMaterial => Boolean(material));
      const placement = placeSleeveAroundMaterials(attachedMaterials, sleeve.width);
      return [
        sleeve.id,
        placement
          ? {
              position: placement.position,
              height: placement.height,
            }
          : {
              position: sleeve.position,
              height: sleeve.height || 36,
            },
      ] as const;
    }),
  );
}

function HarnessCanvasInner() {
  const { config, selection, setSelection, updateConnector } = useHarnessStore();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [canvasSelection, setCanvasSelection] = useState<string | null>(null);
  const [connectorDialog, setConnectorDialog] = useState<ConnectorDialogState | null>(null);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [newMaterialDraft, setNewMaterialDraft] = useState<CanvasWireMaterial | null>(null);
  const [sleeveDialog, setSleeveDialog] = useState<SleeveDialogState | null>(null);
  const [modelDialogPosition, setModelDialogPosition] = useState<{ x: number; y: number } | null>(null);
  const [accessoryDialog, setAccessoryDialog] = useState<AccessoryDialogState | null>(null);
  const [pendingConnectionPoint, setPendingConnectionPoint] = useState<MaterialConnectionPoint | null>(null);
  const [deleteConfirmToast, setDeleteConfirmToast] = useState<{
    title?: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const [deletionNotice, setDeletionNotice] = useState<{
    message: string;
    snapshot: HarnessConfig;
    afterConfig: HarnessConfig;
  } | null>(null);
  const pendingConnectionPointRef = useRef<MaterialConnectionPoint | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const dragGroupRef = useRef<{
    draggedNodeId: string;
    nodeIds: string[];
    initialPositions: Map<string, { x: number; y: number }>;
  } | null>(null);
  const reconnectSucceeded = useRef(false);
  const hasAutoFitted = useRef(false);
  const { fitView, screenToFlowPosition } = useReactFlow();

  const materials = config.materials ?? EMPTY_MATERIALS;
  const sleeves = config.protectiveSleeves ?? EMPTY_SLEEVES;
  const models = config.models ?? EMPTY_MODELS;

  // Register the jumper context menu handler so ConnectorNode's jumper
  // SVG arcs can trigger this context menu (the arcs are drawn as node
  // overlays, not as React Flow edges, so onEdgeContextMenu doesn't fire).
  useEffect(() => {
    setJumperContextMenuHandler((jumperId, x, y) => {
      setContextMenu({ x, y, kind: 'jumper', jumperId });
    });
    return () => setJumperContextMenuHandler(null);
  }, []);

  useEffect(() => {
    if (!deletionNotice) return;
    const timer = window.setTimeout(() => setDeletionNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [deletionNotice]);

  useEffect(() => {
    if (!deleteConfirmToast) return;
    const timer = window.setTimeout(() => setDeleteConfirmToast(null), 8000);
    return () => window.clearTimeout(timer);
  }, [deleteConfirmToast]);

  useEffect(() => {
    setMaterialAccessoryDialogHandler((request) => {
      setAccessoryDialog(request);
    });
    return () => setMaterialAccessoryDialogHandler(null);
  }, []);

  useEffect(() => {
    setMaterialAccessoryContextMenuHandler((request) => {
      setContextMenu({
        x: request.x,
        y: request.y,
        kind: 'accessory',
        materialId: request.materialId,
        accessoryKind: request.kind,
        accessoryId: request.accessoryId,
        attachmentCircuitId: request.circuitId,
        attachmentEndpoint: request.endpoint,
      });
    });
    return () => setMaterialAccessoryContextMenuHandler(null);
  }, []);

  const deleteWithUndo = useCallback((
    message: string,
    action: (state: ReturnType<typeof useHarnessStore.getState>) => void,
    afterDelete?: () => void,
  ) => {
    const state = useHarnessStore.getState();
    const snapshot = state.config;
    action(state);
    afterDelete?.();
    setDeletionNotice({
      message,
      snapshot,
      afterConfig: useHarnessStore.getState().config,
    });
  }, []);

  const requestDeleteConfirmation = useCallback((options: {
    title?: string;
    message: string;
    confirmLabel?: string;
    undoMessage: string;
    action: (state: ReturnType<typeof useHarnessStore.getState>) => void;
    afterDelete?: () => void;
  }) => {
    setDeleteConfirmToast({
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel,
      onConfirm: () => {
        setDeleteConfirmToast(null);
        deleteWithUndo(options.undoMessage, options.action, options.afterDelete);
      },
    });
  }, [deleteWithUndo]);

  const handleRequestRemoveCircuit = useCallback((materialId: string, circuitId: string) => {
    const material = config.materials.find((item) => item.id === materialId);
    if (!material) return;
    requestDeleteConfirmation({
      message: `删除线材“${material.name}”上的这条接线？`,
      undoMessage: `已删除线材“${material.name}”上的接线`,
      action: (state) => {
        state.replaceDocument(removeMaterialCircuit(state.config, materialId, circuitId));
      },
    });
  }, [config.materials, requestDeleteConfirmation]);

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
      zIndex: 6,
    }));
    const materialNodes: Node[] = materials.map((material) => {
      const detailMaterialIds = electronicGroups.get(material.id) ?? [material.id];
      const nodeData: WireMaterialNodeData = {
        ...material,
        detailMaterialIds,
        showMergedDetails: detailMaterialIds[detailMaterialIds.length - 1] === material.id,
        onRequestRemoveCircuit: handleRequestRemoveCircuit,
      };
      return {
        id: material.id,
        type: 'material',
        position: material.position,
        data: nodeData as unknown as Node['data'],
        selected: canvasSelection === material.id,
        dragHandle: '.wire-material-drag',
        zIndex: 4,
      };
    });
    const sleeveNodes: Node[] = sleeves.map((sleeve) => ({
      id: sleeve.id,
      type: 'sleeve',
      position: sleeve.position,
      data: sleeve as unknown as Node['data'],
      selected: canvasSelection === sleeve.id,
      zIndex: 5,
    }));
    const modelNodes: Node[] = models.map((model) => ({
      id: model.id,
      type: 'model',
      position: model.position,
      data: model as unknown as Node['data'],
      selected: selection.kind === 'model' && selection.id === model.id,
      style: { width: model.width, height: model.height },
      zIndex: 1,
    }));

    const nextNodes = [...connectorNodes, ...materialNodes, ...sleeveNodes, ...modelNodes];
    setNodes((previousNodes) => {
      const previousById = new Map(previousNodes.map((node) => [node.id, node]));
      const resolvedNodes = nextNodes.map((node) => {
        const previous = previousById.get(node.id);
        if (previous && canReuseNode(previous, node)) {
          return previous;
        }
        if (previous) {
          return { ...previous, ...node };
        }
        return node;
      });
      nodesRef.current = resolvedNodes;
      return resolvedNodes;
    });
  }, [canvasSelection, config.connectors, handleRequestRemoveCircuit, materials, models, selection, setNodes, sleeves]);

  // Build edges from circuits and jumpers
  useEffect(() => {
    setEdges(buildEdges(config, canvasSelection));
  }, [config, canvasSelection, setEdges]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

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
    setConnectorDialog({ position: currentFlowPosition() });
  }, [currentFlowPosition]);

  const handleAddCanvasWire = useCallback(() => {
    const id = generateId();
    setNewMaterialDraft(createDefaultCanvasMaterial(id, currentFlowPosition()));
    setEditingMaterialId(id);
  }, [currentFlowPosition]);

  const handleAddProtectiveSleeve = useCallback((materialId?: string) => {
    setSleeveDialog({ position: currentFlowPosition(), materialId });
  }, [currentFlowPosition]);

  const handleOpenModelDialog = useCallback(() => {
    setModelDialogPosition(currentFlowPosition());
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
    requestDeleteConfirmation({
      title: '确认断开',
      message: `断开线材“${material.name}”的${side === 'start' ? '起点' : '终点'}连接？`,
      confirmLabel: '断开',
      undoMessage: `已断开线材“${material.name}”的连接`,
      action: (store) => {
        const nextConfig = detachMaterialEndpoint(store.config, material.id, circuitId, side);
        store.replaceDocument(nextConfig);
      },
      afterDelete: () => {
        setCanvasSelection(null);
      },
    });
  }, [requestDeleteConfirmation]);

  const handleDeleteJumper = useCallback((jumperId: string) => {
    const state = useHarnessStore.getState();
    // Find the connector that owns this jumper
    const connector = state.config.connectors.find((c) =>
      c.jumpers.some((j) => j.id === jumperId),
    );
    if (!connector) return;
    requestDeleteConfirmation({
      message: `删除连接器“${connector.label}”上的短接？`,
      undoMessage: `已删除连接器“${connector.label}”上的短接`,
      action: (store) => {
        const nextConfig = removeConnectorJumper(store.config, connector.id, jumperId);
        store.replaceDocument(nextConfig);
      },
      afterDelete: () => {
        setCanvasSelection(null);
      },
    });
  }, [requestDeleteConfirmation]);

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
            width: getConnectorNodeWidth(connector),
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

  const handleDeleteAccessory = useCallback((
    materialId: string,
    kind: MaterialAccessoryKind,
    accessoryId: string,
  ) => {
    const state = useHarnessStore.getState();
    const current = state.config.materials.find((item) => item.id === materialId);
    if (!current) return;
    requestDeleteConfirmation({
      message: kind === 'label'
        ? `删除线材“${current.name}”上的标签？`
        : `删除线材“${current.name}”上的号码管？`,
      undoMessage: kind === 'label' ? '已删除标签' : '已删除号码管',
      action: (store) => {
        const latest = store.config.materials.find((item) => item.id === materialId);
        if (!latest) return;
        if (kind === 'label') {
          store.updateMaterial(materialId, {
            labels: (latest.labels ?? []).filter((item) => item.id !== accessoryId),
          });
          return;
        }
        store.updateMaterial(materialId, {
          numberTubes: (latest.numberTubes ?? []).filter((item) => item.id !== accessoryId),
        });
      },
    });
  }, [requestDeleteConfirmation]);

  const onNodeDragStart: OnNodeDrag = useCallback((_, node) => {
    const linkedNodeIds = getLinkedDragNodeIds(useHarnessStore.getState().config, node.id);
    if (linkedNodeIds.length <= 1) {
      dragGroupRef.current = null;
      return;
    }

    const initialPositions = new Map<string, { x: number; y: number }>();
    for (const currentNode of nodesRef.current) {
      if (linkedNodeIds.includes(currentNode.id)) {
        initialPositions.set(currentNode.id, currentNode.position);
      }
    }
    if (!initialPositions.has(node.id)) {
      initialPositions.set(node.id, node.position);
    }

    dragGroupRef.current = {
      draggedNodeId: node.id,
      nodeIds: linkedNodeIds,
      initialPositions,
    };
  }, []);

  const onNodeDrag: OnNodeDrag = useCallback((_, node) => {
    const dragGroup = dragGroupRef.current;
    if (dragGroup && dragGroup.draggedNodeId === node.id) {
      const draggedInitialPosition = dragGroup.initialPositions.get(node.id);
      if (!draggedInitialPosition) return;

      const deltaX = node.position.x - draggedInitialPosition.x;
      const deltaY = node.position.y - draggedInitialPosition.y;
      const positionOverrides = new Map<string, { x: number; y: number }>();
      for (const currentNodeId of dragGroup.nodeIds) {
        const initialPosition = dragGroup.initialPositions.get(currentNodeId);
        if (!initialPosition) continue;
        positionOverrides.set(currentNodeId, {
          x: initialPosition.x + deltaX,
          y: initialPosition.y + deltaY,
        });
      }
      const sleevePreviewUpdates = getSleevePreviewUpdates(useHarnessStore.getState().config, positionOverrides);

      setNodes((currentNodes) => currentNodes.map((currentNode) => {
        if (positionOverrides.has(currentNode.id)) {
          return {
            ...currentNode,
            position: positionOverrides.get(currentNode.id)!,
          };
        }
        const sleevePreview = sleevePreviewUpdates.get(currentNode.id);
        if (currentNode.type === 'sleeve' && sleevePreview) {
          return {
            ...currentNode,
            position: sleevePreview.position,
            data: {
              ...(currentNode.data as Record<string, unknown>),
              height: sleevePreview.height,
            },
          };
        }
        return currentNode;
      }));
      return;
    }

    if (node.type === 'material') {
      const positionOverrides = new Map<string, { x: number; y: number }>([[node.id, node.position]]);
      const sleevePreviewUpdates = getSleevePreviewUpdates(useHarnessStore.getState().config, positionOverrides);
      if (sleevePreviewUpdates.size === 0) return;
      setNodes((currentNodes) => currentNodes.map((currentNode) => {
        const sleevePreview = sleevePreviewUpdates.get(currentNode.id);
        if (currentNode.type === 'sleeve' && sleevePreview) {
          return {
            ...currentNode,
            position: sleevePreview.position,
            data: {
              ...(currentNode.data as Record<string, unknown>),
              height: sleevePreview.height,
            },
          };
        }
        return currentNode;
      }));
    }
  }, [setNodes]);

  const onNodeDragStop: OnNodeDrag = useCallback((_, node) => {
    const state = useHarnessStore.getState();
    const dragGroup = dragGroupRef.current;
    if (dragGroup && dragGroup.draggedNodeId === node.id) {
      const draggedInitialPosition = dragGroup.initialPositions.get(node.id);
      if (draggedInitialPosition) {
        const deltaX = node.position.x - draggedInitialPosition.x;
        const deltaY = node.position.y - draggedInitialPosition.y;
        const finalPositions = new Map<string, { x: number; y: number }>();
        for (const nodeId of dragGroup.nodeIds) {
          const initialPosition = dragGroup.initialPositions.get(nodeId);
          if (!initialPosition) continue;
          finalPositions.set(nodeId, {
            x: initialPosition.x + deltaX,
            y: initialPosition.y + deltaY,
          });
        }
        state.replaceDocument(applyNodePositionsToConfig(state.config, finalPositions));
        if (node.type === 'connector') {
          setCanvasSelection(null);
          setSelection({ kind: 'connector', id: node.id });
        } else if (node.type === 'material') {
          setCanvasSelection(node.id);
          setSelection({ kind: 'material', id: node.id });
        } else if (node.type === 'model') {
          setCanvasSelection(node.id);
          setSelection({ kind: 'model', id: node.id });
        }
        dragGroupRef.current = null;
        return;
      }
    }
    dragGroupRef.current = null;

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
        const materialCenterY = material.position.y + getMaterialCenterY(material.spec.kind);
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
      return;
    }
    if (node.type === 'model') {
      state.updateModel(node.id, { position: node.position });
    }
  }, [attachNearbyMaterialEndpoints, setSelection, updateConnector]);

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
    if (node.type === 'model') {
      setSelection({ kind: 'model', id: node.id });
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
    if (node.type === 'model') {
      setCanvasSelection(node.id);
      setSelection({ kind: 'model', id: node.id });
      setContextMenu({ x: event.clientX, y: event.clientY, kind: 'model', modelId: node.id });
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
      const attachmentData = edge.data as {
        materialId?: string;
        circuitId?: string;
        side?: MaterialEndpoint;
      } | undefined;
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        kind: 'attachment',
        attachmentId: edge.id,
        attachmentMaterialId: attachmentData?.materialId,
        attachmentCircuitId: attachmentData?.circuitId,
        attachmentEndpoint: attachmentData?.side,
      });
    }
  }, []);

  const editingMaterial = newMaterialDraft
    ?? materials.find((material) => material.id === editingMaterialId)
    ?? null;
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
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
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
          onAddModel={handleOpenModelDialog}
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
          onDeleteConnector={(id) => {
            const connector = config.connectors.find((item) => item.id === id);
            if (!connector) return;
            const disconnectedCount = config.materials.reduce(
              (count, material) => count + material.circuits.filter((circuit) =>
                circuit.start?.connectorId === id || circuit.end?.connectorId === id).length,
              0,
            );
            const jumperCount = connector.jumpers.length;
            requestDeleteConfirmation({
              message:
                disconnectedCount > 0 || jumperCount > 0
                  ? `删除“${connector.label}”将断开 ${disconnectedCount} 条接线${jumperCount > 0 ? `，并删除 ${jumperCount} 个短接` : ''}。`
                  : `删除连接器“${connector.label}”？`,
              undoMessage: `已删除连接器“${connector.label}”`,
              action: (state) => state.removeConnector(id),
            });
          }}
          onEditMaterial={(id) => {
            setNewMaterialDraft(null);
            setEditingMaterialId(id);
          }}
          onDeleteMaterial={(id) => {
            const material = config.materials.find((item) => item.id === id);
            if (!material) return;
            requestDeleteConfirmation({
              message: `删除线材“${material.name}”？`,
              undoMessage: `已删除线材“${material.name}”`,
              action: (state) => state.removeMaterial(id),
              afterDelete: () => {
                setCanvasSelection(null);
              },
            });
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
            requestDeleteConfirmation({
              message: '删除当前保护套？',
              undoMessage: '已删除保护套',
              action: (state) => state.removeProtectiveSleeve(id),
              afterDelete: () => {
                setCanvasSelection(null);
              },
            });
          }}
          onDeleteModel={(id) => {
            requestDeleteConfirmation({
              message: '删除当前外模？',
              undoMessage: '已删除外模',
              action: (state) => state.removeModel(id),
              afterDelete: () => {
                setCanvasSelection(null);
              },
            });
          }}
          onAddAttachmentNumberTube={(materialId, circuitId, endpoint) =>
            setAccessoryDialog({ materialId, kind: 'number-tube', circuitId, endpoint })
          }
          onEditAccessory={(materialId, kind, accessoryId, circuitId, endpoint) =>
            setAccessoryDialog({ materialId, kind, accessoryId, circuitId, endpoint })
          }
          onDeleteAccessory={handleDeleteAccessory}
          onDetachEndpoint={handleDetachEndpoint}
          onDeleteJumper={handleDeleteJumper}
          onFitView={() => fitView({ duration: 300 })}
          hasSelection={selection.kind !== 'none' || canvasSelection !== null}
        />
      )}

      <Suspense fallback={null}>
      {connectorDialog && (
        <PartPickerDialog
          isOpen
          onClose={() => setConnectorDialog(null)}
          onSelect={(connector) => {
            const state = useHarnessStore.getState();
            const nextConfig = addConnector(state.config, {
              position: connectorDialog.position,
              connector,
            });
            state.replaceDocument(nextConfig);
            const added = nextConfig.connectors[nextConfig.connectors.length - 1];
            if (added) {
              setSelection({ kind: 'connector', id: added.id });
            }
            setConnectorDialog(null);
          }}
        />
      )}
      {editingMaterial && (
        <WireMaterialDialog
          key={editingMaterialId ?? 'closed'}
          material={editingMaterial}
          onCancel={() => {
            setEditingMaterialId(null);
            setNewMaterialDraft(null);
          }}
          onConfirm={(updates) => {
            if (newMaterialDraft) {
              useHarnessStore.getState().addMaterial({ ...newMaterialDraft, ...updates });
              setSelection({ kind: 'material', id: newMaterialDraft.id });
              setCanvasSelection(newMaterialDraft.id);
            } else if (editingMaterialId) {
              useHarnessStore.getState().updateMaterial(editingMaterialId, updates);
            }
            setEditingMaterialId(null);
            setNewMaterialDraft(null);
          }}
        />
      )}

      {sleeveDialog && (
        <ProtectiveSleeveDialog
        key={sleeveDialog.sleeveId ?? `${sleeveDialog.materialId ?? 'pane'}-open`}
        isOpen
        editing={Boolean(sleeveDialog.sleeveId)}
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
        initialRemark={editingSleeve?.remark ?? ''}
        initialCorrugatedFixing={editingSleeve?.corrugatedFixing}
        materialOptions={sleeveMaterialOptions}
        onCancel={() => setSleeveDialog(null)}
        onConfirm={(type, lengthMm, corrugatedMaterial, materialIds, remark, corrugatedFixing) => {
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
              corrugatedFixing: type === 'corrugated' ? corrugatedFixing : undefined,
              remark,
            });
            setSelection({ kind: 'sleeve', id: sleeveDialog.sleeveId });
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
              corrugatedFixing: type === 'corrugated' ? corrugatedFixing : undefined,
              remark,
            };
            state.addProtectiveSleeve(sleeve);
            setSelection({ kind: 'sleeve', id: sleeve.id });
            setCanvasSelection(sleeve.id);
          }
          setSleeveDialog(null);
        }}
        />
      )}

      {modelDialogPosition && (
        <OvermoldPickerDialog
          isOpen={true}
          onClose={() => setModelDialogPosition(null)}
          onSelect={(overmold) => {
            const state = useHarnessStore.getState();
            const placementPos = findModelPlacement(state.config, modelDialogPosition);
            
            let connectorHeight = CANVAS_MODEL_SIZE;
            let minDist = Infinity;
            for (const connector of state.config.connectors) {
              const cx = connector.position.x + getConnectorNodeWidth(connector) / 2;
              const cy = connector.position.y + getConnectorHeight(connector) / 2;
              const d = Math.hypot(cx - modelDialogPosition.x, cy - modelDialogPosition.y);
              if (d < minDist) {
                minDist = d;
                connectorHeight = getConnectorHeight(connector);
              }
            }

            const model: CanvasModel = {
              id: generateId(),
              kind: 'outer-box',
              position: placementPos,
              width: CANVAS_MODEL_SIZE,
              height: connectorHeight,
              overmoldSpecId: overmold.id,
              catalogItemId: overmold.catalogItemId,
              catalogImageUrl: overmold.image,
            };
            state.addModel(model);
            setSelection({ kind: 'model', id: model.id });
            setCanvasSelection(model.id);
            setModelDialogPosition(null);
          }}
        />
      )}

      {accessoryDialog && (() => {
        const material = materials.find((item) => item.id === accessoryDialog.materialId);
        if (!material) return null;
        const editingLabel = accessoryDialog.kind === 'label'
          ? (material.labels ?? []).find((item) => item.id === accessoryDialog.accessoryId)
          : undefined;
        const editingNumberTube = accessoryDialog.kind === 'number-tube'
          ? (material.numberTubes ?? []).find((item) => item.id === accessoryDialog.accessoryId)
          : undefined;
        return (
          <MaterialAccessoryDialog
            key={`${accessoryDialog.materialId}:${accessoryDialog.kind}:${accessoryDialog.accessoryId ?? 'new'}`}
            kind={accessoryDialog.kind}
            materialName={material.name}
            editing={Boolean(accessoryDialog.accessoryId)}
            initialContent={editingLabel?.content ?? editingNumberTube?.content ?? ''}
            initialLengthMm={editingLabel?.lengthMm ?? editingNumberTube?.lengthMm}
            initialDistanceMm={editingNumberTube?.distanceMm ?? 0}
            onCancel={() => setAccessoryDialog(null)}
            onDelete={() => {
              if (!accessoryDialog.accessoryId) return;
              handleDeleteAccessory(material.id, accessoryDialog.kind, accessoryDialog.accessoryId);
              setAccessoryDialog(null);
            }}
            onConfirm={(content, lengthMm, distanceMm) => {
              const state = useHarnessStore.getState();
              const current = state.config.materials.find((item) => item.id === material.id);
              if (!current) return;
              if (accessoryDialog.kind === 'label') {
                state.updateMaterial(material.id, {
                  labels: accessoryDialog.accessoryId
                    ? (current.labels ?? []).map((item) =>
                        item.id === accessoryDialog.accessoryId
                          ? { ...item, content, lengthMm }
                          : item,
                      )
                    : [
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
                  numberTubes: accessoryDialog.accessoryId
                    ? (current.numberTubes ?? []).map((item) =>
                        item.id === accessoryDialog.accessoryId
                          ? {
                              ...item,
                              content,
                              lengthMm,
                              circuitId: accessoryDialog.circuitId ?? item.circuitId,
                              endpoint: accessoryDialog.endpoint ?? item.endpoint,
                              distanceMm: distanceMm ?? item.distanceMm ?? 0,
                            }
                          : item,
                      )
                    : [
                        ...(current.numberTubes ?? []),
                        {
                          id: generateId(),
                          content,
                          lengthMm,
                          circuitId: accessoryDialog.circuitId,
                          endpoint: accessoryDialog.endpoint,
                          distanceMm: distanceMm ?? 0,
                        },
                      ],
                });
              }
              setAccessoryDialog(null);
            }}
          />
        );
      })()}
      </Suspense>

      {deletionNotice && (
        <UndoToast
          message={deletionNotice.message}
          canUndo={config === deletionNotice.afterConfig}
          onUndo={() => {
            if (useHarnessStore.getState().config !== deletionNotice.afterConfig) return;
            useHarnessStore.getState().replaceDocument(deletionNotice.snapshot);
            setDeletionNotice(null);
          }}
          onClose={() => setDeletionNotice(null)}
        />
      )}
      {deleteConfirmToast && (
        <DeleteConfirmToast
          title={deleteConfirmToast.title}
          message={deleteConfirmToast.message}
          confirmLabel={deleteConfirmToast.confirmLabel}
          onConfirm={deleteConfirmToast.onConfirm}
          onCancel={() => setDeleteConfirmToast(null)}
        />
      )}
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

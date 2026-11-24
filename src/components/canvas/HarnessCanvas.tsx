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
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type EdgeTypes,
  type IsValidConnection,
  type Node,
  type NodeMouseHandler,
  type NodeTypes,
  type OnNodeDrag,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Lock } from 'lucide-react';
import { DeleteConfirmToast } from '@/components/shared/DeleteConfirmToast';
import { UndoToast } from '@/components/shared/UndoToast';
import {
  createDefaultCanvasMaterial,
  getConnectorHeight,
  getConnectorNodeWidth,
  getMaterialCenterY,
  getMaterialEndpointPoint,
  placeSleeveAroundMaterials,
} from '@/lib/canvasMaterials';
import {
  addConnectorJumper,
  attachMaterialEndpoint,
  detachMaterialEndpoint,
  generateId,
  reassignMaterialEndpoint,
  removeConnectorJumper,
  removeMaterialCircuit,
} from '@/lib/commands';
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
import { CanvasModelNode } from './CanvasModelNode';
import { ConnectorNode } from './ConnectorNode';
import { ContextMenu, type ContextMenuState } from './ContextMenu';
import {
  HarnessCanvasDialogs,
  type AccessoryDialogState,
  type ConnectorDialogState,
  type SleeveDialogState,
} from './HarnessCanvasDialogs';
import {
  applyNodePositionsToConfig,
  buildEdges,
  canReuseNode,
  distanceToRect,
  getElectronicMaterialGroups,
  getLinkedDragNodeIds,
  getSleevePreviewUpdates,
  hasValidContainerDimensions,
  isValidCanvasViewport,
  parsePinFromHandleId,
  parseSideFromHandleId,
  resolveNearestConnectorHandle,
} from './harnessCanvasGeometry';
import { JumperEdge } from './JumperEdge';
import { setJumperContextMenuHandler } from './jumperContextMenu';
import { type MaterialAccessoryKind } from './MaterialAccessoryDialog';
import { setMaterialAccessoryContextMenuHandler } from './materialAccessoryEvents';
import { MaterialAttachmentEdge } from './MaterialAttachmentEdge';
import {
  setMaterialConnectionPointHandler,
  type MaterialConnectionPoint,
} from './materialConnectionClick';
import { ProtectiveSleeveNode } from './ProtectiveSleeveNode';
import { WireMaterialNode, type WireMaterialNodeData } from './WireMaterialNode';

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

function HarnessCanvasInner() {
  const { config, selection, setSelection, updateConnector } = useHarnessStore();
  const [isInteractive, setIsInteractive] = useState(true);
  const isInteractiveRef = useRef(isInteractive);
  useEffect(() => {
    isInteractiveRef.current = isInteractive;
  }, [isInteractive]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [canvasSelection, setCanvasSelection] = useState<string | null>(null);
  const [connectorDialog, setConnectorDialog] = useState<ConnectorDialogState | null>(null);
  const [editingConnectorId, setEditingConnectorId] = useState<string | null>(null);
  const [changingPartConnectorId, setChangingPartConnectorId] = useState<string | null>(null);
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
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingConnectionPointRef = useRef<MaterialConnectionPoint | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const dragGroupRef = useRef<{
    draggedNodeId: string;
    nodeIds: string[];
    initialPositions: Map<string, { x: number; y: number }>;
  } | null>(null);
  const reconnectSucceeded = useRef(false);
  const [initialViewport] = useState(() => {
    const vp = useHarnessStore.getState().canvasViewport;
    return isValidCanvasViewport(vp) ? vp : undefined;
  });
  const lastValidViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(
    initialViewport ?? null,
  );
  const hasAutoFitted = useRef(Boolean(initialViewport));
  const currentConfigIdRef = useRef(config.id);
  const { fitView, screenToFlowPosition } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const canvasViewport = useHarnessStore((state) => state.canvasViewport);

  useEffect(() => {
    if (!isInteractive) {
      const timer = setTimeout(() => {
        setSelection({ kind: 'none' });
        setCanvasSelection(null);
        setContextMenu(null);
        setPendingConnectionPoint(null);
        pendingConnectionPointRef.current = null;
        setConnectorDialog(null);
        setEditingConnectorId(null);
        setChangingPartConnectorId(null);
        setEditingMaterialId(null);
        setNewMaterialDraft(null);
        setSleeveDialog(null);
        setModelDialogPosition(null);
        setAccessoryDialog(null);
        setDeleteConfirmToast(null);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isInteractive, setSelection]);

  useEffect(() => {
    if (currentConfigIdRef.current !== config.id) {
      currentConfigIdRef.current = config.id;
      const vp = useHarnessStore.getState().canvasViewport;
      const validVp = isValidCanvasViewport(vp) ? vp : null;
      lastValidViewportRef.current = validVp;
      hasAutoFitted.current = Boolean(validVp);
    }
  }, [config.id]);

  useEffect(() => {
    return () => {
      const snapshot = lastValidViewportRef.current;
      if (snapshot && isValidCanvasViewport(snapshot)) {
        useHarnessStore.getState().setCanvasViewport(snapshot);
      }
    };
  }, []);

  useEffect(() => {
    if (canvasViewport === null) {
      lastValidViewportRef.current = null;
      hasAutoFitted.current = false;
    } else if (isValidCanvasViewport(canvasViewport)) {
      lastValidViewportRef.current = canvasViewport;
      hasAutoFitted.current = true;
    }
  }, [canvasViewport]);

  const materials = config.materials ?? EMPTY_MATERIALS;
  const sleeves = config.protectiveSleeves ?? EMPTY_SLEEVES;
  const models = config.models ?? EMPTY_MODELS;

  useEffect(() => {
    setJumperContextMenuHandler((jumperId, x, y) => {
      if (!isInteractiveRef.current) return;
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
    setMaterialAccessoryContextMenuHandler((request) => {
      if (!isInteractiveRef.current) return;
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
        state.replaceDocument(removeMaterialCircuit(state.config, materialId, circuitId), { userEdit: true });
      },
    });
  }, [config.materials, requestDeleteConfirmation]);

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

  useEffect(() => {
    setEdges(buildEdges(config, canvasSelection));
  }, [config, canvasSelection, setEdges]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const scheduleFitView = useCallback(() => {
    if (hasAutoFitted.current) {
      return;
    }
    const container = containerRef.current;
    if (!hasValidContainerDimensions(container) || !nodesInitialized || nodes.length === 0) {
      return;
    }
    hasAutoFitted.current = true;
    fitView({ duration: 250, padding: 0.28, maxZoom: 1 });
  }, [fitView, nodes.length, nodesInitialized]);

  useEffect(() => {
    if (nodes.length === 0) {
      hasAutoFitted.current = false;
      return;
    }
    const timer = setTimeout(() => {
      scheduleFitView();
    }, 60);
    return () => clearTimeout(timer);
  }, [nodes.length, scheduleFitView]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          scheduleFitView();
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [scheduleFitView]);

  const currentFlowPosition = useCallback(() => (
    contextMenu?.flowPosition ?? { x: 220, y: 220 }
  ), [contextMenu]);

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
      state.replaceDocument(nextConfig, { userEdit: true });
      setCanvasSelection(materialId);
    } catch {
      // Side conflict or pin out of range — ignore.
    }
  }, []);

  useEffect(() => {
    setMaterialConnectionPointHandler((point) => {
      if (!isInteractiveRef.current) return;
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
      state.replaceDocument(nextConfig, { userEdit: true });
    } catch {
      // Invalid jumper — ignore.
    }
  }, []);

  const isValidConnection: IsValidConnection<Edge> = useCallback((connection) => {
    if (!isInteractiveRef.current) return false;
    if (!connection.source || !connection.target) return false;

    const state = useHarnessStore.getState();
    const sourceIsMaterial = state.config.materials.some((m) => m.id === connection.source);
    const targetIsMaterial = state.config.materials.some((m) => m.id === connection.target);
    const sourceIsConnector = state.config.connectors.some((c) => c.id === connection.source);
    const targetIsConnector = state.config.connectors.some((c) => c.id === connection.target);

    if (sourceIsMaterial && targetIsConnector) return true;
    if (targetIsMaterial && sourceIsConnector) return true;

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
    if (!isInteractiveRef.current || !connection.source || !connection.target) return;

    const state = useHarnessStore.getState();
    const sourceIsMaterial = state.config.materials.some((m) => m.id === connection.source);
    const targetIsMaterial = state.config.materials.some((m) => m.id === connection.target);
    const sourceIsConnector = state.config.connectors.some((c) => c.id === connection.source);
    const targetIsConnector = state.config.connectors.some((c) => c.id === connection.target);

    if (sourceIsMaterial && targetIsConnector) {
      const endpoint: MaterialEndpoint = connection.sourceHandle === 'start' ? 'start' : 'end';
      const side = parseSideFromHandleId(connection.targetHandle);
      const pin = parsePinFromHandleId(connection.targetHandle);
      if (!side || !pin) return;
      handleAttachEndpoint(connection.source, endpoint, connection.target, side, pin);
      return;
    }

    if (targetIsMaterial && sourceIsConnector) {
      const endpoint: MaterialEndpoint = connection.targetHandle === 'start' ? 'start' : 'end';
      const side = parseSideFromHandleId(connection.sourceHandle);
      const pin = parsePinFromHandleId(connection.sourceHandle);
      if (!side || !pin) return;
      handleAttachEndpoint(connection.target, endpoint, connection.source, side, pin);
      return;
    }

    if (sourceIsConnector && targetIsConnector && connection.source === connection.target) {
      const pin1 = parsePinFromHandleId(connection.sourceHandle);
      const pin2 = parsePinFromHandleId(connection.targetHandle);
      const side1 = parseSideFromHandleId(connection.sourceHandle);
      if (!pin1 || !pin2 || !side1) return;
      handleAddJumper(connection.source, side1, pin1, pin2);
    }
  }, [handleAttachEndpoint, handleAddJumper]);

  const onReconnect = useCallback((oldEdge: Edge, connection: Connection) => {
    if (!isInteractiveRef.current || !connection.target) return;
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

      const nextConfig = reassignMaterialEndpoint(state.config, {
        materialId,
        circuitId,
        endpoint: side,
        connectorId: connection.target,
        connectorSide: newSide,
        pin: newPin,
      });

      if (nextConfig !== state.config) {
        state.replaceDocument(nextConfig, { userEdit: true });
      }
      return;
    }

    if (oldEdge.type === 'jumper' && oldEdge.data) {
      reconnectSucceeded.current = true;
    }
  }, []);

  const handleDetachEndpoint = useCallback((edgeId: string) => {
    const sepIndex = edgeId.lastIndexOf(':');
    if (sepIndex === -1) return;
    const circuitId = edgeId.substring(0, sepIndex);
    const side = edgeId.substring(sepIndex + 1) as MaterialEndpoint;
    if (side !== 'start' && side !== 'end') return;

    const state = useHarnessStore.getState();
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
        store.replaceDocument(nextConfig, { userEdit: true });
      },
      afterDelete: () => {
        setCanvasSelection(null);
      },
    });
  }, [requestDeleteConfirmation]);

  const handleDeleteJumper = useCallback((jumperId: string) => {
    const state = useHarnessStore.getState();
    const connector = state.config.connectors.find((c) =>
      c.jumpers.some((j) => j.id === jumperId),
    );
    if (!connector) return;
    requestDeleteConfirmation({
      message: `删除连接器“${connector.label}”上的短接？`,
      undoMessage: `已删除连接器“${connector.label}”上的短接`,
      action: (store) => {
        const nextConfig = removeConnectorJumper(store.config, connector.id, jumperId);
        store.replaceDocument(nextConfig, { userEdit: true });
      },
      afterDelete: () => {
        setCanvasSelection(null);
      },
    });
  }, [requestDeleteConfirmation]);

  const attachNearbyMaterialEndpoints = useCallback((material: CanvasWireMaterial) => {
    const endpointPoints: Array<{ endpoint: MaterialEndpoint; point: { x: number; y: number } }> = [
      { endpoint: 'start', point: getMaterialEndpointPoint(material, 'start') },
      { endpoint: 'end', point: getMaterialEndpointPoint(material, 'end') },
    ];

    let attachedAny = false;

    for (const { endpoint, point } of endpointPoints) {
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
          const resolved = resolveNearestConnectorHandle(currentConfig, connector, point);
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
            useHarnessStore.getState().replaceDocument(nextConfig, { userEdit: true });
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
    if (!isInteractiveRef.current) return;
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
    if (!isInteractiveRef.current) return;
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
    if (!isInteractiveRef.current) {
      dragGroupRef.current = null;
      return;
    }
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
        state.replaceDocument(applyNodePositionsToConfig(state.config, finalPositions), { userEdit: true });
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

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    if (!isInteractiveRef.current) return;
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
    if (!isInteractiveRef.current) return;
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
    if (!isInteractiveRef.current) return;
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
    if (!isInteractiveRef.current) return;
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
    if (!isInteractiveRef.current) return;
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

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <ReactFlow
        defaultViewport={initialViewport}
        onMove={(_, vp) => {
          const container = containerRef.current;
          if (hasValidContainerDimensions(container) && isValidCanvasViewport(vp)) {
            lastValidViewportRef.current = vp;
          }
        }}
        onMoveEnd={(_, vp) => {
          const container = containerRef.current;
          if (hasValidContainerDimensions(container) && isValidCanvasViewport(vp)) {
            lastValidViewportRef.current = vp;
            useHarnessStore.getState().setCanvasViewport(vp);
          }
        }}
        nodes={nodes}
        edges={edges}
        nodesDraggable={isInteractive}
        nodesConnectable={isInteractive}
        nodesFocusable={isInteractive}
        elementsSelectable={isInteractive}
        edgesReconnectable={isInteractive}
        edgesFocusable={isInteractive}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onReconnectStart={() => {
          if (!isInteractiveRef.current) return;
          reconnectSucceeded.current = false;
        }}
        onReconnectEnd={(_, edge) => {
          if (!isInteractiveRef.current) return;
          if (!reconnectSucceeded.current && edge.type === 'attachment') {
            handleDetachEndpoint(edge.id);
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
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
        className={!isInteractive ? 'canvas-locked select-none' : undefined}
      >
        <Background color="#cbd5e1" gap={20} />
        <Controls
          fitViewOptions={{ padding: 0.28, duration: 250 }}
          onInteractiveChange={setIsInteractive}
        />
      </ReactFlow>

      {!isInteractive && (
        <>
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50/95 px-4 py-1.5 text-xs font-semibold text-amber-800 shadow-md backdrop-blur">
            <Lock className="h-3.5 w-3.5 text-amber-600" />
            <span>画布已锁定（只读模式：节点拖动、连线、右键菜单与删除操作已禁用）</span>
          </div>
          <style>{`
            .canvas-locked .react-flow__node,
            .canvas-locked .cursor-grab,
            .canvas-locked .cursor-pointer,
            .canvas-locked .wire-material-drag {
              cursor: default !important;
            }
            .canvas-locked .react-flow__handle {
              pointer-events: none !important;
              cursor: default !important;
            }
          `}</style>
        </>
      )}

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
          onEditConnector={(id) => setEditingConnectorId(id)}
          onChangeConnector={(id) => setChangingPartConnectorId(id)}
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
          onFitView={() => fitView({ duration: 300, padding: 0.28 })}
          hasSelection={selection.kind !== 'none' || canvasSelection !== null}
        />
      )}

      <HarnessCanvasDialogs
        config={config}
        materials={materials}
        sleeves={sleeves}
        editingConnectorId={editingConnectorId}
        setEditingConnectorId={setEditingConnectorId}
        changingPartConnectorId={changingPartConnectorId}
        setChangingPartConnectorId={setChangingPartConnectorId}
        connectorDialog={connectorDialog}
        setConnectorDialog={setConnectorDialog}
        editingMaterialId={editingMaterialId}
        newMaterialDraft={newMaterialDraft}
        onCloseMaterialDialog={() => {
          setEditingMaterialId(null);
          setNewMaterialDraft(null);
        }}
        sleeveDialog={sleeveDialog}
        setSleeveDialog={setSleeveDialog}
        modelDialogPosition={modelDialogPosition}
        setModelDialogPosition={setModelDialogPosition}
        accessoryDialog={accessoryDialog}
        setAccessoryDialog={setAccessoryDialog}
        setSelection={setSelection}
        setCanvasSelection={setCanvasSelection}
        onDeleteAccessory={handleDeleteAccessory}
      />

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

export function HarnessCanvas() {
  return (
    <ReactFlowProvider>
      <HarnessCanvasInner />
    </ReactFlowProvider>
  );
}

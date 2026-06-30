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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { addConnectorNode, addWireToConnection, createConnection } from '@/lib/commands';
import {
  CANVAS_MATERIAL_HEIGHT,
  CANVAS_MATERIAL_SLEEVE_CENTER_Y,
  createDefaultCanvasMaterial,
  lengthMmToCanvasWidth,
  PROTECTIVE_SLEEVE_HEIGHT,
  sleeveLengthToCanvasWidth,
} from '@/lib/canvasMaterials';
import { useHarnessStore } from '@/stores/harnessStore';
import type {
  CanvasWireMaterial,
  HarnessConfig,
  HarnessNode,
  MaterialAttachment,
  ProtectiveSleeve,
  WireEndpoint,
} from '@/types/harness';
import { ConnectorNode } from './ConnectorNode';
import { ContextMenu, type ContextMenuState } from './ContextMenu';
import { MaterialAttachmentEdge } from './MaterialAttachmentEdge';
import { ProtectiveSleeveDialog } from './ProtectiveSleeveDialog';
import { ProtectiveSleeveNode } from './ProtectiveSleeveNode';
import { WireMaterialDialog } from './WireMaterialDialog';
import { WireMaterialNode } from './WireMaterialNode';

const nodeTypes: NodeTypes = {
  connector: ConnectorNode,
  material: WireMaterialNode,
  sleeve: ProtectiveSleeveNode,
};
const edgeTypes: EdgeTypes = {
  attachment: MaterialAttachmentEdge,
};
const EMPTY_MATERIALS: CanvasWireMaterial[] = [];
const EMPTY_ATTACHMENTS: MaterialAttachment[] = [];
const EMPTY_SLEEVES: ProtectiveSleeve[] = [];

function parsePinFromHandleId(handleId?: string | null): number | undefined {
  if (!handleId) return undefined;
  const match = handleId.match(/pin-(\d+)$/);
  if (!match) return undefined;
  const pin = Number.parseInt(match[1], 10);
  return Number.isFinite(pin) && pin > 0 ? pin : undefined;
}

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

function getConnectorHeight(node: HarnessNode): number {
  const pinCount = node.connector?.pinCount ?? 2;
  const visiblePins = Math.min(pinCount, 6);
  return 52 + visiblePins * 20 + (pinCount > 6 ? 20 : 0) + 32;
}

function getVisiblePinCount(node: HarnessNode): number {
  return Math.min(node.connector?.pinCount ?? 2, 6);
}

function getMaterialEndpointPoint(
  material: CanvasWireMaterial,
  endpoint: WireEndpoint,
): { x: number; y: number } {
  return {
    x: endpoint === 'start' ? material.position.x : material.position.x + material.width,
    y: material.position.y + CANVAS_MATERIAL_SLEEVE_CENTER_Y,
  };
}

function getHandleSide(handleId?: string | null): 'left' | 'right' | undefined {
  if (!handleId) return undefined;
  if (handleId.startsWith('left')) return 'left';
  if (handleId.startsWith('right')) return 'right';
  return undefined;
}

function getConnectorPinHandlePosition(
  node: HarnessNode,
  side: 'left' | 'right',
  pin: number,
): { x: number; y: number } {
  const clampedPin = Math.max(1, Math.min(pin, getVisiblePinCount(node)));
  return {
    x: node.position.x + (side === 'left' ? 0 : 200),
    y: node.position.y + 52 + (clampedPin - 0.5) * 20,
  };
}

function resolveNearestConnectorHandle(
  node: HarnessNode,
  point: { x: number; y: number },
  preferredSide?: 'left' | 'right',
): { handle: string; distance: number; pin: number } {
  const connectorCenterX = node.position.x + 100;
  const side = preferredSide ?? (point.x < connectorCenterX ? 'left' : 'right');
  const visiblePinCount = getVisiblePinCount(node);

  let bestPin = 1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let pin = 1; pin <= visiblePinCount; pin += 1) {
    const handlePosition = getConnectorPinHandlePosition(node, side, pin);
    const distance = Math.hypot(point.x - handlePosition.x, point.y - handlePosition.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPin = pin;
    }
  }

  return {
    handle: `${side}-pin-${bestPin}`,
    distance: bestDistance,
    pin: bestPin,
  };
}

function distanceToRect(
  point: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number },
): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

function centerSleeveOnMaterial(
  material: CanvasWireMaterial,
  sleeveWidth: number,
): { x: number; y: number } {
  return {
    x: material.position.x + (material.width - sleeveWidth) / 2,
    y: material.position.y + CANVAS_MATERIAL_SLEEVE_CENTER_Y - PROTECTIVE_SLEEVE_HEIGHT / 2,
  };
}

function ensureConnectionMaterial(
  config: HarnessConfig,
  connectionId: string,
): HarnessConfig {
  const connection = config.connections.find((item) => item.id === connectionId);
  if (!connection) return config;

  const existingMaterial = (config.canvasMaterials ?? []).find(
    (material) => material.connectionId === connectionId,
  );
  if (existingMaterial) return config;

  const attachments = config.materialAttachments ?? [];
  const materialForPair = (config.canvasMaterials ?? []).find((material) => {
    if (material.connectionId) return false;
    const materialAttachments = attachments.filter(
      (attachment) => attachment.materialId === material.id,
    );
    const connectorIds = new Set(
      materialAttachments.map((attachment) => attachment.connectorNodeId),
    );
    return connectorIds.has(connection.fromNodeId) && connectorIds.has(connection.toNodeId);
  });
  if (materialForPair) {
    return {
      ...config,
      canvasMaterials: (config.canvasMaterials ?? []).map((material) => (
        material.id === materialForPair.id
          ? { ...material, connectionId }
          : material
      )),
    };
  }

  const fromNode = config.nodes.find((node) => node.id === connection.fromNodeId);
  const toNode = config.nodes.find((node) => node.id === connection.toNodeId);
  if (!fromNode || !toNode) return config;

  const connectionWires = config.wires.filter((wire) => connection.wireIds.includes(wire.id));
  const firstWire = connectionWires[0];
  const materialId = generateId();
  const fromIsLeft = fromNode.position.x <= toNode.position.x;
  const startNode = fromIsLeft ? fromNode : toNode;
  const endNode = fromIsLeft ? toNode : fromNode;
  const fromCenter = {
    x: fromNode.position.x + 100,
    y: fromNode.position.y + getConnectorHeight(fromNode) / 2,
  };
  const toCenter = {
    x: toNode.position.x + 100,
    y: toNode.position.y + getConnectorHeight(toNode) / 2,
  };
  const material: CanvasWireMaterial = {
    id: materialId,
    name: '新线材',
    connectionId,
    position: {
      x: (fromCenter.x + toCenter.x) / 2 - 130,
      y: (fromCenter.y + toCenter.y) / 2 - CANVAS_MATERIAL_SLEEVE_CENTER_Y,
    },
    width: lengthMmToCanvasWidth(firstWire?.lengthMm ?? 300),
    expandedByDefault: true,
    spec: {
      kind: 'electronic',
      color: firstWire?.wireColor ?? 'red',
      lengthMm: firstWire?.lengthMm ?? 300,
      awg: firstWire?.wireGauge ?? 26,
      ulNumber: '1007',
      endTreatment: { stripped: false },
    },
  };
  const attachmentKeys = new Set<string>();
  const nextAttachments: MaterialAttachment[] = [];
  const wireEntries = connectionWires.length > 0 ? connectionWires : [firstWire].filter(Boolean);

  wireEntries.forEach((wire) => {
    if (!wire) return;
    const startPin = wire.fromConnectorId === startNode.id ? wire.fromPin : wire.toPin;
    const endPin = wire.fromConnectorId === endNode.id ? wire.fromPin : wire.toPin;
    const attachmentDrafts: Array<Omit<MaterialAttachment, 'id'>> = [
      {
        materialId,
        endpoint: 'start',
        connectorNodeId: startNode.id,
        connectorHandle: `right-pin-${startPin}`,
      },
      {
        materialId,
        endpoint: 'end',
        connectorNodeId: endNode.id,
        connectorHandle: `left-pin-${endPin}`,
      },
    ];

    attachmentDrafts.forEach((draft) => {
      const key = `${draft.endpoint}:${draft.connectorNodeId}:${draft.connectorHandle}`;
      if (attachmentKeys.has(key)) return;
      attachmentKeys.add(key);
      nextAttachments.push({
        id: generateId(),
        ...draft,
      });
    });
  });

  return {
    ...config,
    canvasMaterials: [...(config.canvasMaterials ?? []), material],
    materialAttachments: [...attachments, ...nextAttachments],
    protectiveSleeves: config.protectiveSleeves ?? [],
    updatedAt: Date.now(),
  };
}

function getMaterialWireDraft(material: CanvasWireMaterial) {
  return {
    wireGauge: material.spec.kind === 'electronic' ? material.spec.awg : 26,
    wireType: 'silicone',
    wireColor: material.spec.kind === 'electronic' ? material.spec.color : 'red',
    lengthMm: material.spec.lengthMm,
  };
}

interface AttachmentPinRef {
  attachment: MaterialAttachment;
  connectorNodeId: string;
  pin: number;
}

function choosePrimaryConnectorId(
  attachments: MaterialAttachment[],
  preferredConnectorId?: string,
): string | undefined {
  if (
    preferredConnectorId
    && attachments.some((attachment) => attachment.connectorNodeId === preferredConnectorId)
  ) {
    return preferredConnectorId;
  }

  const counts = new Map<string, number>();
  attachments.forEach((attachment) => {
    counts.set(
      attachment.connectorNodeId,
      (counts.get(attachment.connectorNodeId) ?? 0) + 1,
    );
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

function getAttachmentPinRefs(
  attachments: MaterialAttachment[],
  endpoint: WireEndpoint,
  connectorNodeId: string,
): AttachmentPinRef[] {
  return attachments
    .filter((attachment) => (
      attachment.endpoint === endpoint
      && attachment.connectorNodeId === connectorNodeId
    ))
    .map((attachment) => {
      const pin = parsePinFromHandleId(attachment.connectorHandle);
      return pin
        ? {
            attachment,
            connectorNodeId,
            pin,
          }
        : undefined;
    })
    .filter((item): item is AttachmentPinRef => Boolean(item))
    .sort((a, b) => a.pin - b.pin || a.attachment.id.localeCompare(b.attachment.id));
}

/**
 * Keeps the electrical Connection/Wire model in sync with a material's two
 * visual endpoint attachments. A single attachment is intentionally not an
 * electrical connection yet.
 */
function reconcileMaterialConnection(
  config: HarnessConfig,
  materialId: string,
): HarnessConfig {
  const material = (config.canvasMaterials ?? []).find((item) => item.id === materialId);
  if (!material) return config;

  const materialAttachments = (config.materialAttachments ?? []).filter(
    (attachment) => attachment.materialId === materialId,
  );
  const existingConnection = material.connectionId
    ? config.connections.find((item) => item.id === material.connectionId)
    : undefined;
  const startConnectorId = choosePrimaryConnectorId(
    materialAttachments.filter((attachment) => attachment.endpoint === 'start'),
    existingConnection?.fromNodeId,
  );
  const endConnectorId = choosePrimaryConnectorId(
    materialAttachments.filter((attachment) => attachment.endpoint === 'end'),
    existingConnection?.toNodeId,
  );
  if (!startConnectorId || !endConnectorId || startConnectorId === endConnectorId) {
    return config;
  }

  const startPins = getAttachmentPinRefs(materialAttachments, 'start', startConnectorId);
  const endPins = getAttachmentPinRefs(materialAttachments, 'end', endConnectorId);
  const pairCount = Math.min(startPins.length, endPins.length);

  if (pairCount === 0) {
    return config;
  }

  const startNodeId = startConnectorId;
  const endNodeId = endConnectorId;
  let connection = material.connectionId
    ? config.connections.find((item) => item.id === material.connectionId)
    : undefined;
  let nextConfig = config;

  if (!connection) {
    connection = config.connections.find((item) => (
      (item.fromNodeId === startNodeId && item.toNodeId === endNodeId)
      || (item.fromNodeId === endNodeId && item.toNodeId === startNodeId)
    ));
  }

  if (!connection) {
    const result = createConnection(nextConfig, {
      fromNodeId: startNodeId,
      toNodeId: endNodeId,
      fromPin: startPins[0]?.pin ?? 1,
      toPin: endPins[0]?.pin ?? 1,
      name: material.name,
      createDefaultWire: false,
    });
    nextConfig = result.config;
    connection = nextConfig.connections.find((item) => item.id === result.connectionId);
  }

  if (!connection) return config;

  const forwardPair = connection.fromNodeId === startNodeId
    && connection.toNodeId === endNodeId;
  const reversePair = connection.fromNodeId === endNodeId
    && connection.toNodeId === startNodeId;

  if (!forwardPair && !reversePair) {
    const connectionWireIds = new Set(connection.wireIds);
    nextConfig = {
      ...nextConfig,
      connections: nextConfig.connections.map((item) => (
        item.id === connection!.id
          ? { ...item, fromNodeId: startNodeId, toNodeId: endNodeId }
          : item
      )),
      wires: nextConfig.wires.map((wire) => (
        connectionWireIds.has(wire.id)
          ? {
              ...wire,
              fromConnectorId: startNodeId,
              toConnectorId: endNodeId,
            }
          : wire
      )),
      updatedAt: Date.now(),
    };
    connection = nextConfig.connections.find((item) => item.id === connection!.id);
  }

  if (!connection) return config;

  const desiredPairs = Array.from({ length: pairCount }, (_, index) => {
    const startPin = startPins[index].pin;
    const endPin = endPins[index].pin;
    return connection!.fromNodeId === startNodeId
      ? { fromPin: startPin, toPin: endPin }
      : { fromPin: endPin, toPin: startPin };
  });

  const connectionWireIds = new Set(connection.wireIds);
  const exactMatchKey = (fromPin: number, toPin: number) => `${fromPin}:${toPin}`;
  const reusableWires = nextConfig.wires.filter((wire) => (
    connectionWireIds.has(wire.id)
    && wire.fromConnectorId === connection!.fromNodeId
    && wire.toConnectorId === connection!.toNodeId
  ));
  const exactMatches = new Map<string, typeof reusableWires>();

  reusableWires.forEach((wire) => {
    const key = exactMatchKey(wire.fromPin, wire.toPin);
    const existing = exactMatches.get(key) ?? [];
    existing.push(wire);
    exactMatches.set(key, existing);
  });

  const availableWires = [...reusableWires];

  desiredPairs.forEach(({ fromPin, toPin }) => {
    const key = exactMatchKey(fromPin, toPin);
    const exactWire = exactMatches.get(key)?.shift();

    if (exactWire) {
      const exactIndex = availableWires.findIndex((wire) => wire.id === exactWire.id);
      if (exactIndex >= 0) availableWires.splice(exactIndex, 1);
      return;
    }

    const reusableWire = availableWires.shift();
    if (reusableWire) {
      nextConfig = {
        ...nextConfig,
        wires: nextConfig.wires.map((wire) => (
          wire.id === reusableWire.id
            ? {
                ...wire,
                fromConnectorId: connection!.fromNodeId,
                fromPin,
                toConnectorId: connection!.toNodeId,
                toPin,
              }
            : wire
        )),
        updatedAt: Date.now(),
      };
      return;
    }

    nextConfig = addWireToConnection(nextConfig, connection!.id, {
      ...getMaterialWireDraft(material),
      fromPin,
      toPin,
    });
  });

  const materialHasConnection = material.connectionId === connection.id;
  if (!materialHasConnection) {
    nextConfig = {
      ...nextConfig,
      canvasMaterials: (nextConfig.canvasMaterials ?? []).map((item) => (
        item.id === materialId ? { ...item, connectionId: connection!.id } : item
      )),
      updatedAt: Date.now(),
    };
  }

  return nextConfig;
}

interface SleeveDialogState {
  position: { x: number; y: number };
  materialId?: string;
  sleeveId?: string;
}

function HarnessCanvasInner() {
  const { config, selection, setSelection, updateNode } = useHarnessStore();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [canvasSelection, setCanvasSelection] = useState<string | null>(null);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [newMaterialId, setNewMaterialId] = useState<string | null>(null);
  const [sleeveDialog, setSleeveDialog] = useState<SleeveDialogState | null>(null);
  const reconnectSucceeded = useRef(false);
  const hasAutoFitted = useRef(false);
  const { fitView, screenToFlowPosition } = useReactFlow();

  const materials = config.canvasMaterials ?? EMPTY_MATERIALS;
  const attachments = config.materialAttachments ?? EMPTY_ATTACHMENTS;
  const sleeves = config.protectiveSleeves ?? EMPTY_SLEEVES;

  useEffect(() => {
    let migratedConfig = config.connections.reduce(
      (currentConfig, connection) => ensureConnectionMaterial(currentConfig, connection.id),
      config,
    );
    migratedConfig = (migratedConfig.canvasMaterials ?? []).reduce(
      (currentConfig, material) => reconcileMaterialConnection(currentConfig, material.id),
      migratedConfig,
    );
    if (migratedConfig !== config) {
      useHarnessStore.getState().replaceDocument(migratedConfig);
    }
  }, [config]);

  useEffect(() => {
    const connectorNodes: Node[] = config.nodes.map((node) => ({
      id: node.id,
      type: 'connector',
      position: node.position,
      data: node as unknown as Record<string, unknown>,
      selected: selection.kind === 'node' && selection.id === node.id,
    }));
    const materialNodes: Node[] = materials.map((material) => ({
      id: material.id,
      type: 'material',
      position: material.position,
      data: material as unknown as Record<string, unknown>,
      selected: canvasSelection === material.id,
      dragHandle: '.wire-material-drag',
      zIndex: 2,
    }));
    const sleeveNodes: Node[] = sleeves.map((sleeve) => ({
      id: sleeve.id,
      type: 'sleeve',
      position: sleeve.position,
      data: sleeve as unknown as Record<string, unknown>,
      selected: canvasSelection === sleeve.id,
      zIndex: 4,
    }));

    setNodes([...connectorNodes, ...materialNodes, ...sleeveNodes]);
  }, [canvasSelection, config.nodes, materials, selection, setNodes, sleeves]);

  useEffect(() => {
    const attachmentEdges: Edge[] = attachments.map((attachment) => ({
      id: attachment.id,
      source: attachment.materialId,
      sourceHandle: attachment.endpoint,
      target: attachment.connectorNodeId,
      targetHandle: attachment.connectorHandle ?? 'left',
      type: 'attachment',
      data: { ...attachment, kind: 'attachment' },
      selected: canvasSelection === attachment.id,
      reconnectable: 'target',
    }));

    setEdges(attachmentEdges);
  }, [attachments, canvasSelection, setEdges]);

  useEffect(() => {
    if (nodes.length === 0) {
      hasAutoFitted.current = false;
      return;
    }

    if (hasAutoFitted.current) {
      return;
    }

    hasAutoFitted.current = true;
    const frameId = requestAnimationFrame(() => {
      fitView({ duration: 0, padding: 0.16 });
    });

    return () => cancelAnimationFrame(frameId);
  }, [fitView, nodes.length]);

  const currentFlowPosition = useCallback(() => (
    contextMenu?.flowPosition ?? { x: 220, y: 220 }
  ), [contextMenu]);

  const handleAddConnector = useCallback(() => {
    const state = useHarnessStore.getState();
    const newConfig = addConnectorNode(state.config, { position: currentFlowPosition() });
    state.replaceDocument(newConfig);
  }, [currentFlowPosition]);

  const handleAddCanvasWire = useCallback(() => {
    const id = generateId();
    useHarnessStore.getState().addCanvasMaterial(
      createDefaultCanvasMaterial(id, currentFlowPosition()),
    );
    setNewMaterialId(id);
    setEditingMaterialId(id);
    setCanvasSelection(id);
  }, [currentFlowPosition]);

  const handleAddProtectiveSleeve = useCallback((materialId?: string) => {
    setSleeveDialog({
      position: currentFlowPosition(),
      materialId,
    });
  }, [currentFlowPosition]);

  const alignMaterialToConnector = useCallback((
    materialId: string,
    connectorNodeId: string,
  ) => {
    const state = useHarnessStore.getState();
    if ((state.config.materialAttachments ?? []).some(
      (attachment) => attachment.materialId === materialId,
    )) {
      return;
    }

    const material = (state.config.canvasMaterials ?? []).find((item) => item.id === materialId);
    const connector = state.config.nodes.find((item) => item.id === connectorNodeId);
    if (!material || !connector) return;

    const materialCenterX = material.position.x + material.width / 2;
    const connectorCenterX = connector.position.x + 100;
    const side = materialCenterX < connectorCenterX ? 'left' : 'right';
    const gap = 36;
    const x = side === 'right'
      ? connector.position.x + 200 + gap
      : connector.position.x - material.width - gap;
    const y = connector.position.y + getConnectorHeight(connector) / 2
      - CANVAS_MATERIAL_SLEEVE_CENTER_Y;
    state.updateCanvasMaterial(material.id, { position: { x, y } });
  }, []);

  const normalizeAttachmentHandle = useCallback((
    materialId: string,
    endpoint: WireEndpoint,
    connectorNodeId: string,
    connectorHandle?: string | null,
  ): string => {
    const state = useHarnessStore.getState();
    const connector = state.config.nodes.find((item) => item.id === connectorNodeId);
    const material = (state.config.canvasMaterials ?? []).find((item) => item.id === materialId);

    if (parsePinFromHandleId(connectorHandle)) {
      return connectorHandle!;
    }

    if (connector && material) {
      const point = getMaterialEndpointPoint(material, endpoint);
      return resolveNearestConnectorHandle(
        connector,
        point,
        getHandleSide(connectorHandle),
      ).handle;
    }

    const fallbackSide = getHandleSide(connectorHandle) ?? 'left';
    return `${fallbackSide}-pin-1`;
  }, []);

  const addAttachment = useCallback((
    materialId: string,
    endpoint: WireEndpoint,
    connectorNodeId: string,
    connectorHandle?: string | null,
  ) => {
    const state = useHarnessStore.getState();
    const normalizedHandle = normalizeAttachmentHandle(
      materialId,
      endpoint,
      connectorNodeId,
      connectorHandle,
    );
    const exists = (state.config.materialAttachments ?? []).some((item) => (
      item.materialId === materialId
      && item.endpoint === endpoint
      && item.connectorNodeId === connectorNodeId
      && item.connectorHandle === normalizedHandle
    ));
    if (exists) return;

    alignMaterialToConnector(materialId, connectorNodeId);

    const attachment: MaterialAttachment = {
      id: generateId(),
      materialId,
      endpoint,
      connectorNodeId,
      connectorHandle: normalizedHandle,
    };

    const latestState = useHarnessStore.getState();
    const nextAttachments = [...(latestState.config.materialAttachments ?? []), attachment];
    const materialAttachments = nextAttachments.filter((a) => a.materialId === materialId);
    const startAttach = materialAttachments.find((a) => a.endpoint === 'start');
    const endAttach = materialAttachments.find((a) => a.endpoint === 'end');

    if (
      startAttach
      && endAttach
      && startAttach.connectorNodeId !== endAttach.connectorNodeId
    ) {
      const nextConfig = reconcileMaterialConnection({
        ...latestState.config,
        materialAttachments: nextAttachments,
        updatedAt: Date.now(),
      }, materialId);
      latestState.replaceDocument(nextConfig);
      setCanvasSelection(materialId);
      return;
    }

    latestState.addMaterialAttachment(attachment);
    setCanvasSelection(materialId);
  }, [alignMaterialToConnector, normalizeAttachmentHandle]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;

    const state = useHarnessStore.getState();
    const sourceMaterial = (state.config.canvasMaterials ?? []).find(
      (material) => material.id === connection.source,
    );
    const targetMaterial = (state.config.canvasMaterials ?? []).find(
      (material) => material.id === connection.target,
    );
    const sourceConnector = state.config.nodes.find((node) => node.id === connection.source);
    const targetConnector = state.config.nodes.find((node) => node.id === connection.target);

    if (sourceMaterial && targetConnector) {
      const endpoint: WireEndpoint = connection.sourceHandle === 'start' ? 'start' : 'end';
      addAttachment(
        sourceMaterial.id,
        endpoint,
        targetConnector.id,
        connection.targetHandle,
      );
      return;
    }

    if (targetMaterial && sourceConnector) {
      const endpoint: WireEndpoint = connection.targetHandle === 'start' ? 'start' : 'end';
      addAttachment(
        targetMaterial.id,
        endpoint,
        sourceConnector.id,
        connection.sourceHandle,
      );
      return;
    }

    if (!sourceConnector || !targetConnector) return;

    const result = createConnection(state.config, {
      fromNodeId: connection.source,
      toNodeId: connection.target,
      fromPin: parsePinFromHandleId(connection.sourceHandle) ?? 1,
      toPin: parsePinFromHandleId(connection.targetHandle) ?? 1,
      name: '新线缆束',
      createDefaultWire: true,
    });

    state.replaceDocument(ensureConnectionMaterial(result.config, result.connectionId));
    setSelection({ kind: 'connection', id: result.connectionId });
  }, [addAttachment, setSelection]);

  const onReconnect = useCallback((oldEdge: Edge, connection: Connection) => {
    const attachment = (useHarnessStore.getState().config.materialAttachments ?? []).find(
      (item) => item.id === oldEdge.id,
    );
    if (!attachment || !connection.target) return;

    const targetIsConnector = useHarnessStore.getState().config.nodes.some(
      (node) => node.id === connection.target,
    );
    if (!targetIsConnector) return;

    reconnectSucceeded.current = true;
    const state = useHarnessStore.getState();
    const normalizedHandle = normalizeAttachmentHandle(
      attachment.materialId,
      attachment.endpoint,
      connection.target,
      connection.targetHandle,
    );
    const nextConfig = {
      ...state.config,
      materialAttachments: (state.config.materialAttachments ?? []).map((item) => (
        item.id === attachment.id
          ? {
              ...item,
              connectorNodeId: connection.target!,
              connectorHandle: normalizedHandle,
            }
          : item
      )),
      updatedAt: Date.now(),
    };
    state.replaceDocument(reconcileMaterialConnection(nextConfig, attachment.materialId));
  }, [normalizeAttachmentHandle]);

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    if (node.type === 'connector') {
      setCanvasSelection(null);
      setSelection({ kind: 'node', id: node.id });
      return;
    }
    if (node.type === 'material') {
      const material = (useHarnessStore.getState().config.canvasMaterials ?? []).find(
        (item) => item.id === node.id,
      );
      setSelection(
        material?.connectionId
          ? { kind: 'connection', id: material.connectionId }
          : { kind: 'none' },
      );
      setCanvasSelection(node.id);
      return;
    }
    setSelection({ kind: 'none' });
    setCanvasSelection(node.id);
  }, [setSelection]);

  const onEdgeClick: EdgeMouseHandler = useCallback((_, edge) => {
    if (edge.type === 'attachment') {
      setSelection({ kind: 'none' });
      setCanvasSelection(edge.id);
      return;
    }
    setCanvasSelection(null);
    setSelection({ kind: 'connection', id: edge.id });
  }, [setSelection]);

  const attachNearbyMaterialEndpoints = useCallback((material: CanvasWireMaterial) => {
    const connectorNodes = useHarnessStore.getState().config.nodes;
    const endpointPoints = [
      {
        endpoint: 'start' as const,
        point: getMaterialEndpointPoint(material, 'start'),
      },
      {
        endpoint: 'end' as const,
        point: getMaterialEndpointPoint(material, 'end'),
      },
    ];

    endpointPoints.forEach(({ endpoint, point }) => {
      const candidates = connectorNodes
        .map((connector) => {
          const distance = distanceToRect(point, {
            x: connector.position.x,
            y: connector.position.y,
            width: 200,
            height: getConnectorHeight(connector),
          });
          if (distance > 28) return undefined;
          const resolved = resolveNearestConnectorHandle(connector, point);
          return {
            connector,
            distance: resolved.distance,
            handle: resolved.handle,
          };
        })
        .filter((candidate): candidate is {
          connector: HarnessNode;
          distance: number;
          handle: string;
        } => Boolean(candidate))
        .sort((a, b) => a.distance - b.distance);

      const nearestCandidate = candidates[0];
      if (!nearestCandidate) return;

      const state = useHarnessStore.getState();
      const existingAttachments = (state.config.materialAttachments ?? []).filter((attachment) => (
        attachment.materialId === material.id
        && attachment.endpoint === endpoint
      ));
      const exactAttachment = existingAttachments.find((attachment) => (
        attachment.connectorNodeId === nearestCandidate.connector.id
        && attachment.connectorHandle === nearestCandidate.handle
      ));

      if (exactAttachment) {
        return;
      }

      if (existingAttachments.length === 1) {
        const [existingAttachment] = existingAttachments;
        const nextConfig = {
          ...state.config,
          materialAttachments: (state.config.materialAttachments ?? []).map((attachment) => (
            attachment.id === existingAttachment.id
              ? {
                  ...attachment,
                  connectorNodeId: nearestCandidate.connector.id,
                  connectorHandle: nearestCandidate.handle,
                }
              : attachment
          )),
          updatedAt: Date.now(),
        };
        state.replaceDocument(reconcileMaterialConnection(nextConfig, material.id));
        setCanvasSelection(material.id);
        return;
      }

      if (existingAttachments.length === 0) {
        addAttachment(
          material.id,
          endpoint,
          nearestCandidate.connector.id,
          nearestCandidate.handle,
        );
        return;
      }
    });
  }, [addAttachment]);

  const onNodeDragStop: OnNodeDrag = useCallback((_, node) => {
    const state = useHarnessStore.getState();
    if (node.type === 'connector') {
      updateNode(node.id, { position: node.position });
      return;
    }
    if (node.type === 'material') {
      const material = (state.config.canvasMaterials ?? []).find((item) => item.id === node.id);
      if (!material) return;
      const movedMaterial = { ...material, position: node.position };
      state.updateCanvasMaterial(node.id, { position: node.position });
      attachNearbyMaterialEndpoints(movedMaterial);
      return;
    }
    if (node.type === 'sleeve') {
      const sleeve = (state.config.protectiveSleeves ?? []).find((item) => item.id === node.id);
      if (!sleeve) return;
      const center = {
        x: node.position.x + sleeve.width / 2,
        y: node.position.y + PROTECTIVE_SLEEVE_HEIGHT / 2,
      };
      const targetMaterial = (state.config.canvasMaterials ?? []).find((material) => (
        center.x >= material.position.x - 15
        && center.x <= material.position.x + material.width + 15
        && center.y >= material.position.y - 20
        && center.y <= material.position.y + CANVAS_MATERIAL_HEIGHT + 20
      ));

      if (targetMaterial) {
        state.updateProtectiveSleeve(node.id, {
          position: centerSleeveOnMaterial(targetMaterial, sleeve.width),
          attachedMaterialId: targetMaterial.id,
        });
      } else {
        state.updateProtectiveSleeve(node.id, {
          position: node.position,
          attachedMaterialId: undefined,
        });
      }
    }
  }, [attachNearbyMaterialEndpoints, updateNode]);

  const onPaneClick = useCallback(() => {
    setCanvasSelection(null);
    setSelection({ kind: 'none' });
    setContextMenu(null);
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
      const material = materials.find((item) => item.id === node.id);
      setCanvasSelection(node.id);
      if (material?.connectionId) {
        setSelection({ kind: 'connection', id: material.connectionId });
      } else {
        setSelection({ kind: 'none' });
      }
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        kind: 'material',
        materialId: node.id,
        connectionId: material?.connectionId,
      });
      return;
    }
    if (node.type === 'sleeve') {
      setCanvasSelection(node.id);
      setContextMenu({ x: event.clientX, y: event.clientY, kind: 'sleeve', sleeveId: node.id });
      return;
    }
    setSelection({ kind: 'node', id: node.id });
    setContextMenu({ x: event.clientX, y: event.clientY, kind: 'node', nodeId: node.id });
  }, [materials, setSelection]);

  const onEdgeContextMenu = useCallback((event: ReactMouseEvent, edge: Edge) => {
    event.preventDefault();
    if (edge.type === 'attachment') {
      setCanvasSelection(edge.id);
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        kind: 'attachment',
        attachmentId: edge.id,
      });
      return;
    }
    setSelection({ kind: 'connection', id: edge.id });
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      kind: 'connection',
      connectionId: edge.id,
    });
  }, [setSelection]);

  const editingMaterial = materials.find((material) => material.id === editingMaterialId) ?? null;

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
          if (!reconnectSucceeded.current && edge.type === 'attachment') {
            useHarnessStore.getState().removeMaterialAttachment(edge.id);
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
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        attributionPosition="bottom-left"
        deleteKeyCode={null}
      >
        <Background color="#cbd5e1" gap={20} />
        <Controls />
      </ReactFlow>

      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onAddConnector={handleAddConnector}
          onAddCanvasWire={handleAddCanvasWire}
          onAddProtectiveSleeve={handleAddProtectiveSleeve}
          onEditNode={(id) => setSelection({ kind: 'node', id })}
          onChangeConnector={(id) => setSelection({ kind: 'node', id })}
          onCopyNode={(nodeId) => {
            const node = config.nodes.find((item) => item.id === nodeId);
            if (!node) return;
            const newNode: HarnessNode = {
              ...node,
              id: generateId(),
              position: { x: node.position.x + 50, y: node.position.y + 50 },
              label: `${node.label}（副本）`,
            };
            useHarnessStore.getState().addNode(newNode);
          }}
          onDeleteNode={(nodeId) => useHarnessStore.getState().removeNode(nodeId)}
          onEditConnection={(id) => setSelection({ kind: 'connection', id })}
          onAddWire={(connectionId) => {
            const state = useHarnessStore.getState();
            try {
              const newConfig = addWireToConnection(state.config, connectionId, {
                wireGauge: 26,
                wireType: 'silicone',
                wireColor: 'red',
                lengthMm: 300,
              });
              state.replaceDocument(newConfig);
            } catch {
              // The connection may have been removed by another action.
            }
          }}
          onDeleteConnection={(connectionId) => useHarnessStore.getState().removeConnection(connectionId)}
          onEditWire={(id) => setSelection({ kind: 'wire', id })}
          onDeleteWire={(wireId) => useHarnessStore.getState().removeWire(wireId)}
          onEditMaterial={(id) => {
            setNewMaterialId(null);
            setEditingMaterialId(id);
          }}
          onEditSleeve={(id) => {
            const sleeve = sleeves.find((item) => item.id === id);
            if (!sleeve) return;
            setSleeveDialog({
              sleeveId: sleeve.id,
              position: sleeve.position,
              materialId: sleeve.attachedMaterialId,
            });
          }}
          onDeleteMaterial={(id) => {
            useHarnessStore.getState().removeCanvasMaterial(id);
            setCanvasSelection(null);
          }}
          onDeleteSleeve={(id) => {
            useHarnessStore.getState().removeProtectiveSleeve(id);
            setCanvasSelection(null);
          }}
          onDeleteAttachment={(id) => {
            useHarnessStore.getState().removeMaterialAttachment(id);
            setCanvasSelection(null);
          }}
          onFitView={() => fitView({ duration: 300 })}
          hasSelection={selection.kind !== 'none' || canvasSelection !== null}
        />
      )}

      <WireMaterialDialog
        key={editingMaterialId ?? 'closed'}
        material={editingMaterial}
        onCancel={() => {
          if (newMaterialId) {
            useHarnessStore.getState().removeCanvasMaterial(newMaterialId);
          }
          setEditingMaterialId(null);
          setNewMaterialId(null);
        }}
        onConfirm={(updates) => {
          if (editingMaterialId) {
            useHarnessStore.getState().updateCanvasMaterial(editingMaterialId, updates);
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
        onCancel={() => setSleeveDialog(null)}
        onConfirm={(type, lengthMm, corrugatedMaterial) => {
          if (!sleeveDialog) return;
          const state = useHarnessStore.getState();
          const width = sleeveLengthToCanvasWidth(lengthMm);
          const attachedMaterial = sleeveDialog.materialId
            ? (state.config.canvasMaterials ?? []).find(
                (material) => material.id === sleeveDialog.materialId,
              )
            : undefined;
          const position = attachedMaterial
            ? centerSleeveOnMaterial(attachedMaterial, width)
            : sleeveDialog.position;

          if (sleeveDialog.sleeveId) {
            state.updateProtectiveSleeve(sleeveDialog.sleeveId, {
              type,
              lengthMm,
              width,
              position,
              corrugatedMaterial: type === 'corrugated' ? corrugatedMaterial : undefined,
            });
            setCanvasSelection(sleeveDialog.sleeveId);
          } else {
            const sleeve: ProtectiveSleeve = {
              id: generateId(),
              type,
              lengthMm,
              width,
              position,
              attachedMaterialId: attachedMaterial?.id,
              corrugatedMaterial: type === 'corrugated' ? corrugatedMaterial : undefined,
            };
            state.addProtectiveSleeve(sleeve);
            setCanvasSelection(sleeve.id);
          }
          setSleeveDialog(null);
        }}
      />
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

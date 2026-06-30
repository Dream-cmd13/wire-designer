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
  const startPin = firstWire
    ? firstWire.fromConnectorId === startNode.id
      ? firstWire.fromPin
      : firstWire.toPin
    : 1;
  const endPin = firstWire
    ? firstWire.fromConnectorId === endNode.id
      ? firstWire.fromPin
      : firstWire.toPin
    : 1;
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
  const nextAttachments: MaterialAttachment[] = [
    {
      id: generateId(),
      materialId,
      endpoint: 'start',
      connectorNodeId: startNode.id,
      connectorHandle: `right-pin-${startPin}`,
    },
    {
      id: generateId(),
      materialId,
      endpoint: 'end',
      connectorNodeId: endNode.id,
      connectorHandle: `left-pin-${endPin}`,
    },
  ];

  return {
    ...config,
    canvasMaterials: [...(config.canvasMaterials ?? []), material],
    materialAttachments: [...attachments, ...nextAttachments],
    protectiveSleeves: config.protectiveSleeves ?? [],
    updatedAt: Date.now(),
  };
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
    const migratedConfig = config.connections.reduce(
      (currentConfig, connection) => ensureConnectionMaterial(currentConfig, connection.id),
      config,
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

  const addAttachment = useCallback((
    materialId: string,
    endpoint: WireEndpoint,
    connectorNodeId: string,
    connectorHandle?: string | null,
  ) => {
    const state = useHarnessStore.getState();
    const exists = (state.config.materialAttachments ?? []).some((item) => (
      item.materialId === materialId
      && item.endpoint === endpoint
      && item.connectorNodeId === connectorNodeId
    ));
    if (exists) return;

    alignMaterialToConnector(materialId, connectorNodeId);

    const attachment: MaterialAttachment = {
      id: generateId(),
      materialId,
      endpoint,
      connectorNodeId,
      connectorHandle: connectorHandle ?? 'left',
    };

    const latestState = useHarnessStore.getState();
    const material = (latestState.config.canvasMaterials ?? []).find((m) => m.id === materialId);
    const nextAttachments = [...(latestState.config.materialAttachments ?? []), attachment];
    const materialAttachments = nextAttachments.filter((a) => a.materialId === materialId);
    const startAttach = materialAttachments.find((a) => a.endpoint === 'start');
    const endAttach = materialAttachments.find((a) => a.endpoint === 'end');

    if (
      !material?.connectionId
      && startAttach
      && endAttach
      && startAttach.connectorNodeId !== endAttach.connectorNodeId
    ) {
      const existingConn = latestState.config.connections.find((c) => (
        (c.fromNodeId === startAttach.connectorNodeId && c.toNodeId === endAttach.connectorNodeId)
        || (c.fromNodeId === endAttach.connectorNodeId && c.toNodeId === startAttach.connectorNodeId)
      ));

      if (existingConn) {
        latestState.replaceDocument({
          ...latestState.config,
          materialAttachments: nextAttachments,
          canvasMaterials: (latestState.config.canvasMaterials ?? []).map((m) => (
            m.id === materialId ? { ...m, connectionId: existingConn.id } : m
          )),
          updatedAt: Date.now(),
        });
      } else {
        const fromPin = parsePinFromHandleId(startAttach.connectorHandle) ?? 1;
        const toPin = parsePinFromHandleId(endAttach.connectorHandle) ?? 1;
        const result = createConnection(latestState.config, {
          fromNodeId: startAttach.connectorNodeId,
          toNodeId: endAttach.connectorNodeId,
          fromPin,
          toPin,
          name: material?.name ?? '新线缆束',
          createDefaultWire: true,
        });
        latestState.replaceDocument({
          ...result.config,
          materialAttachments: nextAttachments,
          canvasMaterials: (result.config.canvasMaterials ?? []).map((m) => (
            m.id === materialId ? { ...m, connectionId: result.connectionId } : m
          )),
          updatedAt: Date.now(),
        });
        setSelection({ kind: 'connection', id: result.connectionId });
      }

      setCanvasSelection(materialId);
      return;
    }

    latestState.addMaterialAttachment(attachment);
    setCanvasSelection(materialId);
  }, [alignMaterialToConnector, setSelection]);

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
    useHarnessStore.getState().updateMaterialAttachment(attachment.id, {
      connectorNodeId: connection.target,
      connectorHandle: connection.targetHandle,
    });
  }, []);

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
        point: {
          x: material.position.x,
          y: material.position.y + CANVAS_MATERIAL_SLEEVE_CENTER_Y,
        },
      },
      {
        endpoint: 'end' as const,
        point: {
          x: material.position.x + material.width,
          y: material.position.y + CANVAS_MATERIAL_SLEEVE_CENTER_Y,
        },
      },
    ];

    endpointPoints.forEach(({ endpoint, point }) => {
      connectorNodes.forEach((connector) => {
        const distance = distanceToRect(point, {
          x: connector.position.x,
          y: connector.position.y,
          width: 200,
          height: getConnectorHeight(connector),
        });
        if (distance <= 28) {
          const connectorCenterX = connector.position.x + 100;
          const connectorHandle = point.x < connectorCenterX ? 'left' : 'right';
          addAttachment(
            material.id,
            endpoint,
            connector.id,
            connectorHandle,
          );
        }
      });
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

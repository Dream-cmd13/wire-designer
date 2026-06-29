import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  addEdge,
  Background,
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
import { Plus } from 'lucide-react';
import { addConnectorNode, addWireToConnection, createConnection } from '@/lib/commands';
import { useHarnessStore } from '@/stores/harnessStore';
import type { HarnessNode } from '@/types/harness';
import { ConnectorNode } from './ConnectorNode';
import { ContextMenu, type ContextMenuState } from './ContextMenu';
import { WireEdge } from './WireEdge';

const nodeTypes: NodeTypes = { connector: ConnectorNode };
const edgeTypes: EdgeTypes = { wire: WireEdge };

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

function HarnessCanvasInner() {
  const { config, selection, setSelection, updateNode } = useHarnessStore();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const { fitView } = useReactFlow();

  useEffect(() => {
    setNodes(
      config.nodes.map((node) => ({
        id: node.id,
        type: node.type as 'connector',
        position: node.position,
        data: node as unknown as Record<string, unknown>,
        selected: selection.kind === 'node' && selection.id === node.id,
      })),
    );
  }, [config.nodes, selection, setNodes]);

  useEffect(() => {
    setEdges(
      config.connections.map((connection) => ({
        id: connection.id,
        source: connection.fromNodeId,
        target: connection.toNodeId,
        type: 'wire',
        data: connection as unknown as Record<string, unknown>,
        selected: selection.kind === 'connection' && selection.id === connection.id,
      })),
    );
  }, [config.connections, selection, setEdges]);

  const handleAddConnector = useCallback(() => {
    const state = useHarnessStore.getState();
    const newConfig = addConnectorNode(state.config, {
      position: { x: 200 + Math.random() * 100, y: 200 + Math.random() * 100 },
    });
    state.replaceDocument(newConfig);
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;

    const state = useHarnessStore.getState();
    const result = createConnection(state.config, {
      fromNodeId: connection.source,
      toNodeId: connection.target,
      name: '新线缆束',
      createDefaultWire: true,
    });

    state.replaceDocument(result.config);
    setSelection({ kind: 'connection', id: result.connectionId });

    setEdges((currentEdges) => addEdge({
      ...connection,
      id: result.connectionId,
      type: 'wire',
      data: result.config.connections.find((item) => item.id === result.connectionId) as unknown as Record<string, unknown>,
    }, currentEdges));
  }, [setEdges, setSelection]);

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setSelection({ kind: 'node', id: node.id });
  }, [setSelection]);

  const onEdgeClick: EdgeMouseHandler = useCallback((_, edge) => {
    setSelection({ kind: 'connection', id: edge.id });
  }, [setSelection]);

  const onNodeDragStop: OnNodeDrag = useCallback((_, node) => {
    updateNode(node.id, { position: node.position });
  }, [updateNode]);

  const onPaneClick = useCallback(() => {
    setSelection({ kind: 'none' });
  }, [setSelection]);

  const onPaneContextMenu = useCallback((event: ReactMouseEvent | MouseEvent) => {
    event.preventDefault();
    setContextMenu({
      x: 'clientX' in event ? event.clientX : 0,
      y: 'clientY' in event ? event.clientY : 0,
      kind: 'pane',
    });
  }, []);

  const onNodeContextMenu = useCallback((event: ReactMouseEvent, node: Node) => {
    event.preventDefault();
    setSelection({ kind: 'node', id: node.id });
    setContextMenu({ x: event.clientX, y: event.clientY, kind: 'node', nodeId: node.id });
  }, [setSelection]);

  const onEdgeContextMenu = useCallback((event: ReactMouseEvent, edge: Edge) => {
    event.preventDefault();
    setSelection({ kind: 'connection', id: edge.id });
    setContextMenu({ x: event.clientX, y: event.clientY, kind: 'connection', connectionId: edge.id });
  }, [setSelection]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    useHarnessStore.getState().removeNode(nodeId);
  }, []);

  const handleDeleteConnection = useCallback((connectionId: string) => {
    useHarnessStore.getState().removeConnection(connectionId);
  }, []);

  const handleDeleteWire = useCallback((wireId: string) => {
    useHarnessStore.getState().removeWire(wireId);
  }, []);

  const isEmpty = config.nodes.length === 0;

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        attributionPosition="bottom-left"
        deleteKeyCode={null}
      >
        <Background color="#cbd5e1" gap={20} />
        <Controls />
      </ReactFlow>

      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="pointer-events-auto text-center">
            <div className="max-w-sm rounded-xl border-2 border-dashed border-blue-300 bg-white p-8 shadow-lg">
              <div className="mb-4 text-5xl">🔌</div>
              <h3 className="mb-2 text-lg font-semibold text-slate-700">画布为空</h3>
              <p className="mb-5 text-sm text-slate-500">
                点击下方按钮添加第一个连接器，然后拖拽端点创建线缆连接。
              </p>
              <button
                onClick={handleAddConnector}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                <Plus className="h-5 w-5" />
                添加连接器
              </button>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onAddConnector={handleAddConnector}
          onEditNode={(id) => setSelection({ kind: 'node', id })}
          onChangeConnector={(id) => setSelection({ kind: 'node', id })}
          onCopyNode={(nodeId) => {
            const node = config.nodes.find((item) => item.id === nodeId);
            if (!node) return;

            const newNode: HarnessNode = {
              ...node,
              id: generateId(),
              position: { x: node.position.x + 50, y: node.position.y + 50 },
              label: `${node.label} (副本)`,
            };

            useHarnessStore.getState().addNode(newNode);
          }}
          onDeleteNode={handleDeleteNode}
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
              // connection may have been removed by another action
            }
          }}
          onDeleteConnection={handleDeleteConnection}
          onEditWire={(id) => setSelection({ kind: 'wire', id })}
          onDeleteWire={handleDeleteWire}
          onFitView={() => fitView({ duration: 300 })}
          hasSelection={selection.kind !== 'none'}
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

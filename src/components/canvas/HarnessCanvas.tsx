import { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type OnNodeDrag,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useHarnessStore } from '@/stores/harnessStore';
import { ConnectorNode } from './ConnectorNode';
import { WireEdge } from './WireEdge';

const nodeTypes = { connector: ConnectorNode as any };
const edgeTypes = { wire: WireEdge as any };

const generateId = (): string =>
  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

export function HarnessCanvas() {
  const { config, setSelectedNode, setSelectedWire, addConnection, addWire, updateNode } = useHarnessStore();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    setNodes(
      config.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n as any,
        selected: false,
      }))
    );
  }, [config.nodes, setNodes]);

  useEffect(() => {
    setEdges(
      config.connections.map((c) => ({
        id: c.id,
        source: c.fromNodeId,
        target: c.toNodeId,
        type: 'wire',
        data: c as any,
        selected: false,
      }))
    );
  }, [config.connections, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      const connectionId = generateId();
      const wireId = generateId();

      // Create a default wire for the new connection
      const newWire = {
        id: wireId,
        name: 'W1',
        wireGauge: 26,
        wireType: 'silicone',
        wireColor: 'red',
        lengthMm: 300,
        fromConnectorId: connection.source,
        fromPin: 1,
        toConnectorId: connection.target,
        toPin: 1,
      };

      const newConnection = {
        id: connectionId,
        name: '新线缆束',
        fromNodeId: connection.source,
        toNodeId: connection.target,
        wireIds: [wireId],
      };

      addConnection(newConnection);
      addWire(newWire);
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: connectionId,
            type: 'wire',
            data: newConnection as any,
          },
          eds
        )
      );
    },
    [addConnection, addWire, setEdges]
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id);
      setSelectedWire(null);
    },
    [setSelectedNode, setSelectedWire]
  );

  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setSelectedWire(edge.id);
      setSelectedNode(null);
    },
    [setSelectedWire, setSelectedNode]
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_: MouseEvent | TouchEvent, node: Node) => {
      updateNode(node.id, { position: node.position });
    },
    [updateNode]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedWire(null);
  }, [setSelectedNode, setSelectedWire]);

  return (
    <div className="w-full h-full">
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
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <Background color="#cbd5e1" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

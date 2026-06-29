import { useRef, useMemo } from 'react';
import { useHarnessStore } from '@/stores/harnessStore';
import { WIRE_COLORS } from '@/lib/data';

export function Preview3D() {
  const { config } = useHarnessStore();
  const svgRef = useRef<SVGSVGElement>(null);

  // Isometric projection helpers
  const iso = (x: number, y: number, z: number) => {
    const isoX = (x - z) * 0.866; // cos(30°)
    const isoY = (x + z) * 0.5 - y; // sin(30°)
    return { x: isoX, y: isoY };
  };

  // Compute node positions in 3D space from 2D canvas positions
  const node3DPositions = useMemo(() => {
    if (config.nodes.length === 0) return new Map<string, { x: number; y: number; z: number }>();
    const xs = config.nodes.map((n) => n.position.x);
    const ys = config.nodes.map((n) => n.position.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const scale = Math.max(maxX - minX, maxY - minY, 200);

    return new Map(
      config.nodes.map((n) => {
        const x = ((n.position.x - cx) / scale) * 80;
        const z = ((n.position.y - cy) / scale) * 80;
        return [n.id, { x, y: 0, z }];
      })
    );
  }, [config.nodes]);

  // Project all nodes to 2D to compute bounds
  const projectedNodes = useMemo(() => {
    return config.nodes.map((node) => {
      const p3 = node3DPositions.get(node.id)!;
      const p2 = iso(p3.x, p3.y, p3.z);
      return { node, p2 };
    });
  }, [config.nodes, node3DPositions]);

  // Auto-fit to view
  const viewBox = useMemo(() => {
    if (projectedNodes.length === 0) return { x: -60, y: -60, w: 120, h: 120 };
    const allX = projectedNodes.map((p) => p.p2.x);
    const allY = projectedNodes.map((p) => p.p2.y);
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const span = Math.max(maxX - minX + 80, maxY - minY + 80, 120);
    return { x: cx - span / 2, y: cy - span / 2, w: span, h: span };
  }, [projectedNodes]);

  // Build wire paths
  const wirePaths = useMemo(() => {
    return config.connections.flatMap((conn) => {
      const from3D = node3DPositions.get(conn.fromNodeId);
      const to3D = node3DPositions.get(conn.toNodeId);
      if (!from3D || !to3D) return [];

      return conn.wireIds.map((wireId, idx) => {
        const wire = config.wires.find((w) => w.id === wireId);
        if (!wire) return null;

        const offset = (idx - (conn.wireIds.length - 1) / 2) * 5;
        const f = iso(from3D.x, offset, from3D.z);
        const t = iso(to3D.x, offset, to3D.z);

        // Arc midpoint (upward arc for wire sag)
        const dist = Math.sqrt(
          Math.pow(t.x - f.x, 2) + Math.pow(t.y - f.y, 2)
        );
        const arcH = Math.max(6, dist * 0.15);
        const mid = { x: (f.x + t.x) / 2, y: (f.y + t.y) / 2 - arcH };

        // Quadratic bezier
        const path = `M ${f.x.toFixed(2)} ${f.y.toFixed(2)} Q ${mid.x.toFixed(2)} ${mid.y.toFixed(2)} ${t.x.toFixed(2)} ${t.y.toFixed(2)}`;

        const color = WIRE_COLORS.find((c) => c.id === wire.wireColor)?.hex || '#6B7280';

        return {
          key: wireId,
          path,
          color,
          gauge: wire.wireGauge,
        };
      }).filter(Boolean);
    });
  }, [config.connections, config.wires, node3DPositions]);

  // Node faces for isometric box (top, left, right)
  const getNodeFaces = (x: number, y: number, z: number) => {
    const hw = 14; // half width in world units
    const hh = 10; // half depth in world units
    const h = 12; // box height

    const center = iso(x, y, z);
    const top = [
      iso(x - hw, y + h, z - hh),
      iso(x + hw, y + h, z - hh),
      iso(x + hw, y + h, z + hh),
      iso(x - hw, y + h, z + hh),
    ];
    const right = [
      iso(x + hw, y + h, z - hh),
      iso(x + hw, y + h, z + hh),
      iso(x + hw, y, z + hh),
      iso(x + hw, y, z - hh),
    ];
    const left = [
      iso(x - hw, y + h, z - hh),
      iso(x - hw, y + h, z + hh),
      iso(x - hw, y, z + hh),
      iso(x - hw, y, z - hh),
    ];
    return { top, right, left, center };
  };

  const toPoly = (pts: { x: number; y: number }[]) =>
    pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

  const isEmpty = config.nodes.length === 0;

  return (
    <div className="absolute top-4 right-4 w-72 h-56 bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden z-10">
      <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-700 flex items-center justify-between">
        <span>等距预览</span>
        <span className="text-[10px] text-slate-400">
          {config.connections.length} 连接 · {config.wires.length} 导线
        </span>
      </div>
      <div className="h-[calc(100%-33px)] relative">
        {isEmpty ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-slate-400">
              <div className="text-3xl mb-2">📐</div>
              <p className="text-xs">暂无连接器</p>
              <p className="text-[10px] text-slate-300 mt-1">添加连接器后可查看预览</p>
            </div>
          </div>
        ) : (
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          className="w-full h-full"
          style={{ background: '#f8fafc' }}
        >
          {/* Ground grid */}
          {Array.from({ length: 9 }).map((_, i) => {
            const x = -80 + i * 20;
            const y1 = iso(x, 0, -80);
            const y2 = iso(x, 0, 80);
            const z1 = iso(-80, 0, x);
            const z2 = iso(80, 0, x);
            return (
              <g key={`grid-${i}`} stroke="#e2e8f0" strokeWidth={0.8}>
                <line x1={y1.x} y1={y1.y} x2={y2.x} y2={y2.y} />
                <line x1={z1.x} y1={z1.y} x2={z2.x} y2={z2.y} />
              </g>
            );
          })}

          {/* Wire paths (drawn behind nodes) */}
          {wirePaths.map((w) =>
            w ? (
              <g key={w.key}>
                {/* Shadow */}
                <path
                  d={w.path}
                  fill="none"
                  stroke="rgba(0,0,0,0.08)"
                  strokeWidth={Math.max(2, (w.gauge || 26) / 8)}
                  transform="translate(0, 3)"
                />
                {/* Wire */}
                <path
                  d={w.path}
                  fill="none"
                  stroke={w.color}
                  strokeWidth={Math.max(2, (w.gauge || 26) / 8)}
                  strokeLinecap="round"
                />
              </g>
            ) : null
          )}

          {/* Connector nodes as isometric boxes */}
          {projectedNodes.map(({ node }) => {
            const p3 = node3DPositions.get(node.id)!;
            const faces = getNodeFaces(p3.x, p3.y, p3.z);
            return (
              <g key={node.id}>
                {/* Right face */}
                <polygon
                  points={toPoly(faces.right)}
                  fill="#60a5fa"
                  stroke="#3b82f6"
                  strokeWidth={1}
                />
                {/* Left face */}
                <polygon
                  points={toPoly(faces.left)}
                  fill="#93c5fd"
                  stroke="#3b82f6"
                  strokeWidth={1}
                />
                {/* Top face */}
                <polygon
                  points={toPoly(faces.top)}
                  fill="#bfdbfe"
                  stroke="#3b82f6"
                  strokeWidth={1}
                />
                {/* Label */}
                <text
                  x={faces.center.x}
                  y={faces.center.y - 4}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={10}
                  fill="#1e40af"
                  fontWeight="600"
                  style={{ pointerEvents: 'none' }}
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
        )}

        {/* Legend overlay */}
        {!isEmpty && (
        <div className="absolute bottom-1.5 left-1.5 flex flex-wrap gap-x-2 gap-y-0.5 bg-white/80 rounded px-1.5 py-0.5">
          {config.wires.slice(0, 4).map((w) => {
            const color = WIRE_COLORS.find((c) => c.id === w.wireColor)?.hex || '#6B7280';
            return (
              <div key={w.id} className="flex items-center gap-1">
                <div
                  className="w-2.5 h-1 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[9px] text-slate-500">{w.name}</span>
              </div>
            );
          })}
          {config.wires.length > 4 && (
            <span className="text-[9px] text-slate-400">+{config.wires.length - 4}</span>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

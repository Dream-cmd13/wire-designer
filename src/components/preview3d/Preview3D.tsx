import { useRef, useMemo } from 'react';
import { useHarnessStore } from '@/stores/harnessStore';
import { WIRE_COLORS } from '@/lib/data';

export function Preview3D() {
  const { config } = useHarnessStore();
  const svgRef = useRef<SVGSVGElement>(null);

  const iso = (x: number, y: number, z: number) => {
    const isoX = (x - z) * 0.866;
    const isoY = (x + z) * 0.5 - y;
    return { x: isoX, y: isoY };
  };

  const connectors = config.connectors;
  const materials = config.materials;

  // Compute connector positions in 3D space from 2D canvas positions
  const connector3DPositions = useMemo(() => {
    if (connectors.length === 0) return new Map<string, { x: number; y: number; z: number }>();
    const xs = connectors.map((n) => n.position.x);
    const ys = connectors.map((n) => n.position.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const scale = Math.max(maxX - minX, maxY - minY, 200);

    return new Map(
      connectors.map((n) => {
        const x = ((n.position.x - cx) / scale) * 80;
        const z = ((n.position.y - cy) / scale) * 80;
        return [n.id, { x, y: 0, z }];
      }),
    );
  }, [connectors]);

  const projectedConnectors = useMemo(() => {
    return connectors.map((instance) => {
      const p3 = connector3DPositions.get(instance.id)!;
      const p2 = iso(p3.x, p3.y, p3.z);
      return { instance, p2 };
    });
  }, [connectors, connector3DPositions]);

  const viewBox = useMemo(() => {
    if (projectedConnectors.length === 0) return { x: -60, y: -60, w: 120, h: 120 };
    const allX = projectedConnectors.map((p) => p.p2.x);
    const allY = projectedConnectors.map((p) => p.p2.y);
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const span = Math.max(maxX - minX + 80, maxY - minY + 80, 120);
    return { x: cx - span / 2, y: cy - span / 2, w: span, h: span };
  }, [projectedConnectors]);

  // Build wire paths from material circuits
  const wirePaths = useMemo(() => {
    const paths: Array<{ key: string; path: string; color: string; gauge: number }> = [];

    for (const material of materials) {
      const awg = material.spec.awg;
      for (const circuit of material.circuits) {
        const startId = circuit.start?.connectorId;
        const endId = circuit.end?.connectorId;
        if (!startId || !endId) continue;

        const from3D = connector3DPositions.get(startId);
        const to3D = connector3DPositions.get(endId);
        if (!from3D || !to3D) continue;

        const f = iso(from3D.x, 0, from3D.z);
        const t = iso(to3D.x, 0, to3D.z);

        const dist = Math.sqrt(Math.pow(t.x - f.x, 2) + Math.pow(t.y - f.y, 2));
        const arcH = Math.max(6, dist * 0.15);
        const mid = { x: (f.x + t.x) / 2, y: (f.y + t.y) / 2 - arcH };

        const path = `M ${f.x.toFixed(2)} ${f.y.toFixed(2)} Q ${mid.x.toFixed(2)} ${mid.y.toFixed(2)} ${t.x.toFixed(2)} ${t.y.toFixed(2)}`;
        const color = WIRE_COLORS.find((c) => c.id === circuit.color)?.hex || '#6B7280';

        paths.push({ key: circuit.id, path, color, gauge: awg });
      }
    }
    return paths;
  }, [materials, connector3DPositions]);

  const getNodeFaces = (x: number, y: number, z: number) => {
    const hw = 14;
    const hh = 10;
    const h = 12;
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

  const isEmpty = connectors.length === 0;

  return (
    <div className="absolute top-4 right-4 w-72 h-56 bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden z-10">
      <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-700 flex items-center justify-between">
        <span>等距预览</span>
        <span className="text-[10px] text-slate-400">
          {connectors.length} 连接器 · {materials.length} 线材
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

            {/* Wire paths */}
            {wirePaths.map((w) => (
              <g key={w.key}>
                <path
                  d={w.path}
                  fill="none"
                  stroke="rgba(0,0,0,0.08)"
                  strokeWidth={Math.max(2, w.gauge / 8)}
                  transform="translate(0, 3)"
                />
                <path
                  d={w.path}
                  fill="none"
                  stroke={w.color}
                  strokeWidth={Math.max(2, w.gauge / 8)}
                  strokeLinecap="round"
                />
              </g>
            ))}

            {/* Connector nodes as isometric boxes */}
            {projectedConnectors.map(({ instance }) => {
              const p3 = connector3DPositions.get(instance.id)!;
              const faces = getNodeFaces(p3.x, p3.y, p3.z);
              return (
                <g key={instance.id}>
                  <polygon points={toPoly(faces.right)} fill="#60a5fa" stroke="#3b82f6" strokeWidth={1} />
                  <polygon points={toPoly(faces.left)} fill="#93c5fd" stroke="#3b82f6" strokeWidth={1} />
                  <polygon points={toPoly(faces.top)} fill="#bfdbfe" stroke="#3b82f6" strokeWidth={1} />
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
                    {instance.label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* Legend overlay */}
        {!isEmpty && materials.length > 0 && (
          <div className="absolute bottom-1.5 left-1.5 flex flex-wrap gap-x-2 gap-y-0.5 bg-white/80 rounded px-1.5 py-0.5">
            {materials.slice(0, 4).map((m) => {
              const colorId = m.spec.kind === 'electronic' ? m.spec.color : (m.spec.coreColors[0] ?? 'red');
              const color = WIRE_COLORS.find((c) => c.id === colorId)?.hex || '#6B7280';
              return (
                <div key={m.id} className="flex items-center gap-1">
                  <div className="w-2.5 h-1 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-[9px] text-slate-500">{m.name}</span>
                </div>
              );
            })}
            {materials.length > 4 && (
              <span className="text-[9px] text-slate-400">+{materials.length - 4}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { memo } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { ConnectorInstance } from '@/types/harness';
import { useHarnessStore } from '@/stores/harnessStore';
import { getConnectorNodeWidth } from '@/lib/canvasMaterials';
import { WIRE_COLORS } from '@/lib/data';
import { showJumperContextMenu } from './jumperContextMenu';
import { selectMaterialConnectionPoint } from './materialConnectionClick';
import {
  getActiveConnectorSide,
  getConnectorPinBindings,
} from '@/lib/commands';
import { Plug } from 'lucide-react';

interface ConnectorNodeProps {
  data: ConnectorInstance;
  selected?: boolean;
}

function ConnectorNodeImpl({ data, selected }: ConnectorNodeProps) {
  // Selectors: subscribe only to the config slice this node needs.
  // This prevents re-renders when unrelated materials/sleeves change.
  const config = useHarnessStore((s) => s.config);
  const pinCount = data.connector?.pinCount || 2;
  const pinLabels = data.connector?.pinLabels || [];

  const activeSide = getActiveConnectorSide(config, data.id);
  const pinBindings = getConnectorPinBindings(config, data.id);

  const showLeft = activeSide === undefined || activeSide === 'left';
  const showRight = activeSide === undefined || activeSide === 'right';

  const getColorHex = (colorId: string) =>
    WIRE_COLORS.find((c) => c.id === colorId)?.hex || '#6B7280';

  // Render ALL pins so every PIN is connectable/shortable. The previous
  // 6-PIN fold made Pin7+ unreachable after the legacy full-PIN panel
  // was removed. Tall nodes are acceptable in a design tool.
  const displayPins = pinCount;

  const connectedPinCount = Array.from({ length: pinCount }, (_, i) => i + 1).filter((p) => {
    return pinBindings.get(`left-pin-${p}`)?.length || pinBindings.get(`right-pin-${p}`)?.length;
  }).length;

  const nodeHeight = 92 + displayPins * 20 + 24 + 8;

  return (
    <div
      className={`bg-white border-2 rounded-lg shadow-sm transition-all ${
        selected ? 'border-blue-500 shadow-md' : 'border-slate-300'
      }`}
      style={{ width: getConnectorNodeWidth(data), minHeight: nodeHeight }}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-100">
        <Plug className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div
            className="text-xs font-bold text-slate-800 overflow-hidden h-[42px] leading-[14px] line-clamp-3 break-all"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
            }}
            title={data.label}
          >
            {data.label}
          </div>
          <div
            className="text-[10px] text-gray-400 overflow-hidden h-7 leading-[12px] line-clamp-2 break-all"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
            title={data.connector?.name}
          >
            {data.connector?.name}
          </div>
        </div>
      </div>

      {/* PIN layout area */}
      <div className="px-1 relative" style={{ overflow: 'visible' }}>
        {Array.from({ length: displayPins }, (_, i) => i + 1).map((pinNum) => {
          const leftBindings = pinBindings.get(`left-pin-${pinNum}`) ?? [];
          const rightBindings = pinBindings.get(`right-pin-${pinNum}`) ?? [];
          const allBindings = [...leftBindings, ...rightBindings];
          const isConnected = allBindings.length > 0;
          const label = pinNum <= pinLabels.length ? pinLabels[pinNum - 1] : String(pinNum);
          const isEvenRow = pinNum % 2 === 0;

          return (
            <div
              key={pinNum}
              className={`relative flex items-center h-5 pl-3 pr-3 rounded-sm transition-colors hover:bg-blue-50 ${
                isEvenRow ? 'bg-slate-50' : 'bg-white'
              }`}
              style={{ lineHeight: '20px' }}
            >
              {/* Left pin handle — only rendered if left side is active.
                  Stays blue even when jumpered; the jumper arc is the
                  visual indicator, not a handle color change. */}
              {showLeft && (
                <Handle
                  id={`left-pin-${pinNum}`}
                  type="target"
                  position={Position.Left}
                  onClick={(event) => {
                    event.stopPropagation();
                    selectMaterialConnectionPoint({
                      kind: 'connector',
                      connectorId: data.id,
                      connectorSide: 'left',
                      pin: pinNum,
                    });
                  }}
                  className="!h-3 !w-3 !border-2 !border-white !bg-blue-500"
                />
              )}

              {/* Left side: PIN number */}
              <span className="text-[10px] font-mono text-blue-600 w-5 text-right flex-shrink-0 pr-1 font-semibold">
                {pinNum}
              </span>

              {/* Middle: PIN label */}
              <span
                className={`text-[10px] truncate flex-1 min-w-0 ${
                  isConnected ? 'text-slate-700 font-medium' : 'text-slate-400'
                }`}
              >
                {label}
              </span>

              {/* Right side: connection status */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {isConnected ? (
                  allBindings.map((binding, idx) => {
                    const colorHex = getColorHex(binding.color);
                    return (
                      <div key={`${binding.circuitId}-${idx}`} className="flex items-center gap-0.5">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: colorHex }}
                        />
                        <div
                          className="w-4 h-[2px] rounded-full flex-shrink-0"
                          style={{ backgroundColor: colorHex }}
                        />
                      </div>
                    );
                  })
                ) : (
                  <div className="flex items-center gap-0.5">
                    <div className="w-2 h-2 rounded-full border border-gray-300 flex-shrink-0" />
                    <div className="w-4 h-[2px] border-t border-dashed border-gray-300 flex-shrink-0" />
                  </div>
                )}

                {allBindings.length > 1 && (
                  <span className="text-[8px] text-blue-500 font-semibold ml-0.5">
                    x{allBindings.length}
                  </span>
                )}
              </div>

              {/* Right pin handle — only rendered if right side is active.
                  Stays blue even when jumpered. */}
              {showRight && (
                <Handle
                  id={`right-pin-${pinNum}`}
                  type="source"
                  position={Position.Right}
                  onClick={(event) => {
                    event.stopPropagation();
                    selectMaterialConnectionPoint({
                      kind: 'connector',
                      connectorId: data.id,
                      connectorSide: 'right',
                      pin: pinNum,
                    });
                  }}
                  className="!h-3 !w-3 !border-2 !border-white !bg-blue-500"
                />
              )}
            </div>
          );
        })}

        {/* Jumper visual: a blue curved arc connecting jumpered pins,
            drawn OUTSIDE the connector body (bulging outward into the
            canvas). No extra dots — the existing blue PIN handles are
            the endpoints. */}
        {data.jumpers.map((jumper) => {
          const side = jumper.side;
          if (jumper.pins.length < 2) return null;
          const sortedPins = [...jumper.pins].sort((a, b) => a - b);
          const visiblePins = sortedPins.filter((p) => p <= displayPins);
          if (visiblePins.length < 2) return null;

          const firstPin = visiblePins[0];
          const lastPin = visiblePins[visiblePins.length - 1];
          const y1 = (firstPin - 1) * 20 + 10;
          const y2 = (lastPin - 1) * 20 + 10;
          const arcHeight = y2 - y1;
          const isLeft = side === 'left';

          // The SVG is positioned entirely outside the connector body.
          // x=0 (right side) or x=svgWidth (left side) touches the
          // connector edge; the arc bulges further outward.
          const bulgeDepth = 16; // how far the arc sticks out
          const svgWidth = bulgeDepth + 4;
          const svgHeight = arcHeight + 8;
          const svgTop = y1 - 4;

          // edgeX: the x coordinate at the connector boundary
          //   right side → x=0 (left edge of the outer SVG)
          //   left side  → x=svgWidth (right edge of the outer SVG)
          const edgeX = isLeft ? svgWidth : 0;
          // bulgeX: the x coordinate of the arc's outermost point
          //   right side → bulge right (positive x, away from body)
          //   left side  → bulge left (x=0, away from body)
          const bulgeX = isLeft ? 0 : svgWidth;

          // Cubic bezier: start at edge, control points push outward,
          // end at edge. This creates a smooth arc outside the body.
          const path = `M ${edgeX} 4 C ${bulgeX} 4, ${bulgeX} ${arcHeight + 4}, ${edgeX} ${arcHeight + 4}`;

          return (
            <svg
              key={jumper.id}
              className="absolute"
              style={{
                top: svgTop,
                // Anchor the SVG so its inner edge sits on the connector
                // boundary and the rest extends outward into the canvas.
                [isLeft ? 'right' : 'left']: `100%`,
                width: svgWidth,
                height: svgHeight,
                overflow: 'visible',
                cursor: 'context-menu',
              }}
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              onContextMenu={(event: ReactMouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
                showJumperContextMenu(jumper.id, event.clientX, event.clientY);
              }}
            >
              {/* The connecting arc — blue, matching the PIN handle color.
                  A transparent wide stroke underneath provides a larger
                  hit area for right-click. */}
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                strokeLinecap="round"
              />
              <path
                d={path}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeLinecap="round"
              />
              <title>{`短接 ${side === 'left' ? '左' : '右'}侧: Pin ${sortedPins.join(', ')}`}</title>
            </svg>
          );
        })}

      </div>

      {/* Footer */}
      <div className="px-2 py-1 border-t border-slate-100 text-[10px] text-slate-500">
        {connectedPinCount}/{pinCount} 已连接
        {activeSide && (
          <span className="ml-1 text-slate-400">
            · {activeSide === 'left' ? '左' : '右'}侧
          </span>
        )}
      </div>
    </div>
  );
}

export const ConnectorNode = memo(ConnectorNodeImpl);

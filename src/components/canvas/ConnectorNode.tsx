import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { ConnectorInstance } from '@/types/harness';
import { useHarnessStore } from '@/stores/harnessStore';
import { WIRE_COLORS } from '@/lib/data';
import {
  getActiveConnectorSide,
  getConnectorPinBindings,
  getJumperPinSet,
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
  const jumperPinsLeft = getJumperPinSet(data, 'left');
  const jumperPinsRight = getJumperPinSet(data, 'right');

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

  const nodeHeight = 52 + displayPins * 20 + 24 + 8;

  return (
    <div
      className={`bg-white border-2 rounded-lg shadow-sm transition-all ${
        selected ? 'border-blue-500 shadow-md' : 'border-slate-300'
      }`}
      style={{ width: 200, minHeight: nodeHeight }}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-100">
        <Plug className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-slate-800 truncate">{data.label}</div>
          <div className="text-[10px] text-gray-400 truncate">{data.connector?.name}</div>
        </div>
      </div>

      {/* PIN layout area */}
      <div className="px-1 relative">
        {Array.from({ length: displayPins }, (_, i) => i + 1).map((pinNum) => {
          const leftBindings = pinBindings.get(`left-pin-${pinNum}`) ?? [];
          const rightBindings = pinBindings.get(`right-pin-${pinNum}`) ?? [];
          const allBindings = [...leftBindings, ...rightBindings];
          const isConnected = allBindings.length > 0;
          const isJumperedLeft = jumperPinsLeft.has(pinNum);
          const isJumperedRight = jumperPinsRight.has(pinNum);
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
              {/* Left pin handle — only rendered if left side is active */}
              {showLeft && (
                <Handle
                  id={`left-pin-${pinNum}`}
                  type="target"
                  position={Position.Left}
                  className={`!h-3 !w-3 !border-2 !border-white ${
                    isJumperedLeft ? '!bg-orange-500' : '!bg-blue-500'
                  }`}
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

                {/* Jumper indicator */}
                {(isJumperedLeft || isJumperedRight) && (
                  <span
                    className="text-[8px] text-orange-500 font-bold ml-0.5"
                    title="短接"
                  >
                    ⏚
                  </span>
                )}
              </div>

              {/* Right pin handle — only rendered if right side is active */}
              {showRight && (
                <Handle
                  id={`right-pin-${pinNum}`}
                  type="source"
                  position={Position.Right}
                  className={`!h-3 !w-3 !border-2 !border-white ${
                    isJumperedRight ? '!bg-orange-500' : '!bg-blue-500'
                  }`}
                />
              )}
            </div>
          );
        })}

        {/* Jumper visual overlay: draw brackets between jumpered pins.
            NOTE: this overlay is inside the pin-area div (which sits
            below the header), so top is relative to the first pin row,
            NOT to the node root. Do NOT add header height here. */}
        {data.jumpers.map((jumper) => {
          const side = jumper.side;
          if (jumper.pins.length < 2) return null;
          const visiblePins = jumper.pins.filter((p) => p <= displayPins);
          if (visiblePins.length < 2) return null;
          const minPin = Math.min(...visiblePins);
          const maxPin = Math.max(...visiblePins);
          if (minPin === maxPin) return null;
          const top = (minPin - 1) * 20 + 2;
          const height = (maxPin - minPin) * 20 - 4;
          const isLeft = side === 'left';
          return (
            <div
              key={jumper.id}
              className="absolute pointer-events-none"
              style={{
                top,
                height,
                [isLeft ? 'left' : 'right']: '-2px',
                width: '4px',
                backgroundColor: '#f97316',
                borderRadius: '2px',
              }}
              title={`短接: Pin ${jumper.pins.join(', ')}`}
            />
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

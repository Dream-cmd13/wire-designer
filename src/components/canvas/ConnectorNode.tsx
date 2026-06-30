import { Handle, Position } from '@xyflow/react';
import type { HarnessNode } from '@/types/harness';
import type { Wire } from '@/types/harness';
import { useHarnessStore } from '@/stores/harnessStore';
import { WIRE_COLORS } from '@/lib/data';
import { Plug } from 'lucide-react';

interface ConnectorNodeProps {
  data: HarnessNode;
  selected?: boolean;
}

export function ConnectorNode({ data, selected }: ConnectorNodeProps) {
  const { config } = useHarnessStore();
  const pinCount = data.connector?.pinCount || 2;
  const pinLabels = data.connector?.pinLabels || [];

  // Find all wires connected to this connector
  const connectedWires = config.wires.filter(
    (w) => w.fromConnectorId === data.id || w.toConnectorId === data.id
  );

  // Build a map: pin number -> array of wires (for multi-connection support)
  const wiresByPin = new Map<number, Wire[]>();
  for (const wire of connectedWires) {
    if (wire.fromConnectorId === data.id) {
      const existing = wiresByPin.get(wire.fromPin) || [];
      existing.push(wire);
      wiresByPin.set(wire.fromPin, existing);
    } else if (wire.toConnectorId === data.id) {
      const existing = wiresByPin.get(wire.toPin) || [];
      existing.push(wire);
      wiresByPin.set(wire.toPin, existing);
    }
  }

  const getWireColorHex = (colorId: string) => {
    const color = WIRE_COLORS.find((c) => c.id === colorId);
    return color?.hex || '#6B7280';
  };

  // Determine displayed pins (max 6, then fold)
  const MAX_DISPLAY_PINS = 6;
  const displayPins = Math.min(pinCount, MAX_DISPLAY_PINS);
  const isFolded = pinCount > MAX_DISPLAY_PINS;

  // Count connected pins
  const connectedPinCount = Array.from({ length: pinCount }, (_, i) => i + 1).filter(
    (p) => (wiresByPin.get(p)?.length || 0) > 0
  ).length;

  // Dynamic height: header ~52px + each pin row 20px + footer ~24px + padding
  const nodeHeight = 52 + displayPins * 20 + (isFolded ? 20 : 0) + 24 + 8;

  return (
    <div
      className={`bg-white border-2 rounded-lg shadow-sm transition-all ${
        selected ? 'border-blue-500 shadow-md' : 'border-slate-300'
      }`}
      style={{ width: 200, minHeight: nodeHeight }}
    >
      {/* Legacy outer handles kept for existing edges; row handles are the primary connection points now. */}
      <Handle
        id="left"
        type="target"
        position={Position.Left}
        className="pointer-events-none !h-0 !w-0 !border-0 !bg-transparent !opacity-0"
      />

      {/* Header: connector label + model */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-100">
        <Plug className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-slate-800 truncate">{data.label}</div>
          <div className="text-[10px] text-gray-400 truncate">{data.connector?.name}</div>
        </div>
      </div>

      {/* PIN layout area */}
      <div className="px-1">
        {Array.from({ length: displayPins }, (_, i) => i + 1).map((pinNum) => {
          const pinWires = wiresByPin.get(pinNum) || [];
          const isConnected = pinWires.length > 0;
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
              <Handle
                id={`left-pin-${pinNum}`}
                type="target"
                position={Position.Left}
                className="!h-3 !w-3 !border-2 !border-white !bg-blue-500"
              />

              {/* Left side: PIN number (right-aligned, monospace, blue) */}
              <span className="text-[10px] font-mono text-blue-600 w-5 text-right flex-shrink-0 pr-1 font-semibold">
                {pinNum}
              </span>

              {/* Middle: PIN label (left-aligned) */}
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
                  pinWires.map((wire, idx) => {
                    const colorHex = getWireColorHex(wire.wireColor);
                    return (
                      <div key={`${wire.id}-${idx}`} className="flex items-center gap-0.5">
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

                {/* Multi-connection count badge */}
                {pinWires.length > 1 && (
                  <span className="text-[8px] text-blue-500 font-semibold ml-0.5">
                    x{pinWires.length}
                  </span>
                )}
              </div>

              <Handle
                id={`right-pin-${pinNum}`}
                type="source"
                position={Position.Right}
                className="!h-3 !w-3 !border-2 !border-white !bg-blue-500"
              />
            </div>
          );
        })}

        {/* Fold indicator for >6 pins */}
        {isFolded && (
          <div className="flex items-center justify-center h-5 text-[10px] text-slate-400">
            ...共 {pinCount} PIN
          </div>
        )}
      </div>

      {/* Footer: connection statistics */}
      <div className="px-2 py-1 border-t border-slate-100 text-[10px] text-slate-500">
        {connectedPinCount}/{pinCount} 已连接
      </div>

      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className="pointer-events-none !h-0 !w-0 !border-0 !bg-transparent !opacity-0"
      />
    </div>
  );
}

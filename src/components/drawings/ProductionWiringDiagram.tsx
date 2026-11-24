import React from 'react';
import { getCatalogSnapshot } from '@/lib/catalogRuntime';
import { getWiringConnectorLabels } from '@/lib/connectorDesignation';
import { DRAWING_FONT_FAMILY } from '@/lib/drawingFont';
import type { ProductionDrawingLayout } from '@/lib/productionDrawingLayout';
import {
  calculateWiringDiagramWidth,
  formatPinNetworkString,
  getWiringDiagramColumns,
} from '@/lib/wiringDiagramLayout';
import type { CanvasWireMaterial, ConnectorInstance } from '@/types/harness';

function resolveChineseColorName(value: string): string {
  const byId = getCatalogSnapshot()?.wireColors.find((c) => c.id === value);
  if (byId) return byId.name;
  return value || '灰';
}

export function ProductionWiringDiagram({
  materials,
  connectors,
  layout,
}: {
  materials: CanvasWireMaterial[];
  connectors: ConnectorInstance[];
  layout: ProductionDrawingLayout['wiringDiagram'];
}) {
  const mat = materials[0];
  if (!mat) return null;

  const circuits = mat.circuits || [];
  if (circuits.length === 0) return null;

  const { orderedConnectors } = getWiringConnectorLabels(connectors, materials);
  const numCols = Math.max(2, orderedConnectors.length);

  const rows = circuits.map((c) => {
    let name = resolveChineseColorName(c.color);
    if (name.endsWith('色')) {
      name = name.slice(0, -1);
    }

    const startConnId = c.start?.connectorId;
    const endConnId = c.end?.connectorId;

    const startIdx = startConnId ? orderedConnectors.findIndex((x) => x.id === startConnId) : -1;
    const endIdx = endConnId ? orderedConnectors.findIndex((x) => x.id === endConnId) : -1;

    const pins: string[] = [];
    for (let i = 0; i < numCols; i++) {
      const connInfo = orderedConnectors[i];
      if (!connInfo) {
        pins.push('');
        continue;
      }
      if (startIdx === i && c.start) {
        pins.push(formatPinNetworkString(connInfo.connector, c.start.connectorSide, c.start.pin));
      } else if (endIdx === i && c.end) {
        pins.push(formatPinNetworkString(connInfo.connector, c.end.connectorSide, c.end.pin));
      } else {
        pins.push('');
      }
    }

    let minIdx = -1;
    let maxIdx = -1;
    if (startIdx !== -1 && endIdx !== -1) {
      minIdx = Math.min(startIdx, endIdx);
      maxIdx = Math.max(startIdx, endIdx);
    } else if (startIdx !== -1) {
      minIdx = startIdx;
      maxIdx = Math.min(numCols - 1, startIdx + 1);
    } else if (endIdx !== -1) {
      maxIdx = endIdx;
      minIdx = Math.max(0, endIdx - 1);
    }

    const segments: boolean[] = [];
    for (let k = 0; k < numCols - 1; k++) {
      segments.push(minIdx !== -1 && maxIdx !== -1 && k >= minIdx && k < maxIdx);
    }

    return {
      pins,
      segments,
      color: name,
      isCutStart: !c.start,
      isCutEnd: !c.end,
    };
  });

  const allLeftCut = rows.every((r) => r.isCutStart);
  const allRightCut = rows.every((r) => r.isCutEnd);

  const columns = getWiringDiagramColumns({
    numCols,
    orderedConnectors,
    allLeftCut,
    allRightCut,
  });

  const { diagramWidth } = calculateWiringDiagramWidth({
    numCols,
    allLeftCut,
    allRightCut,
    baseWidth: layout.width,
  });

  const bodyHeight = layout.height - layout.headerHeight;
  const rowHeight = Math.max(22, Math.floor((bodyHeight - 38) / Math.max(1, rows.length)));

  return (
    <div
      className="border border-black bg-white flex flex-col font-serif text-black select-none shadow-sm rounded overflow-hidden"
      style={{
        fontFamily: DRAWING_FONT_FAMILY,
        width: diagramWidth,
        height: layout.height,
        boxSizing: 'border-box',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="shrink-0 border-b border-black flex items-center justify-center font-bold text-xs tracking-[0.25em]"
        style={{ height: layout.headerHeight, backgroundColor: 'rgba(248, 250, 252, 0.5)' }}
      >
        接线图
      </div>

      <div className="flex-1 flex flex-col p-2 relative justify-between overflow-hidden">
        <div className="flex flex-row items-center text-[10px] leading-tight font-bold mb-1">
          <div className="flex-1 flex flex-row items-center">
            {columns.map((col, idx) => (
              <React.Fragment key={idx}>
                <span
                  style={{ width: col.width }}
                  className={`shrink-0 ${col.alignClass} truncate`}
                  title={col.label}
                >
                  {col.label}
                </span>
                {idx < numCols - 1 && <div className="flex-1 min-w-[20px]" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-row items-center">
          {allLeftCut && (
            <div style={{ width: 70 }} className="flex flex-row h-full shrink-0">
              <div
                style={{ width: 35 }}
                className="flex flex-col items-center justify-center text-xs font-bold text-black border-r border-black h-full pr-1 shrink-0"
              >
                <span className="leading-tight">切</span>
                <span className="leading-tight">断</span>
              </div>
              <div style={{ width: 35 }} className="shrink-0" />
            </div>
          )}

          <div className="flex-1 flex flex-col justify-between h-full py-1">
            {rows.map((row, rowIdx) => (
              <div key={rowIdx} className="flex flex-row items-center" style={{ height: rowHeight }}>
                {!allLeftCut && (
                  <span
                    style={{ width: 70 }}
                    className="shrink-0 text-xs font-bold text-black text-center whitespace-nowrap"
                  >
                    {row.pins[0] || ''}
                  </span>
                )}

                {Array.from({ length: numCols - 1 }).map((_, segIdx) => {
                  const targetColIdx = segIdx + 1;
                  const isLastCol = targetColIdx === numCols - 1;
                  const showPin = !(isLastCol && allRightCut);
                  const targetCol = columns[targetColIdx];

                  return (
                    <React.Fragment key={segIdx}>
                      <div className="flex-1 flex flex-col justify-end h-full relative pb-1 min-w-[20px] px-0">
                        {row.segments[segIdx] ? (
                          <>
                            <span className="text-center text-[11px] font-bold text-black mb-0.5 whitespace-nowrap">
                              {row.color}
                            </span>
                            <div className="w-full border-b border-black" />
                          </>
                        ) : (
                          <div className="w-full h-[1px]" />
                        )}
                      </div>

                      {showPin && (
                        <span
                          style={{ width: targetCol?.width ?? 70 }}
                          className={`shrink-0 text-xs font-bold text-black ${targetCol?.alignClass ?? 'text-center px-1'} whitespace-nowrap`}
                        >
                          {row.pins[targetColIdx] || ''}
                        </span>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            ))}
          </div>

          {allRightCut && (
            <div style={{ width: 70 }} className="flex flex-row h-full shrink-0">
              <div style={{ width: 35 }} className="shrink-0" />
              <div
                style={{ width: 35 }}
                className="flex flex-col items-center justify-center text-xs font-bold text-black border-l border-black h-full pl-1 shrink-0"
              >
                <span className="leading-tight">切</span>
                <span className="leading-tight">断</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

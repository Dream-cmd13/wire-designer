import { getJumperNetwork } from '@/lib/commands';
import type { ConnectorInstance, ConnectorSide } from '@/types/harness';

export function formatPinNetworkString(connector: ConnectorInstance, side: ConnectorSide, pin: number): string {
  const network = getJumperNetwork(connector.jumpers, side, pin);
  const sorted = Array.from(network).sort((a, b) => a - b);
  return sorted.map((p) => `Pin${p}`).join(', ');
}

export interface WiringDiagramColumnInfo {
  index: number;
  width: number;
  label: string;
  isCut: boolean;
  alignClass: string;
}

export function getWiringDiagramColumns({
  numCols,
  orderedConnectors,
  allLeftCut,
  allRightCut,
}: {
  numCols: number;
  orderedConnectors: Array<{ label: string }>;
  allLeftCut: boolean;
  allRightCut: boolean;
}): WiringDiagramColumnInfo[] {
  const PIN_COL_WIDTH = 70;

  return Array.from({ length: numCols }).map((_, idx) => {
    const conn = orderedConnectors[idx];
    const isCut = (idx === 0 && allLeftCut) || (idx === numCols - 1 && allRightCut);
    const label = isCut ? '' : (conn ? conn.label : (idx === 0 ? 'P1' : ''));

    return {
      index: idx,
      width: PIN_COL_WIDTH,
      label,
      isCut,
      alignClass: 'text-center',
    };
  });
}

export function calculateWiringDiagramWidth({
  numCols,
  baseWidth = 280,
}: {
  numCols: number;
  allLeftCut?: boolean;
  allRightCut?: boolean;
  baseWidth?: number;
}): {
  requiredContentWidth: number;
  diagramWidth: number;
} {
  const PIN_COL_WIDTH = 70;
  const MIN_SEGMENT_WIDTH = 110;
  const PADDING_H = 20;

  const requiredContentWidth =
    numCols * PIN_COL_WIDTH +
    (numCols - 1) * MIN_SEGMENT_WIDTH +
    PADDING_H;

  return {
    requiredContentWidth,
    diagramWidth: Math.max(baseWidth, requiredContentWidth),
  };
}

export function getCutLineBounds({
  rowsCount,
  rowHeight,
  bodyHeight,
}: {
  rowsCount: number;
  rowHeight: number;
  bodyHeight: number;
}): { top: number; height: number } {
  if (rowsCount <= 1) {
    const wireY = rowHeight;
    const height = Math.min(38, Math.max(30, rowHeight));
    const top = Math.max(4, wireY - Math.floor(height / 2));
    return { top, height };
  }
  const topWireY = rowHeight;
  const contentHeight = Math.max(rowHeight * rowsCount, bodyHeight - 34);
  const bottomWireY = contentHeight - 8;
  const top = Math.max(4, topWireY - 12);
  const bottom = Math.min(contentHeight - 4, bottomWireY + 12);
  const height = Math.max(36, bottom - top);
  return { top, height };
}

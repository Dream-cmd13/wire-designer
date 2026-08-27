import { describe, expect, it } from 'vitest';
import { getProductDrawingFilename } from '@/lib/productImageExport';
import {
  calculateWiringDiagramWidth,
  formatPinNetworkString,
  getCutLineBounds,
  getWiringDiagramColumns,
} from '@/components/drawings/TwoDView';
import type { ConnectorInstance, HarnessConfig, ProductionDrawingFrame } from '@/types/harness';

describe('productImageExport', () => {
  const dummyConfig = {
    name: '测试项目1',
    connectors: [],
    materials: [],
    models: [],
    protectiveSleeves: [],
  } as unknown as HarnessConfig;

  const dummyFrame = {
    drawingNo: 'WH-2026-001',
    title: '线束成品图纸',
    revision: 'A.0',
  } as unknown as ProductionDrawingFrame;

  it('generates filename using drawingNo when present', () => {
    expect(getProductDrawingFilename(dummyConfig, dummyFrame, 'png')).toBe('WH-2026-001_成品图.png');
    expect(getProductDrawingFilename(dummyConfig, dummyFrame, 'pdf')).toBe('WH-2026-001_成品图.pdf');
  });

  it('falls back to projectName when drawingNo is empty', () => {
    const emptyDrawingNoFrame = {
      ...dummyFrame,
      drawingNo: '',
    };
    expect(getProductDrawingFilename(dummyConfig, emptyDrawingNoFrame, 'png')).toBe('测试项目1_成品图.png');
  });

  it('falls back to default name when both drawingNo and projectName are empty', () => {
    const emptyConfig = { ...dummyConfig, name: '' };
    const emptyFrame = {
      ...dummyFrame,
      drawingNo: '',
    };
    expect(getProductDrawingFilename(emptyConfig, emptyFrame, 'png')).toBe('线束成品图_成品图.png');
  });
});

describe('formatPinNetworkString in WiringDiagram', () => {
  const connector: ConnectorInstance = {
    id: 'conn-1',
    label: 'P1',
    connector: {
      id: 'c-type-1',
      name: 'M12-4P',
      pinCount: 4,
    } as any,
    position: { x: 0, y: 0 },
    jumpers: [
      { id: 'j-1', side: 'left', pins: [2, 3] },
    ],
  };

  it('formats single pin with Pin prefix', () => {
    expect(formatPinNetworkString(connector, 'left', 1)).toBe('Pin1');
    expect(formatPinNetworkString(connector, 'left', 4)).toBe('Pin4');
  });

  it('formats shorted pins with Pin prefix and comma separation', () => {
    expect(formatPinNetworkString(connector, 'left', 2)).toBe('Pin2, Pin3');
    expect(formatPinNetworkString(connector, 'left', 3)).toBe('Pin2, Pin3');
  });

  it('formats unshorted side single pin correctly', () => {
    expect(formatPinNetworkString(connector, 'right', 2)).toBe('Pin2');
  });
});

describe('getWiringDiagramColumns & calculateWiringDiagramWidth', () => {
  it('returns standard pin column widths for normal 2-connector harness', () => {
    const cols = getWiringDiagramColumns({
      numCols: 2,
      orderedConnectors: [{ label: 'P1' }, { label: 'P2' }],
      allLeftCut: false,
      allRightCut: false,
    });

    expect(cols).toHaveLength(2);
    expect(cols[0]).toEqual({
      index: 0,
      width: 70,
      label: 'P1',
      isCut: false,
      alignClass: 'text-center',
    });
    expect(cols[1]).toEqual({
      index: 1,
      width: 70,
      label: 'P2',
      isCut: false,
      alignClass: 'text-center',
    });
  });

  it('keeps identical symmetric column widths when right end is cut, with empty label for cut column', () => {
    const cols = getWiringDiagramColumns({
      numCols: 2,
      orderedConnectors: [{ label: 'P1' }],
      allLeftCut: false,
      allRightCut: true,
    });

    expect(cols).toHaveLength(2);
    expect(cols[0].width).toBe(70);
    expect(cols[0].label).toBe('P1');
    expect(cols[0].isCut).toBe(false);
    expect(cols[0].alignClass).toBe('text-center');

    // Cut column has the exact same 70px width and centered alignment, but no fake P2 label
    expect(cols[1].width).toBe(70);
    expect(cols[1].label).toBe('');
    expect(cols[1].isCut).toBe(true);
    expect(cols[1].alignClass).toBe('text-center');
  });

  it('keeps identical symmetric column widths when left end is cut, with empty label for cut column', () => {
    const cols = getWiringDiagramColumns({
      numCols: 2,
      orderedConnectors: [{ label: 'P1' }, { label: 'P2' }],
      allLeftCut: true,
      allRightCut: false,
    });

    expect(cols[0].width).toBe(70);
    expect(cols[0].label).toBe('');
    expect(cols[0].isCut).toBe(true);
    expect(cols[0].alignClass).toBe('text-center');

    expect(cols[1].width).toBe(70);
    expect(cols[1].label).toBe('P2');
    expect(cols[1].isCut).toBe(false);
    expect(cols[1].alignClass).toBe('text-center');
  });

  it('supports right cut in 3-connector harness with empty label for cut column', () => {
    const cols = getWiringDiagramColumns({
      numCols: 3,
      orderedConnectors: [{ label: 'P1' }, { label: 'P2' }, { label: 'P3' }],
      allLeftCut: false,
      allRightCut: true,
    });

    expect(cols).toHaveLength(3);
    expect(cols[0].width).toBe(70);
    expect(cols[1].width).toBe(70);
    expect(cols[2].width).toBe(70);
    expect(cols[2].label).toBe('');
    expect(cols[2].isCut).toBe(true);
    expect(cols[2].alignClass).toBe('text-center');
  });

  it('calculates content and diagram widths accurately', () => {
    // 2 cols: 70 + 70 + 110 + 20 = 270, diagramWidth clamped to baseWidth 280
    const twoCols = calculateWiringDiagramWidth({
      numCols: 2,
      allLeftCut: false,
      allRightCut: true,
      baseWidth: 280,
    });
    expect(twoCols.requiredContentWidth).toBe(270);
    expect(twoCols.diagramWidth).toBe(280);

    // 3 cols: 70 * 3 + 2 * 110 + 20 = 450
    const threeCols = calculateWiringDiagramWidth({
      numCols: 3,
      allLeftCut: false,
      allRightCut: true,
      baseWidth: 280,
    });
    expect(threeCols.requiredContentWidth).toBe(450);
    expect(threeCols.diagramWidth).toBe(450);
  });

  it('calculates bounded cut line height centered around wires without piercing bottom', () => {
    // Single row: wire is at y = rowHeight = 56. Cut line is centered with height 38, top = 37
    const singleRowBounds = getCutLineBounds({
      rowsCount: 1,
      rowHeight: 56,
      bodyHeight: 94,
    });
    expect(singleRowBounds.height).toBe(38);
    expect(singleRowBounds.top).toBe(37);

    // Multiple rows (e.g. 3 rows): spans between top wire and bottom wire
    const multiRowBounds = getCutLineBounds({
      rowsCount: 3,
      rowHeight: 22,
      bodyHeight: 94,
    });
    expect(multiRowBounds.top).toBe(10);
    expect(multiRowBounds.height).toBeGreaterThanOrEqual(36);
  });
});

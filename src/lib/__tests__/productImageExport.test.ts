import { describe, expect, it } from 'vitest';
import { getProductDrawingFilename } from '@/lib/productImageExport';
import { formatPinNetworkString } from '@/components/drawings/TwoDView';
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

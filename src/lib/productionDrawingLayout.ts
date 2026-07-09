import { generateBOM } from '@/lib/bom';
import type { HarnessConfig } from '@/types/harness';

const FRAME_WIDTH = 1200;
const FRAME_HEIGHT = 800;
const BOM_BOTTOM = 133.33;
const BOM_RIGHT = 32;
const BOM_WIDTH = 570;
const BOM_ROW_HEIGHT = 30;
const BOM_HEADER_HEIGHT = 34;
const ASSEMBLY_TOP = 76;
const ASSEMBLY_PADDING_Y = 8;
const ASSEMBLY_GAP = 12;
const WIRING_WIDTH = 400;
const WIRING_HEIGHT = 180;
const WIRING_HEADER_HEIGHT = 30;
const SAFE_GAP = 20;
const MAX_IMAGE_HEIGHT = 360;
const MIN_IMAGE_HEIGHT = 48;

export interface ProductionDrawingLayout {
  frame: { width: number; height: number };
  safeGap: number;
  bom: {
    bottom: number;
    right: number;
    width: number;
    rowHeight: number;
    headerHeight: number;
    height: number;
  };
  bomRect: { left: number; top: number; right: number; bottom: number };
  assemblyTop: number;
  assemblyGap: number;
  maxImageHeight: number;
  wiringDiagram: {
    width: number;
    height: number;
    headerHeight: number;
  };
  assemblyBottom: number;
}

export function countProductionBomRows(config: HarnessConfig): number {
  const bomItems = generateBOM(config);
  const modelSpecIds = new Set(config.models.map((model) => model.overmoldSpecId ?? 'default'));

  return (
    bomItems.filter((item) => item.type === 'wire').length +
    bomItems.filter((item) => item.type === 'connector').length +
    bomItems.filter((item) => item.type === 'accessory').length +
    modelSpecIds.size
  );
}

export function calculateProductionDrawingLayout({
  bomRowCount,
  hasWiringDiagram,
}: {
  bomRowCount: number;
  hasWiringDiagram: boolean;
}): ProductionDrawingLayout {
  const rowCount = Math.max(0, bomRowCount);
  const bomHeight = BOM_HEADER_HEIGHT + rowCount * BOM_ROW_HEIGHT;
  const bomBottom = FRAME_HEIGHT - BOM_BOTTOM;
  const bomTop = bomBottom - bomHeight;
  const wiringHeight = hasWiringDiagram ? WIRING_HEIGHT : 0;
  const wiringGap = hasWiringDiagram ? ASSEMBLY_GAP : 0;
  const availableImageHeight =
    bomTop - SAFE_GAP - ASSEMBLY_TOP - ASSEMBLY_PADDING_Y - wiringGap - wiringHeight;
  const maxImageHeight = Math.max(
    MIN_IMAGE_HEIGHT,
    Math.min(MAX_IMAGE_HEIGHT, Math.floor(availableImageHeight)),
  );
  const assemblyBottom =
    ASSEMBLY_TOP + ASSEMBLY_PADDING_Y + maxImageHeight + wiringGap + wiringHeight;

  return {
    frame: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
    safeGap: SAFE_GAP,
    bom: {
      bottom: BOM_BOTTOM,
      right: BOM_RIGHT,
      width: BOM_WIDTH,
      rowHeight: BOM_ROW_HEIGHT,
      headerHeight: BOM_HEADER_HEIGHT,
      height: bomHeight,
    },
    bomRect: {
      left: FRAME_WIDTH - BOM_RIGHT - BOM_WIDTH,
      top: bomTop,
      right: FRAME_WIDTH - BOM_RIGHT,
      bottom: bomBottom,
    },
    assemblyTop: ASSEMBLY_TOP,
    assemblyGap: ASSEMBLY_GAP,
    maxImageHeight,
    wiringDiagram: {
      width: WIRING_WIDTH,
      height: hasWiringDiagram ? WIRING_HEIGHT : 0,
      headerHeight: WIRING_HEADER_HEIGHT,
    },
    assemblyBottom,
  };
}

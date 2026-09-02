import { buildProductionBomRows } from '@/lib/productionBomRows';
import type { HarnessConfig, OvermoldSpec } from '@/types/harness';

const FRAME_WIDTH = 1200;
const FRAME_HEIGHT = 800;
const BOM_BOTTOM = 133.33;
const BOM_RIGHT = 24;
const BOM_WIDTH = 640;
const BOM_ROW_HEIGHT = 40;
const BOM_HEADER_HEIGHT = 34;
const ASSEMBLY_TOP = 76;
const ASSEMBLY_PADDING_Y = 8;
const ASSEMBLY_GAP = 12;
const CALLOUT_BAND_HEIGHT = 44;
const CALLOUT_GAP = 10;
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
  calloutBand: {
    height: number;
    gap: number;
  };
  maxImageHeight: number;
  wiringDiagram: {
    width: number;
    height: number;
    headerHeight: number;
  };
  assemblyBottom: number;
}

export function countProductionBomRows(
  config: HarnessConfig,
  overmolds: readonly OvermoldSpec[],
): number {
  return buildProductionBomRows(config, overmolds).length;
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

  const fixedTopHeight = ASSEMBLY_TOP + ASSEMBLY_PADDING_Y;
  const availableAssemblyHeight = bomTop - SAFE_GAP - fixedTopHeight;

  let effectiveWiringHeight = hasWiringDiagram ? WIRING_HEIGHT : 0;
  const effectiveWiringGap = hasWiringDiagram ? ASSEMBLY_GAP : 0;
  const effectiveCalloutHeight = CALLOUT_BAND_HEIGHT;
  const effectiveCalloutGap = CALLOUT_GAP;

  let fixedExtras = effectiveCalloutGap + effectiveCalloutHeight + effectiveWiringGap + effectiveWiringHeight;

  if (availableAssemblyHeight - fixedExtras < MIN_IMAGE_HEIGHT && hasWiringDiagram) {
    // Compress wiring diagram height if needed to preserve image and callout space
    const compressible = WIRING_HEIGHT - 120;
    const needed = MIN_IMAGE_HEIGHT - (availableAssemblyHeight - fixedExtras);
    const reduction = Math.min(compressible, Math.max(0, needed));
    effectiveWiringHeight = WIRING_HEIGHT - reduction;
    fixedExtras = effectiveCalloutGap + effectiveCalloutHeight + effectiveWiringGap + effectiveWiringHeight;
  }

  const availableImageHeight = Math.max(16, availableAssemblyHeight - fixedExtras);
  const maxImageHeight = Math.max(
    16,
    Math.min(MAX_IMAGE_HEIGHT, Math.floor(availableImageHeight)),
  );
  const assemblyBottom = Math.min(
    bomTop - SAFE_GAP,
    fixedTopHeight + maxImageHeight + fixedExtras,
  );

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
    calloutBand: {
      height: effectiveCalloutHeight,
      gap: effectiveCalloutGap,
    },
    maxImageHeight,
    wiringDiagram: {
      width: WIRING_WIDTH,
      height: effectiveWiringHeight,
      headerHeight: WIRING_HEADER_HEIGHT,
    },
    assemblyBottom,
  };
}

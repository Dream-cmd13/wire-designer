import type { ProductionBomRow } from '@/lib/productionBomRows';

export interface TargetBox {
  groupIdx: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface GroupCalloutItem {
  row: ProductionBomRow;
  preferredX: number;
  targetBoxes: TargetBox[];
  subKey: string;
}

export const BALLOON_RADIUS = 11;
export const MIN_BALLOON_SPACING = 28;

/**
 * Calculates elbow point (ex, by) such that the turn angle from horizontal
 * shelf to diagonal leader is strictly OBTUSE (> 90°), matching standard CAD callout style.
 */
export function calculateElbowPoint(
  bx: number,
  by: number,
  tx: number,
  ty: number,
  radius: number = BALLOON_RADIUS,
): { ex: number; balloonEdgeX: number } {
  const dy = Math.max(20, by - ty);
  const slantOffset = Math.max(18, Math.min(36, dy * 0.45));

  if (bx >= tx) {
    // Balloon is to the right of the target (bx >= tx).
    // Horizontal shelf goes from balloonEdgeX (bx - radius) LEFTWARDS to (ex, by).
    // Diagonal leader goes from (ex, by) LEFT-UPWARDS to (tx, ty).
    // Turns with strictly OBTUSE angle (> 90°): ex > tx and ex < bx - radius.
    const maxEx = bx - radius - 2;
    const targetEx = tx + slantOffset;
    const ex = Math.min(maxEx, Math.max(tx + 10, targetEx));
    const balloonEdgeX = bx - radius;
    return { ex, balloonEdgeX };
  } else {
    // Balloon is to the left of the target (bx < tx).
    // Horizontal shelf goes from balloonEdgeX (bx + radius) RIGHTWARDS to (ex, by).
    // Diagonal leader goes from (ex, by) RIGHT-UPWARDS to (tx, ty).
    // Turns with strictly OBTUSE angle (> 90°): ex < tx and ex > bx + radius.
    const minEx = bx + radius + 2;
    const targetEx = tx - slantOffset;
    const ex = Math.max(minEx, Math.min(tx - 10, targetEx));
    const balloonEdgeX = bx + radius;
    return { ex, balloonEdgeX };
  }
}

/**
 * Partitions target boxes of a BOM row into callout items.
 * When multiple identical connectors exist (e.g. at P1 and P2), each instance gets
 * an independent balloon with short, local leader lines, sharing the same BOM itemNo,
 * avoiding long cross-diagram leader lines.
 */
export function partitionTargetsIntoCalloutItems(
  row: ProductionBomRow,
  targetBoxes: TargetBox[],
): GroupCalloutItem[] {
  if (targetBoxes.length === 0) return [];

  // Sort target boxes from left to right
  const sortedBoxes = [...targetBoxes].sort((a, b) => a.centerX - b.centerX);

  if (row.kind === 'connector') {
    return sortedBoxes.map((box, bIdx) => ({
      row,
      preferredX: box.centerX < 400 ? box.centerX - 45 : box.centerX + 45,
      targetBoxes: [box],
      subKey: `t${bIdx}`,
    }));
  }

  if ((row.kind === 'outer-mold' || row.kind === 'inner-mold') && sortedBoxes.length > 1) {
    const isSpread = sortedBoxes.some((b, i) =>
      sortedBoxes.some((b2, j) => i !== j && Math.abs(b.centerX - b2.centerX) > 100),
    );

    if (isSpread) {
      return sortedBoxes.map((box, bIdx) => {
        const isLeft = box.centerX < 400;
        const offset = row.kind === 'outer-mold' ? (isLeft ? -30 : 40) : (isLeft ? -30 : 68);
        return {
          row,
          preferredX: box.centerX + offset,
          targetBoxes: [box],
          subKey: `t${bIdx}`,
        };
      });
    }
  }

  // Wires, accessories, or clustered items: single balloon pointing to target(s)
  const avgCenterX = sortedBoxes.reduce((sum, b) => sum + b.centerX, 0) / sortedBoxes.length;
  let preferredX = avgCenterX;

  if (row.kind === 'outer-mold') {
    preferredX = avgCenterX + 40;
  } else if (row.kind === 'inner-mold') {
    preferredX = avgCenterX + 68;
  } else if (row.kind === 'wire') {
    preferredX = avgCenterX + 60;
  } else if (row.kind === 'accessory') {
    preferredX = avgCenterX + 35;
  }

  return [
    {
      row,
      preferredX,
      targetBoxes: sortedBoxes,
      subKey: 't0',
    },
  ];
}

import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { ProductionBomRow } from '@/lib/productionBomRows';
import type { ProductionDrawingLayout } from '@/lib/productionDrawingLayout';

export interface ItemCalloutLayerProps {
  bomRows: ProductionBomRow[];
  worldRef: React.RefObject<HTMLDivElement | null>;
  highlightedRowKey?: string | null;
  onHoverRowKey?: (key: string | null) => void;
  onClickRowKey?: (key: string | null) => void;
  visible?: boolean;
  zoom: number;
  productionLayout: ProductionDrawingLayout;
  recalculateToken?: string | number;
}

interface TargetBox {
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

interface CalloutItem {
  key: string;
  row: ProductionBomRow;
  balloonX: number;
  balloonY: number;
  lines: Array<{
    points: string;
  }>;
}

const BALLOON_RADIUS = 11;
const MIN_BALLOON_SPACING = 28;

/**
 * Calculates elbow point (ex, by) such that the turn angle from horizontal
 * shelf to diagonal leader is strictly OBTUSE (> 90°), matching standard CAD callout style.
 */
function calculateElbowPoint(
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

export function ItemCalloutLayer({
  bomRows,
  worldRef,
  highlightedRowKey,
  onHoverRowKey,
  onClickRowKey,
  visible = true,
  zoom,
  productionLayout,
  recalculateToken,
}: ItemCalloutLayerProps) {
  const [callouts, setCallouts] = useState<CalloutItem[]>([]);
  const rafRef = useRef<number | null>(null);

  const calculateCallouts = useCallback(() => {
    const worldEl = worldRef.current;
    if (!worldEl) {
      setCallouts([]);
      return;
    }

    const worldRect = worldEl.getBoundingClientRect();
    const currentZoom = zoom || 1;

    // Measure each group container's lowest image bottom
    const groupContainers = worldEl.querySelectorAll<HTMLElement>('[data-callout-group]');
    const groupBottoms = new Map<number, number>();

    groupContainers.forEach((gEl) => {
      const gIdx = parseInt(gEl.getAttribute('data-callout-group') || '0', 10);
      let lowestImgBottom = 160;

      const imgCards = gEl.querySelectorAll<HTMLElement>('[data-callout-kind]');
      imgCards.forEach((cEl) => {
        const cRect = cEl.getBoundingClientRect();
        if (cRect.width > 0 && cRect.height > 0) {
          const b = (cRect.bottom - worldRect.top) / currentZoom;
          if (b > lowestImgBottom) lowestImgBottom = b;
        }
      });

      groupBottoms.set(gIdx, lowestImgBottom);
    });

    // Find all target boxes by kind and id, partitioned by groupIdx
    const itemsByGroup = new Map<
      number,
      Array<{
        row: ProductionBomRow;
        preferredX: number;
        targetBoxes: TargetBox[];
      }>
    >();

    for (const row of bomRows) {
      // Group targets of this row by groupIdx
      const targetsByGroup = new Map<number, TargetBox[]>();

      for (const target of row.targets) {
        const selector = `[data-callout-kind="${target.kind}"][data-callout-id="${target.id}"]`;
        const elements = worldEl.querySelectorAll<HTMLElement>(selector);

        elements.forEach((el) => {
          // If kind is connector, ignore pin-map images if main connector exists
          const role = el.getAttribute('data-callout-role');
          if (target.kind === 'connector' && role === 'connector-pin-map' && elements.length > 1) {
            return;
          }

          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;

          const groupEl = el.closest('[data-callout-group]');
          const groupIdx = groupEl ? parseInt(groupEl.getAttribute('data-callout-group') || '0', 10) : 0;

          const box: TargetBox = {
            groupIdx,
            left: (rect.left - worldRect.left) / currentZoom,
            top: (rect.top - worldRect.top) / currentZoom,
            right: (rect.right - worldRect.left) / currentZoom,
            bottom: (rect.bottom - worldRect.top) / currentZoom,
            width: rect.width / currentZoom,
            height: rect.height / currentZoom,
            centerX: (rect.left - worldRect.left + rect.width / 2) / currentZoom,
            centerY: (rect.top - worldRect.top + rect.height / 2) / currentZoom,
          };

          if (!targetsByGroup.has(groupIdx)) {
            targetsByGroup.set(groupIdx, []);
          }
          targetsByGroup.get(groupIdx)!.push(box);
        });
      }

      // For each group where this row has targets, add an entry to itemsByGroup
      targetsByGroup.forEach((targetBoxes, groupIdx) => {
        if (targetBoxes.length === 0) return;

        const avgCenterX = targetBoxes.reduce((sum, b) => sum + b.centerX, 0) / targetBoxes.length;
        let preferredX = avgCenterX;

        if (row.kind === 'connector') {
          preferredX = avgCenterX < 400 ? avgCenterX - 45 : avgCenterX + 45;
        } else if (row.kind === 'outer-mold') {
          preferredX = avgCenterX + 40;
        } else if (row.kind === 'inner-mold') {
          preferredX = avgCenterX + 68;
        } else if (row.kind === 'wire') {
          preferredX = avgCenterX + 60;
        } else if (row.kind === 'accessory') {
          preferredX = avgCenterX + 35;
        }

        if (!itemsByGroup.has(groupIdx)) {
          itemsByGroup.set(groupIdx, []);
        }
        itemsByGroup.get(groupIdx)!.push({
          row,
          preferredX,
          targetBoxes,
        });
      });
    }

    if (itemsByGroup.size === 0) {
      setCallouts([]);
      return;
    }

    const allPlaced: Array<{
      key: string;
      row: ProductionBomRow;
      x: number;
      y: number;
      targetBoxes: TargetBox[];
    }> = [];

    itemsByGroup.forEach((groupItems, gIdx) => {
      const gBottom = groupBottoms.get(gIdx) ?? 160;
      const bandY = Math.min(
        productionLayout.bomRect.top - productionLayout.safeGap - 10,
        gBottom + 22,
      );

      groupItems.sort((a, b) => a.preferredX - b.preferredX);

      const placed = groupItems.map((item) => ({
        key: `${item.row.key}-g${gIdx}`,
        row: item.row,
        x: Math.max(50, Math.min(1150, item.preferredX)),
        y: bandY,
        targetBoxes: item.targetBoxes,
      }));

      // Horizontal overlap resolution for this group
      for (let i = 1; i < placed.length; i++) {
        const prev = placed[i - 1];
        const curr = placed[i];
        if (curr.x < prev.x + MIN_BALLOON_SPACING) {
          curr.x = prev.x + MIN_BALLOON_SPACING;
        }
      }

      const maxAllowedX = 1150;
      if (placed.length > 0 && placed[placed.length - 1].x > maxAllowedX) {
        placed[placed.length - 1].x = maxAllowedX;
        for (let i = placed.length - 2; i >= 0; i--) {
          const next = placed[i + 1];
          const curr = placed[i];
          if (curr.x > next.x - MIN_BALLOON_SPACING) {
            curr.x = next.x - MIN_BALLOON_SPACING;
          }
        }
      }

      allPlaced.push(...placed);
    });

    // Build dogleg / elbow leader lines with strictly obtuse angles (> 90°)
    const result: CalloutItem[] = allPlaced.map((item) => {
      const bx = item.x;
      const by = item.y;

      const lines = item.targetBoxes.map((box) => {
        const tx = box.centerX;
        const ty = box.top + box.height * 0.45;

        const { ex, balloonEdgeX } = calculateElbowPoint(bx, by, tx, ty, BALLOON_RADIUS);
        return {
          points: `${balloonEdgeX},${by} ${ex},${by} ${tx},${ty}`,
        };
      });

      return {
        key: item.key,
        row: item.row,
        balloonX: bx,
        balloonY: by,
        lines,
      };
    });

    setCallouts(result);
  }, [bomRows, worldRef, zoom, productionLayout]);

  // Use scheduled animation frame to avoid synchronous setState inside effect
  useEffect(() => {
    const scheduleUpdate = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        calculateCallouts();
      });
    };

    scheduleUpdate();

    const worldEl = worldRef.current;
    if (!worldEl) return;

    const observer = new ResizeObserver(() => {
      scheduleUpdate();
    });

    observer.observe(worldEl);
    const nodes = worldEl.querySelectorAll('[data-callout-kind], [data-callout-group]');
    nodes.forEach((n) => observer.observe(n));

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
  }, [calculateCallouts, worldRef, recalculateToken]);

  if (!visible || callouts.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-10 overflow-visible"
      viewBox="0 0 1200 800"
      width={1200}
      height={800}
      style={{
        width: 1200,
        height: 800,
      }}
    >
      <defs>
        <marker
          id="item-callout-arrow"
          viewBox="0 0 8 8"
          refX="6"
          refY="4"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 1.5 L 6 4 L 0 6.5 z" fill="#000000" />
        </marker>
        <marker
          id="item-callout-arrow-highlight"
          viewBox="0 0 8 8"
          refX="6"
          refY="4"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 1.5 L 6 4 L 0 6.5 z" fill="#2563eb" />
        </marker>
      </defs>

      {/* Render Dogleg / Elbow Leader Lines */}
      {callouts.map((item) => {
        const isHighlighted = highlightedRowKey === item.row.key;
        const strokeColor = isHighlighted ? '#2563eb' : '#000000';
        const strokeWidth = isHighlighted ? 1.6 : 1.0;
        const markerEnd = isHighlighted
          ? 'url(#item-callout-arrow-highlight)'
          : 'url(#item-callout-arrow)';

        return (
          <g key={`lines-${item.key}`}>
            {item.lines.map((line, idx) => (
              <polyline
                key={`line-${item.key}-${idx}`}
                points={line.points}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                markerEnd={markerEnd}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>
        );
      })}

      {/* Render Circular Balloons */}
      {callouts.map((item) => {
        const isHighlighted = highlightedRowKey === item.row.key;
        const strokeColor = isHighlighted ? '#2563eb' : '#000000';
        const fillColor = isHighlighted ? '#eff6ff' : '#ffffff';
        const textColor = isHighlighted ? '#1d4ed8' : '#000000';
        const strokeWidth = isHighlighted ? 2.0 : 1.2;

        return (
          <g
            key={`balloon-${item.key}`}
            className="cursor-pointer select-none transition-transform"
            style={{ pointerEvents: 'auto' }}
            onMouseEnter={() => onHoverRowKey?.(item.row.key)}
            onMouseLeave={() => onHoverRowKey?.(null)}
            onClick={(e) => {
              e.stopPropagation();
              onClickRowKey?.(isHighlighted ? null : item.row.key);
            }}
          >
            <title>{`${item.row.itemNo}: ${item.row.name} (${item.row.specification})`}</title>
            {/* White circle with border */}
            <circle
              cx={item.balloonX}
              cy={item.balloonY}
              r={BALLOON_RADIUS}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              className="transition-colors"
            />
            {/* Centered Item Number (1, 2, 3...) */}
            <text
              x={item.balloonX}
              y={item.balloonY}
              fill={textColor}
              fontSize="11"
              fontWeight="bold"
              fontFamily='SimSun, STSong, "Songti SC", serif'
              textAnchor="middle"
              dominantBaseline="central"
            >
              {item.row.itemNo}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

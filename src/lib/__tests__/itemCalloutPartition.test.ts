import { describe, expect, it } from 'vitest';
import {
  partitionTargetsIntoCalloutItems,
  calculateElbowPoint,
  BALLOON_RADIUS,
  type TargetBox,
} from '@/components/drawings/ItemCalloutLayer';
import type { ProductionBomRow } from '@/lib/productionBomRows';

describe('partitionTargetsIntoCalloutItems', () => {
  const dummyConnectorRow: ProductionBomRow = {
    key: 'conn|c-usb',
    itemNo: 2,
    kind: 'connector',
    name: '连接器',
    specification: 'Type-C 公头',
    unit: 'PCS',
    quantity: 2,
    targets: [
      { kind: 'connector', id: 'conn-1' },
      { kind: 'connector', id: 'conn-2' },
    ],
  };

  const p1Box: TargetBox = {
    groupIdx: 0,
    left: 100,
    top: 100,
    right: 140,
    bottom: 140,
    width: 40,
    height: 40,
    centerX: 120,
    centerY: 120,
  };

  const p2Box: TargetBox = {
    groupIdx: 0,
    left: 800,
    top: 100,
    right: 840,
    bottom: 140,
    width: 40,
    height: 40,
    centerX: 820,
    centerY: 120,
  };

  it('partitions two identical connectors into two independent callouts with identical itemNo', () => {
    const items = partitionTargetsIntoCalloutItems(dummyConnectorRow, [p1Box, p2Box]);

    expect(items).toHaveLength(2);

    // Both callout items share the same BOM itemNo and row
    expect(items[0].row.itemNo).toBe(2);
    expect(items[1].row.itemNo).toBe(2);
    expect(items[0].row.key).toBe(dummyConnectorRow.key);
    expect(items[1].row.key).toBe(dummyConnectorRow.key);

    // SubKeys are distinct
    expect(items[0].subKey).toBe('t0');
    expect(items[1].subKey).toBe('t1');

    // First callout points only to P1 locally (preferredX < p1Box.centerX)
    expect(items[0].targetBoxes).toEqual([p1Box]);
    expect(items[0].preferredX).toBe(120 - 45);

    // Second callout points only to P2 locally (preferredX > p2Box.centerX)
    expect(items[1].targetBoxes).toEqual([p2Box]);
    expect(items[1].preferredX).toBe(820 + 45);
  });

  it('keeps single connector as one callout', () => {
    const items = partitionTargetsIntoCalloutItems(dummyConnectorRow, [p1Box]);
    expect(items).toHaveLength(1);
    expect(items[0].targetBoxes).toEqual([p1Box]);
    expect(items[0].preferredX).toBe(120 - 45);
  });

  it('keeps multiple bundled wires in a single callout', () => {
    const wireRow: ProductionBomRow = {
      key: 'wire|ul1007',
      itemNo: 1,
      kind: 'wire',
      name: '线材',
      specification: 'UL1007 24AWG',
      unit: 'PCS',
      quantity: 2,
      targets: [
        { kind: 'material', id: 'mat-1' },
        { kind: 'material', id: 'mat-2' },
      ],
    };

    const wireBox1: TargetBox = {
      groupIdx: 0,
      left: 400,
      top: 110,
      right: 500,
      bottom: 130,
      width: 100,
      height: 20,
      centerX: 450,
      centerY: 120,
    };

    const wireBox2: TargetBox = {
      groupIdx: 0,
      left: 400,
      top: 130,
      right: 500,
      bottom: 150,
      width: 100,
      height: 20,
      centerX: 450,
      centerY: 140,
    };

    const items = partitionTargetsIntoCalloutItems(wireRow, [wireBox1, wireBox2]);
    expect(items).toHaveLength(1);
    expect(items[0].targetBoxes).toHaveLength(2);
    expect(items[0].subKey).toBe('t0');
    expect(items[0].preferredX).toBe(450 + 60);
  });

  it('partitions spread outer-molds into independent callouts', () => {
    const moldRow: ProductionBomRow = {
      key: 'outer-mold|spec-c',
      itemNo: 3,
      kind: 'outer-mold',
      name: '外模料',
      specification: 'PVC 直头',
      unit: 'PCS',
      quantity: 2,
      targets: [
        { kind: 'model', id: 'model-1' },
        { kind: 'model', id: 'model-2' },
      ],
    };

    const moldBox1: TargetBox = {
      groupIdx: 0,
      left: 140,
      top: 100,
      right: 180,
      bottom: 140,
      width: 40,
      height: 40,
      centerX: 160,
      centerY: 120,
    };

    const moldBox2: TargetBox = {
      groupIdx: 0,
      left: 760,
      top: 100,
      right: 800,
      bottom: 140,
      width: 40,
      height: 40,
      centerX: 780,
      centerY: 120,
    };

    const items = partitionTargetsIntoCalloutItems(moldRow, [moldBox1, moldBox2]);
    expect(items).toHaveLength(2);
    expect(items[0].targetBoxes).toEqual([moldBox1]);
    expect(items[1].targetBoxes).toEqual([moldBox2]);
    expect(items[0].row.itemNo).toBe(3);
    expect(items[1].row.itemNo).toBe(3);
  });
});

describe('calculateElbowPoint', () => {
  it('calculates obtuse elbow when balloon is to the left of target (bx < tx)', () => {
    const bx = 75;
    const by = 200;
    const tx = 120;
    const ty = 120;

    const { ex, balloonEdgeX } = calculateElbowPoint(bx, by, tx, ty, BALLOON_RADIUS);

    expect(balloonEdgeX).toBe(bx + BALLOON_RADIUS); // 86
    expect(ex).toBeGreaterThan(balloonEdgeX); // goes rightwards
    expect(ex).toBeLessThan(tx); // turns before reaching target X
  });

  it('calculates obtuse elbow when balloon is to the right of target (bx >= tx)', () => {
    const bx = 865;
    const by = 200;
    const tx = 820;
    const ty = 120;

    const { ex, balloonEdgeX } = calculateElbowPoint(bx, by, tx, ty, BALLOON_RADIUS);

    expect(balloonEdgeX).toBe(bx - BALLOON_RADIUS); // 854
    expect(ex).toBeLessThan(balloonEdgeX); // goes leftwards
    expect(ex).toBeGreaterThan(tx); // turns before reaching target X
  });
});

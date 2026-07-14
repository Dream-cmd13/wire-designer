# Drawing Object Transform Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rotation-aware light-blue selection frame, eight resize handles, a rotation handle, and stable move/resize/rotate behavior for every drawing object, including point-array shapes and DOM tables.

**Architecture:** Keep object content in its existing Canvas or DOM renderer, and add one SVG interaction overlay above both layers. Put all matrix, frame, hit-test, resize, point-scaling, move, and rotation calculations in a pure `drawingTransform` module so rendering and pointer handlers share one coordinate model.

**Tech Stack:** React 19, TypeScript 6, Canvas 2D, SVG, Pointer Events, Vitest.

## Global Constraints

- Preserve the current `DrawingObject` schema; do not add persisted transform fields.
- Use drawing-world coordinates for geometry, CSS pixels for handle visuals, and DPR only for the Canvas backing store.
- Draw handles at 8 × 8 CSS px with at least 16 × 16 CSS px hit targets.
- Place the rotation handle 24 CSS px above the rotated top-edge midpoint.
- Use 8 × 8 drawing units as the minimum persisted object size.
- Keep persisted width and height positive; crossing an anchor flips the active resize direction.
- Holding Shift preserves the starting aspect ratio on corner resize and snaps rotation to 15° increments.
- Move, resize, and rotate each call `onStartEdit()` once per completed pointer gesture.
- Locked objects show only the selection frame and cannot be transformed.
- Hide transform controls while non-table text is in caret-editing mode.
- Keep the existing table cell editing and Canvas text caret behavior intact.
- Do not add multi-selection, skew, custom transform origins, guide snapping, or stroke-outline curve hit-testing.

---

## File Map

- Create `src/lib/drawingTransform.ts`: pure coordinate transforms, frame geometry, hit-testing, resize, move, rotate, cursor, and point-array mapping.
- Create `src/lib/__tests__/drawingTransform.test.ts`: deterministic unit tests for all geometry and transform behavior.
- Create `src/components/drawings/standalone/StandaloneDrawingSelectionOverlay.tsx`: SVG frame, handles, hit areas, and pointer-event surface.
- Modify `src/lib/drawingRenderer.ts`: use rotation-aware object hit-testing and remove the old axis-aligned Canvas selection rectangle.
- Modify `src/components/drawings/standalone/StandaloneDrawingCanvas.tsx`: own the transform gesture state, integrate the SVG overlay, and coordinate editing/locked/table behavior.
- Modify `src/lib/__tests__/drawingCanvasTemplates.test.ts`: source-level regression checks for overlay wiring, table rotation, and preservation of caret/table editing.

---

### Task 1: Build the shared coordinate and frame geometry

**Files:**
- Create: `src/lib/drawingTransform.ts`
- Create: `src/lib/__tests__/drawingTransform.test.ts`

**Interfaces:**
- Consumes: `DrawingObject` and `DrawingPoint` from `src/types/drawing.ts`.
- Produces: `TransformHandle`, `TransformFrame`, `getObjectCenter`, `localToWorldPoint`, `worldToLocalPoint`, `getTransformFrame`, `getTransformHandlePoints`, and `getResizeCursor`.

- [ ] **Step 1: Write failing matrix and frame tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  getTransformFrame,
  getTransformHandlePoints,
  localToWorldPoint,
  worldToLocalPoint,
} from '@/lib/drawingTransform';
import { defaultDrawingObjectStyle } from '@/lib/drawingDocument';
import type { DrawingObject } from '@/types/drawing';

const object = {
  id: 'text-1', kind: 'text', text: 'A', x: 100, y: 200,
  width: 80, height: 40, rotation: 90, zIndex: 1,
  locked: false, visible: true, style: defaultDrawingObjectStyle,
} as DrawingObject;

describe('drawing transform geometry', () => {
  it('round-trips local and world points through the center rotation matrix', () => {
    const world = localToWorldPoint(object, { x: 0, y: 0 });
    expect(world.x).toBeCloseTo(160);
    expect(world.y).toBeCloseTo(180);
    expect(worldToLocalPoint(object, world)).toEqual({ x: 0, y: 0 });
  });

  it('returns rotated corners in nw-ne-se-sw order', () => {
    expect(getTransformFrame(object).corners).toEqual([
      { x: 160, y: 180 }, { x: 160, y: 260 },
      { x: 120, y: 260 }, { x: 120, y: 180 },
    ]);
  });

  it('keeps the rotation stem at 24 CSS pixels for every zoom', () => {
    const atHalf = getTransformHandlePoints(object, 0.5);
    const atDouble = getTransformHandlePoints(object, 2);
    expect(Math.hypot(
      (atHalf.rotate.x - atHalf.n.x) * 0.5,
      (atHalf.rotate.y - atHalf.n.y) * 0.5,
    )).toBeCloseTo(24);
    expect(Math.hypot(
      (atDouble.rotate.x - atDouble.n.x) * 2,
      (atDouble.rotate.y - atDouble.n.y) * 2,
    )).toBeCloseTo(24);
  });
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `npm test -- src/lib/__tests__/drawingTransform.test.ts`

Expected: FAIL because `@/lib/drawingTransform` cannot be resolved.

- [ ] **Step 3: Implement matrix and frame primitives**

Create `src/lib/drawingTransform.ts` with these exported contracts and calculations:

```ts
import type { DrawingObject, DrawingPoint } from '@/types/drawing';

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type TransformHandle = ResizeHandle | 'rotate';

export type TransformFrame = {
  center: DrawingPoint;
  corners: [DrawingPoint, DrawingPoint, DrawingPoint, DrawingPoint];
  edgeMidpoints: { n: DrawingPoint; e: DrawingPoint; s: DrawingPoint; w: DrawingPoint };
};

export const HANDLE_SIZE_CSS = 8;
export const HANDLE_HIT_SIZE_CSS = 16;
export const ROTATION_HANDLE_SIZE_CSS = 10;
export const ROTATION_OFFSET_CSS = 24;
export const MIN_OBJECT_SIZE = 8;

export function getObjectCenter(object: DrawingObject): DrawingPoint {
  return { x: object.x + object.width / 2, y: object.y + object.height / 2 };
}

function rotateVector(point: DrawingPoint, degrees: number): DrawingPoint {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

export function localToWorldPoint(object: DrawingObject, local: DrawingPoint): DrawingPoint {
  const center = getObjectCenter(object);
  const rotated = rotateVector(
    { x: local.x - object.width / 2, y: local.y - object.height / 2 },
    object.rotation,
  );
  return { x: center.x + rotated.x, y: center.y + rotated.y };
}

export function worldToLocalPoint(object: DrawingObject, world: DrawingPoint): DrawingPoint {
  const center = getObjectCenter(object);
  const local = rotateVector(
    { x: world.x - center.x, y: world.y - center.y },
    -object.rotation,
  );
  return { x: local.x + object.width / 2, y: local.y + object.height / 2 };
}

function midpoint(left: DrawingPoint, right: DrawingPoint): DrawingPoint {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

export function getTransformFrame(object: DrawingObject): TransformFrame {
  const nw = localToWorldPoint(object, { x: 0, y: 0 });
  const ne = localToWorldPoint(object, { x: object.width, y: 0 });
  const se = localToWorldPoint(object, { x: object.width, y: object.height });
  const sw = localToWorldPoint(object, { x: 0, y: object.height });
  return {
    center: getObjectCenter(object),
    corners: [nw, ne, se, sw],
    edgeMidpoints: {
      n: midpoint(nw, ne), e: midpoint(ne, se),
      s: midpoint(sw, se), w: midpoint(nw, sw),
    },
  };
}

export function getTransformHandlePoints(
  object: DrawingObject,
  zoom: number,
): Record<TransformHandle, DrawingPoint> {
  const frame = getTransformFrame(object);
  const outward = rotateVector({ x: 0, y: -ROTATION_OFFSET_CSS / zoom }, object.rotation);
  return {
    nw: frame.corners[0], n: frame.edgeMidpoints.n, ne: frame.corners[1],
    e: frame.edgeMidpoints.e, se: frame.corners[2], s: frame.edgeMidpoints.s,
    sw: frame.corners[3], w: frame.edgeMidpoints.w,
    rotate: { x: frame.edgeMidpoints.n.x + outward.x, y: frame.edgeMidpoints.n.y + outward.y },
  };
}

const resizeCursors = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'] as const;

export function getResizeCursor(handle: ResizeHandle, rotation: number): string {
  const base = { n: 0, ne: 1, e: 2, se: 3, s: 0, sw: 1, w: 2, nw: 3 }[handle];
  const turns = Math.round(rotation / 45);
  const index = ((base + turns) % resizeCursors.length + resizeCursors.length) % resizeCursors.length;
  return resizeCursors[index];
}
```

- [ ] **Step 4: Run the targeted test**

Run: `npm test -- src/lib/__tests__/drawingTransform.test.ts`

Expected: PASS with 3 tests.

- [ ] **Step 5: Commit the geometry foundation**

```bash
git add src/lib/drawingTransform.ts src/lib/__tests__/drawingTransform.test.ts
git commit -m "feat: add drawing transform geometry"
```

---

### Task 2: Replace axis-aligned object hit-testing with inverse-matrix hit-testing

**Files:**
- Modify: `src/lib/drawingTransform.ts`
- Modify: `src/lib/drawingRenderer.ts`
- Modify: `src/lib/__tests__/drawingTransform.test.ts`

**Interfaces:**
- Consumes: `worldToLocalPoint(object, point)` from Task 1.
- Produces: `containsDrawingPoint(object, point)` and a rotation-aware `getDrawingObjectAtPoint(document, point)`.

- [ ] **Step 1: Add failing inside/outside and z-order tests**

```ts
import { containsDrawingPoint } from '@/lib/drawingTransform';
import { getDrawingObjectAtPoint } from '@/lib/drawingRenderer';
import type { DrawingDocument } from '@/types/drawing';

it('tests a rotated object in its local rectangle', () => {
  expect(containsDrawingPoint(object, { x: 140, y: 181 })).toBe(true);
  expect(containsDrawingPoint(object, { x: 101, y: 201 })).toBe(false);
});

it('returns the topmost rotated object', () => {
  const top = { ...object, id: 'top', zIndex: 2 } as DrawingObject;
  const document = {
    schemaVersion: 1, id: 'drawing', name: 'hit test', createdAt: 0, updatedAt: 0,
    page: { size: 'A4', orientation: 'landscape', width: 1200, height: 800 },
    objects: [{ ...object, rotation: 0 }, top],
    titleBlock: { title: '', drawingNo: '', revision: '' },
    revisionTable: [], techRequirements: [],
  } as DrawingDocument;
  expect(getDrawingObjectAtPoint(document, { x: 140, y: 220 })?.id).toBe('top');
});
```

- [ ] **Step 2: Run the tests and verify the old hit-test fails**

Run: `npm test -- src/lib/__tests__/drawingTransform.test.ts`

Expected: FAIL because `containsDrawingPoint` is missing or the renderer still uses world-axis bounds.

- [ ] **Step 3: Implement local-frame containment and connect the renderer**

Append to `drawingTransform.ts`:

```ts
export function containsDrawingPoint(object: DrawingObject, point: DrawingPoint): boolean {
  if (!object.visible || object.width <= 0 || object.height <= 0) return false;
  const local = worldToLocalPoint(object, point);
  return local.x >= 0 && local.x <= object.width && local.y >= 0 && local.y <= object.height;
}
```

In `drawingRenderer.ts`, import the helper and replace the final `.find(...)` predicate:

```ts
.find(({ object }) => containsDrawingPoint(object, point))
```

Keep the existing descending z-index and insertion-order sort unchanged.

- [ ] **Step 4: Run geometry and existing drawing tests**

Run: `npm test -- src/lib/__tests__/drawingTransform.test.ts src/lib/__tests__/drawingCanvasTemplates.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit rotation-aware hit-testing**

```bash
git add src/lib/drawingTransform.ts src/lib/drawingRenderer.ts src/lib/__tests__/drawingTransform.test.ts
git commit -m "fix: hit test rotated drawing objects"
```

---

### Task 3: Implement move, resize, flip, point scaling, and rotation calculations

**Files:**
- Modify: `src/lib/drawingTransform.ts`
- Modify: `src/lib/__tests__/drawingTransform.test.ts`

**Interfaces:**
- Consumes: matrix primitives and `ResizeHandle` from Task 1.
- Produces: `DrawingTransformPatch`, `DrawingMoveBounds`, `moveDrawingObject`, `resizeDrawingObject`, `rotateDrawingObject`, `DrawingResizeResult`, and `normalizeRotation`.

- [ ] **Step 1: Add failing transform tests**

```ts
import {
  moveDrawingObject,
  resizeDrawingObject,
  rotateDrawingObject,
} from '@/lib/drawingTransform';

it('moves line-like points with the object frame', () => {
  const line = {
    ...object, kind: 'polyline', x: 10, y: 20, width: 100, height: 50,
    points: [{ x: 10, y: 20 }, { x: 110, y: 70 }], orthogonal: false,
  } as DrawingObject;
  expect(moveDrawingObject(line, { x: 10, y: -5 })).toMatchObject({
    x: 20, y: 15, points: [{ x: 20, y: 15 }, { x: 120, y: 65 }],
  });
});

it('applies page-edge constraints to the effective move delta', () => {
  const moved = moveDrawingObject(object, { x: -500, y: 900 }, {
    width: 1200, height: 800, inset: 20,
  });
  expect(moved).toMatchObject({ x: 20, y: 740 });
});

it('keeps the opposite rotated corner fixed during corner resize', () => {
  const start = { ...object, rotation: 30 } as DrawingObject;
  const fixedBefore = localToWorldPoint(start, { x: 0, y: 0 });
  const pointer = localToWorldPoint(start, { x: 120, y: 70 });
  const result = resizeDrawingObject(start, 'se', pointer, false);
  const resized = { ...start, ...result.patch } as DrawingObject;
  const fixedAfter = localToWorldPoint(resized, { x: 0, y: 0 });
  expect(fixedAfter.x).toBeCloseTo(fixedBefore.x);
  expect(fixedAfter.y).toBeCloseTo(fixedBefore.y);
  expect(result.patch).toMatchObject({ width: 120, height: 70 });
});

it('preserves aspect ratio with Shift and mirrors points after crossing', () => {
  const line = {
    ...object, kind: 'line', rotation: 0,
    points: [{ x: 100, y: 200 }, { x: 180, y: 240 }], orthogonal: false,
  } as DrawingObject;
  const ratioResult = resizeDrawingObject(line, 'se', { x: 260, y: 280 }, true);
  expect((ratioResult.patch.width ?? 1) / (ratioResult.patch.height ?? 1)).toBeCloseTo(2);
  const flipped = resizeDrawingObject(line, 'e', { x: 80, y: 220 }, false);
  const flippedPoints = flipped.patch.points ?? [];
  expect(flipped.activeHandle).toBe('w');
  expect(flipped.patch.width).toBeGreaterThanOrEqual(8);
  expect(flippedPoints[0].x).toBeGreaterThan(flippedPoints[1].x);
});

it('rotates continuously and snaps to 15 degrees with Shift', () => {
  const start = { ...object, rotation: 10 } as DrawingObject;
  const center = getObjectCenter(start);
  const startPointer = { x: center.x, y: center.y - 100 };
  const endPointer = { x: center.x + 100, y: center.y };
  expect(rotateDrawingObject(start, startPointer, endPointer, false)).toEqual({ rotation: 100 });
  expect(rotateDrawingObject(start, startPointer, endPointer, true)).toEqual({ rotation: 105 });
});
```

- [ ] **Step 2: Run the tests and verify missing transform functions**

Run: `npm test -- src/lib/__tests__/drawingTransform.test.ts`

Expected: FAIL because the transform functions are not exported.

- [ ] **Step 3: Implement move and rotation calculations**

Append these functions to `drawingTransform.ts`:

```ts
const lineKinds = new Set<DrawingObject['kind']>(['line', 'polyline', 'curve', 'freehand']);

export type DrawingTransformPatch = Partial<DrawingObject> & { points?: DrawingPoint[] };
export type DrawingMoveBounds = { width: number; height: number; inset: number };

function isLineLike(object: DrawingObject): object is Extract<
  DrawingObject,
  { kind: 'line' | 'polyline' | 'curve' | 'freehand' }
> {
  return lineKinds.has(object.kind);
}

export function moveDrawingObject(
  object: DrawingObject,
  delta: DrawingPoint,
  bounds?: DrawingMoveBounds,
): DrawingTransformPatch {
  const intendedX = object.x + delta.x;
  const intendedY = object.y + delta.y;
  const x = bounds
    ? Math.min(bounds.width - bounds.inset - object.width, Math.max(bounds.inset, intendedX))
    : intendedX;
  const y = bounds
    ? Math.min(bounds.height - bounds.inset - object.height, Math.max(bounds.inset, intendedY))
    : intendedY;
  const appliedDelta = { x: x - object.x, y: y - object.y };
  const patch: DrawingTransformPatch = { x, y };
  if (isLineLike(object)) {
    return {
      ...patch,
      points: object.points.map((point) => ({
        x: point.x + appliedDelta.x,
        y: point.y + appliedDelta.y,
      })),
    };
  }
  return patch;
}

export function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

function pointerAngle(center: DrawingPoint, pointer: DrawingPoint): number {
  return Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180 / Math.PI;
}

export function rotateDrawingObject(
  object: DrawingObject,
  startPointer: DrawingPoint,
  pointer: DrawingPoint,
  snap: boolean,
): DrawingTransformPatch {
  const center = getObjectCenter(object);
  const delta = pointerAngle(center, pointer) - pointerAngle(center, startPointer);
  const raw = normalizeRotation(object.rotation + delta);
  return { rotation: snap ? normalizeRotation(Math.round(raw / 15) * 15) : raw };
}
```

- [ ] **Step 4: Implement fixed-anchor resize and point mapping**

Add these public types and the resize function. Keep all calculations based on the immutable starting object:

```ts
export type DrawingResizeResult = {
  patch: DrawingTransformPatch;
  activeHandle: ResizeHandle;
};

const handleAxes: Record<ResizeHandle, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  nw: { x: -1, y: -1 }, n: { x: 0, y: -1 }, ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 }, se: { x: 1, y: 1 }, s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 }, w: { x: -1, y: 0 },
};

function handleFromAxes(x: -1 | 0 | 1, y: -1 | 0 | 1): ResizeHandle {
  return ({
    '-1,-1': 'nw', '0,-1': 'n', '1,-1': 'ne', '1,0': 'e',
    '1,1': 'se', '0,1': 's', '-1,1': 'sw', '-1,0': 'w',
  } as Record<string, ResizeHandle>)[`${x},${y}`];
}

export function resizeDrawingObject(
  object: DrawingObject,
  handle: ResizeHandle,
  pointer: DrawingPoint,
  preserveAspectRatio: boolean,
): DrawingResizeResult {
  const axes = handleAxes[handle];
  const fixedLocal = {
    x: axes.x < 0 ? object.width : axes.x > 0 ? 0 : object.width / 2,
    y: axes.y < 0 ? object.height : axes.y > 0 ? 0 : object.height / 2,
  };
  const fixedWorld = localToWorldPoint(object, fixedLocal);
  const delta = rotateVector(
    { x: pointer.x - fixedWorld.x, y: pointer.y - fixedWorld.y },
    -object.rotation,
  );
  let signedWidth = axes.x === 0 ? object.width : delta.x * axes.x;
  let signedHeight = axes.y === 0 ? object.height : delta.y * axes.y;

  if (preserveAspectRatio && axes.x !== 0 && axes.y !== 0) {
    const ratio = object.width / object.height;
    if (Math.abs(signedWidth) / object.width >= Math.abs(signedHeight) / object.height) {
      signedHeight = Math.sign(signedHeight || axes.y) * Math.abs(signedWidth) / ratio;
    } else {
      signedWidth = Math.sign(signedWidth || axes.x) * Math.abs(signedHeight) * ratio;
    }
  }

  const flipX = axes.x !== 0 && signedWidth < 0;
  const flipY = axes.y !== 0 && signedHeight < 0;
  const width = axes.x === 0 ? object.width : Math.max(MIN_OBJECT_SIZE, Math.abs(signedWidth));
  const height = axes.y === 0 ? object.height : Math.max(MIN_OBJECT_SIZE, Math.abs(signedHeight));
  const centerOffsetLocal = {
    x: axes.x === 0 ? 0 : Math.sign(signedWidth || 1) * axes.x * width / 2,
    y: axes.y === 0 ? 0 : Math.sign(signedHeight || 1) * axes.y * height / 2,
  };
  const centerOffsetWorld = rotateVector(centerOffsetLocal, object.rotation);
  const center = {
    x: fixedWorld.x + centerOffsetWorld.x,
    y: fixedWorld.y + centerOffsetWorld.y,
  };
  const patch: DrawingTransformPatch = {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
  };

  if (isLineLike(object)) {
    patch.points = object.points.map((point) => {
      const sourceX = (point.x - object.x) / object.width;
      const sourceY = (point.y - object.y) / object.height;
      return {
        x: patch.x! + (flipX ? 1 - sourceX : sourceX) * width,
        y: patch.y! + (flipY ? 1 - sourceY : sourceY) * height,
      };
    });
  }

  const activeX = flipX ? (-axes.x as -1 | 0 | 1) : axes.x;
  const activeY = flipY ? (-axes.y as -1 | 0 | 1) : axes.y;
  return { patch, activeHandle: handleFromAxes(activeX, activeY) };
}
```

The eight-handle anchor test in Step 5 is the acceptance gate for `centerOffsetLocal`; do not add post-calculation coordinate offsets.

- [ ] **Step 5: Add explicit tests for all eight handles, minimum size, and 30°/90° anchors**

Use a table-driven test over `['nw','n','ne','e','se','s','sw','w']`, calculate the fixed local anchor from the handle axes, and assert that its world position before and after resize differs by less than `1e-6` on each axis. Assert every patch has `width >= 8` and `height >= 8`.

- [ ] **Step 6: Run the complete geometry test**

Run: `npm test -- src/lib/__tests__/drawingTransform.test.ts`

Expected: PASS for matrix, hit-test, move, eight-handle resize, flip, point mapping, and rotation tests.

- [ ] **Step 7: Commit transform calculations**

```bash
git add src/lib/drawingTransform.ts src/lib/__tests__/drawingTransform.test.ts
git commit -m "feat: add resize move and rotate calculations"
```

---

### Task 4: Render the shared SVG selection overlay

**Files:**
- Create: `src/components/drawings/standalone/StandaloneDrawingSelectionOverlay.tsx`
- Modify: `src/lib/__tests__/drawingCanvasTemplates.test.ts`

**Interfaces:**
- Consumes: `DrawingObject`, `ResizeHandle`, `getTransformFrame`, `getTransformHandlePoints`, `getResizeCursor`, and the CSS size constants.
- Produces: `StandaloneDrawingSelectionOverlay` with pointer-start callbacks for resize and rotate plus shared pointer move/end callbacks.

- [ ] **Step 1: Add a failing overlay source regression test**

```ts
it('renders one SVG transform overlay with eight resize handles and rotation control', () => {
  const overlay = readFileSync(
    'src/components/drawings/standalone/StandaloneDrawingSelectionOverlay.tsx',
    'utf8',
  );
  expect(overlay).toContain("const resizeHandles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']");
  expect(overlay).toContain('stroke="#60a5fa"');
  expect(overlay).toContain('HANDLE_SIZE_CSS');
  expect(overlay).toContain('HANDLE_HIT_SIZE_CSS');
  expect(overlay).toContain('onResizePointerDown(handle, event)');
  expect(overlay).toContain('onRotatePointerDown(event)');
});
```

- [ ] **Step 2: Run the regression test and verify the component is missing**

Run: `npm test -- src/lib/__tests__/drawingCanvasTemplates.test.ts`

Expected: FAIL because the overlay file does not exist.

- [ ] **Step 3: Create the overlay component**

Implement these props and rendering rules:

```tsx
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  HANDLE_HIT_SIZE_CSS,
  HANDLE_SIZE_CSS,
  ROTATION_HANDLE_SIZE_CSS,
  getResizeCursor,
  getTransformFrame,
  getTransformHandlePoints,
  type ResizeHandle,
} from '@/lib/drawingTransform';
import type { DrawingObject } from '@/types/drawing';

type OverlayProps = {
  object: DrawingObject;
  zoom: number;
  pageWidth: number;
  pageHeight: number;
  controlsVisible: boolean;
  onResizePointerDown: (handle: ResizeHandle, event: ReactPointerEvent<SVGRectElement>) => void;
  onRotatePointerDown: (event: ReactPointerEvent<SVGCircleElement>) => void;
  onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerEnd: (event: ReactPointerEvent<SVGSVGElement>) => void;
};

const resizeHandles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function StandaloneDrawingSelectionOverlay(props: OverlayProps) {
  const frame = getTransformFrame(props.object);
  const points = getTransformHandlePoints(props.object, props.zoom);
  const polygon = frame.corners.map((point) => `${point.x * props.zoom},${point.y * props.zoom}`).join(' ');
  const top = points.n;
  const rotate = points.rotate;

  return (
    <svg
      aria-label="对象变换控制"
      className="pointer-events-none absolute left-0 top-0 z-40 overflow-visible"
      width={props.pageWidth * props.zoom}
      height={props.pageHeight * props.zoom}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerEnd}
      onPointerCancel={props.onPointerEnd}
    >
      <polygon points={polygon} fill="none" stroke="#60a5fa" strokeWidth="1.5" pointerEvents="none" />
      {props.controlsVisible && (
        <>
          <line
            x1={top.x * props.zoom} y1={top.y * props.zoom}
            x2={rotate.x * props.zoom} y2={rotate.y * props.zoom}
            stroke="#60a5fa" strokeWidth="1.5" pointerEvents="none"
          />
          {resizeHandles.map((handle) => {
            const point = points[handle];
            return (
              <g key={handle}>
                <rect
                  className="pointer-events-all"
                  x={point.x * props.zoom - HANDLE_HIT_SIZE_CSS / 2}
                  y={point.y * props.zoom - HANDLE_HIT_SIZE_CSS / 2}
                  width={HANDLE_HIT_SIZE_CSS} height={HANDLE_HIT_SIZE_CSS}
                  fill="transparent"
                  style={{ cursor: getResizeCursor(handle, props.object.rotation) }}
                  onPointerDown={(event) => props.onResizePointerDown(handle, event)}
                />
                <rect
                  x={point.x * props.zoom - HANDLE_SIZE_CSS / 2}
                  y={point.y * props.zoom - HANDLE_SIZE_CSS / 2}
                  width={HANDLE_SIZE_CSS} height={HANDLE_SIZE_CSS}
                  fill="white" stroke="#3b82f6" strokeWidth="1.5"
                  pointerEvents="none"
                />
              </g>
            );
          })}
          <circle
            className="pointer-events-all"
            cx={rotate.x * props.zoom} cy={rotate.y * props.zoom}
            r={Math.max(HANDLE_HIT_SIZE_CSS, ROTATION_HANDLE_SIZE_CSS) / 2}
            fill="transparent" style={{ cursor: 'grab' }}
            onPointerDown={props.onRotatePointerDown}
          />
          <circle
            cx={rotate.x * props.zoom} cy={rotate.y * props.zoom}
            r={ROTATION_HANDLE_SIZE_CSS / 2}
            fill="white" stroke="#3b82f6" strokeWidth="1.5"
            pointerEvents="none"
          />
        </>
      )}
    </svg>
  );
}
```

Decorative shapes use `pointerEvents="none"`; only the transparent 16 px hit shapes receive pointer input.

- [ ] **Step 4: Run the overlay regression test**

Run: `npm test -- src/lib/__tests__/drawingCanvasTemplates.test.ts`

Expected: PASS for the new overlay source test and all existing caret/table tests.

- [ ] **Step 5: Commit the SVG overlay**

```bash
git add src/components/drawings/standalone/StandaloneDrawingSelectionOverlay.tsx src/lib/__tests__/drawingCanvasTemplates.test.ts
git commit -m "feat: render drawing transform controls"
```

---

### Task 5: Integrate move, resize, rotate, and one-snapshot undo into the Canvas

**Files:**
- Modify: `src/components/drawings/standalone/StandaloneDrawingCanvas.tsx`
- Modify: `src/lib/drawingRenderer.ts`
- Modify: `src/lib/__tests__/drawingCanvasTemplates.test.ts`

**Interfaces:**
- Consumes: transform calculations from Task 3 and overlay callbacks from Task 4.
- Produces: one `TransformInteraction` state machine that updates objects through the existing `onUpdateObject` callback.

- [ ] **Step 1: Add failing interaction wiring assertions**

```ts
it('routes move resize and rotate through one immutable gesture snapshot', () => {
  const source = readFileSync(
    'src/components/drawings/standalone/StandaloneDrawingCanvas.tsx',
    'utf8',
  );
  expect(source).toContain("type TransformInteraction =");
  expect(source).toContain("kind: 'resize'");
  expect(source).toContain("kind: 'rotate'");
  expect(source).toContain('moveDrawingObject(interaction.object');
  expect(source).toContain('resizeDrawingObject(interaction.object');
  expect(source).toContain('rotateDrawingObject(interaction.object');
  expect(source).toContain('<StandaloneDrawingSelectionOverlay');
});

it('does not draw the obsolete axis-aligned Canvas selection rectangle', () => {
  const renderer = readFileSync('src/lib/drawingRenderer.ts', 'utf8');
  expect(renderer).not.toContain('context.strokeRect(object.x - 4');
});
```

- [ ] **Step 2: Run the tests and verify the old drag implementation fails them**

Run: `npm test -- src/lib/__tests__/drawingCanvasTemplates.test.ts`

Expected: FAIL because the unified interaction and overlay are not wired.

- [ ] **Step 3: Replace `DragState` with immutable gesture variants**

Use these variants near the existing editor types:

```ts
type TransformInteraction =
  | { kind: 'move'; object: DrawingObject; startPointer: DrawingPoint }
  | { kind: 'resize'; object: DrawingObject; startPointer: DrawingPoint; handle: ResizeHandle }
  | { kind: 'rotate'; object: DrawingObject; startPointer: DrawingPoint }
  | null;
```

Replace `drag` state with `interaction`. Clone the selected object at gesture start using `structuredClone(object)` so live store updates do not mutate the starting geometry.

- [ ] **Step 4: Make pointer conversion work for Canvas and SVG events**

```ts
const getDrawingPoint = (clientX: number, clientY: number): DrawingPoint | null => {
  const rect = canvasRef.current?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return null;
  return {
    x: ((clientX - rect.left) / rect.width) * drawing.page.width,
    y: ((clientY - rect.top) / rect.height) * drawing.page.height,
  };
};
```

Call this helper from Canvas pointer events, double-click caret hit-testing, and SVG overlay events. Remove the old helper that depends on `event.currentTarget` being the Canvas.

- [ ] **Step 5: Start each gesture and snapshot undo once**

Canvas object move start:

```ts
const point = getDrawingPoint(event.clientX, event.clientY);
const object = point ? getDrawingObjectAtPoint(drawing, point) : undefined;
onSelectObject(object?.id ?? null);
if (!point || !object || object.locked) return;
event.currentTarget.setPointerCapture(event.pointerId);
onStartEdit();
setInteraction({ kind: 'move', object: structuredClone(object), startPointer: point });
```

Overlay resize and rotate starts:

```ts
const beginResize = (handle: ResizeHandle, event: React.PointerEvent<SVGRectElement>) => {
  if (!selectedObject || selectedObject.locked) return;
  const point = getDrawingPoint(event.clientX, event.clientY);
  if (!point) return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.setPointerCapture(event.pointerId);
  onStartEdit();
  setInteraction({ kind: 'resize', object: structuredClone(selectedObject), startPointer: point, handle });
};

const beginRotate = (event: React.PointerEvent<SVGCircleElement>) => {
  if (!selectedObject || selectedObject.locked) return;
  const point = getDrawingPoint(event.clientX, event.clientY);
  if (!point) return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.setPointerCapture(event.pointerId);
  onStartEdit();
  setInteraction({ kind: 'rotate', object: structuredClone(selectedObject), startPointer: point });
};
```

- [ ] **Step 6: Calculate every pointer move from the starting snapshot**

```ts
const updateTransform = (clientX: number, clientY: number, shiftKey: boolean) => {
  if (!interaction) return;
  const point = getDrawingPoint(clientX, clientY);
  if (!point) return;
  let patch: Partial<DrawingObject>;
  if (interaction.kind === 'move') {
    patch = moveDrawingObject(interaction.object, {
      x: point.x - interaction.startPointer.x,
      y: point.y - interaction.startPointer.y,
    }, { width: drawing.page.width, height: drawing.page.height, inset: 20 });
  } else if (interaction.kind === 'resize') {
    patch = resizeDrawingObject(
      interaction.object,
      interaction.handle,
      point,
      shiftKey,
    ).patch;
  } else {
    patch = rotateDrawingObject(interaction.object, interaction.startPointer, point, shiftKey);
  }
  if (Object.values(patch).every((value) => typeof value !== 'number' || Number.isFinite(value))) {
    onUpdateObject(interaction.object.id, patch);
  }
};
```

Canvas and overlay pointer-move handlers call this helper. Both pointer-up and pointer-cancel release capture when present and set `interaction` to `null`.

- [ ] **Step 7: Render the overlay and remove the Canvas duplicate**

Derive `selectedObject` from `drawing.objects`. Render the overlay after the caret SVG:

```tsx
{selectedObject && !editor && (
  <StandaloneDrawingSelectionOverlay
    object={selectedObject}
    zoom={zoom}
    pageWidth={drawing.page.width}
    pageHeight={drawing.page.height}
    controlsVisible={!selectedObject.locked}
    onResizePointerDown={beginResize}
    onRotatePointerDown={beginRotate}
    onPointerMove={(event) => updateTransform(event.clientX, event.clientY, event.shiftKey)}
    onPointerEnd={endTransform}
  />
)}
```

Delete lines 205–212 of the current `drawingRenderer.ts` selection rectangle block. Remove `selectedObjectId` from `renderDrawingCanvas` if no remaining caller needs it, and update its Standalone Canvas/test call sites in the same change.

- [ ] **Step 8: Run targeted interaction regressions**

Run: `npm test -- src/lib/__tests__/drawingTransform.test.ts src/lib/__tests__/drawingCanvasTemplates.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit Canvas integration**

```bash
git add src/components/drawings/standalone/StandaloneDrawingCanvas.tsx src/lib/drawingRenderer.ts src/lib/__tests__/drawingCanvasTemplates.test.ts
git commit -m "feat: integrate drawing transform gestures"
```

---

### Task 6: Integrate rotated DOM tables and preserve editing conflicts

**Files:**
- Modify: `src/components/drawings/standalone/StandaloneDrawingCanvas.tsx`
- Modify: `src/lib/__tests__/drawingCanvasTemplates.test.ts`

**Interfaces:**
- Consumes: shared selection overlay from Task 4 and the existing `DrawingTableLayer` editing/drag API.
- Produces: visually rotated tables with shared selection UI and unchanged cell editing.

- [ ] **Step 1: Add failing table and editing-state regression assertions**

```ts
it('rotates DOM tables around their center and uses only the shared overlay', () => {
  const source = readFileSync(
    'src/components/drawings/standalone/StandaloneDrawingCanvas.tsx',
    'utf8',
  );
  expect(source).toContain('transform: `rotate(${object.rotation}deg)`');
  expect(source).toContain("transformOrigin: 'center center'");
  expect(source).not.toContain("ring-2 ring-blue-500 ring-offset-1");
});

it('suppresses transform controls while Canvas text is editing and locks controls', () => {
  const source = readFileSync(
    'src/components/drawings/standalone/StandaloneDrawingCanvas.tsx',
    'utf8',
  );
  expect(source).toContain('selectedObject && !editor');
  expect(source).toContain('controlsVisible={!selectedObject.locked}');
  expect(source).toContain('if (!selectedObject || selectedObject.locked) return;');
});
```

- [ ] **Step 2: Run the regression test and verify table rotation is absent**

Run: `npm test -- src/lib/__tests__/drawingCanvasTemplates.test.ts`

Expected: FAIL on table rotation and duplicate-ring assertions.

- [ ] **Step 3: Rotate the table DOM root and remove its ring**

In the root `DrawingTableLayer` style, add:

```tsx
transform: `rotate(${object.rotation}deg)`,
transformOrigin: 'center center',
```

Remove the selected Tailwind ring from the table root. Retain `selected` only if it remains useful for accessibility metadata; otherwise remove it from `DrawingTableLayer` props and its caller.

- [ ] **Step 4: Preserve table body drag and cell editing**

Keep the current table pointer rule `if (editing || object.locked) return;`. Confirm table body drag still calls `onStartEdit()` exactly once before `setDrag`, while shared SVG resize/rotation handles stop propagation and use their own pointer capture.

Add `aria-selected={selected}` to the table root if the prop is retained, so removing the ring does not remove selected-state semantics.

- [ ] **Step 5: Run caret, table, and transform tests together**

Run: `npm test -- src/lib/__tests__/drawingTextLayout.test.ts src/lib/__tests__/drawingTransform.test.ts src/lib/__tests__/drawingCanvasTemplates.test.ts`

Expected: PASS, including the existing contentEditable and custom caret regressions.

- [ ] **Step 6: Commit DOM table integration**

```bash
git add src/components/drawings/standalone/StandaloneDrawingCanvas.tsx src/lib/__tests__/drawingCanvasTemplates.test.ts
git commit -m "feat: add transform controls to drawing tables"
```

---

### Task 7: Verify object updates, undo boundaries, zoom, rotation, and browser behavior

**Files:**
- Modify only if verification exposes a scoped defect in files from Tasks 1–6.

**Interfaces:**
- Consumes: the completed feature.
- Produces: test/build evidence and a browser checklist with no unresolved transform defects.

- [ ] **Step 1: Run the complete automated test suite**

Run: `npm test`

Expected: all Vitest test files pass.

- [ ] **Step 2: Run TypeScript and production build**

Run: `npm run build`

Expected: `tsc -b` and Vite production build both succeed. The existing large-chunk warning may remain; no TypeScript errors are allowed.

- [ ] **Step 3: Run changed-file lint**

Run:

```bash
npx eslint src/lib/drawingTransform.ts src/lib/__tests__/drawingTransform.test.ts src/lib/drawingRenderer.ts src/components/drawings/standalone/StandaloneDrawingSelectionOverlay.tsx src/components/drawings/standalone/StandaloneDrawingCanvas.tsx src/lib/__tests__/drawingCanvasTemplates.test.ts
```

Expected: zero errors and warnings in changed files. If full-project lint still reports the pre-existing `no-explicit-any` findings in `src/lib/catalogRepository.ts`, record them separately instead of modifying that unrelated file.

- [ ] **Step 4: Browser-check selection visuals at four zoom levels**

Open `http://localhost:5173/drawing-workbench`. At 50%, 100%, 150%, and 200% zoom, select a text, connector, wire bundle, dimension, table, polyline, and freehand object. Verify:

- One light-blue frame follows object rotation.
- Eight handles remain 8 CSS px and easy to hit.
- The rotation stem remains 24 CSS px.
- No old axis-aligned dashed Canvas frame is visible.

- [ ] **Step 5: Browser-check every resize direction and crossing**

For a 30° object, drag all eight handles. Verify the opposite corner or edge midpoint remains stationary. Hold Shift on a corner and verify the starting aspect ratio remains stable. Cross the fixed anchor horizontally and vertically and verify width/height stay positive while content mirrors.

- [ ] **Step 6: Browser-check point-array transforms**

Resize and move `line`, `polyline`, `curve`, and `freehand` objects. Verify all rendered points remain inside and aligned with the new frame. Undo once and verify the whole gesture reverts in one step; redo once and verify the complete gesture returns.

- [ ] **Step 7: Browser-check rotation and rotated hit-testing**

Rotate representative objects continuously, then hold Shift and verify 15° snapping. Click points inside the old axis-aligned bounds but outside the rotated frame and verify the object is not selected. Click inside the rotated frame and verify the topmost object is selected.

- [ ] **Step 8: Browser-check editing and locked states**

Lock an object and verify only its frame is shown. Double-click Canvas text and confirm transform handles disappear while the caret remains aligned. Edit a table title and cell, then move, resize, and rotate the table after editing finishes.

- [ ] **Step 9: Inspect the final diff**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only the files listed in this plan plus previously existing user changes are present.

- [ ] **Step 10: Commit verification-only fixes if Step 4–8 required changes**

```bash
git add src/lib/drawingTransform.ts src/lib/__tests__/drawingTransform.test.ts src/lib/drawingRenderer.ts src/components/drawings/standalone/StandaloneDrawingSelectionOverlay.tsx src/components/drawings/standalone/StandaloneDrawingCanvas.tsx src/lib/__tests__/drawingCanvasTemplates.test.ts
git commit -m "test: verify drawing transform interactions"
```

Skip this commit when verification required no code changes.

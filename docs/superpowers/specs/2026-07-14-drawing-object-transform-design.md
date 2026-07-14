# Drawing Object Transform Controls Design

## Scope

Add a standard transform interaction to the standalone drawing workbench:

- A light-blue rotated selection frame.
- Eight resize handles at the four corners and four edge midpoints.
- A top-center rotation stem and rotation handle.
- Pointer-driven move, resize, and rotate interactions.
- Rotation-aware object hit-testing.
- Live object size and rotation updates through the existing `onUpdateObject` path.
- Point-array transforms for `line`, `polyline`, `curve`, and `freehand` objects.
- The same selection overlay for Canvas objects and DOM-managed tables.

Text caret editing remains independent. While non-table text is being edited, transform handles are hidden so caret input and transform gestures cannot compete for pointer ownership.

## Existing Constraints

- Drawing coordinates use a fixed 1200 × 800 world coordinate system.
- Canvas backing-store scaling is controlled by device pixel ratio; interaction coordinates use world and CSS pixels only.
- `DrawingObjectBase.x/y` identify the unrotated local frame's top-left point, while `rotation` is applied around the frame center.
- Line-like object points are stored as absolute drawing points and rendered relative to `object.x/y` inside the object's rotated local frame.
- Tables are hidden from the interactive Canvas and rendered as DOM elements.
- `DrawingWorkbenchPage.remember()` creates the undo snapshot. It must run once at gesture start, not during every pointer move.
- Locked objects can be selected but cannot be moved, resized, or rotated.

## Chosen Architecture

Use an SVG interaction overlay above the Canvas and DOM table layers, backed by a pure TypeScript geometry module.

Canvas continues to draw object content. The SVG layer draws only selection UI and receives pointer events on handles. This matches the existing SVG caret architecture, keeps handles at fixed CSS-pixel sizes, and avoids duplicating object content in the DOM.

The pure geometry module is the single source of truth for:

- Local-to-world and world-to-local point conversion.
- Rotated corners, edge midpoints, and rotation-handle positions.
- Handle hit-testing with CSS-pixel tolerances converted through `zoom`.
- Rotation-aware object hit-testing.
- Move, resize, flip, aspect-ratio, and rotation calculations.
- Point-array transformation for line-like objects.

## Coordinate Model

For an object with center `C`, rotation matrix `R`, and local point `L`, its world point is:

```text
W = C + R × (L - localCenter)
```

The inverse mapping used for hit-testing is:

```text
L = localCenter + R⁻¹ × (W - C)
```

Canvas DPR never enters these equations. Pointer coordinates are converted from viewport CSS coordinates into drawing-world coordinates using the Canvas bounding rectangle. SVG display coordinates are `world × zoom`.

## Selection Overlay

The overlay uses the object's rotated world-space corners to draw a polygonal frame. Visual values are CSS pixels:

- Frame stroke: `#60a5fa`.
- Frame stroke width: 1.5 px.
- Handle fill: white.
- Handle stroke: `#3b82f6`.
- Handle size: 8 × 8 px.
- Handle hit target: at least 16 × 16 px.
- Rotation stem length: 24 px above the top-edge midpoint.
- Rotation handle diameter: 10 px.

The eight handle identifiers are `nw`, `n`, `ne`, `e`, `se`, `s`, `sw`, and `w`. Handle rectangles remain screen-axis-aligned for a stable visual and hit target; their positions follow the rotated frame. Resize cursors are rotated into the nearest 45-degree cursor family.

Locked objects show the light-blue frame but no resize or rotation handles. During text editing, the selection overlay is hidden. Invisible objects cannot be selected.

## Gesture State

One discriminated `TransformInteraction` state represents the active gesture:

- `move`: object snapshot and pointer start position.
- `resize`: object snapshot, initial pointer, active handle, fixed opposite anchor, and initial aspect ratio.
- `rotate`: object snapshot, object center, pointer start angle, and initial rotation.

Every gesture follows this sequence:

1. Reject locked objects.
2. Stop propagation when the gesture starts from a control handle.
3. Capture the pointer.
4. Call `onStartEdit()` exactly once.
5. Store an immutable clone of the starting object.
6. Calculate patches from the starting object on every `pointermove`; do not accumulate rounded deltas from the previous frame.
7. Release pointer capture and clear interaction state on `pointerup` or `pointercancel`.

This guarantees stable matrix calculations and produces one undo entry for the complete gesture.

## Move Behavior

Move uses the world-space pointer delta from gesture start. Rotation does not change the translation delta because the whole local frame moves as one unit. The patch updates `x/y`; line-like points move by the same delta so their absolute coordinates remain aligned with the object frame.

Existing page-edge constraints remain in effect for move. The constraint is applied to the calculated frame position, not to incremental pointer movement.

## Resize Behavior

Resize projects the pointer into the starting object's rotated axes. The opposite handle or opposite-edge midpoint is the fixed world-space anchor.

- Corner handles change width and height.
- Edge handles change only one dimension.
- Holding Shift on a corner preserves the starting aspect ratio.
- Minimum dimensions are 8 × 8 drawing units.
- Crossing the fixed anchor flips the active handle, while persisted width and height remain positive.
- Object rotation does not change during resize.
- The new object center is reconstructed from the fixed world anchor and resized local half-extents.

For line-like objects, every point is mapped from the starting local frame into the resized local frame. Horizontal or vertical handle crossing mirrors the corresponding point coordinate. The patch updates `x`, `y`, `width`, `height`, and `points` atomically.

Tables update `x`, `y`, `width`, and `height`; their DOM layer reads the live dimensions. Text offsets inside a table remain unchanged because they are local offsets.

## Rotation Behavior

Rotation is calculated from the angle between object center and pointer:

```text
nextRotation = initialRotation + currentPointerAngle - startPointerAngle
```

The result is normalized into `[0, 360)`. Holding Shift snaps to 15-degree increments. Rotation updates only `rotation`; point arrays remain in their local frame and are rotated by the existing renderer matrix.

## Hit-Testing Priority

Pointer-down resolution uses this order:

1. Rotation handle of the selected unlocked object.
2. Resize handles of the selected unlocked object.
3. Topmost visible object using rotation-aware local-frame hit-testing.
4. Empty Canvas, which clears selection.

Object hit-testing first transforms the pointer into object-local coordinates, then checks `0 ≤ x ≤ width` and `0 ≤ y ≤ height`. Z-index and insertion-order precedence remain unchanged.

## DOM Table Integration

Tables keep their existing DOM content and editing behavior. Their root receives the same center-based CSS rotation as Canvas objects:

```css
transform: rotate(<rotation>deg);
transform-origin: center center;
```

The old table ring is removed so only the shared SVG overlay represents selection. Table body dragging continues to move the table, while SVG handles own resize and rotation gestures. Editing a table cell prevents table movement but does not alter the shared object geometry.

## Rendering and Layering

Layer order inside the existing relative drawing wrapper:

1. Canvas object content.
2. DOM table objects.
3. Transparent text input control.
4. SVG caret.
5. SVG transform overlay.

The old Canvas selection rectangle is removed to prevent an unrotated duplicate frame. The overlay SVG itself uses `pointer-events: none`; only handle hit targets use `pointer-events: all`.

## Error and Cancellation Rules

- `pointercancel` ends the gesture at the last applied patch and releases capture.
- If the selected object disappears during a gesture, clear the gesture without applying another patch.
- If zoom changes during a gesture, finish or cancel the active gesture before accepting another control interaction.
- Non-finite pointer or matrix results produce no patch.
- Minimum-size clamping prevents zero-size inverse-matrix and point-scaling failures.

## Test Strategy

Pure geometry tests cover:

- Local/world matrix round trips at 0°, 30°, 90°, and 225°.
- Rotated frame corners and handle positions.
- Fixed CSS-pixel handle sizing at 50%, 100%, 150%, and 200% zoom.
- Rotation-aware inside/outside hit-testing and z-order selection.
- Move deltas for regular and line-like objects.
- Corner resize, edge resize, Shift aspect ratio, minimum size, and handle crossing.
- Fixed-anchor invariance during rotated resize.
- Point-array scaling and mirroring.
- Continuous rotation, angle normalization, and Shift 15° snapping.

Component regression tests cover SVG overlay wiring, removal of the old Canvas selection rectangle, table rotation styling, locked-state controls, editing-state suppression, pointer capture, and one `onStartEdit` call per gesture.

Browser verification covers representative Canvas text, connector, wire bundle, dimension, polyline, freehand, table, title block, and technical-requirements objects at multiple zoom and rotation values.

## Acceptance Criteria

- The selected object has one light-blue frame aligned to its rotation.
- Eight resize handles and one rotation handle remain constant in CSS-pixel size at every supported zoom.
- Dragging each handle changes the expected edges while the opposite anchor remains visually fixed.
- Shift preserves aspect ratio for corner resizing and snaps rotation to 15°.
- Crossing an anchor flips the object without negative persisted dimensions.
- Line-like points scale, mirror, and move with their object bounds.
- Rotated objects are selectable only through their rotated local bounds, not the old axis-aligned box.
- Tables visually rotate and share the same transform controls.
- Locked objects cannot be transformed.
- Text caret editing and table cell editing remain functional.
- One complete move, resize, or rotate gesture creates one undo step.
- Existing tests, TypeScript checking, changed-file lint, and production build pass.

## Out of Scope

- Multi-object selection or group transforms.
- Skew handles or perspective transforms.
- Arbitrary transform origins.
- Rotation snapping to nearby objects or guide lines.
- Pixel-level stroke-outline hit-testing for curves.
- A new persisted object schema or migration.

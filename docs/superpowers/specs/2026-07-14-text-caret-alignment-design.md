# Direct Canvas Caret Alignment Design

## Scope

Align the editing caret directly with every editable non-table Canvas text run: text, label, connector, wire bundle, accessory, dimension, title block, and technical requirements. Tables remain on their existing DOM editing path. Selection handles and transform controls are out of scope.

## Root Cause

Canvas rendering and the DOM editor independently encode fonts, baselines, insets, centering, suffixes, maximum widths, zoom, and rotation. Several object editors use generic rectangles that do not match the object-specific Canvas text coordinates. Replacing Canvas text with DOM text only aligns the caret to the replacement, not to the original glyphs.

## Architecture

Create a shared text-layout module that returns the exact editable Canvas text runs for an object field. Both the renderer and caret calculator consume those runs. Each run includes its display prefix/suffix, editable source range, Canvas font, local baseline, local x position, and optional max width.

Keep the original Canvas text visible. A transparent input or textarea captures keyboard input, selection, and IME state with its native caret hidden. The visible caret is an SVG line calculated from `selectionStart`, `measureText()`, `actualBoundingBoxAscent`, and `actualBoundingBoxDescent`. The caret endpoints pass through the same object rotation and canvas zoom as the glyphs. Device pixel ratio remains limited to the Canvas backing store.

## Verification

Unit tests cover object-specific baselines, centered dimensions, wire-bundle suffixes, max-width compression, insertion indices, and rotation. Browser checks cover beginning/middle/end positions, multiple zoom levels, and rotated objects without hiding or replacing Canvas text.

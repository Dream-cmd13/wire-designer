# Text Caret Alignment Design

## Scope

Fix caret alignment only for standalone drawing `text` and `label` objects. Do not add selection handles, resize behavior, or rotation controls.

## Root Cause

Canvas renders these objects with `Arial` and a baseline at `fontSize`, while the transparent native input inherits `system-ui` and uses the full object height as its line box. The editor also omits the object's rotation. Consequently, the visible Canvas glyphs and the native caret are produced by different typography and transform models.

## Design

While a text object is being edited, omit its Canvas rendering and show a single-line `contentEditable` DOM overlay containing the visible text and native caret. The overlay uses the same font family, size, weight, style, direction, spacing, position, zoom, and rotation as the Canvas object. Focus is deferred until `document.fonts.ready`, then the selection is collapsed at the end.

Input updates the drawing object immediately. Blur or Enter commits by leaving edit mode; Escape leaves edit mode without introducing separate selection or transform behavior.

## Verification

- Unit regression checks verify that the editor uses visible `contentEditable` text, waits for fonts, hides only the edited Canvas object, and synchronizes the rotation transform.
- Existing drawing tests, lint, and production build must pass.
- Browser walkthrough verifies `红色222|` at multiple zoom levels and a non-zero rotation.

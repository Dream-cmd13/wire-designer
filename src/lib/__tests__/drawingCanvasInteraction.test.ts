import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const canvasSource = readFileSync(new URL('../../components/drawings/standalone/StandaloneDrawingCanvas.tsx', import.meta.url), 'utf8');
const rendererSource = readFileSync(new URL('../drawingRenderer.ts', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../../pages/DrawingWorkbenchPage.tsx', import.meta.url), 'utf8');

describe('standalone drawing canvas interactions', () => {
  it('supports selection boxes and interactive path tools', () => {
    expect(canvasSource).toContain('selectedObjectIds');
    expect(canvasSource).toContain('getObjectsInSelectionRect');
    expect(canvasSource).toContain('snapOrthogonalPoint');
    expect(canvasSource).toContain('sampleFreehandPoint');
    expect(canvasSource).toContain("toolMode === 'freehand'");
    expect(canvasSource).toContain('onAddObject');
  });

  it('renders grouped resources and public icon paths', () => {
    expect(rendererSource).toContain("object.kind === 'group'");
    expect(rendererSource).toContain("object.kind === 'icon'");
    expect(rendererSource).toContain('new Path2D(object.svgPath)');
  });

  it('suppresses the browser menu and reports canvas hit context', () => {
    expect(canvasSource).toContain('onContextMenuRequest');
    expect(canvasSource).toContain('onContextMenu={handleContextMenu}');
    expect(canvasSource).toContain('event.preventDefault()');
    expect(canvasSource).toContain('getDrawingObjectAtPoint(drawing, point)');
    expect(canvasSource).toContain('clientPoint');
  });

  it('does not start drawing or dragging from a secondary pointer button', () => {
    expect(canvasSource.match(/event\.button !== 0/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('finishes the current path before opening a right-click context menu', () => {
    const contextMenuStart = canvasSource.indexOf('const handleContextMenu');
    const contextMenuEnd = canvasSource.indexOf('const handlePointerDown', contextMenuStart);
    const contextMenuSource = canvasSource.slice(contextMenuStart, contextMenuEnd);

    expect(contextMenuSource).toContain("finalizeActiveDraft('finish')");
    expect(contextMenuSource.indexOf("finalizeActiveDraft('finish')")).toBeLessThan(contextMenuSource.indexOf('onContextMenuRequest?.'));
  });

  it('does not open the context menu while a drawing tool is active', () => {
    const contextMenuStart = canvasSource.indexOf('const handleContextMenu');
    const contextMenuEnd = canvasSource.indexOf('const handlePointerDown', contextMenuStart);
    const contextMenuSource = canvasSource.slice(contextMenuStart, contextMenuEnd);
    const drawingGuard = "if (toolMode !== 'select') return;";

    expect(contextMenuSource).toContain(drawingGuard);
    expect(contextMenuSource.indexOf("finalizeActiveDraft('finish')")).toBeLessThan(contextMenuSource.indexOf(drawingGuard));
    expect(contextMenuSource.indexOf(drawingGuard)).toBeLessThan(contextMenuSource.indexOf('onContextMenuRequest?.'));
  });

  it('creates a dot from a freehand click while preserving drag drawing', () => {
    expect(canvasSource).not.toContain('freehandClickAnchor');
    expect(canvasSource).toContain("onAddObject?.(createDrawingLineObject('freehand', draftPoints))");
    expect(canvasSource).toContain('event.buttons === 1');
    expect(rendererSource).toContain('context.arc');
  });

  it('only shows transform controls in selection mode and routes path double-clicks to property editing', () => {
    expect(canvasSource).toContain("toolMode === 'select' && activeTransformObject");
    expect(canvasSource).toContain('onEditLineRequest');
    expect(canvasSource).toContain('onEditLineRequest?.(object.id)');
  });

  it('uses a crosshair cursor only while a drawing tool is active', () => {
    expect(canvasSource).toContain("toolMode !== 'select' ? 'cursor-crosshair' : ''");
  });

  it('routes wheel input by the current selected-object hit area', () => {
    expect(canvasSource).toContain('onWheel={handleWheel}');
    expect(canvasSource).toContain('containsDrawingPoint(activeTransformObject, point)');
    expect(canvasSource).toContain('selectedObject.locked');
    expect(canvasSource).toContain('onCanvasZoom?.(clampDrawingZoom');
    expect(canvasSource).toContain('onScaleObject?.(');
    expect(pageSource).toContain('const [zoom, setZoom] = useState(0.72)');
    expect(pageSource).toContain('wheelGestureRef');
  });

  it('routes wheel scaling to an active table cell or text target', () => {
    expect(canvasSource).toContain('onScaleTableTarget?.(');
    expect(canvasSource).toContain('containsDrawingPoint(activeTransformObject, point)');
    expect(pageSource).toContain('scaleTableTarget');
    expect(pageSource).toContain('resizeDrawingTableCell');
    expect(pageSource).toContain('resizeDrawingTableText');
  });
});

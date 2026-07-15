import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const canvasSource = readFileSync(new URL('../../components/drawings/standalone/StandaloneDrawingCanvas.tsx', import.meta.url), 'utf8');
const rendererSource = readFileSync(new URL('../drawingRenderer.ts', import.meta.url), 'utf8');

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
});

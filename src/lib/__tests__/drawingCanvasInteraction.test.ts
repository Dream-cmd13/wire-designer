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
});

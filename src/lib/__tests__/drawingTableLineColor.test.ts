import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererFiles = [
  'src/components/drawings/standalone/StandaloneDrawingCanvas.tsx',
  'src/lib/drawingRenderer.ts',
  'src/components/drawings/workbench/DrawingCanvas.tsx',
];

describe('drawing table line color', () => {
  it('shares #181818 across every table renderer', () => {
    const layoutSource = readFileSync(resolve(process.cwd(), 'src/lib/drawingTableLayout.ts'), 'utf8');

    expect(layoutSource).toContain("export const DRAWING_TABLE_LINE_COLOR = '#181818'");
    rendererFiles.forEach((file) => {
      expect(readFileSync(resolve(process.cwd(), file), 'utf8')).toContain('DRAWING_TABLE_LINE_COLOR');
    });
  });
});

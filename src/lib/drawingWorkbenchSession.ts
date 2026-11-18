export type DrawingWorkbenchEntry = 'create' | 'resume';

export function enterDrawingWorkbench(hasExistingDrawing: boolean): DrawingWorkbenchEntry {
  return hasExistingDrawing ? 'resume' : 'create';
}

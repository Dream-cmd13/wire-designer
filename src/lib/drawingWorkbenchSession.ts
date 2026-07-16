export type DrawingWorkbenchEntry = 'create' | 'resume' | 'confirm';

let enteredThisRuntime = false;

export function enterDrawingWorkbench(hasExistingDrawing: boolean): DrawingWorkbenchEntry {
  if (enteredThisRuntime) return hasExistingDrawing ? 'resume' : 'create';
  enteredThisRuntime = true;
  return hasExistingDrawing ? 'confirm' : 'create';
}

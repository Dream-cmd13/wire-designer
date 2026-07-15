import type { DrawingTableLocalTarget } from '../types/drawing';

export type DrawingTablePointerHit = 'table' | 'cell' | 'text';
export type DrawingTablePointerAction = 'move-table' | 'select-cell' | 'move-text';

export function resolveTablePointerAction(
  selected: boolean,
  activeTarget: DrawingTableLocalTarget | null,
  hit: DrawingTablePointerHit,
): DrawingTablePointerAction {
  if ((selected && !activeTarget) || hit === 'table') return 'move-table';
  return hit === 'text' ? 'move-text' : 'select-cell';
}

export function resolveTableDoubleClickAction(
  activeTarget: DrawingTableLocalTarget | null,
  target: DrawingTableLocalTarget,
): 'select-local' | 'edit-text' {
  const isSameText = target.kind === 'table-text'
    && activeTarget?.kind === 'table-text'
    && activeTarget.objectId === target.objectId
    && activeTarget.key === target.key;
  return isSameText ? 'edit-text' : 'select-local';
}

import type { MaterialAccessoryKind } from './MaterialAccessoryDialog';
import type { MaterialEndpoint } from '@/types/harness';

export interface MaterialAccessoryDialogRequest {
  materialId: string;
  kind: MaterialAccessoryKind;
  accessoryId?: string;
  circuitId?: string;
  endpoint?: MaterialEndpoint;
}

export interface MaterialAccessoryContextMenuRequest extends MaterialAccessoryDialogRequest {
  x: number;
  y: number;
}

let dialogHandler: ((request: MaterialAccessoryDialogRequest) => void) | null = null;
let contextMenuHandler: ((request: MaterialAccessoryContextMenuRequest) => void) | null = null;

export function setMaterialAccessoryDialogHandler(
  nextHandler: ((request: MaterialAccessoryDialogRequest) => void) | null,
) {
  dialogHandler = nextHandler;
}

export function openMaterialAccessoryDialog(request: MaterialAccessoryDialogRequest) {
  dialogHandler?.(request);
}

export function setMaterialAccessoryContextMenuHandler(
  nextHandler: ((request: MaterialAccessoryContextMenuRequest) => void) | null,
) {
  contextMenuHandler = nextHandler;
}

export function openMaterialAccessoryContextMenu(request: MaterialAccessoryContextMenuRequest) {
  contextMenuHandler?.(request);
}

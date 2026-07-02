// Lightweight module-level bridge so ConnectorNode's jumper SVG arcs
// (which are drawn as overlays inside the node, NOT as React Flow edges)
// can trigger HarnessCanvas's context menu without prop drilling.

type JumperContextMenuHandler = (jumperId: string, x: number, y: number) => void;

let handler: JumperContextMenuHandler | null = null;

export function setJumperContextMenuHandler(fn: JumperContextMenuHandler | null): void {
  handler = fn;
}

export function showJumperContextMenu(jumperId: string, x: number, y: number): void {
  handler?.(jumperId, x, y);
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BringToFront, ClipboardPaste, Copy, Lock, Scissors, SendToBack, Trash2, Unlock } from 'lucide-react';

interface DrawingCanvasContextMenuProps {
  target: 'canvas' | 'object';
  x: number;
  y: number;
  canPaste: boolean;
  canCopy: boolean;
  canDelete: boolean;
  canCrop: boolean;
  canChangeLayer: boolean;
  canToggleLock: boolean;
  locked: boolean;
  onPaste: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onCrop: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onToggleLock: () => void;
  onClose: () => void;
}

const menuItemClass = 'flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-700';

export function DrawingCanvasContextMenu({
  target,
  x,
  y,
  canPaste,
  canCopy,
  canDelete,
  canCrop,
  canChangeLayer,
  canToggleLock,
  locked,
  onPaste,
  onCopy,
  onDelete,
  onCrop,
  onBringToFront,
  onSendToBack,
  onToggleLock,
  onClose,
}: DrawingCanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ x, y });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const padding = 8;
    setPosition({
      x: Math.max(padding, Math.min(x, window.innerWidth - menu.offsetWidth - padding)),
      y: Math.max(padding, Math.min(y, window.innerHeight - menu.offsetHeight - padding)),
    });
  }, [x, y, target]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  return <div
    ref={menuRef}
    role="menu"
    aria-label={target === 'canvas' ? '画布右键菜单' : '实体右键菜单'}
    className="fixed z-50 min-w-40 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl"
    style={{ left: position.x, top: position.y }}
    onContextMenu={(event) => event.preventDefault()}
  >
    {target === 'canvas' ? <button role="menuitem" type="button" disabled={!canPaste} onClick={run(onPaste)} className={menuItemClass}>
      <ClipboardPaste className="h-4 w-4"/>粘贴
    </button> : <>
      <button role="menuitem" type="button" disabled={!canCopy} onClick={run(onCopy)} className={menuItemClass}><Copy className="h-4 w-4"/>复制</button>
      <button role="menuitem" type="button" disabled={!canDelete} onClick={run(onDelete)} className={menuItemClass}><Trash2 className="h-4 w-4"/>删除</button>
      <button role="menuitem" type="button" disabled={!canCrop} onClick={run(onCrop)} className={menuItemClass}><Scissors className="h-4 w-4"/>裁剪</button>
      <div className="my-1 border-t border-slate-100"/>
      <button role="menuitem" type="button" disabled={!canChangeLayer} onClick={run(onBringToFront)} className={menuItemClass}><BringToFront className="h-4 w-4"/>移到顶层</button>
      <button role="menuitem" type="button" disabled={!canChangeLayer} onClick={run(onSendToBack)} className={menuItemClass}><SendToBack className="h-4 w-4"/>移到底层</button>
      <button role="menuitem" type="button" disabled={!canToggleLock} onClick={run(onToggleLock)} className={menuItemClass}>
        {locked ? <Unlock className="h-4 w-4"/> : <Lock className="h-4 w-4"/>}{locked ? '解锁' : '锁定'}
      </button>
    </>}
  </div>;
}

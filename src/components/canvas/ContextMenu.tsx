import { useEffect, useRef, useState } from 'react';
import {
  Plus, Edit3, Copy, Trash2, Cable, Maximize2, Eye, Layers3,
} from 'lucide-react';

export interface ContextMenuState {
  x: number;
  y: number;
  kind: 'pane' | 'node' | 'connection' | 'wire' | 'material' | 'sleeve' | 'attachment';
  nodeId?: string;
  connectionId?: string;
  wireId?: string;
  materialId?: string;
  sleeveId?: string;
  attachmentId?: string;
  flowPosition?: { x: number; y: number };
}

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  onAddConnector: () => void;
  onAddCanvasWire: () => void;
  onAddProtectiveSleeve: (materialId?: string) => void;
  onEditNode: (nodeId: string) => void;
  onChangeConnector: (nodeId: string) => void;
  onCopyNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onEditConnection: (connectionId: string) => void;
  onAddWire: (connectionId: string) => void;
  onDeleteConnection: (connectionId: string) => void;
  onEditWire: (wireId: string) => void;
  onDeleteWire: (wireId: string) => void;
  onEditMaterial: (materialId: string) => void;
  onDeleteMaterial: (materialId: string) => void;
  onEditSleeve: (sleeveId: string) => void;
  onDeleteSleeve: (sleeveId: string) => void;
  onDeleteAttachment: (attachmentId: string) => void;
  onFitView: () => void;
  hasSelection: boolean;
}

function MenuItem({ icon, label, onClick, destructive }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-100 transition-colors cursor-pointer ${
        destructive ? 'text-red-600 hover:bg-red-50' : 'text-slate-700'
      }`}
      type="button"
    >
      <span className="w-4 h-4 shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function menuAction(action: () => void, onClose: () => void): () => void {
  return () => { action(); onClose(); };
}

export function ContextMenu({
  state,
  onClose,
  onAddConnector,
  onAddCanvasWire,
  onAddProtectiveSleeve,
  onEditNode,
  onChangeConnector,
  onCopyNode,
  onDeleteNode,
  onEditConnection,
  onAddWire,
  onDeleteConnection,
  onEditWire,
  onDeleteWire,
  onEditMaterial,
  onDeleteMaterial,
  onEditSleeve,
  onDeleteSleeve,
  onDeleteAttachment,
  onFitView,
  hasSelection,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x: state.x, y: state.y });

  // Adjust position to stay within viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewW = window.innerWidth;
      const viewH = window.innerHeight;
      let x = state.x;
      let y = state.y;
      if (x + rect.width > viewW) x = viewW - rect.width - 8;
      if (y + rect.height > viewH) y = viewH - rect.height - 8;
      if (x < 0) x = 8;
      if (y < 0) y = 8;
      setAdjustedPos({ x, y });
    }
  }, [state.x, state.y]);

  // Close on Esc
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delayed to avoid the context menu event itself triggering close
    setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => document.removeEventListener('click', handleClick);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed bg-white rounded-lg shadow-xl border border-slate-200 py-1 min-w-[180px] z-50"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      {state.kind === 'pane' && (
        <>
          <MenuItem icon={<Plus className="w-4 h-4" />} label="添加连接器" onClick={menuAction(onAddConnector, onClose)} />
          <MenuItem icon={<Cable className="w-4 h-4" />} label="添加线材" onClick={menuAction(onAddCanvasWire, onClose)} />
          <MenuItem icon={<Layers3 className="w-4 h-4" />} label="添加保护套" onClick={menuAction(() => onAddProtectiveSleeve(), onClose)} />
          {hasSelection && (
            <>
              <div className="border-t border-slate-100 my-1" />
              <MenuItem icon={<Copy className="w-4 h-4" />} label="粘贴" onClick={onClose} />
            </>
          )}
          <div className="border-t border-slate-100 my-1" />
          <MenuItem icon={<Maximize2 className="w-4 h-4" />} label="适配画布" onClick={menuAction(onFitView, onClose)} />
        </>
      )}

      {state.kind === 'node' && state.nodeId && (
        <>
          <MenuItem icon={<Edit3 className="w-4 h-4" />} label="编辑属性" onClick={menuAction(() => onEditNode(state.nodeId!), onClose)} />
          <MenuItem icon={<Eye className="w-4 h-4" />} label="更换连接器型号" onClick={menuAction(() => onChangeConnector(state.nodeId!), onClose)} />
          <MenuItem icon={<Cable className="w-4 h-4" />} label="发起连接" onClick={onClose} />
          <div className="border-t border-slate-100 my-1" />
          <MenuItem icon={<Copy className="w-4 h-4" />} label="复制节点" onClick={menuAction(() => onCopyNode(state.nodeId!), onClose)} />
          <div className="border-t border-slate-100 my-1" />
          <MenuItem icon={<Trash2 className="w-4 h-4" />} label="删除节点" onClick={menuAction(() => onDeleteNode(state.nodeId!), onClose)} destructive />
        </>
      )}

      {state.kind === 'connection' && state.connectionId && (
        <>
          <MenuItem icon={<Edit3 className="w-4 h-4" />} label="编辑连接" onClick={menuAction(() => onEditConnection(state.connectionId!), onClose)} />
          <MenuItem icon={<Plus className="w-4 h-4" />} label="添加导线" onClick={menuAction(() => onAddWire(state.connectionId!), onClose)} />
          <div className="border-t border-slate-100 my-1" />
          <MenuItem icon={<Trash2 className="w-4 h-4" />} label="删除连接" onClick={menuAction(() => onDeleteConnection(state.connectionId!), onClose)} destructive />
        </>
      )}

      {state.kind === 'wire' && state.wireId && (
        <>
          <MenuItem icon={<Edit3 className="w-4 h-4" />} label="编辑导线" onClick={menuAction(() => onEditWire(state.wireId!), onClose)} />
          <MenuItem icon={<Copy className="w-4 h-4" />} label="复制导线" onClick={onClose} />
          <div className="border-t border-slate-100 my-1" />
          <MenuItem icon={<Trash2 className="w-4 h-4" />} label="删除导线" onClick={menuAction(() => onDeleteWire(state.wireId!), onClose)} destructive />
        </>
      )}

      {state.kind === 'material' && state.materialId && (
        <>
          {state.connectionId && (
            <>
              <MenuItem icon={<Edit3 className="w-4 h-4" />} label="编辑线材信息" onClick={menuAction(() => onEditConnection(state.connectionId!), onClose)} />
              <MenuItem icon={<Plus className="w-4 h-4" />} label="添加导线" onClick={menuAction(() => onAddWire(state.connectionId!), onClose)} />
            </>
          )}
          <MenuItem icon={<Edit3 className="w-4 h-4" />} label="编辑线材参数" onClick={menuAction(() => onEditMaterial(state.materialId!), onClose)} />
          <MenuItem icon={<Layers3 className="w-4 h-4" />} label="添加保护套" onClick={menuAction(() => onAddProtectiveSleeve(state.materialId!), onClose)} />
          <div className="border-t border-slate-100 my-1" />
          <MenuItem
            icon={<Trash2 className="w-4 h-4" />}
            label="删除线材"
            onClick={menuAction(
              () => state.connectionId
                ? onDeleteConnection(state.connectionId!)
                : onDeleteMaterial(state.materialId!),
              onClose,
            )}
            destructive
          />
        </>
      )}

      {state.kind === 'sleeve' && state.sleeveId && (
        <>
          <MenuItem icon={<Edit3 className="w-4 h-4" />} label="编辑保护套" onClick={menuAction(() => onEditSleeve(state.sleeveId!), onClose)} />
          <div className="border-t border-slate-100 my-1" />
          <MenuItem icon={<Trash2 className="w-4 h-4" />} label="删除保护套" onClick={menuAction(() => onDeleteSleeve(state.sleeveId!), onClose)} destructive />
        </>
      )}

      {state.kind === 'attachment' && state.attachmentId && (
        <MenuItem icon={<Trash2 className="w-4 h-4" />} label="断开连接" onClick={menuAction(() => onDeleteAttachment(state.attachmentId!), onClose)} destructive />
      )}
    </div>
  );
}

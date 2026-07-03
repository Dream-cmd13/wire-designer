import { useEffect, useRef, useState } from 'react';
import {
  Plus, Edit3, Copy, Trash2, Cable, Maximize2, Eye, Layers3, Box, Hash, Tag,
} from 'lucide-react';

export interface ContextMenuState {
  x: number;
  y: number;
  kind: 'pane' | 'connector' | 'material' | 'sleeve' | 'attachment' | 'jumper';
  connectorId?: string;
  materialId?: string;
  sleeveId?: string;
  attachmentId?: string;
  /** For attachment: {materialId}:{circuitId}:{side} */
  jumperId?: string;
  flowPosition?: { x: number; y: number };
}

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  onAddConnector: () => void;
  onAddCanvasWire: () => void;
  onAddProtectiveSleeve: (materialId?: string) => void;
  onAddModel: () => void;
  onAddMaterialLabel: (materialId: string) => void;
  onAddMaterialNumberTube: (materialId: string) => void;
  onEditConnector: (connectorId: string) => void;
  onChangeConnector: (connectorId: string) => void;
  onCopyConnector: (connectorId: string) => void;
  onDeleteConnector: (connectorId: string) => void;
  onEditMaterial: (materialId: string) => void;
  onDeleteMaterial: (materialId: string) => void;
  onEditSleeve: (sleeveId: string) => void;
  onDeleteSleeve: (sleeveId: string) => void;
  onDetachEndpoint: (attachmentId: string) => void;
  onDeleteJumper: (jumperId: string) => void;
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
  onAddModel,
  onAddMaterialLabel,
  onAddMaterialNumberTube,
  onEditConnector,
  onChangeConnector,
  onCopyConnector,
  onDeleteConnector,
  onEditMaterial,
  onDeleteMaterial,
  onEditSleeve,
  onDeleteSleeve,
  onDetachEndpoint,
  onDeleteJumper,
  onFitView,
  hasSelection,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x: state.x, y: state.y });

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

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
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
          <MenuItem icon={<Box className="w-4 h-4" />} label="添加模型" onClick={menuAction(onAddModel, onClose)} />
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

      {state.kind === 'connector' && state.connectorId && (
        <>
          <MenuItem icon={<Edit3 className="w-4 h-4" />} label="编辑属性" onClick={menuAction(() => onEditConnector(state.connectorId!), onClose)} />
          <MenuItem icon={<Eye className="w-4 h-4" />} label="更换连接器型号" onClick={menuAction(() => onChangeConnector(state.connectorId!), onClose)} />
          <div className="border-t border-slate-100 my-1" />
          <MenuItem icon={<Copy className="w-4 h-4" />} label="复制连接器" onClick={menuAction(() => onCopyConnector(state.connectorId!), onClose)} />
          <div className="border-t border-slate-100 my-1" />
          <MenuItem icon={<Trash2 className="w-4 h-4" />} label="删除连接器" onClick={menuAction(() => onDeleteConnector(state.connectorId!), onClose)} destructive />
        </>
      )}

      {state.kind === 'material' && state.materialId && (
        <>
          <MenuItem icon={<Edit3 className="w-4 h-4" />} label="编辑线材参数" onClick={menuAction(() => onEditMaterial(state.materialId!), onClose)} />
          <MenuItem icon={<Layers3 className="w-4 h-4" />} label="添加保护套" onClick={menuAction(() => onAddProtectiveSleeve(state.materialId!), onClose)} />
          <MenuItem icon={<Tag className="w-4 h-4" />} label="添加标签" onClick={menuAction(() => onAddMaterialLabel(state.materialId!), onClose)} />
          <MenuItem icon={<Hash className="w-4 h-4" />} label="添加号码管" onClick={menuAction(() => onAddMaterialNumberTube(state.materialId!), onClose)} />
          <div className="border-t border-slate-100 my-1" />
          <MenuItem icon={<Trash2 className="w-4 h-4" />} label="删除线材" onClick={menuAction(() => onDeleteMaterial(state.materialId!), onClose)} destructive />
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
        <MenuItem icon={<Trash2 className="w-4 h-4" />} label="断开连接" onClick={menuAction(() => onDetachEndpoint(state.attachmentId!), onClose)} destructive />
      )}

      {state.kind === 'jumper' && state.jumperId && (
        <MenuItem icon={<Trash2 className="w-4 h-4" />} label="删除短接" onClick={menuAction(() => onDeleteJumper(state.jumperId!), onClose)} destructive />
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Cable,
  Copy,
  Edit3,
  Eye,
  Hash,
  Layers3,
  Maximize2,
  Plus,
  Tag,
  Trash2,
} from 'lucide-react';

export interface ContextMenuState {
  x: number;
  y: number;
  kind: 'pane' | 'connector' | 'material' | 'sleeve' | 'model' | 'attachment' | 'jumper';
  connectorId?: string;
  materialId?: string;
  sleeveId?: string;
  modelId?: string;
  attachmentId?: string;
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
  onDeleteModel: (modelId: string) => void;
  onDetachEndpoint: (attachmentId: string) => void;
  onDeleteJumper: (jumperId: string) => void;
  onFitView: () => void;
  hasSelection: boolean;
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100 ${
        destructive ? 'text-red-600 hover:bg-red-50' : 'text-slate-700'
      }`}
    >
      <span className="h-4 w-4 shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function menuAction(action: () => void, onClose: () => void): () => void {
  return () => {
    action();
    onClose();
  };
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
  onDeleteModel,
  onDetachEndpoint,
  onDeleteJumper,
  onFitView,
  hasSelection,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x: state.x, y: state.y });

  useEffect(() => {
    if (!menuRef.current) return;
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
  }, [state.x, state.y]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => document.removeEventListener('click', handleClick);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      {state.kind === 'pane' && (
        <>
          <MenuItem icon={<Plus className="h-4 w-4" />} label="添加连接器" onClick={menuAction(onAddConnector, onClose)} />
          <MenuItem icon={<Cable className="h-4 w-4" />} label="添加线材" onClick={menuAction(onAddCanvasWire, onClose)} />
          <MenuItem icon={<Layers3 className="h-4 w-4" />} label="添加保护套" onClick={menuAction(() => onAddProtectiveSleeve(), onClose)} />
          <MenuItem icon={<Box className="h-4 w-4" />} label="添加模型" onClick={menuAction(onAddModel, onClose)} />
          {hasSelection && (
            <>
              <div className="my-1 border-t border-slate-100" />
              <MenuItem icon={<Copy className="h-4 w-4" />} label="粘贴" onClick={onClose} />
            </>
          )}
          <div className="my-1 border-t border-slate-100" />
          <MenuItem icon={<Maximize2 className="h-4 w-4" />} label="适配画布" onClick={menuAction(onFitView, onClose)} />
        </>
      )}

      {state.kind === 'connector' && state.connectorId && (
        <>
          <MenuItem icon={<Edit3 className="h-4 w-4" />} label="编辑属性" onClick={menuAction(() => onEditConnector(state.connectorId!), onClose)} />
          <MenuItem icon={<Eye className="h-4 w-4" />} label="更换连接器型号" onClick={menuAction(() => onChangeConnector(state.connectorId!), onClose)} />
          <div className="my-1 border-t border-slate-100" />
          <MenuItem icon={<Copy className="h-4 w-4" />} label="复制连接器" onClick={menuAction(() => onCopyConnector(state.connectorId!), onClose)} />
          <div className="my-1 border-t border-slate-100" />
          <MenuItem icon={<Trash2 className="h-4 w-4" />} label="删除连接器" onClick={menuAction(() => onDeleteConnector(state.connectorId!), onClose)} destructive />
        </>
      )}

      {state.kind === 'material' && state.materialId && (
        <>
          <MenuItem icon={<Edit3 className="h-4 w-4" />} label="编辑线材参数" onClick={menuAction(() => onEditMaterial(state.materialId!), onClose)} />
          <MenuItem icon={<Layers3 className="h-4 w-4" />} label="添加保护套" onClick={menuAction(() => onAddProtectiveSleeve(state.materialId!), onClose)} />
          <MenuItem icon={<Tag className="h-4 w-4" />} label="添加标签" onClick={menuAction(() => onAddMaterialLabel(state.materialId!), onClose)} />
          <MenuItem icon={<Hash className="h-4 w-4" />} label="添加号码管" onClick={menuAction(() => onAddMaterialNumberTube(state.materialId!), onClose)} />
          <div className="my-1 border-t border-slate-100" />
          <MenuItem icon={<Trash2 className="h-4 w-4" />} label="删除线材" onClick={menuAction(() => onDeleteMaterial(state.materialId!), onClose)} destructive />
        </>
      )}

      {state.kind === 'sleeve' && state.sleeveId && (
        <>
          <MenuItem icon={<Edit3 className="h-4 w-4" />} label="编辑保护套" onClick={menuAction(() => onEditSleeve(state.sleeveId!), onClose)} />
          <div className="my-1 border-t border-slate-100" />
          <MenuItem icon={<Trash2 className="h-4 w-4" />} label="删除保护套" onClick={menuAction(() => onDeleteSleeve(state.sleeveId!), onClose)} destructive />
        </>
      )}

      {state.kind === 'model' && state.modelId && (
        <MenuItem icon={<Trash2 className="h-4 w-4" />} label="删除外模" onClick={menuAction(() => onDeleteModel(state.modelId!), onClose)} destructive />
      )}

      {state.kind === 'attachment' && state.attachmentId && (
        <MenuItem icon={<Trash2 className="h-4 w-4" />} label="断开连接" onClick={menuAction(() => onDetachEndpoint(state.attachmentId!), onClose)} destructive />
      )}

      {state.kind === 'jumper' && state.jumperId && (
        <MenuItem icon={<Trash2 className="h-4 w-4" />} label="删除短接" onClick={menuAction(() => onDeleteJumper(state.jumperId!), onClose)} destructive />
      )}
    </div>
  );
}

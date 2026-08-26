import { RotateCcw } from 'lucide-react';
import { ActionToast } from './ActionToast';

interface UndoToastProps {
  message: string;
  canUndo: boolean;
  onUndo: () => void;
  onClose: () => void;
  position?: 'top' | 'center';
}

export function UndoToast({ message, canUndo, onUndo, onClose, position = 'center' }: UndoToastProps) {
  return (
    <ActionToast
      message={message}
      position={position}
      primaryAction={{
        label: '撤销',
        onClick: onUndo,
        disabled: !canUndo,
        title: canUndo ? '恢复刚刚删除的对象' : '设计已继续修改，请使用全局撤销',
        icon: <RotateCcw className="h-3.5 w-3.5" />,
      }}
      onClose={onClose}
    />
  );
}


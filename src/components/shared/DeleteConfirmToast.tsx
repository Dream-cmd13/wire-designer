import { Trash2 } from 'lucide-react';
import { ActionToast } from './ActionToast';

interface DeleteConfirmToastProps {
  title?: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  position?: 'top' | 'center';
}

export function DeleteConfirmToast({
  title = '确认删除',
  message,
  confirmLabel = '删除',
  onConfirm,
  onCancel,
  position = 'center',
}: DeleteConfirmToastProps) {
  return (
    <ActionToast
      role="alertdialog"
      tone="danger"
      position={position}
      title={title}
      message={message}
      primaryAction={{
        label: confirmLabel,
        onClick: onConfirm,
        destructive: true,
        icon: <Trash2 className="h-3.5 w-3.5" />,
      }}
      secondaryAction={{ label: '取消', onClick: onCancel }}
      onClose={onCancel}
    />
  );
}


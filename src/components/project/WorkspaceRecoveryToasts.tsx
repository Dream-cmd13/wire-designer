import { ActionToast } from '@/components/shared/ActionToast';
import type { CorruptWorkspaceDraft, WorkspaceDraft } from '@/lib/workspaceDraftCache';
import type { SaveState } from '@/types/harness';

export interface WorkspaceRecoveryToastsProps {
  isEditingCurrentProject: boolean;
  currentProjectId?: string;
  saveState: SaveState;
  switchConfirmOpen: boolean;
  activeDraftRecovery: { ownerId: string; projectId: string; draft: WorkspaceDraft } | null;
  saveConflict: { projectId: string; kind: 'conflict' | 'missing' } | null;
  conflictReadConfirmOpen: boolean;
  conflictResolving: boolean;
  activeCorruptDrafts: CorruptWorkspaceDraft[];
  onResolveSwitchConfirmation: (confirmed: boolean) => void;
  onUseCloudVersion: () => void;
  onRestoreLocalDraft: () => void;
  onDismissDraftRecovery: () => void;
  onResolveConflictSaveAsNew: () => void;
  onOpenConflictReadConfirm: () => void;
  onDownloadLocalCopy: () => void;
  onCancelConflictReadConfirm: () => void;
  onConfirmConflictReadCloud: () => void;
  onDiscardCorruptDrafts: () => void;
  onDownloadCorruptDrafts: () => void;
  onDismissCorruptDrafts: () => void;
}

export function WorkspaceRecoveryToasts({
  isEditingCurrentProject,
  currentProjectId,
  saveState,
  switchConfirmOpen,
  activeDraftRecovery,
  saveConflict,
  conflictReadConfirmOpen,
  conflictResolving,
  activeCorruptDrafts,
  onResolveSwitchConfirmation,
  onUseCloudVersion,
  onRestoreLocalDraft,
  onDismissDraftRecovery,
  onResolveConflictSaveAsNew,
  onOpenConflictReadConfirm,
  onDownloadLocalCopy,
  onCancelConflictReadConfirm,
  onConfirmConflictReadCloud,
  onDiscardCorruptDrafts,
  onDownloadCorruptDrafts,
  onDismissCorruptDrafts,
}: WorkspaceRecoveryToastsProps) {
  return (
    <>
      {switchConfirmOpen && (
        <ActionToast
          role="alertdialog"
          title="有未保存的修改"
          message="当前工作区有未保存修改。确定保存后切换账号吗？"
          secondaryAction={{ label: '取消', onClick: () => onResolveSwitchConfirmation(false) }}
          primaryAction={{ label: '保存并切换', onClick: () => onResolveSwitchConfirmation(true) }}
          onClose={() => onResolveSwitchConfirmation(false)}
        />
      )}

      {isEditingCurrentProject && activeDraftRecovery && (
        <ActionToast
          role="alertdialog"
          title="发现本地草稿"
          message="本地保存了未同步到云端的项目修改。请先保存当前修改，再恢复草稿。使用云端版本会丢弃当前草稿及其恢复备份，其他独立草稿仍会保留。"
          secondaryAction={{
            label: '使用云端版本',
            onClick: onUseCloudVersion,
          }}
          primaryAction={{
            label: '恢复本地草稿',
            disabled: saveState.status !== 'saved' || Boolean(saveConflict),
            onClick: onRestoreLocalDraft,
          }}
          onClose={onDismissDraftRecovery}
        />
      )}

      {isEditingCurrentProject && saveConflict && saveConflict.projectId === currentProjectId && (
        <ActionToast
          role="alertdialog"
          tone="danger"
          title={saveConflict.kind === 'conflict' ? '保存冲突' : '云端文档已删除'}
          message={saveConflict.kind === 'conflict'
            ? '云端已有其他窗口/设备保存的更新版本，自动保存已暂停，本地修改仍保留。请选择处理方式；不会自动覆盖云端。'
            : '该文档已在云端被删除，保存不会复活旧记录，本地修改仍保留。请下载本地副本或另存为新文档。'}
          tertiaryAction={{
            label: '另存为新文档',
            disabled: conflictResolving,
            onClick: onResolveConflictSaveAsNew,
          }}
          secondaryAction={{
            label: '读取云端版本',
            disabled: conflictResolving,
            onClick: onOpenConflictReadConfirm,
          }}
          primaryAction={{
            label: '下载本地副本',
            onClick: onDownloadLocalCopy,
          }}
          onClose={() => undefined}
        />
      )}

      {isEditingCurrentProject && conflictReadConfirmOpen && (
        <ActionToast
          role="alertdialog"
          tone="danger"
          title="读取云端版本会替换本地内容"
          message="读取云端最新版本后，本地未保存的项目修改会被替换且无法撤销。确定继续吗？"
          secondaryAction={{
            label: '取消',
            onClick: onCancelConflictReadConfirm,
          }}
          primaryAction={{
            label: conflictResolving ? '读取中...' : '确定读取云端',
            destructive: true,
            disabled: conflictResolving,
            onClick: onConfirmConflictReadCloud,
          }}
          onClose={onCancelConflictReadConfirm}
        />
      )}

      {isEditingCurrentProject && activeCorruptDrafts.length > 0 && !activeDraftRecovery && (
        <ActionToast
          role="alertdialog"
          tone="danger"
          title="发现损坏的本地项目草稿"
          message={`本地保存的未同步修改无法解析（共 ${activeCorruptDrafts.length} 份），原始内容仍保留在本地。${activeCorruptDrafts.some((entry) => !entry.isolated) ? '部分内容因本地存储空间不足未能转入隔离区，请先下载备份。' : '建议先下载备份，再决定是否丢弃。'}`}
          secondaryAction={{
            label: '丢弃草稿',
            destructive: true,
            onClick: onDiscardCorruptDrafts,
          }}
          primaryAction={{
            label: '下载原始内容',
            onClick: onDownloadCorruptDrafts,
          }}
          onClose={onDismissCorruptDrafts}
        />
      )}
    </>
  );
}

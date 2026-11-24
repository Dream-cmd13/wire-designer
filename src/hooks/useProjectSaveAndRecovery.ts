import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { appRoutes } from '@/lib/appRoute';
import { downloadTextFile, safeFilename } from '@/lib/designFile';
import { DocumentWriteError } from '@/lib/documentWriteError';
import { getUserErrorMessage, UserFacingError } from '@/lib/userErrorMessage';
import {
  canApplyWorkspaceDraft,
  corruptWorkspaceDraftsToJson,
  currentDraftInstanceId,
  listCorruptWorkspaceDrafts,
  nextProjectRecoveryDraft,
  removeCorruptWorkspaceDraft,
  removeProjectRecoveryDraft,
  removeWorkspaceDraftForInstance,
  writeWorkspaceDraft,
  type CorruptWorkspaceDraft,
  type WorkspaceDraft,
} from '@/lib/workspaceDraftCache';
import { projectRepository } from '@/repositories/projectRepository';
import { flushDrawingDrafts, type DrawingSaveState } from '@/stores/drawingStore';
import { useHarnessStore } from '@/stores/harnessStore';
import { useHistoryStore } from '@/stores/historyStore';
import { notify } from '@/stores/noticeStore';
import { useProjectStore } from '@/stores/projectStore';
import { useUserStore } from '@/stores/userStore';
import type { DocumentVersion } from '@/types/document';
import type { HarnessConfig, SaveState } from '@/types/harness';
import type { Project, User } from '@/types/user';

interface UseProjectSaveAndRecoveryOptions {
  currentUser: User | null;
  currentUserId?: string;
  currentProject: Project | null;
  config: HarnessConfig;
  saveState: SaveState;
  drawingSaveState: DrawingSaveState;
  saveActiveDrawing: () => Promise<void>;
  createProject: (
    userId: string,
    name: string,
    description: string,
    initialConfig: HarnessConfig,
    options?: { activate?: boolean },
  ) => Promise<{ project: Project; version: DocumentVersion } | null>;
  saveCurrentConfig: (config: HarnessConfig) => Promise<void>;
  setCurrentProject: (project: Project | null) => void;
  setCurrentProjectVersion: (version: DocumentVersion | null) => void;
  replaceDocument: (fullConfig: HarnessConfig, options?: { markSaved?: boolean; userEdit?: boolean }) => void;
  markSaving: () => void;
  markSaved: () => void;
  markSaveError: (message: string) => void;
  workspaceSessionRef: MutableRefObject<number>;
  navigate: (path: string, options?: { projectId?: string | null; replace?: boolean }) => void;
}

export function useProjectSaveAndRecovery({
  currentUser,
  currentUserId,
  currentProject,
  config,
  saveState,
  drawingSaveState,
  saveActiveDrawing,
  createProject,
  saveCurrentConfig,
  setCurrentProject,
  setCurrentProjectVersion,
  replaceDocument,
  markSaving,
  markSaved,
  markSaveError,
  workspaceSessionRef,
  navigate,
}: UseProjectSaveAndRecoveryOptions) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recoveryRaw, setRecoveryRaw] = useState<string | null>(null);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const restoredDraftRef = useRef<{ draft: WorkspaceDraft; backupInstanceId: string } | null>(null);
  const [draftRecovery, setDraftRecovery] = useState<{
    ownerId: string;
    projectId: string;
    draft: WorkspaceDraft;
  } | null>(null);
  const [corruptDrafts, setCorruptDrafts] = useState<CorruptWorkspaceDraft[]>([]);
  const [draftBackupError, setDraftBackupError] = useState<string | null>(null);
  const [switchConfirmOpen, setSwitchConfirmOpen] = useState(false);
  const [saveConflict, setSaveConflict] = useState<{ projectId: string; kind: 'conflict' | 'missing' } | null>(null);
  const [conflictReadConfirmOpen, setConflictReadConfirmOpen] = useState(false);
  const [conflictResolving, setConflictResolving] = useState(false);
  const switchConfirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const activeDraftRecovery = draftRecovery?.ownerId === currentUserId
    && draftRecovery?.projectId === currentProject?.id ? draftRecovery : null;
  const activeCorruptDrafts = corruptDrafts.filter((draft) =>
    draft.ownerId === currentUserId && draft.documentId === currentProject?.id && draft.kind === 'project',
  );

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const resetRecoveryState = useCallback(() => {
    clearSaveTimer();
    setLoadError(null);
    setRecoveryRaw(null);
    setSaveBlocked(false);
    restoredDraftRef.current = null;
    setDraftRecovery(null);
    setCorruptDrafts([]);
    setDraftBackupError(null);
    setSaveConflict(null);
    setConflictReadConfirmOpen(false);
    setConflictResolving(false);
  }, [clearSaveTimer]);

  const applyProjectLoadRecovery = useCallback((options: {
    draft: { ownerId: string; projectId: string; draft: WorkspaceDraft } | null;
    damagedDrafts: CorruptWorkspaceDraft[];
    loadError: string | null;
    recoveryRaw: string | null;
    saveBlocked: boolean;
  }) => {
    restoredDraftRef.current = null;
    setDraftRecovery(options.draft);
    setCorruptDrafts(options.damagedDrafts);
    setDraftBackupError(null);
    setSaveConflict(null);
    setConflictReadConfirmOpen(false);
    setLoadError(options.loadError);
    setRecoveryRaw(options.recoveryRaw);
    setSaveBlocked(options.saveBlocked);
  }, []);

  const clearDraftOnClose = useCallback(() => {
    setDraftRecovery(null);
    setCorruptDrafts([]);
    setDraftBackupError(null);
    setLoadError(null);
    setRecoveryRaw(null);
    setSaveBlocked(false);
  }, []);

  const clearRecoveryOnWizardComplete = useCallback(() => {
    setDraftRecovery(null);
    setCorruptDrafts([]);
    setDraftBackupError(null);
    setSaveConflict(null);
    setConflictReadConfirmOpen(false);
    setLoadError(null);
    setRecoveryRaw(null);
    setSaveBlocked(false);
  }, []);

  const clearRecoveryForDeletedProject = useCallback((project: Project) => {
    const restored = restoredDraftRef.current;
    if (restored?.draft.ownerId === project.userId && restored.draft.documentId === project.id) {
      restoredDraftRef.current = null;
    }
    setDraftRecovery((state) => state?.ownerId === project.userId && state.projectId === project.id ? null : state);
    setSaveConflict((state) => state?.projectId === project.id ? null : state);
  }, []);

  const advanceDraftRecovery = useCallback((ownerId: string, projectId: string) => {
    const draft = nextProjectRecoveryDraft(ownerId, projectId);
    setDraftRecovery(draft ? { ownerId, projectId, draft } : null);
  }, []);

  const finishRestoredDraft = useCallback((ownerId: string, projectId: string, localRevision: number) => {
    const restored = restoredDraftRef.current;
    if (!restored || restored.draft.ownerId !== ownerId || restored.draft.documentId !== projectId) return false;
    removeWorkspaceDraftForInstance(ownerId, 'project', projectId, restored.backupInstanceId, localRevision);
    removeProjectRecoveryDraft(restored.draft);
    restoredDraftRef.current = null;
    advanceDraftRecovery(ownerId, projectId);
    return true;
  }, [advanceDraftRecovery]);

  const writeProjectDraft = useCallback((): void => {
    if (saveBlocked) return;
    const project = useProjectStore.getState().currentProject;
    const ownerId = useUserStore.getState().currentUser?.id ?? null;
    const harness = useHarnessStore.getState();
    if (!project || !ownerId || project.userId !== ownerId || harness.saveState.status === 'saved') return;
    if (harness.config.id !== project.id) return;
    const recovery = restoredDraftRef.current;
    const restored = recovery?.draft.ownerId === ownerId && recovery.draft.documentId === project.id ? recovery : null;
    const baseVersion = useProjectStore.getState().currentProjectVersion;
    const result = writeWorkspaceDraft({
      ownerId,
      kind: 'project',
      documentId: project.id,
      localRevision: harness.localRevision,
      baseServerRevision: baseVersion?.revision ?? null,
      recoverySourceDraftIds: restored ? [...(restored.draft.recoverySourceDraftIds ?? []), restored.draft.draftId] : undefined,
      document: harness.config,
    }, restored?.backupInstanceId);
    setDraftBackupError(
      result.ok
        ? null
        : result.error ?? '未能在此设备上备份最新修改，请保持页面打开并尝试保存。',
    );
  }, [saveBlocked]);

  const doSave = useCallback(async (options?: { retry?: boolean }) => {
    if (!currentProject || saveBlocked || !useUserStore.getState().currentUser) {
      return;
    }
    // 版本冲突/云端已删除时暂停自动保存，必须由用户选择恢复方式，不做无条件覆盖。
    if (saveConflict) {
      return;
    }

    const saveUserId = currentProject.userId;
    const saveSession = workspaceSessionRef.current;
    const saveProjectId = currentProject.id;
    const isSaveContextCurrent = () => {
      const user = useUserStore.getState().currentUser;
      return workspaceSessionRef.current === saveSession
        && user?.id === saveUserId && (user.role === 'engineer' || user.role === 'admin') && !user.mustChangePassword
        && useProjectStore.getState().currentProject?.id === saveProjectId;
    };

    let allowErrorRetry = options?.retry === true;
    while (true) {
      if (!isSaveContextCurrent()) return;

      if (saveInFlightRef.current) {
        await saveInFlightRef.current;
        continue;
      }

      const status = useHarnessStore.getState().saveState.status;
      if (status === 'saved') {
        return;
      }
      if (status === 'error' && !allowErrorRetry) {
        return;
      }
      allowErrorRetry = false;

      const latestConfig = useHarnessStore.getState().config;
      const savedLocalRevision = useHarnessStore.getState().localRevision;
      if (latestConfig.id !== saveProjectId) {
        return;
      }
      const task = (async () => {
        markSaving();
        try {
          await saveCurrentConfig(latestConfig);
          if (!isSaveContextCurrent()) return;
          // 只有当前文档仍是发起保存时的那个快照，才能确认本次保存。
          // 用对象身份而不是 updatedAt 相等判断，避免同毫秒编辑被旧响应误标为已保存。
          if (useHarnessStore.getState().config === latestConfig) {
            markSaved();
            if (!finishRestoredDraft(saveUserId, saveProjectId, savedLocalRevision)) {
              removeWorkspaceDraftForInstance(saveUserId, 'project', saveProjectId, currentDraftInstanceId(), savedLocalRevision);
            }
          } else {
            useHarnessStore.getState().markDirty();
          }
        } catch (error) {
          if (!isSaveContextCurrent()) return;
          console.error('项目保存失败:', error);
          const writeError = error instanceof DocumentWriteError
            ? error
            : null;
          if (writeError && (writeError.code === 'conflict' || writeError.code === 'missing')) {
            setSaveConflict({
              projectId: saveProjectId,
              kind: writeError.code === 'missing' ? 'missing' : 'conflict',
            });
            markSaveError(writeError.message);
            return;
          }
          markSaveError(getUserErrorMessage(error, '保存失败，请重试。'));
        }
      })();

      saveInFlightRef.current = task;
      try {
        await task;
      } finally {
        if (saveInFlightRef.current === task) {
          saveInFlightRef.current = null;
        }
      }
      if (saveConflict) return;
    }
  }, [currentProject, finishRestoredDraft, markSaveError, markSaved, markSaving, saveBlocked, saveConflict, saveCurrentConfig, workspaceSessionRef]);

  const requestSwitchConfirmation = useCallback((): Promise<boolean> => (
    new Promise<boolean>((resolve) => {
      switchConfirmResolverRef.current = resolve;
      setSwitchConfirmOpen(true);
    })
  ), []);

  const resolveSwitchConfirmation = useCallback((confirmed: boolean) => {
    setSwitchConfirmOpen(false);
    const resolve = switchConfirmResolverRef.current;
    switchConfirmResolverRef.current = null;
    resolve?.(confirmed);
  }, []);

  const retryProjectSave = useCallback(() => {
    void doSave({ retry: true });
  }, [doSave]);

  const downloadLocalProjectCopy = useCallback(() => {
    const localConfig = useHarnessStore.getState().config;
    downloadTextFile(
      JSON.stringify({
        kind: 'wire-harness-project-local-copy',
        projectId: useProjectStore.getState().currentProject?.id ?? null,
        savedAt: new Date().toISOString(),
        config: localConfig,
      }, null, 2),
      `${safeFilename(localConfig.name || 'project')}-local-copy.json`,
    );
  }, []);

  const resolveConflictReadCloud = useCallback(async () => {
    const project = useProjectStore.getState().currentProject;
    const owner = useUserStore.getState().currentUser;
    if (!project || !owner) return;
    const session = workspaceSessionRef.current;
    const localSnapshot = useHarnessStore.getState().config;
    const localRevision = useHarnessStore.getState().localRevision;
    const isCurrent = () => {
      const user = useUserStore.getState().currentUser;
      return workspaceSessionRef.current === session
        && user?.id === owner.id
        && user.role === owner.role
        && !user.mustChangePassword
        && useProjectStore.getState().currentProject?.id === project.id
        && useHarnessStore.getState().config === localSnapshot;
    };
    setConflictResolving(true);
    try {
      const result = await projectRepository.load(project.id);
      if (!isCurrent()) return;
      if (result.status === 'ok') {
        useProjectStore.getState().setCurrentProjectVersion(result.version);
        replaceDocument(result.config, { markSaved: true });
        if (!finishRestoredDraft(owner.id, project.id, localRevision)) {
          removeWorkspaceDraftForInstance(
            owner.id,
            'project',
            project.id,
            currentDraftInstanceId(),
            localRevision,
          );
        }
        setSaveConflict(null);
        setConflictReadConfirmOpen(false);
        notify({ tone: 'success', message: '已读取云端版本，本地未保存修改已按你的选择丢弃。' });
      } else {
        setConflictReadConfirmOpen(false);
        notify({
          tone: 'danger',
          title: '无法读取云端版本',
          message: result.status === 'missing'
            ? '该文档已在云端删除，请下载本地副本或另存为新文档。'
            : '云端内容结构已损坏，请下载本地副本或另存为新文档。',
        });
      }
    } catch (error) {
      if (!isCurrent()) return;
      notify({
        tone: 'danger',
        title: '读取云端版本失败',
        message: getUserErrorMessage(error, '读取云端版本失败，请检查网络后重试。'),
      });
    } finally {
      setConflictResolving(false);
    }
  }, [finishRestoredDraft, replaceDocument, workspaceSessionRef]);

  const resolveConflictSaveAsNew = useCallback(async () => {
    const project = useProjectStore.getState().currentProject;
    const owner = useUserStore.getState().currentUser;
    if (!project || !owner) return;
    const session = workspaceSessionRef.current;
    const workspaceIsCurrent = () => {
      const user = useUserStore.getState().currentUser;
      return workspaceSessionRef.current === session && user?.id === owner.id
        && user.role === owner.role && !user.mustChangePassword;
    };
    const localConfig = useHarnessStore.getState().config;
    const localRevision = useHarnessStore.getState().localRevision;
    const canApplyResult = () => workspaceIsCurrent()
      && useProjectStore.getState().currentProject?.id === project.id
      && useHarnessStore.getState().config === localConfig;
    setConflictResolving(true);
    try {
      const newName = `${localConfig.name || project.name}（本地副本）`;
      const created = await createProject(owner.id, newName, project.description, { ...localConfig, name: newName }, { activate: false });
      if (!created) return;
      if (!canApplyResult()) {
        if (workspaceIsCurrent()) notify({ tone: 'success', message: `已另存为新项目“${newName}”，当前编辑仍保留。` });
        return;
      }
      finishRestoredDraft(owner.id, project.id, localRevision);
      setCurrentProject(created.project);
      setCurrentProjectVersion(created.version);
      replaceDocument({ ...localConfig, id: created.project.id, name: newName }, { markSaved: true });
      setDraftRecovery(null);
      setCorruptDrafts([]);
      setDraftBackupError(null);
      setSaveConflict(null);
      setConflictReadConfirmOpen(false);
      notify({ tone: 'success', message: `已另存为新项目“${newName}”。` });
      navigate(appRoutes['designer-design'].path, { projectId: created.project.id });
    } catch (error) {
      if (!workspaceIsCurrent()) return;
      notify({
        tone: 'danger',
        title: '另存失败',
        message: getUserErrorMessage(error, '另存为新项目失败，请保持页面打开后重试。'),
      });
    } finally {
      if (workspaceSessionRef.current === session) setConflictResolving(false);
    }
  }, [createProject, finishRestoredDraft, navigate, replaceDocument, setCurrentProject, setCurrentProjectVersion, workspaceSessionRef]);

  const saveBeforeLeavingWorkspace = useCallback(async (): Promise<boolean> => {
    const project = useProjectStore.getState().currentProject;
    if (!project || useHarnessStore.getState().saveState.status === 'saved') return true;
    if (saveBlocked) {
      notify({
        tone: 'danger',
        title: '暂时无法切换项目',
        message: '当前项目未能保存，请先处理保存错误后再切换项目。',
      });
      return false;
    }
    if (saveConflict) {
      notify({
        tone: 'danger',
        title: '存在保存冲突',
        message: '当前项目与云端版本冲突，请先选择恢复方式后再切换项目。',
      });
      return false;
    }

    writeProjectDraft();
    await doSave({ retry: true });
    if (useHarnessStore.getState().saveState.status === 'saved') return true;
    notify({
      tone: 'danger',
      title: '项目未能保存',
      message: '项目保存失败，已取消切换。请保持页面打开并重试。',
      action: { label: '重试保存', onClick: retryProjectSave },
      dedupeKey: 'project-save-failed',
    });
    return false;
  }, [doSave, retryProjectSave, saveBlocked, saveConflict, writeProjectDraft]);

  const prepareForUserSwitch = useCallback(async () => {
    const hasUnsavedProject = Boolean(currentProject && saveState.status !== 'saved');
    const hasUnsavedDrawing = drawingSaveState !== 'saved';

    if (!hasUnsavedProject && !hasUnsavedDrawing) return true;
    if (hasUnsavedProject && saveBlocked) {
      notify({
        tone: 'danger',
        title: '暂时无法切换账号',
        message: '当前项目未能保存，请先处理保存错误后再切换账号。',
      });
      return false;
    }
    if (hasUnsavedProject && saveConflict) {
      notify({
        tone: 'danger',
        title: '存在保存冲突',
        message: '当前项目与云端版本冲突，请先选择恢复方式后再切换账号。',
      });
      return false;
    }

    const shouldSave = await requestSwitchConfirmation();
    if (!shouldSave) return false;

    if (hasUnsavedProject) {
      await doSave({ retry: true });
      if (useHarnessStore.getState().saveState.status !== 'saved') {
        notify({
          tone: 'danger',
          title: '项目未能保存',
          message: '项目保存失败，已取消账号切换。请保持页面打开并重试。',
          action: { label: '重试保存', onClick: retryProjectSave },
          dedupeKey: 'project-save-failed',
        });
        return false;
      }
    }

    if (hasUnsavedDrawing) {
      try {
        await saveActiveDrawing();
      } catch (error) {
        console.error('图纸保存失败:', error);
        notify({
          tone: 'danger',
          title: '图纸未能保存',
          message: '图纸保存失败，已取消账号切换。请保持页面打开并重试。',
          action: {
            label: '重试保存',
            onClick: () => void saveActiveDrawing().catch(() => undefined),
          },
        });
        return false;
      }
    }
    return true;
  }, [currentProject, doSave, drawingSaveState, requestSwitchConfirmation, retryProjectSave, saveActiveDrawing, saveBlocked, saveConflict, saveState.status]);

  const saveActiveProjectBeforeExport = useCallback(async (project: Project) => {
    const session = workspaceSessionRef.current;
    const isActiveProject = () => {
      const user = useUserStore.getState().currentUser;
      return workspaceSessionRef.current === session && user?.id === project.userId
        && (user.role === 'engineer' || user.role === 'admin') && !user.mustChangePassword
        && useProjectStore.getState().currentProject?.id === project.id;
    };
    if (!isActiveProject()) throw new UserFacingError('活动项目已切换，请从列表重新导出。');
    if (saveBlocked) throw new UserFacingError('当前设计无法保存，请回到编辑页处理恢复提示后重试。');
    if (saveConflict) throw new UserFacingError('当前设计存在保存冲突，请回到编辑页处理后重试。');

    if (useHarnessStore.getState().saveState.status !== 'saved') {
      writeProjectDraft();
      await doSave({ retry: true });
    }
    const harness = useHarnessStore.getState();
    if (!isActiveProject() || harness.config.id !== project.id) {
      throw new UserFacingError('活动项目已切换，请从列表重新导出。');
    }
    if (harness.saveState.status !== 'saved') {
      throw new UserFacingError('最新修改未能保存，请检查保存状态后重试导出。');
    }
  }, [doSave, saveBlocked, saveConflict, workspaceSessionRef, writeProjectDraft]);

  useEffect(() => {
    if (saveState.status !== 'dirty' || !currentProject || saveBlocked || saveConflict) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => void doSave(), 2000);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [config, currentProject, doSave, saveBlocked, saveConflict, saveState.status]);

  useEffect(() => {
    if (!currentProject || saveBlocked || saveState.status === 'saved') {
      return;
    }

    const timer = window.setTimeout(writeProjectDraft, 1000);
    return () => window.clearTimeout(timer);
  }, [config, currentProject, saveBlocked, saveState.status, writeProjectDraft]);

  useEffect(() => {
    const flushDrafts = () => {
      writeProjectDraft();
      flushDrawingDrafts();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushDrafts();
    };

    window.addEventListener('pagehide', flushDrafts);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flushDrafts);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [writeProjectDraft]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const projectPending = Boolean(currentProject && !saveBlocked && saveState.status !== 'saved');
      const drawingPending = drawingSaveState !== 'saved';

      if (projectPending) writeProjectDraft();
      if (drawingPending) flushDrawingDrafts();

      if (projectPending || drawingPending) {
        event.preventDefault();
        event.returnValue = '';
      }
      // 直接表写已被版本校验 RPC 取代：退出时只保留本地草稿，不再做无版本兜底写入。
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentProject, drawingSaveState, saveBlocked, saveState.status, writeProjectDraft]);

  const handleUseCloudVersion = useCallback(() => {
    if (!activeDraftRecovery) return;
    const ownerId = useUserStore.getState().currentUser?.id ?? null;
    const currentProjectId = useProjectStore.getState().currentProject?.id ?? null;
    const { draft, ownerId: draftOwner, projectId: draftProject } = activeDraftRecovery;
    if (!canApplyWorkspaceDraft(draft, { ownerId, documentId: currentProjectId })) return;
    removeProjectRecoveryDraft(draft);
    advanceDraftRecovery(draftOwner, draftProject);
  }, [activeDraftRecovery, advanceDraftRecovery]);

  const handleRestoreLocalDraft = useCallback(() => {
    if (!activeDraftRecovery) return;
    const ownerId = useUserStore.getState().currentUser?.id ?? null;
    const currentProjectId = useProjectStore.getState().currentProject?.id ?? null;
    const restored = restoredDraftRef.current;
    if ((restored?.draft.ownerId === ownerId && restored.draft.documentId === currentProjectId)
      || useHarnessStore.getState().saveState.status !== 'saved' || saveConflict) return;
    if (!canApplyWorkspaceDraft(activeDraftRecovery.draft, { ownerId, documentId: currentProjectId })) {
      setDraftRecovery(null);
      return;
    }
    const { draft, projectId: draftProject } = activeDraftRecovery;
    restoredDraftRef.current = { draft, backupInstanceId: `${currentDraftInstanceId()}-recovery-${crypto.randomUUID()}` };
    setDraftRecovery(null);
    replaceDocument(draft.document as HarnessConfig, { markSaved: false });
    useHistoryStore.getState().clear();
    const currentVersion = useProjectStore.getState().currentProjectVersion;
    if (draft.baseServerRevision === null) {
      // 旧格式草稿没有可确认的云端基线：不能套用云端最新版本，
      // 否则会用最新 revision 提交旧内容。直接进入人工冲突处理。
      useProjectStore.getState().setCurrentProjectVersion(null);
      setSaveConflict({ projectId: draftProject, kind: 'conflict' });
      useHarnessStore.getState().markSaveError('恢复的草稿缺少云端基线，请选择“读取云端版本”或“另存为新文档”。');
      return;
    }
    // 恢复草稿的原始基线：云端若已前进，后续保存会被数据库原子拒绝并进入冲突处理；
    // 云端仍在同一版本时保存才会被接受。
    useProjectStore.getState().setCurrentProjectVersion({
      revision: draft.baseServerRevision,
      updatedAt: currentVersion?.updatedAt ?? '',
    });
  }, [activeDraftRecovery, replaceDocument, saveConflict]);

  const handleDiscardCorruptDrafts = useCallback(() => {
    const owner = useUserStore.getState().currentUser;
    const project = useProjectStore.getState().currentProject;
    if (!owner || (owner.role !== 'engineer' && owner.role !== 'admin') || owner.mustChangePassword
      || !project || project.userId !== owner.id) return;
    const drafts = activeCorruptDrafts.filter((entry) => entry.ownerId === owner.id && entry.documentId === project.id);
    if (!drafts.length) return;
    drafts.forEach((entry) => removeCorruptWorkspaceDraft(entry));
    setCorruptDrafts(listCorruptWorkspaceDrafts(owner.id, 'project').filter((entry) => entry.documentId === project.id));
  }, [activeCorruptDrafts]);

  const handleDownloadCorruptDrafts = useCallback(() => {
    downloadTextFile(
      corruptWorkspaceDraftsToJson(activeCorruptDrafts),
      `${safeFilename('损坏项目草稿')}-${Date.now()}.json`,
    );
  }, [activeCorruptDrafts]);

  return {
    loadError,
    setLoadError,
    recoveryRaw,
    saveBlocked,
    draftBackupError,
    switchConfirmOpen,
    activeDraftRecovery,
    saveConflict,
    conflictReadConfirmOpen,
    setConflictReadConfirmOpen,
    conflictResolving,
    activeCorruptDrafts,
    clearSaveTimer,
    resetRecoveryState,
    applyProjectLoadRecovery,
    clearDraftOnClose,
    clearRecoveryOnWizardComplete,
    clearRecoveryForDeletedProject,
    doSave,
    resolveSwitchConfirmation,
    retryProjectSave,
    downloadLocalProjectCopy,
    resolveConflictReadCloud,
    resolveConflictSaveAsNew,
    saveBeforeLeavingWorkspace,
    prepareForUserSwitch,
    saveActiveProjectBeforeExport,
    handleUseCloudVersion,
    handleRestoreLocalDraft,
    handleDiscardCorruptDrafts,
    handleDownloadCorruptDrafts,
    dismissDraftRecovery: () => setDraftRecovery(null),
    dismissCorruptDrafts: () => setCorruptDrafts([]),
    isRetrySaveAvailable: saveState.status === 'error' && !saveConflict && !saveBlocked && Boolean(currentUser),
  };
}

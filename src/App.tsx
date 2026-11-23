import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, Loader2 } from 'lucide-react';
import { AuthModal } from '@/components/auth/AuthModal';
import { LoginRequiredPanel } from '@/components/auth/LoginRequiredPanel';
import { AdminShell } from '@/components/layout/AdminShell';
import { MainLayout } from '@/components/layout/MainLayout';
import { ActionToast } from '@/components/shared/ActionToast';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { StorageSetupBanner } from '@/components/shared/StorageSetupBanner';
import { ProjectList } from '@/components/project/ProjectList';
import { ProjectWizard } from '@/components/project/ProjectWizard';
import { useAppRoute } from '@/hooks/useAppRoute';
import { appRoutes, defaultRoute, getRouteByPath, requiresAuth, shouldKeepRouteAfterLogin } from '@/lib/appRoute';
import { downloadTextFile, safeFilename } from '@/lib/designFile';
import { checkStorageBootstrap, type StorageBootstrapState } from '@/lib/storageBootstrap';
import { supabase } from '@/lib/supabaseClient';
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
import { DocumentWriteError } from '@/lib/documentWriteError';
import { projectRepository } from '@/repositories/projectRepository';
import { flushDrawingDrafts, releaseDrawingStore, useDrawingStore } from '@/stores/drawingStore';
import { createDefaultConfig, useHarnessStore } from '@/stores/harnessStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useFinishedHarnessStore } from '@/stores/finishedHarnessStore';
import { usePriceStore } from '@/stores/priceStore';
import { useHistoryStore } from '@/stores/historyStore';
import { notify } from '@/stores/noticeStore';
import { useProjectStore } from '@/stores/projectStore';
import { useUserStore } from '@/stores/userStore';
import type { Project } from '@/types/user';
import type { HarnessConfig } from '@/types/harness';

const HarnessCanvas = lazy(() => import('@/components/canvas/HarnessCanvas').then((module) => ({ default: module.HarnessCanvas })));
const TwoDView = lazy(() => import('@/components/drawings/TwoDView').then((module) => ({ default: module.TwoDView })));
const BomModal = lazy(() => import('@/components/panels/BomPanel').then((module) => ({ default: module.BomModal })));
const QuoteModal = lazy(() => import('@/components/panels/QuotePanel').then((module) => ({ default: module.QuoteModal })));
const MaterialLibraryPage = lazy(() => import('@/pages/MaterialLibraryPage').then((module) => ({ default: module.MaterialLibraryPage })));
const DrawingWorkbenchPage = lazy(() => import('@/pages/DrawingWorkbenchPage').then((module) => ({ default: module.DrawingWorkbenchPage })));
const DwgViewerPage = lazy(() => import('@/pages/DwgViewerPage').then((module) => ({ default: module.DwgViewerPage })));
const ModelViewerPage = lazy(() => import('@/pages/ModelViewerPage').then((module) => ({ default: module.ModelViewerPage })));
const AutoQuotePage = lazy(() => import('@/pages/AutoQuotePage').then((module) => ({ default: module.AutoQuotePage })));

function ModuleLoadingState() {
  return (
    <div className="flex h-full items-center justify-center bg-slate-100 p-4 text-sm text-slate-500">
      <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-600" />
      页面加载中...
    </div>
  );
}

function AuthLoadingState() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-100 p-4 text-sm text-slate-500">
      <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-600" />
      正在确认登录状态...
    </div>
  );
}

function ModuleLoadErrorState() {
  return (
    <div className="flex h-full items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-slate-600">页面模块加载失败，请检查网络后重试。</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          重新加载
        </button>
      </div>
    </div>
  );
}

function DesignerView() {
  return (
    <MainLayout>
      <HarnessCanvas />
    </MainLayout>
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function ProjectRestoringState() {
  return (
    <div className="flex h-full items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <Loader2 className="mx-auto h-9 w-9 animate-spin text-blue-600" />
        <h2 className="mt-4 text-base font-semibold text-slate-900">正在加载项目...</h2>
        <p className="mt-2 text-sm text-slate-500">
          正在准备设计环境与图纸数据，请稍候。
        </p>
      </div>
    </div>
  );
}

interface LoadErrorBannerProps {
  message: string;
  recoveryRaw: string | null;
  projectName?: string;
  onClose: () => void;
}

function LoadErrorBanner({ message, recoveryRaw, projectName, onClose }: LoadErrorBannerProps) {
  return (
    <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-red-700">{message}</p>
          <p className="mt-1 text-xs text-red-500">
            当前会话仅用于查看和修复，自动保存已暂停，避免覆盖原始损坏数据。
          </p>
        </div>
        {recoveryRaw && (
          <button
            type="button"
            onClick={() => downloadTextFile(
              recoveryRaw,
              `${safeFilename(projectName ?? 'damaged-project')}.recovery.json`,
            )}
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
          >
            <Download className="h-3.5 w-3.5" />
            下载原始副本
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 cursor-pointer text-red-400 hover:text-red-600"
          aria-label="关闭错误提示"
        >
          关闭
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const currentUser = useUserStore((state) => state.currentUser);
  const restricted = Boolean(currentUser && currentUser.role !== 'engineer' && currentUser.role !== 'admin');
  const { route: requestedRoute, projectId: requestedProjectId, navigate, navigationVersion, getNavigationVersion } = useAppRoute();
  const projectId = restricted ? null : requestedProjectId;
  useEffect(() => {
    if (currentUser?.role === 'sales' && requestedRoute.id !== 'auto-quote') navigate(appRoutes['auto-quote'].path, { replace: true });
  }, [currentUser?.role, requestedRoute.id, navigate]);
  const [authOpen, setAuthOpen] = useState(false);
  const [bomModalOpen, setBomModalOpen] = useState(false);
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recoveryRaw, setRecoveryRaw] = useState<string | null>(null);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [storageBootstrapState, setStorageBootstrapState] = useState<StorageBootstrapState>({
    status: 'unconfigured',
  });
  const [storageChecking, setStorageChecking] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const storageCheckInFlightRef = useRef<Promise<StorageBootstrapState> | null>(null);
  const previousAuthUserIdRef = useRef<string | null | undefined>(undefined);
  const restoreProjectAttemptRef = useRef<string | null>(null);
  const workspaceSessionRef = useRef(0);
  const projectOpenRequestRef = useRef(0);
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

  const currentUserId = currentUser?.id;
  const authReady = useUserStore((state) => state.authReady);
  const initializeCatalog = useCatalogStore((state) => state.initialize);
  const refreshCatalogIfStale = useCatalogStore((state) => state.refreshIfStale);
  const catalogStatus = useCatalogStore((state) => state.status);
  const catalogError = useCatalogStore((state) => state.error);
  const loadPrices = usePriceStore((state) => state.load);
  const {
    currentProject: storedProject,
    projects,
    projectsStatus,
    createProject,
    saveCurrentConfig,
    setCurrentProject,
    setCurrentProjectVersion,
    loadProjects,
  } = useProjectStore();
  const currentProject = !restricted && storedProject?.userId === currentUserId ? storedProject : null;
  const route = restricted ? appRoutes['auto-quote']
    : currentUserId && requestedRoute.section === 'designer' && !projectId && !currentProject ? defaultRoute
    : requestedRoute;
  const isEditingCurrentProject = route.section === 'designer'
    && Boolean(currentProject && (!projectId || currentProject.id === projectId));
  const activeDraftRecovery = draftRecovery?.ownerId === currentUserId
    && draftRecovery?.projectId === currentProject?.id ? draftRecovery : null;
  const activeCorruptDrafts = corruptDrafts.filter((draft) =>
    draft.ownerId === currentUserId && draft.documentId === currentProject?.id && draft.kind === 'project',
  );
  const { config, markSaveError, markSaved, markSaving, replaceDocument, saveState } = useHarnessStore();
  const catalogSnapshot = useCatalogStore((state) => state.snapshot);
  const refreshCatalogReferences = useHarnessStore((state) => state.refreshCatalogReferences);
  const canUndo = useHistoryStore((state) => state.past.length > 0);
  const canRedo = useHistoryStore((state) => state.future.length > 0);
  const drawingSaveState = useDrawingStore((state) => state.saveState);
  const saveActiveDrawing = useDrawingStore((state) => state.saveActiveDocument);

  const needsCatalog = Boolean(currentUserId) && (
    route.section === 'designer'
    || route.id === 'materials'
    || route.id === 'drawing-workbench'
    || route.section === 'auto-quote'
    || wizardOpen
  );

  const needsStorageBootstrap = Boolean(supabase) && Boolean(currentUserId) && (
    route.id === 'model-viewer'
    ||
    route.section === 'designer'
    || route.id === 'materials'
    || route.id === 'drawing-workbench'
  );

  const performStorageBootstrapCheck = useCallback(async () => {
    if (!supabase) {
      setStorageBootstrapState({ status: 'unconfigured' });
      setStorageChecking(false);
      return;
    }

    if (storageCheckInFlightRef.current) {
      const state = await storageCheckInFlightRef.current;
      setStorageBootstrapState(state);
      return;
    }

    setStorageChecking(true);
    const task = checkStorageBootstrap(supabase);
    storageCheckInFlightRef.current = task;
    try {
      const state = await task;
      setStorageBootstrapState(state);
    } finally {
      storageCheckInFlightRef.current = null;
      setStorageChecking(false);
    }
  }, []);

  const refreshStorageBootstrap = useCallback(async () => {
    await performStorageBootstrapCheck();
  }, [performStorageBootstrapCheck]);


  useEffect(() => {
    if (!needsStorageBootstrap) return;
    const timer = setTimeout(() => {
      void performStorageBootstrapCheck();
    }, 0);
    return () => clearTimeout(timer);
  }, [needsStorageBootstrap, performStorageBootstrapCheck]);

  useEffect(() => {
    if (!needsCatalog) return;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      void refreshCatalogIfStale().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [needsCatalog, refreshCatalogIfStale]);

  // 目录同步只在目录快照变化时刷新引用与派生图片，不依赖 saveState，也不替换整个文档。
  // 打开/切换文档由 replaceDocument 自行对齐，因此这里不需要响应 config.id 变化。
  useEffect(() => {
    if (catalogStatus !== 'ready' || !catalogSnapshot || !currentProject) return;
    if (useHarnessStore.getState().config.id !== currentProject.id) return;
    refreshCatalogReferences();
  }, [catalogSnapshot, catalogStatus, currentProject, refreshCatalogReferences]);

  const applyHistoryDocument = useCallback((nextConfig: typeof config | null) => {
    if (!nextConfig) return;

    const history = useHistoryStore.getState();
    history.pause();
    replaceDocument(nextConfig, { markSaved: false });
    history.resume();
  }, [replaceDocument]);

  const handleUndo = useCallback(() => {
    const previous = useHistoryStore.getState().undo(useHarnessStore.getState().config);
    applyHistoryDocument(previous);
  }, [applyHistoryDocument]);

  const handleRedo = useCallback(() => {
    const next = useHistoryStore.getState().redo(useHarnessStore.getState().config);
    applyHistoryDocument(next);
  }, [applyHistoryDocument]);

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
  }, [currentProject, finishRestoredDraft, markSaveError, markSaved, markSaving, saveBlocked, saveConflict, saveCurrentConfig]);

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
  }, [finishRestoredDraft, replaceDocument]);

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
  }, [createProject, finishRestoredDraft, navigate, replaceDocument, setCurrentProject, setCurrentProjectVersion]);

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

  const resetWorkspaceForUser = useCallback((destinationPath = defaultRoute.path, destinationProjectId: string | null = null) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    workspaceSessionRef.current += 1;
    projectOpenRequestRef.current += 1;
    restoreProjectAttemptRef.current = null;
    setWizardOpen(false);
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
    useProjectStore.getState().resetProjects();
    releaseDrawingStore(useUserStore.getState().currentUser?.id ?? null);
    useCatalogStore.getState().reset();
    usePriceStore.getState().reset();
    useFinishedHarnessStore.getState().reset();
    replaceDocument(createDefaultConfig(), { markSaved: true });
    useHarnessStore.getState().setCanvasViewport(null);
    useHarnessStore.getState().setTwoDViewport(null);
    useHistoryStore.getState().clear();
    navigate(destinationPath, { projectId: destinationProjectId, replace: true });
  }, [navigate, replaceDocument]);

  useEffect(() => {
    if (!authReady) return;

    const nextUserId = currentUser?.id ?? null;
    const previousUserId = previousAuthUserIdRef.current;
    previousAuthUserIdRef.current = nextUserId;
    if (previousUserId === undefined || previousUserId === nextUserId) return;

    const keepRequestedRoute = previousUserId === null
      && shouldKeepRouteAfterLogin(route);
    resetWorkspaceForUser(
      keepRequestedRoute ? route.path : defaultRoute.path,
      keepRequestedRoute ? projectId : null,
    );
  }, [authReady, currentUser?.id, projectId, resetWorkspaceForUser, route]);

  // 必须在账号重置（resetWorkspaceForUser 会清空目录/价格数据并使旧请求失效）之后执行，
  // 否则登录后刚发起的目录请求会被同一次提交中的重置丢弃。
  useEffect(() => {
    if (!needsCatalog) return;
    void initializeCatalog().catch(() => {
      // The catalog store exposes the error state to the shell; no mock fallback is used.
    });
    if (!restricted) void loadPrices().catch(() => {
      // Background preload; QuoteModal handles loading/fallback gracefully.
    });
  }, [needsCatalog, initializeCatalog, loadPrices, restricted]);

  // 必须在账号重置（resetWorkspaceForUser 使旧会话代次失效）之后执行，否则新账号的列表请求会捕获旧代次并被丢弃。
  useEffect(() => {
    if (!authReady || !currentUserId || restricted) return;
    void loadProjects(currentUserId);
  }, [authReady, currentUserId, loadProjects, restricted]);

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
    const unsubscribe = useHarnessStore.subscribe((state, previousState) => {
      if (!previousState || state.config === previousState.config) {
        return;
      }

      // 目录派生刷新不是用户编辑，不进入撤销/重做历史。
      if (state.catalogSyncCount !== previousState.catalogSyncCount) {
        return;
      }

      useHistoryStore.getState().pushState(previousState.config);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isEditingCurrentProject) return;

      const isCtrlOrCmd = event.ctrlKey || event.metaKey;
      if (!isCtrlOrCmd || isEditableTarget(event.target)) return;

      if (event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
        return;
      }

      if ((event.key === 'z' && event.shiftKey) || event.key === 'y') {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRedo, handleUndo, isEditingCurrentProject]);

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

  const handleNewProject = async () => {
    if (!currentUser) {
      setAuthOpen(true);
      return;
    }
    const requestId = ++projectOpenRequestRef.current;
    const navigation = getNavigationVersion();
    if (!(await saveBeforeLeavingWorkspace())) return;
    if (requestId !== projectOpenRequestRef.current || navigation !== getNavigationVersion()
      || useUserStore.getState().currentUser?.id !== currentUser.id
      || useUserStore.getState().currentUser?.role !== currentUser.role) return;

    setWizardOpen(true);
  };

  const handleNavigate = useCallback((path: string) => {
    const nextRoute = getRouteByPath(path);
    const activeProjectId = currentProject?.id;
    if (nextRoute.section === 'designer') {
      navigate(activeProjectId ? nextRoute.path : defaultRoute.path, { projectId: activeProjectId });
      return;
    }

    navigate(path);
  }, [currentProject, navigate]);

  const handleOpenProject = useCallback(async (
    project: Project,
    destinationPath = appRoutes['designer-design'].path,
    fromDeepLink = false,
  ) => {
    const owner = useUserStore.getState().currentUser;
    if (!owner || project.userId !== owner.id || (owner.role !== 'engineer' && owner.role !== 'admin')) return;

    const requestSession = workspaceSessionRef.current;
    const requestId = ++projectOpenRequestRef.current;
    const navigation = getNavigationVersion();
    const isRequestCurrent = () => {
      const user = useUserStore.getState().currentUser;
      return workspaceSessionRef.current === requestSession
        && projectOpenRequestRef.current === requestId
        && getNavigationVersion() === navigation
        && user?.id === owner.id
        && (user.role === 'engineer' || user.role === 'admin')
        && !user.mustChangePassword;
    };
    const returnToList = () => {
      if (fromDeepLink) navigate(defaultRoute.path, { replace: true });
    };

    const saved = await saveBeforeLeavingWorkspace();
    if (!isRequestCurrent()) return;
    if (!saved) {
      returnToList();
      return;
    }
    if (useProjectStore.getState().currentProject?.id === project.id) {
      navigate(destinationPath, { projectId: project.id });
      return;
    }

    try {
      const result = await projectRepository.load(project.id);
      if (!isRequestCurrent()) return;

      if (result.status === 'missing') {
        notify({ tone: 'danger', message: '项目不存在或当前账号无权访问。' });
        returnToList();
        return;
      }

      if (useHarnessStore.getState().saveState.status !== 'saved') {
        const latestSaved = await saveBeforeLeavingWorkspace();
        if (!isRequestCurrent()) return;
        if (!latestSaved) {
          returnToList();
          return;
        }
      }

      const draft = result.status === 'ok' ? nextProjectRecoveryDraft(owner.id, project.id) : null;
      const damagedDrafts = result.status === 'ok'
        ? listCorruptWorkspaceDrafts(owner.id, 'project').filter((entry) => entry.documentId === project.id)
        : [];
      restoredDraftRef.current = null;
      setDraftRecovery(draft ? { ownerId: owner.id, projectId: project.id, draft } : null);
      setCorruptDrafts(damagedDrafts);
      setDraftBackupError(null);
      setSaveConflict(null);
      setConflictReadConfirmOpen(false);
      setCurrentProject(result.status === 'ok' ? { ...project, name: result.config.name } : project);
      setCurrentProjectVersion(result.status === 'ok' ? result.version : null);
      useHarnessStore.getState().setCanvasViewport(null);
      useHarnessStore.getState().setTwoDViewport(null);
      const history = useHistoryStore.getState();
      history.clear();
      history.pause();
      try {
        replaceDocument(result.status === 'ok' ? result.config : createDefaultConfig(), { markSaved: true });
      } finally {
        history.resume();
      }
      setLoadError(result.status === 'invalid'
        ? `项目“${project.name}”的结构校验失败，已保留原始恢复副本（${result.issues.slice(0, 2).join('；')}）。`
        : null);
      setRecoveryRaw(result.status === 'invalid' ? result.raw : null);
      setSaveBlocked(result.status === 'invalid');
      navigate(destinationPath, { projectId: project.id });
    } catch (error) {
      if (!isRequestCurrent()) return;
      console.error('项目打开失败:', error);
      notify({ tone: 'danger', title: '打开项目失败', message: getUserErrorMessage(error, '项目加载失败，请重试。') });
      returnToList();
    }
  }, [getNavigationVersion, navigate, replaceDocument, saveBeforeLeavingWorkspace, setCurrentProject, setCurrentProjectVersion]);

  useEffect(() => {
    if (!authReady || !currentUserId || restricted || requestedRoute.section !== 'designer' || projectId) return;
    navigate(currentProject ? requestedRoute.path : defaultRoute.path, {
      projectId: currentProject?.id,
      replace: true,
    });
  }, [authReady, currentProject, currentUserId, navigate, projectId, requestedRoute, restricted]);

  useEffect(() => {
    if (restricted) {
      restoreProjectAttemptRef.current = null;
      return;
    }
    if (!projectId || route.section !== 'designer' || !authReady || !currentUserId || currentProject?.id === projectId) return;
    if (projectsStatus !== 'success' && projectsStatus !== 'error') return;

    const attemptKey = `${navigationVersion}:${currentUserId}:${projectId}`;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || navigationVersion !== getNavigationVersion() || restoreProjectAttemptRef.current === attemptKey
        || useUserStore.getState().currentUser?.id !== currentUserId
        || useProjectStore.getState().projectsStatus !== projectsStatus) return;
      restoreProjectAttemptRef.current = attemptKey;

      if (projectsStatus === 'error') {
        navigate(defaultRoute.path, { replace: true });
        return;
      }

      const project = projects.find((candidate) => candidate.id === projectId && candidate.userId === currentUserId);
      if (!project) {
        notify({ tone: 'danger', message: '项目不存在或当前账号无权访问。' });
        navigate(defaultRoute.path, { replace: true });
        return;
      }
      return handleOpenProject(project, route.path, true);
    });

    return () => {
      cancelled = true;
    };
  }, [
    authReady,
    currentProject?.id,
    currentUserId,
    getNavigationVersion,
    handleOpenProject,
    navigate,
    navigationVersion,
    projectId,
    projects,
    projectsStatus,
    restricted,
    route.path,
    route.section,
  ]);

  const handleWizardComplete = () => {
    setDraftRecovery(null);
    setCorruptDrafts([]);
    setDraftBackupError(null);
    setSaveConflict(null);
    setConflictReadConfirmOpen(false);
    setLoadError(null);
    setRecoveryRaw(null);
    setSaveBlocked(false);
    setWizardOpen(false);
    useHarnessStore.getState().setCanvasViewport(null);
    useHarnessStore.getState().setTwoDViewport(null);
    useHistoryStore.getState().clear();
    navigate(appRoutes['designer-design'].path, {
      projectId: useProjectStore.getState().currentProject?.id ?? null,
    });
  };

  const handleCloseProject = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const closingProject = useProjectStore.getState().currentProject;
    const closingSession = workspaceSessionRef.current;
    const closingOpenRequest = projectOpenRequestRef.current;
    const isCloseCurrent = () => (
      workspaceSessionRef.current === closingSession
      && projectOpenRequestRef.current === closingOpenRequest
      && (useProjectStore.getState().currentProject?.id ?? null) === (closingProject?.id ?? null)
    );

    if (closingProject && !saveBlocked && useHarnessStore.getState().saveState.status !== 'saved') {
      await doSave({ retry: true });
      if (!isCloseCurrent()) return;
      if (useHarnessStore.getState().saveState.status !== 'saved') {
        notify({
          tone: 'danger',
          title: '项目未能保存',
          message: '项目保存失败，已取消关闭。请保持页面打开并重试。',
          action: { label: '重试保存', onClick: retryProjectSave },
          dedupeKey: 'project-save-failed',
        });
        return;
      }
    }

    if (!isCloseCurrent()) return;

    setDraftRecovery(null);
    setCorruptDrafts([]);
    setDraftBackupError(null);

    restoreProjectAttemptRef.current = null;
    projectOpenRequestRef.current += 1;
    setCurrentProject(null);
    setLoadError(null);
    setRecoveryRaw(null);
    setSaveBlocked(false);
    useHarnessStore.getState().setCanvasViewport(null);
    useHarnessStore.getState().setTwoDViewport(null);
    useHistoryStore.getState().clear();
    navigate(defaultRoute.path);
  };

  const handleUpdateProjectName = useCallback((nextName: string) => {
    const trimmed = nextName.trim();
    const harness = useHarnessStore.getState();
    if (!saveBlocked && trimmed && trimmed !== harness.config.name) harness.setConfig({ name: trimmed });
  }, [saveBlocked]);

  const handleRenameActiveProject = async (id: string, name: string) => {
    if (currentProject?.id !== id) return false;
    if (saveBlocked) {
      notify({ tone: 'danger', message: '当前项目无法保存，请先打开项目处理恢复提示。' });
      return false;
    }
    handleUpdateProjectName(name);
    return saveBeforeLeavingWorkspace();
  };

  const handleProjectDeleted = (project: Project) => {
    if (useUserStore.getState().currentUser?.id !== project.userId) return;
    const restored = restoredDraftRef.current;
    if (restored?.draft.ownerId === project.userId && restored.draft.documentId === project.id) {
      restoredDraftRef.current = null;
    }
    setDraftRecovery((state) => state?.ownerId === project.userId && state.projectId === project.id ? null : state);
    setSaveConflict((state) => state?.projectId === project.id ? null : state);
  };

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
  }, [doSave, saveBlocked, saveConflict, writeProjectDraft]);
  const saveActiveProjectBeforeExportRef = useRef(saveActiveProjectBeforeExport);
  useLayoutEffect(() => {
    saveActiveProjectBeforeExportRef.current = saveActiveProjectBeforeExport;
  }, [saveActiveProjectBeforeExport]);

  const saveStatusLabel =
    saveState.status === 'saved'
      ? '已保存'
      : saveState.status === 'dirty'
        ? '未保存'
        : saveState.status === 'saving'
          ? '保存中...'
          : `保存失败: ${saveState.message}`;

  const saveStatusClass =
    saveState.status === 'saved'
      ? 'text-green-700 bg-green-50'
      : saveState.status === 'dirty'
        ? 'text-amber-700 bg-amber-50'
        : saveState.status === 'saving'
          ? 'text-blue-700 bg-blue-50'
          : 'text-red-700 bg-red-50';

  const renderDesignerContent = () => {
    if (!isEditingCurrentProject || !currentProject) return <ProjectRestoringState />;

    const isProductImage = route.id === 'designer-product-image';

    const content = isProductImage ? <TwoDView /> : <DesignerView />;

    return (
      <div className="flex h-full min-h-0 flex-col">
        {loadError && (
          <LoadErrorBanner
            message={loadError}
            recoveryRaw={recoveryRaw}
            projectName={currentProject.name}
            onClose={() => setLoadError(null)}
          />
        )}
        <div className="min-h-0 flex-1">{content}</div>
      </div>
    );
  };

  const renderContent = () => {
    if (!currentUser && requiresAuth(route)) {
      return <LoginRequiredPanel />;
    }

    if (route.section === 'designer') {
      return renderDesignerContent();
    }

    if (route.id === 'drawing-workbench') {
      return <DrawingWorkbenchPage />;
    }

    if (route.id === 'dwg-viewer') {
      return <DwgViewerPage />;
    }

    if (route.id === 'model-viewer') {
      return <ModelViewerPage key={`${currentUser?.id}:${currentUser?.role}`} />;
    }

    if (route.id === 'auto-quote') {
      return <AutoQuotePage key={`${currentUser?.id}:${currentUser?.role}`} />;
    }

    if (route.id === 'materials') {
      return <MaterialLibraryPage key={`${currentUser?.id}:${currentUser?.role}`} />;
    }

    if (route.id === 'designer-projects') {
      return (
        <ProjectList
          key={currentUserId}
          onNewProject={handleNewProject}
          onOpenProject={(project) => void handleOpenProject(project)}
          onRenameActiveProject={handleRenameActiveProject}
          onProjectDeleted={handleProjectDeleted}
          onSaveActiveProjectBeforeExport={(project) => saveActiveProjectBeforeExportRef.current(project)}
        />
      );
    }
  };

  if (!authReady) {
    return <AuthLoadingState />;
  }

  return (
    <>
      <AdminShell
        route={route}
        currentUser={currentUser}
        currentProjectId={currentProject?.id}
        currentProjectName={isEditingCurrentProject ? (saveBlocked ? currentProject?.name : config.name) : undefined}
        saveStatusLabel={saveStatusLabel}
        saveStatusClass={saveStatusClass}
        saveBlocked={saveBlocked}
        canUndo={canUndo}
        canRedo={canRedo}
        onNavigate={handleNavigate}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onRetrySave={saveState.status === 'error' && !saveConflict && !saveBlocked ? retryProjectSave : undefined}
        onOpenAuth={() => setAuthOpen(true)}
        onCloseProject={handleCloseProject}
        onUpdateProjectName={handleUpdateProjectName}
        onOpenBom={() => setBomModalOpen(true)}
        onOpenQuote={() => setQuoteModalOpen(true)}
      >
        <StorageSetupBanner
          state={storageBootstrapState}
          checking={storageChecking}
          onRetry={() => void refreshStorageBootstrap()}
        />
        {catalogStatus === 'error' && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            {catalogError ?? '物料暂时无法加载，请联系管理员处理。'}
          </div>
        )}
        {draftBackupError && (
          <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-1.5 text-xs text-red-700">
            {draftBackupError}
          </div>
        )}
        <ErrorBoundary fallback={<ModuleLoadErrorState />}>
          <Suspense key={route.id} fallback={<ModuleLoadingState />}>
            {renderContent()}
          </Suspense>
        </ErrorBoundary>
      </AdminShell>


      {switchConfirmOpen && (
        <ActionToast
          role="alertdialog"
          title="有未保存的修改"
          message="当前工作区有未保存修改。确定保存后切换账号吗？"
          secondaryAction={{ label: '取消', onClick: () => resolveSwitchConfirmation(false) }}
          primaryAction={{ label: '保存并切换', onClick: () => resolveSwitchConfirmation(true) }}
          onClose={() => resolveSwitchConfirmation(false)}
        />
      )}

      {isEditingCurrentProject && activeDraftRecovery && (
        <ActionToast
          role="alertdialog"
          title="发现本地草稿"
          message="本地保存了未同步到云端的项目修改。请先保存当前修改，再恢复草稿。使用云端版本会丢弃当前草稿及其恢复备份，其他独立草稿仍会保留。"
          secondaryAction={{
            label: '使用云端版本',
            onClick: () => {
              const ownerId = useUserStore.getState().currentUser?.id ?? null;
              const currentProjectId = useProjectStore.getState().currentProject?.id ?? null;
              const { draft, ownerId: draftOwner, projectId: draftProject } = activeDraftRecovery;
              if (!canApplyWorkspaceDraft(draft, { ownerId, documentId: currentProjectId })) return;
              removeProjectRecoveryDraft(draft);
              advanceDraftRecovery(draftOwner, draftProject);
            },
          }}
          primaryAction={{
            label: '恢复本地草稿',
            disabled: saveState.status !== 'saved' || Boolean(saveConflict),
            onClick: () => {
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
            },
          }}
          onClose={() => setDraftRecovery(null)}
        />
      )}

      {isEditingCurrentProject && saveConflict && saveConflict.projectId === currentProject?.id && (
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
            onClick: () => void resolveConflictSaveAsNew(),
          }}
          secondaryAction={{
            label: '读取云端版本',
            disabled: conflictResolving,
            onClick: () => setConflictReadConfirmOpen(true),
          }}
          primaryAction={{
            label: '下载本地副本',
            onClick: downloadLocalProjectCopy,
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
            onClick: () => setConflictReadConfirmOpen(false),
          }}
          primaryAction={{
            label: conflictResolving ? '读取中...' : '确定读取云端',
            destructive: true,
            disabled: conflictResolving,
            onClick: () => void resolveConflictReadCloud(),
          }}
          onClose={() => setConflictReadConfirmOpen(false)}
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
            onClick: () => {
              const owner = useUserStore.getState().currentUser;
              const project = useProjectStore.getState().currentProject;
              if (!owner || (owner.role !== 'engineer' && owner.role !== 'admin') || owner.mustChangePassword
                || !project || project.userId !== owner.id) return;
              const drafts = activeCorruptDrafts.filter((entry) => entry.ownerId === owner.id && entry.documentId === project.id);
              if (!drafts.length) return;
              drafts.forEach((entry) => removeCorruptWorkspaceDraft(entry));
              setCorruptDrafts(listCorruptWorkspaceDrafts(owner.id, 'project').filter((entry) => entry.documentId === project.id));
            },
          }}
          primaryAction={{
            label: '下载原始内容',
            onClick: () => downloadTextFile(
              corruptWorkspaceDraftsToJson(activeCorruptDrafts),
              `${safeFilename('损坏项目草稿')}-${Date.now()}.json`,
            ),
          }}
          onClose={() => setCorruptDrafts([])}
        />
      )}

      {authOpen && (
        <AuthModal
          isOpen
          onClose={() => setAuthOpen(false)}
          onBeforeSignOut={prepareForUserSwitch}
        />
      )}

      {!restricted && wizardOpen && (
        <ProjectWizard
          onComplete={handleWizardComplete}
          onCancel={() => setWizardOpen(false)}
        />
      )}

      <Suspense fallback={null}>
        {isEditingCurrentProject && bomModalOpen && (
          <BomModal
            isOpen
            onClose={() => setBomModalOpen(false)}
          />
        )}

        {isEditingCurrentProject && quoteModalOpen && (
          <QuoteModal
            key={`${currentUser?.id}:${currentUser?.role}`}
            isOpen
            onClose={() => setQuoteModalOpen(false)}
          />
        )}
      </Suspense>

    </>
  );
}

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, FolderOpen, Loader2 } from 'lucide-react';
import { AuthModal } from '@/components/auth/AuthModal';
import { AdminShell } from '@/components/layout/AdminShell';
import { MainLayout } from '@/components/layout/MainLayout';
import { ActionToast } from '@/components/shared/ActionToast';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { StorageSetupBanner } from '@/components/shared/StorageSetupBanner';
import { ProjectList } from '@/components/project/ProjectList';
import { ProjectWizard } from '@/components/project/ProjectWizard';
import { useAppRoute } from '@/hooks/useAppRoute';
import { appRoutes, getRouteByPath } from '@/lib/appRoute';
import { downloadTextFile, safeFilename } from '@/lib/designFile';
import { checkStorageBootstrap, type StorageBootstrapState } from '@/lib/storageBootstrap';
import { supabase } from '@/lib/supabaseClient';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import {
  canApplyWorkspaceDraft,
  readWorkspaceDraft,
  removeWorkspaceDraft,
  removeWorkspaceDraftIfRevisionAtMost,
  writeWorkspaceDraft,
  type WorkspaceDraft,
} from '@/lib/workspaceDraftCache';
import { projectRepository } from '@/repositories/projectRepository';
import { flushDrawingDrafts, resetDrawingStore, useDrawingStore } from '@/stores/drawingStore';
import { createDefaultConfig, useHarnessStore } from '@/stores/harnessStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePriceStore } from '@/stores/priceStore';
import { useHistoryStore } from '@/stores/historyStore';
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

function ModuleLoadingState() {
  return (
    <div className="flex h-full items-center justify-center bg-slate-100 p-4 text-sm text-slate-500">
      <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-600" />
      页面加载中...
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

function ProjectRequiredState({ onNavigateHome }: { onNavigateHome: () => void }) {
  return (
    <div className="flex h-full items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <FolderOpen className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-4 text-base font-semibold text-slate-900">尚未打开项目</h2>
        <p className="mt-2 text-sm text-slate-500">
          请先从首页打开项目，再进入线束设计器。
        </p>
        <button
          type="button"
          onClick={onNavigateHome}
          className="mt-5 cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          返回首页
        </button>
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
  const { route, projectId, navigate } = useAppRoute();
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
  const projectsLoadRequestRef = useRef(0);
  const workspaceSessionRef = useRef(0);
  const projectOpenRequestRef = useRef(0);
  const [projectsReady, setProjectsReady] = useState<{
    userId: string;
    requestId: number;
  } | null>(null);
  const [isRestoringProject, setIsRestoringProject] = useState(false);
  const [failedProjectId, setFailedProjectId] = useState<string | null>(null);
  const [draftRecovery, setDraftRecovery] = useState<{
    ownerId: string;
    projectId: string;
    draft: WorkspaceDraft;
  } | null>(null);
  const [draftBackupError, setDraftBackupError] = useState<string | null>(null);
  const restoreFailed = Boolean(projectId && failedProjectId === projectId);

  const currentUser = useUserStore((state) => state.currentUser);
  const currentUserId = currentUser?.id;
  const authReady = useUserStore((state) => state.authReady);
  const initializeAuth = useUserStore((state) => state.initialize);
  const initializeCatalog = useCatalogStore((state) => state.initialize);
  const refreshCatalogIfStale = useCatalogStore((state) => state.refreshIfStale);
  const catalogStatus = useCatalogStore((state) => state.status);
  const catalogError = useCatalogStore((state) => state.error);
  const loadPrices = usePriceStore((state) => state.load);
  const {
    currentProject,
    projects,
    saveCurrentConfig,
    setCurrentProject,
    updateProject,
    loadProjects,
  } = useProjectStore();
  const { config, markSaveError, markSaved, markSaving, replaceDocument, saveState } = useHarnessStore();
  const configRef = useRef(config);
  const canUndo = useHistoryStore((state) => state.past.length > 0);
  const canRedo = useHistoryStore((state) => state.future.length > 0);
  const drawingSaveState = useDrawingStore((state) => state.saveState);
  const saveActiveDrawing = useDrawingStore((state) => state.saveActiveDocument);

  const needsCatalog = route.section === 'designer'
    || route.id === 'materials'
    || route.id === 'drawing-workbench'
    || wizardOpen;

  const needsStorageBootstrap = Boolean(supabase) && (
    route.section === 'designer'
    || route.id === 'materials'
    || route.id === 'drawing-workbench'
  );

  useEffect(() => {
    configRef.current = config;
  }, [config]);

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

  useEffect(() => initializeAuth(), [initializeAuth]);

  useEffect(() => {
    if (!needsStorageBootstrap) return;
    const timer = setTimeout(() => {
      void performStorageBootstrapCheck();
    }, 0);
    return () => clearTimeout(timer);
  }, [needsStorageBootstrap, performStorageBootstrapCheck]);

  useEffect(() => {
    if (!needsCatalog) return;
    void initializeCatalog().catch(() => {
      // The catalog store exposes the error state to the shell; no mock fallback is used.
    });
    void loadPrices().catch(() => {
      // Background preload; QuoteModal handles loading/fallback gracefully.
    });
  }, [needsCatalog, initializeCatalog, loadPrices]);

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

  useEffect(() => {
    if (catalogStatus !== 'ready' || !currentProject || configRef.current.id !== currentProject.id) return;
    replaceDocument(configRef.current, { markSaved: saveState.status === 'saved' });
  }, [catalogStatus, currentProject, config.id, replaceDocument, saveState.status]);

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

  const writeProjectDraft = useCallback((): void => {
    if (saveBlocked) return;
    const project = useProjectStore.getState().currentProject;
    const ownerId = useUserStore.getState().currentUser?.id ?? null;
    const harness = useHarnessStore.getState();
    if (!project || !ownerId || harness.saveState.status === 'saved') return;
    const result = writeWorkspaceDraft({
      ownerId,
      kind: 'project',
      documentId: project.id,
      revision: harness.config.updatedAt,
      baseUpdatedAt: project.updatedAt,
      document: harness.config,
    });
    setDraftBackupError(result.ok ? null : result.error ?? '本地草稿备份失败。');
  }, [saveBlocked]);

  const doSave = useCallback(async (options?: { retry?: boolean }) => {
    if (!currentProject || saveBlocked) {
      return;
    }

    const saveUserId = useUserStore.getState().currentUser?.id ?? null;
    const saveSession = workspaceSessionRef.current;
    const saveOpenRequest = projectOpenRequestRef.current;
    const saveProjectId = currentProject.id;
    const isSaveContextCurrent = () => (
      workspaceSessionRef.current === saveSession
      && projectOpenRequestRef.current === saveOpenRequest
      && (useUserStore.getState().currentUser?.id ?? null) === saveUserId
      && (useProjectStore.getState().currentProject?.id ?? null) === saveProjectId
    );

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
      const task = (async () => {
        markSaving();
        try {
          await saveCurrentConfig(latestConfig);
          if (!isSaveContextCurrent()) return;
          if (useHarnessStore.getState().config.updatedAt === latestConfig.updatedAt) {
            markSaved();
            const ownerId = useUserStore.getState().currentUser?.id;
            if (ownerId) {
              removeWorkspaceDraftIfRevisionAtMost(ownerId, 'project', saveProjectId, latestConfig.updatedAt);
            }
          }
        } catch (error) {
          if (!isSaveContextCurrent()) return;
          console.error('项目保存失败:', error);
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
    }
  }, [currentProject, markSaveError, markSaved, markSaving, saveBlocked, saveCurrentConfig]);

  const prepareForUserSwitch = useCallback(async () => {
    const hasUnsavedProject = Boolean(currentProject && saveState.status !== 'saved');
    const hasUnsavedDrawing = drawingSaveState !== 'saved';

    if (!hasUnsavedProject && !hasUnsavedDrawing) return true;
    if (hasUnsavedProject && saveBlocked) {
      window.alert('当前项目无法保存，请先处理保存错误后再切换用户。');
      return false;
    }

    const shouldSave = window.confirm('当前工作区有未保存修改。确定保存后切换用户吗？');
    if (!shouldSave) return false;

    if (hasUnsavedProject) {
      await doSave({ retry: true });
      if (useHarnessStore.getState().saveState.status !== 'saved') {
        window.alert('项目保存失败，已取消用户切换。');
        return false;
      }
    }

    if (hasUnsavedDrawing) {
      try {
        await saveActiveDrawing();
      } catch (error) {
        console.error('图纸保存失败:', error);
        window.alert('图纸保存失败，已取消用户切换。');
        return false;
      }
    }
    return true;
  }, [currentProject, doSave, drawingSaveState, saveActiveDrawing, saveBlocked, saveState.status]);

  const resetWorkspaceForUser = useCallback((destinationPath = appRoutes.home.path) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    workspaceSessionRef.current += 1;
    projectOpenRequestRef.current += 1;
    restoreProjectAttemptRef.current = null;
    setFailedProjectId(null);
    setIsRestoringProject(false);
    setWizardOpen(false);
    setLoadError(null);
    setRecoveryRaw(null);
    setSaveBlocked(false);
    setDraftRecovery(null);
    setDraftBackupError(null);
    useProjectStore.getState().resetProjects();
    resetDrawingStore();
    replaceDocument(createDefaultConfig(), { markSaved: true });
    useHarnessStore.getState().setCanvasViewport(null);
    useHarnessStore.getState().setTwoDViewport(null);
    useHistoryStore.getState().clear();
    navigate(destinationPath);
  }, [navigate, replaceDocument]);

  useEffect(() => {
    if (!authReady) return;

    const nextUserId = currentUser?.id ?? null;
    const previousUserId = previousAuthUserIdRef.current;
    previousAuthUserIdRef.current = nextUserId;
    if (previousUserId === undefined || previousUserId === nextUserId) return;

    const keepRequestedProject = previousUserId === null
      && Boolean(projectId)
      && route.section === 'designer';
    resetWorkspaceForUser(
      keepRequestedProject ? route.path : appRoutes.home.path,
    );
  }, [authReady, currentUser?.id, projectId, resetWorkspaceForUser, route.path, route.section]);

  // 必须在账号重置（resetWorkspaceForUser 使旧会话代次失效）之后执行，否则新账号的列表请求会捕获旧代次并被丢弃。
  useEffect(() => {
    const requestId = ++projectsLoadRequestRef.current;
    if (!authReady || !currentUserId) {
      return;
    }

    let cancelled = false;
    void loadProjects(currentUserId)
      .then(() => {
        if (!cancelled && requestId === projectsLoadRequestRef.current) {
          setProjectsReady({ userId: currentUserId, requestId });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('项目列表加载失败:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, currentUserId, loadProjects]);

  useEffect(() => {
    if (saveState.status !== 'dirty' || !currentProject || saveBlocked) {
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
  }, [config, currentProject, doSave, saveBlocked, saveState.status]);

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

      useHistoryStore.getState().pushState(previousState.config);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (route.section !== 'designer') return;

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
  }, [handleRedo, handleUndo, route.section]);

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

      if (!currentProject || saveBlocked) {
        return;
      }

      try {
        projectRepository.emergencySave(currentProject.id, useHarnessStore.getState().config);
      } catch {
        // best effort flush only
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentProject, drawingSaveState, saveBlocked, saveState.status, writeProjectDraft]);

  const handleNewProject = () => {
    if (!currentUser) {
      setAuthOpen(true);
      return;
    }

    setLoadError(null);
    setRecoveryRaw(null);
    setSaveBlocked(false);
    setWizardOpen(true);
  };

  const handleNavigate = useCallback((path: string) => {
    const nextRoute = getRouteByPath(path);
    const activeProjectId = currentProject?.id;
    if (nextRoute.section === 'designer' && activeProjectId) {
      navigate(path, { projectId: activeProjectId });
      return;
    }

    navigate(path);
  }, [currentProject, navigate]);

  const handleOpenProject = useCallback(async (
    project: Project,
    destinationPath = appRoutes['designer-design'].path,
  ) => {
    const requestUserId = useUserStore.getState().currentUser?.id ?? null;
    if (!requestUserId || project.userId !== requestUserId) {
      return;
    }

    const requestSession = workspaceSessionRef.current;
    const requestId = ++projectOpenRequestRef.current;
    const isRequestCurrent = () => (
      workspaceSessionRef.current === requestSession
      && projectOpenRequestRef.current === requestId
      && (useUserStore.getState().currentUser?.id ?? null) === requestUserId
    );

    setIsRestoringProject(true);
    setFailedProjectId(null);
    setDraftRecovery(null);
    setDraftBackupError(null);
    setCurrentProject(project);
    useHarnessStore.getState().setCanvasViewport(null);
    useHarnessStore.getState().setTwoDViewport(null);
    const history = useHistoryStore.getState();
    history.clear();
    history.pause();

    try {
      const result = await projectRepository.load(project.id);

      if (!isRequestCurrent()) return;

      if (result.status === 'ok') {
        replaceDocument(result.config, { markSaved: true });
        if (result.config.name !== project.name) {
          await updateProject(project.id, { name: result.config.name });
          if (!isRequestCurrent()) return;
        }
        const draft = readWorkspaceDraft(requestUserId, 'project', project.id);
        if (draft) {
          const draftConfig = draft.document as HarnessConfig;
          if (draftConfig.updatedAt === result.config.updatedAt) {
            removeWorkspaceDraft(requestUserId, 'project', project.id);
          } else {
            setDraftRecovery({ ownerId: requestUserId, projectId: project.id, draft });
          }
        }
        setLoadError(null);
        setRecoveryRaw(null);
        setSaveBlocked(false);
      } else {
        replaceDocument(createDefaultConfig(), { markSaved: true });
        if (result.status === 'invalid') {
          setLoadError(
            `项目“${project.name}”的结构校验失败，已保留原始恢复副本（${result.issues.slice(0, 2).join('；')}）。`,
          );
          setRecoveryRaw(result.raw);
        } else {
          setLoadError(`无法加载项目“${project.name}”的配置数据，已打开空白工作区。`);
          setRecoveryRaw(null);
        }
        setSaveBlocked(true);
      }
    } catch (error) {
      if (!isRequestCurrent()) return;
      console.error('项目打开失败:', error);
      setFailedProjectId(project.id);
      setCurrentProject(null);
      replaceDocument(createDefaultConfig(), { markSaved: true });
      setLoadError(getUserErrorMessage(error, '项目加载失败，请重试。'));
      setRecoveryRaw(null);
      setSaveBlocked(false);
      useHistoryStore.getState().clear();
      navigate(appRoutes.home.path);
      return;
    } finally {
      if (isRequestCurrent()) {
        history.resume();
        setIsRestoringProject(false);
      }
    }

    if (!isRequestCurrent()) return;
    navigate(destinationPath, { projectId: project.id });
  }, [navigate, replaceDocument, setCurrentProject, updateProject]);

  useEffect(() => {
    if (!projectId || route.section !== 'designer' || !authReady || !currentUserId) {
      if (!projectId || !currentUserId) {
        restoreProjectAttemptRef.current = null;
      }
      return;
    }

    if (currentProject?.id === projectId && config.id === projectId) {
      return;
    }

    const isRemoteReady = Boolean(
      projectsReady
      && projectsReady.userId === currentUserId
      && projectsReady.requestId === projectsLoadRequestRef.current,
    );

    const project = projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      if (!isRemoteReady) {
        return;
      }
      setFailedProjectId(projectId);
      setCurrentProject(null);
      replaceDocument(createDefaultConfig(), { markSaved: true });
      navigate(appRoutes.home.path);
      return;
    }

    const attemptKey = `${currentUserId}:${projectId}`;
    if (restoreProjectAttemptRef.current === attemptKey) {
      return;
    }
    restoreProjectAttemptRef.current = attemptKey;

    let cancelled = false;
    void Promise.resolve()
      .then(() => {
        if (cancelled) return;
        return handleOpenProject(project, route.path);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('项目恢复失败:', error);
        setFailedProjectId(projectId);
        setCurrentProject(null);
        replaceDocument(createDefaultConfig(), { markSaved: true });
        navigate(appRoutes.home.path);
      });

    return () => {
      cancelled = true;
    };
  }, [
    authReady,
    config.id,
    currentProject?.id,
    currentUserId,
    handleOpenProject,
    navigate,
    projectId,
    projects,
    projectsReady,
    replaceDocument,
    route.path,
    route.section,
    setCurrentProject,
  ]);

  const handleWizardComplete = () => {
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
        window.alert('项目保存失败，已取消关闭，请重试。');
        return;
      }
    }

    if (!isCloseCurrent()) return;

    setDraftRecovery(null);
    setDraftBackupError(null);

    restoreProjectAttemptRef.current = null;
    setFailedProjectId(null);
    setIsRestoringProject(false);
    setCurrentProject(null);
    setLoadError(null);
    setRecoveryRaw(null);
    setSaveBlocked(false);
    useHarnessStore.getState().setCanvasViewport(null);
    useHarnessStore.getState().setTwoDViewport(null);
    useHistoryStore.getState().clear();
    navigate(appRoutes.home.path);
  };

  const handleUpdateProjectName = useCallback((nextName: string) => {
    if (!currentProject) return;
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === currentProject.name) return;
    useHarnessStore.getState().setConfig({ name: trimmed });
    void updateProject(currentProject.id, { name: trimmed });
  }, [currentProject, updateProject]);

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
    if (!currentProject || (projectId && currentProject.id !== projectId) || isRestoringProject) {
      if (projectId && !restoreFailed) {
        return <ProjectRestoringState />;
      }
      return <ProjectRequiredState onNavigateHome={() => navigate(appRoutes.home.path)} />;
    }

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
    if (route.section === 'designer') {
      return renderDesignerContent();
    }

    if (route.id === 'drawing-workbench') {
      return <DrawingWorkbenchPage />;
    }

    if (route.id === 'materials') {
      return <MaterialLibraryPage />;
    }

    return (
      <ProjectList
        onNewProject={handleNewProject}
        onOpenProject={(project) => void handleOpenProject(project)}
      />
    );
  };

  return (
    <>
      <AdminShell
        route={route}
        currentUser={currentUser}
        currentProjectName={currentProject?.name}
        saveStatusLabel={saveStatusLabel}
        saveStatusClass={saveStatusClass}
        saveBlocked={saveBlocked}
        canUndo={canUndo}
        canRedo={canRedo}
        onNavigate={handleNavigate}
        onUndo={handleUndo}
        onRedo={handleRedo}
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
            目录数据暂时不可用：{catalogError ?? '请检查云端服务配置后重试。'}
          </div>
        )}
        {draftBackupError && (
          <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-1.5 text-xs text-red-700">
            本地草稿备份失败：{draftBackupError}。请保持页面打开，或重试保存。
          </div>
        )}
        <ErrorBoundary fallback={<ModuleLoadErrorState />}>
          <Suspense fallback={<ModuleLoadingState />}>
            {renderContent()}
          </Suspense>
        </ErrorBoundary>
      </AdminShell>

      {draftRecovery && (
        <ActionToast
          role="alertdialog"
          title="发现本地草稿"
          message="本地保存了未同步到云端的项目修改。恢复本地草稿会使用本地版本，使用云端版本会丢弃本地草稿。"
          secondaryAction={{
            label: '使用云端版本',
            onClick: () => {
              const ownerId = useUserStore.getState().currentUser?.id ?? null;
              const currentProjectId = useProjectStore.getState().currentProject?.id ?? null;
              if (canApplyWorkspaceDraft(draftRecovery.draft, { ownerId, documentId: currentProjectId })) {
                removeWorkspaceDraft(draftRecovery.ownerId, 'project', draftRecovery.projectId);
              }
              setDraftRecovery(null);
            },
          }}
          primaryAction={{
            label: '恢复本地草稿',
            onClick: () => {
              const ownerId = useUserStore.getState().currentUser?.id ?? null;
              const currentProjectId = useProjectStore.getState().currentProject?.id ?? null;
              if (!canApplyWorkspaceDraft(draftRecovery.draft, { ownerId, documentId: currentProjectId })) {
                setDraftRecovery(null);
                return;
              }
              replaceDocument(draftRecovery.draft.document as HarnessConfig, { markSaved: false });
              setDraftRecovery(null);
            },
          }}
          onClose={() => setDraftRecovery(null)}
        />
      )}

      {authOpen && (
        <AuthModal
          isOpen
          onClose={() => setAuthOpen(false)}
          onBeforeSignOut={prepareForUserSwitch}
        />
      )}

      {wizardOpen && (
        <ProjectWizard
          onComplete={handleWizardComplete}
          onCancel={() => setWizardOpen(false)}
        />
      )}

      <Suspense fallback={null}>
        {bomModalOpen && (
          <BomModal
            isOpen
            onClose={() => setBomModalOpen(false)}
          />
        )}

        {quoteModalOpen && (
          <QuoteModal
            isOpen
            onClose={() => setQuoteModalOpen(false)}
          />
        )}
      </Suspense>

    </>
  );
}

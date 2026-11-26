import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AuthModal } from '@/components/auth/AuthModal';
import { LoginRequiredPanel } from '@/components/auth/LoginRequiredPanel';
import { AdminShell } from '@/components/layout/AdminShell';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProjectList } from '@/components/project/ProjectList';
import { ProjectWizard } from '@/components/project/ProjectWizard';
import { WorkspaceRecoveryToasts } from '@/components/project/WorkspaceRecoveryToasts';
import {
  AuthLoadingState,
  LoadErrorBanner,
  ModuleLoadErrorState,
  ModuleLoadingState,
  ProjectRestoringState,
} from '@/components/shared/AppStatusViews';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { StorageSetupBanner } from '@/components/shared/StorageSetupBanner';
import { useAppRoute } from '@/hooks/useAppRoute';
import { useProjectSaveAndRecovery } from '@/hooks/useProjectSaveAndRecovery';
import { appRoutes, defaultRoute, getRouteByPath, requiresAuth, resolveRoleRoute, shouldKeepRouteAfterLogin } from '@/lib/appRoute';
import { checkStorageBootstrap, type StorageBootstrapState } from '@/lib/storageBootstrap';
import { supabase } from '@/lib/supabaseClient';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import { listCorruptWorkspaceDrafts, nextProjectRecoveryDraft } from '@/lib/workspaceDraftCache';
import { projectRepository } from '@/repositories/projectRepository';
import { useCatalogStore } from '@/stores/catalogStore';
import { releaseDrawingStore, useDrawingStore } from '@/stores/drawingStore';
import { useFinishedHarnessStore } from '@/stores/finishedHarnessStore';
import { createDefaultConfig, useHarnessStore } from '@/stores/harnessStore';
import { useHistoryStore } from '@/stores/historyStore';
import { notify } from '@/stores/noticeStore';
import { usePriceStore } from '@/stores/priceStore';
import { useProjectStore } from '@/stores/projectStore';
import { useUserStore } from '@/stores/userStore';
import type { Project } from '@/types/user';

const HarnessCanvas = lazy(() => import('@/components/canvas/HarnessCanvas').then((module) => ({ default: module.HarnessCanvas })));
const TwoDView = lazy(() => import('@/components/drawings/TwoDView').then((module) => ({ default: module.TwoDView })));
const BomModal = lazy(() => import('@/components/panels/BomPanel').then((module) => ({ default: module.BomModal })));
const QuoteModal = lazy(() => import('@/components/panels/QuotePanel').then((module) => ({ default: module.QuoteModal })));
const MaterialLibraryPage = lazy(() => import('@/pages/MaterialLibraryPage').then((module) => ({ default: module.MaterialLibraryPage })));
const DrawingWorkbenchPage = lazy(() => import('@/pages/DrawingWorkbenchPage').then((module) => ({ default: module.DrawingWorkbenchPage })));
const DwgViewerPage = lazy(() => import('@/pages/DwgViewerPage').then((module) => ({ default: module.DwgViewerPage })));
const ModelViewerPage = lazy(() => import('@/pages/ModelViewerPage').then((module) => ({ default: module.ModelViewerPage })));
const RequestQuotePage = lazy(() => import('@/pages/RequestQuotePage'));
const QuoteRequestsPage = lazy(() => import('@/pages/QuoteRequestsPage'));
const AutoQuotePage = lazy(() => import('@/pages/AutoQuotePage').then((module) => ({ default: module.AutoQuotePage })));

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

export default function App() {
  const currentUser = useUserStore((state) => state.currentUser);
  const restricted = Boolean(currentUser && currentUser.role !== 'engineer' && currentUser.role !== 'admin');
  const { route: requestedRoute, projectId: requestedProjectId, navigate, navigationVersion, getNavigationVersion } = useAppRoute();
  const projectId = restricted ? null : requestedProjectId;
  const allowedRoute = resolveRoleRoute(requestedRoute, currentUser ? currentUser.role ?? 'sales' : undefined);
  useEffect(() => {
    if (currentUser?.role === 'sales' && allowedRoute !== requestedRoute) navigate(allowedRoute.path, { replace: true });
  }, [currentUser?.role, allowedRoute, requestedRoute, navigate]);
  const [authOpen, setAuthOpen] = useState(false);
  const [bomModalOpen, setBomModalOpen] = useState(false);
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [storageBootstrapState, setStorageBootstrapState] = useState<StorageBootstrapState>({
    status: 'unconfigured',
  });
  const [storageChecking, setStorageChecking] = useState(false);
  const storageCheckInFlightRef = useRef<Promise<StorageBootstrapState> | null>(null);
  const previousAuthUserIdRef = useRef<string | null | undefined>(undefined);
  const restoreProjectAttemptRef = useRef<string | null>(null);
  const workspaceSessionRef = useRef(0);
  const projectOpenRequestRef = useRef(0);

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
  const route = currentUserId && allowedRoute.section === 'designer' && !projectId && !currentProject ? defaultRoute : allowedRoute;
  const isEditingCurrentProject = route.section === 'designer'
    && Boolean(currentProject && (!projectId || currentProject.id === projectId));

  const { config, markSaveError, markSaved, markSaving, replaceDocument, saveState } = useHarnessStore();
  const catalogSnapshot = useCatalogStore((state) => state.snapshot);
  const refreshCatalogReferences = useHarnessStore((state) => state.refreshCatalogReferences);
  const canUndo = useHistoryStore((state) => state.past.length > 0);
  const canRedo = useHistoryStore((state) => state.future.length > 0);
  const drawingSaveState = useDrawingStore((state) => state.saveState);
  const saveActiveDrawing = useDrawingStore((state) => state.saveActiveDocument);

  const {
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
    dismissDraftRecovery,
    dismissCorruptDrafts,
    isRetrySaveAvailable,
  } = useProjectSaveAndRecovery({
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
  });

  const needsCatalog = Boolean(currentUserId) && (
    route.section === 'designer'
    || route.id === 'materials'
    || route.id === 'drawing-workbench'
    || route.section === 'auto-quote'
    || wizardOpen
  );

  const needsStorageBootstrap = Boolean(supabase) && Boolean(currentUserId) && (
    route.id === 'model-viewer'
    || route.section === 'designer'
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

  const resetWorkspaceForUser = useCallback((destinationPath = defaultRoute.path, destinationProjectId: string | null = null) => {
    resetRecoveryState();
    workspaceSessionRef.current += 1;
    projectOpenRequestRef.current += 1;
    restoreProjectAttemptRef.current = null;
    setWizardOpen(false);
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
  }, [navigate, replaceDocument, resetRecoveryState]);

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
      applyProjectLoadRecovery({
        draft: draft ? { ownerId: owner.id, projectId: project.id, draft } : null,
        damagedDrafts,
        loadError: result.status === 'invalid'
          ? `项目“${project.name}”的结构校验失败，已保留原始恢复副本（${result.issues.slice(0, 2).join('；')}）。`
          : null,
        recoveryRaw: result.status === 'invalid' ? result.raw : null,
        saveBlocked: result.status === 'invalid',
      });
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
      navigate(destinationPath, { projectId: project.id });
    } catch (error) {
      if (!isRequestCurrent()) return;
      console.error('项目打开失败:', error);
      notify({ tone: 'danger', title: '打开项目失败', message: getUserErrorMessage(error, '项目加载失败，请重试。') });
      returnToList();
    }
  }, [applyProjectLoadRecovery, getNavigationVersion, navigate, replaceDocument, saveBeforeLeavingWorkspace, setCurrentProject, setCurrentProjectVersion]);

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
    clearRecoveryOnWizardComplete();
    setWizardOpen(false);
    useHarnessStore.getState().setCanvasViewport(null);
    useHarnessStore.getState().setTwoDViewport(null);
    useHistoryStore.getState().clear();
    navigate(appRoutes['designer-design'].path, {
      projectId: useProjectStore.getState().currentProject?.id ?? null,
    });
  };

  const handleCloseProject = async () => {
    clearSaveTimer();

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

    clearDraftOnClose();
    restoreProjectAttemptRef.current = null;
    projectOpenRequestRef.current += 1;
    setCurrentProject(null);
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
    clearRecoveryForDeletedProject(project);
  };

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

    if (route.id === 'request-quote') return <RequestQuotePage />;
    if (route.id === 'quote-requests' && currentUser) {
      return <QuoteRequestsPage key={`${currentUser.id}:${currentUser.role}`} user={currentUser} />;
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
        onRetrySave={isRetrySaveAvailable ? retryProjectSave : undefined}
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
        {needsCatalog && catalogStatus === 'error' && (
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

      <WorkspaceRecoveryToasts
        isEditingCurrentProject={isEditingCurrentProject}
        currentProjectId={currentProject?.id}
        saveState={saveState}
        switchConfirmOpen={switchConfirmOpen}
        activeDraftRecovery={activeDraftRecovery}
        saveConflict={saveConflict}
        conflictReadConfirmOpen={conflictReadConfirmOpen}
        conflictResolving={conflictResolving}
        activeCorruptDrafts={activeCorruptDrafts}
        onResolveSwitchConfirmation={resolveSwitchConfirmation}
        onUseCloudVersion={handleUseCloudVersion}
        onRestoreLocalDraft={handleRestoreLocalDraft}
        onDismissDraftRecovery={dismissDraftRecovery}
        onResolveConflictSaveAsNew={() => void resolveConflictSaveAsNew()}
        onOpenConflictReadConfirm={() => setConflictReadConfirmOpen(true)}
        onDownloadLocalCopy={downloadLocalProjectCopy}
        onCancelConflictReadConfirm={() => setConflictReadConfirmOpen(false)}
        onConfirmConflictReadCloud={() => void resolveConflictReadCloud()}
        onDiscardCorruptDrafts={handleDiscardCorruptDrafts}
        onDownloadCorruptDrafts={handleDownloadCorruptDrafts}
        onDismissCorruptDrafts={dismissCorruptDrafts}
      />

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

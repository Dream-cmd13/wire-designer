import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Download, FolderOpen } from 'lucide-react';
import { AuthModal } from '@/components/auth/AuthModal';
import { HarnessCanvas } from '@/components/canvas/HarnessCanvas';
import { AdminShell } from '@/components/layout/AdminShell';
import { MainLayout } from '@/components/layout/MainLayout';
import { StorageSetupBanner } from '@/components/shared/StorageSetupBanner';
import { TwoDView } from '@/components/drawings/TwoDView';
import { BomPanel } from '@/components/panels/BomPanel';
import { QuotePanel } from '@/components/panels/QuotePanel';
import { ProjectList } from '@/components/project/ProjectList';
import { ProjectWizard } from '@/components/project/ProjectWizard';
import { useAppRoute } from '@/hooks/useAppRoute';
import { appRoutes, getRouteByPath } from '@/lib/appRoute';
import { downloadTextFile, safeFilename } from '@/lib/designFile';
import { checkStorageBootstrap, type StorageBootstrapState } from '@/lib/storageBootstrap';
import { supabase } from '@/lib/supabaseClient';
import { getUserErrorMessage } from '@/lib/userErrorMessage';
import { projectRepository } from '@/repositories/projectRepository';
import { useDrawingStore } from '@/stores/drawingStore';
import { createDefaultConfig, useHarnessStore } from '@/stores/harnessStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useProjectStore } from '@/stores/projectStore';
import { useUserStore } from '@/stores/userStore';
import { ConnectorLibraryPage } from '@/pages/ConnectorLibraryPage';
import { DrawingWorkbenchPage } from '@/pages/DrawingWorkbenchPage';
import { HarnessLibraryPage } from '@/pages/HarnessLibraryPage';
import type { Project } from '@/types/user';

function RightPanel() {
  const [bomCollapsed, setBomCollapsed] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <QuotePanel />
      <div className="border-t border-slate-200">
        <button
          type="button"
          onClick={() => setBomCollapsed((value) => !value)}
          className="flex w-full cursor-pointer items-center justify-between px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
        >
          <span className="font-semibold">BOM物料清单</span>
          {bomCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
        {!bomCollapsed && (
          <div className="px-4 pb-4">
            <BomPanel />
          </div>
        )}
      </div>
    </div>
  );
}

function DesignerView() {
  return (
    <MainLayout rightPanel={<RightPanel />}>
      <HarnessCanvas />
    </MainLayout>
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function ProjectRequiredState({ onNavigateHome }: { onNavigateHome: () => void }) {
  return (
    <div className="flex h-full items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <FolderOpen className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-4 text-base font-semibold text-slate-900">尚未打开项目</h2>
        <p className="mt-2 text-sm text-slate-500">
          请先从首页或线束库打开项目，再进入线束设计器。
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
  const [projectsReady, setProjectsReady] = useState<{
    userId: string;
    requestId: number;
  } | null>(null);

  const currentUser = useUserStore((state) => state.currentUser);
  const currentUserId = currentUser?.id;
  const authReady = useUserStore((state) => state.authReady);
  const initializeAuth = useUserStore((state) => state.initialize);
  const initializeCatalog = useCatalogStore((state) => state.initialize);
  const refreshCatalogIfStale = useCatalogStore((state) => state.refreshIfStale);
  const catalogStatus = useCatalogStore((state) => state.status);
  const catalogError = useCatalogStore((state) => state.error);
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
    || route.id === 'library-connectors'
    || route.id === 'drawing-workbench'
    || route.id === 'library-harnesses'
    || wizardOpen;

  const needsStorageBootstrap = Boolean(supabase) && (
    route.section === 'designer'
    || route.id === 'library-connectors'
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
    void performStorageBootstrapCheck();
  }, [needsStorageBootstrap, performStorageBootstrapCheck]);

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
    if (!needsCatalog) return;
    void initializeCatalog().catch(() => {
      // The catalog store exposes the error state to the shell; no mock fallback is used.
    });
  }, [needsCatalog, initializeCatalog]);

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

  const doSave = useCallback(async () => {
    if (!currentProject || saveBlocked) {
      return;
    }
    if (saveInFlightRef.current) {
      await saveInFlightRef.current;
      return;
    }

    const task = (async () => {
      const latestConfig = useHarnessStore.getState().config;
      markSaving();
      try {
        await saveCurrentConfig(latestConfig);
        if (useHarnessStore.getState().config.updatedAt === latestConfig.updatedAt) {
          markSaved();
        }
      } catch (error) {
        console.error('项目保存失败:', error);
        markSaveError(getUserErrorMessage(error, '保存失败，请重试。'));
      }
    })();

    saveInFlightRef.current = task;
    try {
      await task;
    } finally {
      saveInFlightRef.current = null;
    }
  }, [currentProject, markSaveError, markSaved, markSaving, saveBlocked, saveCurrentConfig]);

  const prepareForUserSwitch = useCallback(async () => {
    const hasUnsavedProject = Boolean(
      currentProject && (saveState.status === 'dirty' || saveState.status === 'saving'),
    );
    const hasUnsavedDrawing = drawingSaveState === 'dirty';

    if (!hasUnsavedProject && !hasUnsavedDrawing) return true;
    if (hasUnsavedProject && saveBlocked) {
      window.alert('当前项目无法保存，请先处理保存错误后再切换用户。');
      return false;
    }

    const shouldSave = window.confirm('当前工作区有未保存修改。确定保存后切换用户吗？');
    if (!shouldSave) return false;

    if (hasUnsavedProject) {
      await doSave();
      if (useHarnessStore.getState().saveState.status === 'error') {
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

    setWizardOpen(false);
    setLoadError(null);
    setRecoveryRaw(null);
    setSaveBlocked(false);
    useProjectStore.getState().resetProjects();
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
    const handleBeforeUnload = () => {
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
  }, [currentProject, saveBlocked]);

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
    setCurrentProject(project);
    useHarnessStore.getState().setCanvasViewport(null);
    useHarnessStore.getState().setTwoDViewport(null);
    const history = useHistoryStore.getState();
    history.clear();
    history.pause();

    try {
      const result = await projectRepository.load(project.id);

      if (result.status === 'ok') {
        replaceDocument(result.config, { markSaved: true });
        if (result.config.name !== project.name) {
          await updateProject(project.id, { name: result.config.name });
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
    } finally {
      history.resume();
    }

    navigate(destinationPath, { projectId: project.id });
  }, [navigate, replaceDocument, setCurrentProject, updateProject]);

  useEffect(() => {
    if (
      !projectId
      || route.section !== 'designer'
      || !authReady
      || !currentUserId
      || !projectsReady
      || projectsReady.userId !== currentUserId
      || projectsReady.requestId !== projectsLoadRequestRef.current
    ) {
      if (!projectId || !currentUserId) {
        restoreProjectAttemptRef.current = null;
      }
      return;
    }

    const attemptKey = `${currentUserId}:${projectId}`;
    if (
      restoreProjectAttemptRef.current === attemptKey
      || (currentProject?.id === projectId && config.id === projectId)
    ) {
      return;
    }
    restoreProjectAttemptRef.current = attemptKey;

    const project = projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      setCurrentProject(null);
      replaceDocument(createDefaultConfig(), { markSaved: true });
      navigate(appRoutes.home.path);
      return;
    }

    let cancelled = false;
    void Promise.resolve()
      .then(() => {
        if (cancelled) return;
        return handleOpenProject(project, route.path);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('项目恢复失败:', error);
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

  const handleCloseProject = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    if (currentProject && !saveBlocked) {
      try {
        projectRepository.emergencySave(currentProject.id, useHarnessStore.getState().config);
      } catch {
        // best effort flush only
      }
    }

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
    if (!currentProject) {
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

    if (route.id === 'library-connectors') {
      return <ConnectorLibraryPage />;
    }

    if (route.id === 'library-harnesses') {
      return (
        <HarnessLibraryPage
          onOpenProject={(project) => void handleOpenProject(project)}
          onNavigateHome={() => navigate(appRoutes.home.path)}
        />
      );
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
        {renderContent()}
      </AdminShell>

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

    </>
  );
}

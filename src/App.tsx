import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Download, FolderOpen } from 'lucide-react';
import { AuthModal } from '@/components/auth/AuthModal';
import { HarnessCanvas } from '@/components/canvas/HarnessCanvas';
import { AdminShell } from '@/components/layout/AdminShell';
import { MainLayout } from '@/components/layout/MainLayout';
import { StorageSetupBanner } from '@/components/shared/StorageSetupBanner';
import { PdfDrawingPickerDialog } from '@/components/drawings/PdfDrawingPickerDialog';
import { ProductionDrawingView } from '@/components/drawings/ProductionDrawingView';
import { TwoDView } from '@/components/drawings/TwoDView';
import { BomPanel } from '@/components/panels/BomPanel';
import { ConfigPanel } from '@/components/panels/ConfigPanel';
import { QuotePanel } from '@/components/panels/QuotePanel';
import { ProjectList } from '@/components/project/ProjectList';
import { ProjectWizard } from '@/components/project/ProjectWizard';
import { useAppRoute } from '@/hooks/useAppRoute';
import { appRoutes } from '@/lib/appRoute';
import { downloadTextFile, safeFilename } from '@/lib/designFile';
import { pdfDrawings, type PdfDrawing } from '@/lib/pdfDrawings';
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
    <MainLayout leftPanel={<ConfigPanel />} rightPanel={<RightPanel />}>
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
  const { route, navigate } = useAppRoute();
  const [authOpen, setAuthOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recoveryRaw, setRecoveryRaw] = useState<string | null>(null);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [selectedPdfIds, setSelectedPdfIds] = useState<string[]>([]);
  const [pdfPickerOpen, setPdfPickerOpen] = useState(false);
  const [uploadedDrawings, setUploadedDrawings] = useState<PdfDrawing[]>([]);
  const [storageBootstrapState, setStorageBootstrapState] = useState<StorageBootstrapState>({
    status: 'unconfigured',
  });
  const [storageChecking, setStorageChecking] = useState(() => Boolean(supabase));
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const previousAuthUserIdRef = useRef<string | null | undefined>(undefined);

  const currentUser = useUserStore((state) => state.currentUser);
  const authReady = useUserStore((state) => state.authReady);
  const initializeAuth = useUserStore((state) => state.initialize);
  const initializeCatalog = useCatalogStore((state) => state.initialize);
  const catalogStatus = useCatalogStore((state) => state.status);
  const catalogError = useCatalogStore((state) => state.error);
  const { currentProject, saveCurrentConfig, setCurrentProject, updateProject, loadProjects } = useProjectStore();
  const { config, markSaveError, markSaved, markSaving, replaceDocument, saveState } = useHarnessStore();
  const canUndo = useHistoryStore((state) => state.past.length > 0);
  const canRedo = useHistoryStore((state) => state.future.length > 0);
  const drawingSaveState = useDrawingStore((state) => state.saveState);
  const saveActiveDrawing = useDrawingStore((state) => state.saveActiveDocument);

  const refreshStorageBootstrap = useCallback(async () => {
    setStorageChecking(true);
    try {
      setStorageBootstrapState(await checkStorageBootstrap(supabase));
    } finally {
      setStorageChecking(false);
    }
  }, []);

  useEffect(() => initializeAuth(), [initializeAuth]);

  useEffect(() => {
    let cancelled = false;
    void checkStorageBootstrap(supabase).then((state) => {
      if (cancelled) return;
      setStorageBootstrapState(state);
      setStorageChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authReady || !currentUser) return;
    void loadProjects(currentUser.id).catch((error) => {
      console.error('项目列表加载失败:', error);
    });
  }, [authReady, currentUser, loadProjects]);

  useEffect(() => {
    void initializeCatalog().catch(() => {
      // The catalog store exposes the error state to the shell; no mock fallback is used.
    });
  }, [initializeCatalog]);

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

  const resetWorkspaceForUser = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    setWizardOpen(false);
    setPdfPickerOpen(false);
    setSelectedPdfIds([]);
    setUploadedDrawings([]);
    setLoadError(null);
    setRecoveryRaw(null);
    setSaveBlocked(false);
    setCurrentProject(null);
    replaceDocument(createDefaultConfig(), { markSaved: true });
    useHistoryStore.getState().clear();
    navigate(appRoutes.home.path);
  }, [navigate, replaceDocument, setCurrentProject]);

  useEffect(() => {
    if (!authReady) return;

    const nextUserId = currentUser?.id ?? null;
    const previousUserId = previousAuthUserIdRef.current;
    previousAuthUserIdRef.current = nextUserId;
    if (previousUserId === undefined || previousUserId === nextUserId) return;

    resetWorkspaceForUser();
  }, [authReady, currentUser?.id, resetWorkspaceForUser]);

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

  const handleOpenProject = async (project: Project) => {
    setCurrentProject(project);
    setPdfPickerOpen(false);
    const history = useHistoryStore.getState();
    history.clear();
    history.pause();

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

    history.resume();
    navigate(appRoutes['designer-design'].path);
  };

  const handleWizardComplete = () => {
    setLoadError(null);
    setRecoveryRaw(null);
    setSaveBlocked(false);
    setWizardOpen(false);
    useHistoryStore.getState().clear();
    setPdfPickerOpen(false);
    navigate(appRoutes['designer-design'].path);
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
    setPdfPickerOpen(false);
    useHistoryStore.getState().clear();
    navigate(appRoutes.home.path);
  };

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

    const content = (() => {
      if (route.id === 'designer-pdf') {
        return (
          <ProductionDrawingView
            drawings={[...pdfDrawings, ...uploadedDrawings]}
            selectedIds={selectedPdfIds}
            onChooseDrawings={() => setPdfPickerOpen(true)}
          />
        );
      }

      if (route.id === 'designer-product-image') {
        return <TwoDView />;
      }

      return <DesignerView />;
    })();

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
        onNavigate={navigate}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenAuth={() => setAuthOpen(true)}
        onCloseProject={handleCloseProject}
      >
        <StorageSetupBanner
          state={storageBootstrapState}
          checking={storageChecking}
          onRetry={() => void refreshStorageBootstrap()}
        />
        {catalogStatus === 'error' && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            目录数据暂时不可用：{catalogError ?? '请检查 Supabase 配置后重试。'}
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

      {pdfPickerOpen && (
        <PdfDrawingPickerDialog
          drawings={[...pdfDrawings, ...uploadedDrawings]}
          initialSelection={selectedPdfIds}
          onClose={() => setPdfPickerOpen(false)}
          onUpload={(newDrawings) => {
            setUploadedDrawings((prev) => {
              const existingIds = new Set(prev.map((drawing) => drawing.id));
              return [...prev, ...newDrawings.filter((drawing) => !existingIds.has(drawing.id))];
            });
          }}
          onConfirm={(drawingIds) => {
            setSelectedPdfIds(drawingIds);
            setPdfPickerOpen(false);
            navigate(appRoutes['designer-pdf'].path);
          }}
        />
      )}
    </>
  );
}

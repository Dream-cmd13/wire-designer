import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Download, FolderOpen, Redo2, Undo2, User } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProjectList } from '@/components/project/ProjectList';
import { downloadTextFile, safeFilename } from '@/lib/designFile';
import { projectRepository } from '@/repositories/projectRepository';
import { createDefaultConfig, useHarnessStore } from '@/stores/harnessStore';
import { useProjectStore } from '@/stores/projectStore';
import { useUserStore } from '@/stores/userStore';
import { useHistoryStore } from '@/stores/historyStore';

const ConfigPanel = lazy(() =>
  import('@/components/panels/ConfigPanel').then((module) => ({ default: module.ConfigPanel })));
const QuotePanel = lazy(() =>
  import('@/components/panels/QuotePanel').then((module) => ({ default: module.QuotePanel })));
const BomPanel = lazy(() =>
  import('@/components/panels/BomPanel').then((module) => ({ default: module.BomPanel })));
const HarnessCanvas = lazy(() =>
  import('@/components/canvas/HarnessCanvas').then((module) => ({ default: module.HarnessCanvas })));
const Preview3D = lazy(() =>
  import('@/components/preview3d/Preview3D').then((module) => ({ default: module.Preview3D })));
const AuthModal = lazy(() =>
  import('@/components/auth/AuthModal').then((module) => ({ default: module.AuthModal })));
const ProjectWizard = lazy(() =>
  import('@/components/project/ProjectWizard').then((module) => ({ default: module.ProjectWizard })));

function LoadingPanel() {
  return <div className="flex h-full items-center justify-center text-sm text-slate-400">正在加载...</div>;
}

function RightPanel() {
  const [bomCollapsed, setBomCollapsed] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <QuotePanel />
      <div className="border-t border-slate-200">
        <button
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
    <Suspense fallback={<LoadingPanel />}>
      <MainLayout leftPanel={<ConfigPanel />} rightPanel={<RightPanel />}>
        <HarnessCanvas />
        <div className="hidden xl:block">
          <Preview3D />
        </div>
      </MainLayout>
    </Suspense>
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export default function App() {
  const [view, setView] = useState<'projectList' | 'designer' | 'wizard'>('projectList');
  const [authOpen, setAuthOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recoveryRaw, setRecoveryRaw] = useState<string | null>(null);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef<Promise<void> | null>(null);

  const currentUser = useUserStore((state) => state.currentUser);
  const { currentProject, saveCurrentConfig, setCurrentProject, updateProject } = useProjectStore();
  const { config, markSaveError, markSaved, markSaving, replaceDocument, saveState } = useHarnessStore();
  const canUndo = useHistoryStore((state) => state.past.length > 0);
  const canRedo = useHistoryStore((state) => state.future.length > 0);

  const applyHistoryDocument = useCallback((nextConfig: typeof config | null) => {
    if (!nextConfig) return;

    const history = useHistoryStore.getState();
    history.pause();
    replaceDocument(nextConfig, { markSaved: false });
    history.resume();
  }, [replaceDocument]);

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
        await updateProject(currentProject.id, { name: latestConfig.name });
        if (useHarnessStore.getState().config.updatedAt === latestConfig.updatedAt) {
          markSaved();
        }
      } catch (error) {
        markSaveError(error instanceof Error ? error.message : '保存失败');
      }
    })();

    saveInFlightRef.current = task;
    try {
      await task;
    } finally {
      saveInFlightRef.current = null;
    }
  }, [currentProject, markSaveError, markSaved, markSaving, saveBlocked, saveCurrentConfig, updateProject]);

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
      if (view !== 'designer') return;

      const isCtrlOrCmd = event.ctrlKey || event.metaKey;
      if (!isCtrlOrCmd || isEditableTarget(event.target)) return;

      if (event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        const previous = useHistoryStore.getState().undo(useHarnessStore.getState().config);
        applyHistoryDocument(previous);
        return;
      }

      if ((event.key === 'z' && event.shiftKey) || event.key === 'y') {
        event.preventDefault();
        const next = useHistoryStore.getState().redo(useHarnessStore.getState().config);
        applyHistoryDocument(next);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [applyHistoryDocument, view]);

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
    setView('wizard');
  };

  const handleOpenProject = async (project: typeof currentProject) => {
    if (!project) return;

    setCurrentProject(project);
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
        setLoadError(`无法加载项目“${project.name}”的配置数据，已回退为默认示例。`);
        setRecoveryRaw(null);
      }
      setSaveBlocked(true);
    }

    history.resume();
    setView('designer');
  };

  const handleWizardComplete = () => {
    setLoadError(null);
    setRecoveryRaw(null);
    setSaveBlocked(false);
    useHistoryStore.getState().clear();
    setView('designer');
  };

  const handleBackToProjects = () => {
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
    useHistoryStore.getState().clear();
    setView('projectList');
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
      ? 'text-green-400 bg-green-900/30'
      : saveState.status === 'dirty'
        ? 'text-yellow-400 bg-yellow-900/30'
        : saveState.status === 'saving'
          ? 'text-blue-400 bg-blue-900/30'
          : 'text-red-400 bg-red-900/30';

  return (
    <div className="h-screen bg-slate-50">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-700 bg-slate-900 px-4 text-white">
        <div className="flex items-center gap-3">
          {view === 'designer' && (
            <button
              onClick={handleBackToProjects}
              className="flex cursor-pointer items-center gap-1 text-slate-300 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">返回</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-blue-400" />
            <h1 className="text-base font-bold">线束设计器</h1>
            <span className="text-xs text-slate-400">v2.0</span>
          </div>

          {currentProject && view === 'designer' && (
            <>
              <span className="ml-2 flex items-center gap-0.5">
                <button
                  onClick={() => {
                    const previous = useHistoryStore.getState().undo(useHarnessStore.getState().config);
                    applyHistoryDocument(previous);
                  }}
                  disabled={!canUndo}
                  className="cursor-pointer rounded p-1 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                  title="撤销 (Ctrl+Z)"
                  aria-label="撤销"
                >
                  <Undo2 className="h-4 w-4 text-slate-300" />
                </button>
                <button
                  onClick={() => {
                    const next = useHistoryStore.getState().redo(useHarnessStore.getState().config);
                    applyHistoryDocument(next);
                  }}
                  disabled={!canRedo}
                  className="cursor-pointer rounded p-1 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                  title="重做 (Ctrl+Y)"
                  aria-label="重做"
                >
                  <Redo2 className="h-4 w-4 text-slate-300" />
                </button>
              </span>

              <span className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                {currentProject.name}
              </span>

              <span className={`ml-1 rounded px-2 py-0.5 text-xs ${saveStatusClass}`}>
                {saveStatusLabel}
              </span>

              {saveBlocked && (
                <span className="rounded bg-red-900/30 px-2 py-0.5 text-xs text-red-300">
                  已暂停自动保存
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {currentUser ? (
            <button
              onClick={() => setAuthOpen(true)}
              className="flex cursor-pointer items-center gap-1.5 rounded bg-slate-700 px-3 py-1.5 text-sm transition-colors hover:bg-slate-600"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs font-medium text-white">
                {currentUser.name[0]}
              </div>
              <span>{currentUser.name}</span>
            </button>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className="flex cursor-pointer items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-sm transition-colors hover:bg-blue-700"
            >
              <User className="h-4 w-4" />
              登录
            </button>
          )}
        </div>
      </header>

      <div className="h-[calc(100vh-56px)]">
        {view === 'projectList' && (
          <ProjectList
            onNewProject={handleNewProject}
            onOpenProject={(project) => void handleOpenProject(project)}
          />
        )}

        {view === 'designer' && (
          <>
            {loadError && (
              <div className="mx-4 mt-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
                <span className="shrink-0 text-lg text-red-500">⚠️</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-700">{loadError}</p>
                  <p className="mt-1 text-xs text-red-500">
                    当前会话仅用于查看和修复，自动保存已暂停，避免覆盖原始损坏数据。
                  </p>
                </div>
                <button
                  onClick={() => setLoadError(null)}
                  className="shrink-0 cursor-pointer text-red-400 hover:text-red-600"
                  aria-label="关闭错误提示"
                >
                  ✕
                </button>
                {recoveryRaw && (
                  <button
                    type="button"
                    onClick={() => downloadTextFile(
                      recoveryRaw,
                      `${safeFilename(currentProject?.name ?? 'damaged-project')}.recovery.json`,
                    )}
                    className="flex shrink-0 cursor-pointer items-center gap-1 rounded border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                  >
                    <Download className="h-3.5 w-3.5" />
                    下载原始副本
                  </button>
                )}
              </div>
            )}

            <DesignerView />
          </>
        )}
      </div>

      <Suspense fallback={null}>
        {authOpen && <AuthModal isOpen onClose={() => setAuthOpen(false)} />}
      </Suspense>

      {view === 'wizard' && (
        <Suspense fallback={<LoadingPanel />}>
          <ProjectWizard
            onComplete={handleWizardComplete}
            onCancel={() => setView('projectList')}
          />
        </Suspense>
      )}
    </div>
  );
}

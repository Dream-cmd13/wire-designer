import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ConfigPanel } from '@/components/panels/ConfigPanel';
import { QuotePanel } from '@/components/panels/QuotePanel';
import { BomPanel } from '@/components/panels/BomPanel';
import { HarnessCanvas } from '@/components/canvas/HarnessCanvas';
import { Preview3D } from '@/components/preview3d/Preview3D';
import { AuthModal } from '@/components/auth/AuthModal';
import { ProjectList } from '@/components/project/ProjectList';
import { ProjectWizard } from '@/components/project/ProjectWizard';
import { useUserStore } from '@/stores/userStore';
import { useProjectStore } from '@/stores/projectStore';
import { useHarnessStore } from '@/stores/harnessStore';
import { loadProjectConfig } from '@/stores/projectStore';
import { ChevronDown, ChevronUp, User, FolderOpen, ArrowLeft } from 'lucide-react';

function RightPanel() {
  const [bomCollapsed, setBomCollapsed] = useState(false);
  return (
    <div className="flex flex-col h-full">
      <QuotePanel />
      <div className="border-t border-slate-200">
        <button
          onClick={() => setBomCollapsed(!bomCollapsed)}
          className="w-full flex items-center justify-between px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <span className="font-semibold">BOM物料清单</span>
          {bomCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
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
    <MainLayout
      leftPanel={<ConfigPanel />}
      rightPanel={<RightPanel />}
    >
      <HarnessCanvas />
      <Preview3D />
    </MainLayout>
  );
}

export default function App() {
  const [view, setView] = useState<'projectList' | 'designer' | 'wizard'>('projectList');
  const [authOpen, setAuthOpen] = useState(false);

  const { currentUser } = useUserStore();
  const { currentProject, setCurrentProject } = useProjectStore();
  const { setConfig } = useHarnessStore();

  // Auto-save config when in designer
  useEffect(() => {
    if (view === 'designer' && currentProject) {
      const interval = setInterval(() => {
        const config = useHarnessStore.getState().config;
        useProjectStore.getState().saveCurrentConfig(config);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [view, currentProject]);

  const handleNewProject = () => {
    if (!currentUser) {
      setAuthOpen(true);
      return;
    }
    setView('wizard');
  };

  const handleOpenProject = (project: typeof currentProject) => {
    if (!project) return;
    setCurrentProject(project);
    const config = loadProjectConfig(project.id);
    if (config) {
      setConfig(config);
    }
    setView('designer');
  };

  const handleWizardComplete = () => {
    setView('designer');
  };

  const handleBackToProjects = () => {
    // Save current config before leaving
    if (currentProject) {
      const config = useHarnessStore.getState().config;
      useProjectStore.getState().saveCurrentConfig(config);
    }
    setCurrentProject(null);
    setView('projectList');
  };

  return (
    <div className="h-screen bg-slate-50">
      {/* Global Header */}
      <header className="h-14 bg-slate-900 text-white flex items-center justify-between px-4 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-3">
          {view === 'designer' && (
            <button
              onClick={handleBackToProjects}
              className="flex items-center gap-1 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">返回</span>
            </button>
          )}
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-blue-400" />
            <h1 className="text-base font-bold">线束设计器</h1>
            <span className="text-xs text-slate-400">v2.0</span>
          </div>
          {currentProject && view === 'designer' && (
            <span className="text-xs text-slate-400 ml-2 px-2 py-0.5 bg-slate-800 rounded">
              {currentProject.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {currentUser ? (
            <button
              onClick={() => setAuthOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded transition-colors cursor-pointer"
            >
              <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-medium">
                {currentUser.name[0]}
              </div>
              <span>{currentUser.name}</span>
            </button>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded transition-colors cursor-pointer"
            >
              <User className="w-4 h-4" /> 登录
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="h-[calc(100vh-56px)]">
        {view === 'projectList' && (
          <ProjectList onNewProject={handleNewProject} onOpenProject={handleOpenProject} />
        )}
        {view === 'designer' && <DesignerView />}
      </div>

      {/* Modals */}
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />

      {view === 'wizard' && (
        <ProjectWizard
          onComplete={handleWizardComplete}
          onCancel={() => setView('projectList')}
        />
      )}
    </div>
  );
}

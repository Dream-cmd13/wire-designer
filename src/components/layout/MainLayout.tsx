import { useEffect, useState, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';

interface MainLayoutProps {
  children: ReactNode;
  leftPanel: ReactNode;
  rightPanel: ReactNode;
}

export function MainLayout({ children, leftPanel, rightPanel }: MainLayoutProps) {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(() => window.matchMedia('(min-width: 1280px)').matches);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1280px)');
    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (!event.matches) setRightOpen(false);
    };
    desktop.addEventListener('change', handleViewportChange);
    return () => desktop.removeEventListener('change', handleViewportChange);
  }, []);

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="hidden border-b border-blue-200 bg-blue-50 px-3 py-2 text-center text-xs text-blue-700 max-xl:block">
        窄屏模式已自动收起右侧面板和等距预览；可按需展开右侧面板。
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div
          className={`flex shrink-0 overflow-hidden transition-[width] duration-200 ${
            leftOpen ? 'w-80' : 'w-6'
          }`}
        >
          {leftOpen ? (
            <aside className="relative w-80 shrink-0 overflow-y-auto border-r border-slate-200 bg-white">
              <button
                onClick={() => setLeftOpen(false)}
                className="absolute top-2 right-2 z-10 cursor-pointer rounded p-1 hover:bg-slate-100"
                title="收起左侧面板"
                aria-label="收起左侧面板"
              >
                <PanelLeftClose className="h-4 w-4 text-slate-400" />
              </button>
              {leftPanel}
            </aside>
          ) : (
            <button
              onClick={() => setLeftOpen(true)}
              className="group flex w-6 items-center justify-center border-r border-slate-200 bg-white hover:bg-slate-50"
              title="展开左侧面板"
              aria-label="展开左侧面板"
            >
              <PanelLeftOpen className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600" />
            </button>
          )}
        </div>

        <main className="relative min-w-0 flex-1">{children}</main>

        <div
          className={`flex shrink-0 overflow-hidden transition-[width] duration-200 ${
            rightOpen ? 'w-72' : 'w-6'
          }`}
        >
          {rightOpen ? (
            <aside className="relative w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white">
              <button
                onClick={() => setRightOpen(false)}
                className="absolute top-2 left-2 z-10 cursor-pointer rounded p-1 hover:bg-slate-100"
                title="收起右侧面板"
                aria-label="收起右侧面板"
              >
                <PanelRightClose className="h-4 w-4 text-slate-400" />
              </button>
              {rightPanel}
            </aside>
          ) : (
            <button
              onClick={() => setRightOpen(true)}
              className="group flex w-6 items-center justify-center border-l border-slate-200 bg-white hover:bg-slate-50"
              title="展开右侧面板"
              aria-label="展开右侧面板"
            >
              <PanelRightOpen className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

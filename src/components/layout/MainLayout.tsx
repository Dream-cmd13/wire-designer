import { useState, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';

interface MainLayoutProps {
  children: ReactNode;
  leftPanel: ReactNode;
  rightPanel: ReactNode;
}

export function MainLayout({ children, leftPanel, rightPanel }: MainLayoutProps) {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Small-screen warning */}
      <div className="hidden max-md:block bg-amber-50 border-b border-amber-200 px-3 py-2 text-xs text-amber-700 text-center">
        建议使用桌面端（1024px 以上）进行线束设计。当前屏幕宽度下体验可能受限。
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        <div className={`shrink-0 transition-all duration-200 flex ${
          leftOpen ? 'w-80' : 'w-0'
        }`}>
          <aside className="w-80 bg-white border-r border-slate-200 overflow-y-auto shrink-0 relative">
            {/* Collapse toggle inside sidebar */}
            <button
              onClick={() => setLeftOpen(false)}
              className="absolute top-2 right-2 z-10 p-1 rounded hover:bg-slate-100 cursor-pointer"
              title="收起左侧面板"
              aria-label="收起左侧面板"
            >
              <PanelLeftClose className="w-4 h-4 text-slate-400" />
            </button>
            {leftPanel}
          </aside>
        </div>

        {/* Expand left button when collapsed */}
        {!leftOpen && (
          <button
            onClick={() => setLeftOpen(true)}
            className="shrink-0 w-6 bg-white border-r border-slate-200 flex items-center justify-center hover:bg-slate-50 cursor-pointer group"
            title="展开左侧面板"
            aria-label="展开左侧面板"
          >
            <PanelLeftOpen className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600" />
          </button>
        )}

        {/* Main canvas area */}
        <main className="flex-1 relative min-w-0">{children}</main>

        {/* Expand right button when collapsed */}
        {!rightOpen && (
          <button
            onClick={() => setRightOpen(true)}
            className="shrink-0 w-6 bg-white border-l border-slate-200 flex items-center justify-center hover:bg-slate-50 cursor-pointer group"
            title="展开右侧面板"
            aria-label="展开右侧面板"
          >
            <PanelRightOpen className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600" />
          </button>
        )}

        {/* Right panel */}
        <div className={`shrink-0 transition-all duration-200 flex ${
          rightOpen ? 'w-72' : 'w-0'
        }`}>
          <aside className="w-72 bg-white border-l border-slate-200 overflow-y-auto shrink-0 relative">
            {/* Collapse toggle inside sidebar */}
            <button
              onClick={() => setRightOpen(false)}
              className="absolute top-2 left-2 z-10 p-1 rounded hover:bg-slate-100 cursor-pointer"
              title="收起右侧面板"
              aria-label="收起右侧面板"
            >
              <PanelRightClose className="w-4 h-4 text-slate-400" />
            </button>
            {rightPanel}
          </aside>
        </div>
      </div>
    </div>
  );
}

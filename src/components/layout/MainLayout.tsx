import type { ReactNode } from 'react';

interface MainLayoutProps {
  children: ReactNode;
  leftPanel: ReactNode;
  rightPanel: ReactNode;
}

export function MainLayout({ children, leftPanel, rightPanel }: MainLayoutProps) {
  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-80 bg-white border-r border-slate-200 overflow-y-auto shrink-0">{leftPanel}</aside>
        <main className="flex-1 relative min-w-0">{children}</main>
        <aside className="w-72 bg-white border-l border-slate-200 overflow-y-auto shrink-0">{rightPanel}</aside>
      </div>
    </div>
  );
}

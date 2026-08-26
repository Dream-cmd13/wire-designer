import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import {
  Cable,
  Database,
  FileImage,
  FolderOpen,
  Home,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PenTool,
  Redo2,
  Undo2,
  User,
} from 'lucide-react';
import { appRoutes, type AppRoute } from '@/lib/appRoute';
import type { User as AppUser } from '@/types/user';

export interface SidebarItem {
  label: string;
  path?: string;
  icon: ComponentType<{ className?: string }>;
  children?: SidebarItem[];
}

const sidebarItems: SidebarItem[] = [
  {
    label: '首页',
    path: appRoutes.home.path,
    icon: Home,
  },
  {
    label: '线束设计器',
    path: appRoutes['designer-design'].path,
    icon: Cable,
    children: [
      { label: '设计图', path: appRoutes['designer-design'].path, icon: PenTool },
      { label: '成品图', path: appRoutes['designer-product-image'].path, icon: FileImage },
    ],
  },
  {
    label: '制作图纸',
    path: appRoutes['drawing-workbench'].path,
    icon: LayoutDashboard,
  },
  {
    label: '正式库',
    path: appRoutes['library-connectors'].path,
    icon: Database,
    children: [
      { label: '数据库连接器', path: appRoutes['library-connectors'].path, icon: Database },
      { label: '线束库', path: appRoutes['library-harnesses'].path, icon: FolderOpen },
    ],
  },
];

interface AdminShellProps {
  route: AppRoute;
  currentUser: AppUser | null;
  currentProjectName?: string;
  saveStatusLabel?: string;
  saveStatusClass?: string;
  saveBlocked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  children: ReactNode;
  onNavigate: (path: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenAuth: () => void;
  onCloseProject: () => void;
  onUpdateProjectName?: (name: string) => void;
}

function ProjectNameEditor({
  projectName,
  onUpdate,
}: {
  projectName: string;
  onUpdate?: (name: string) => void;
}) {
  const [value, setValue] = useState(projectName);

  useEffect(() => {
    setValue(projectName);
  }, [projectName]);

  const commit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setValue(projectName);
      return;
    }
    if (trimmed !== projectName && onUpdate) {
      onUpdate(trimmed);
    }
  };

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 transition-colors focus-within:border-blue-500 focus-within:bg-white focus-within:ring-1 focus-within:ring-blue-500">
      <span className="shrink-0 font-medium text-slate-500">项目名称</span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        }}
        className="w-28 sm:w-44 bg-transparent text-xs font-semibold text-slate-800 outline-none placeholder:text-slate-400"
        placeholder="未命名项目"
        title="点击修改项目名称，回车或失焦生效"
      />
    </div>
  );
}

function pathMatches(route: AppRoute, item: SidebarItem) {
  if (item.path === route.path) return true;
  return item.children?.some((child) => child.path === route.path) ?? false;
}

export function AdminShell({
  route,
  currentUser,
  currentProjectName,
  saveStatusLabel,
  saveStatusClass,
  saveBlocked,
  canUndo,
  canRedo,
  children,
  onNavigate,
  onUndo,
  onRedo,
  onOpenAuth,
  onCloseProject,
  onUpdateProjectName,
}: AdminShellProps) {
  const showDesignerActions = route.section === 'designer' && Boolean(currentProjectName);
  const contextLabel = route.id === 'drawing-workbench'
    ? '独立制图 · 新建后导出'
    : currentProjectName || '选择项目后可进入完整设计流程';
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 text-slate-900">
      <aside
        className={`flex shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-slate-100 transition-[width] duration-200 ${
          sidebarCollapsed ? 'w-14' : 'w-16 sm:w-64'
        }`}
      >
        <div
          className={`flex h-14 shrink-0 items-center border-b border-slate-800 px-2 ${
            sidebarCollapsed ? 'justify-center' : 'gap-2 sm:px-4'
          }`}
        >
          {!sidebarCollapsed && (
            <>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-white" title="线束设计器">
                <Cable className="h-4 w-4" />
              </div>
              <div className="hidden min-w-0 flex-1 sm:block">
                <h1 className="truncate text-sm font-bold">线束设计器</h1>
                <p className="text-xs text-slate-400">Admin Console v2.0</p>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((value) => !value)}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label={sidebarCollapsed ? '展开侧边栏' : '收缩侧边栏'}
            title={sidebarCollapsed ? '展开侧边栏' : '收缩侧边栏'}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <nav className={`min-h-0 flex-1 overflow-y-auto py-3 ${sidebarCollapsed ? 'px-1.5' : 'px-2'}`}>
          <div className="space-y-1">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const active = pathMatches(route, item);
              return (
                <div key={item.label}>
                  <button
                    type="button"
                    onClick={() => item.path && onNavigate(item.path)}
                    className={`flex h-10 w-full cursor-pointer items-center rounded-md text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                      active ? 'bg-blue-500 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    } ${sidebarCollapsed ? 'justify-center px-0' : 'gap-2 px-2'}`}
                    aria-current={active ? 'page' : undefined}
                    title={item.label}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className={`hidden truncate font-medium ${sidebarCollapsed ? '' : 'sm:block'}`}>
                      {item.label}
                    </span>
                  </button>

                  {item.children && (
                    <div
                      className={`mt-1 space-y-1 ${
                        sidebarCollapsed ? '' : 'sm:ml-4 sm:border-l sm:border-slate-800 sm:pl-2'
                      }`}
                    >
                      {item.children.map((child) => {
                        const ChildIcon = child.icon;
                        const childActive = child.path === route.path;
                        return (
                          <button
                            type="button"
                            key={child.label}
                            onClick={() => child.path && onNavigate(child.path)}
                            className={`flex h-9 w-full cursor-pointer items-center rounded-md text-left text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                              childActive
                                ? 'bg-slate-100 text-slate-950'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                            } ${sidebarCollapsed ? 'justify-center px-0' : 'gap-2 px-2'}`}
                            aria-current={childActive ? 'page' : undefined}
                            title={child.label}
                          >
                            <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                            <span className={`hidden truncate ${sidebarCollapsed ? '' : 'sm:block'}`}>
                              {child.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{route.title}</p>
              <p className="hidden text-xs text-slate-500 sm:block">
                {contextLabel}
              </p>
            </div>

            {showDesignerActions && (
              <div className="flex min-w-0 items-center gap-1 sm:gap-2">
                <span className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={onUndo}
                    disabled={!canUndo}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30"
                    title="撤销 (Ctrl+Z)"
                    aria-label="撤销"
                  >
                    <Undo2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onRedo}
                    disabled={!canRedo}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30"
                    title="重做 (Ctrl+Y)"
                    aria-label="重做"
                  >
                    <Redo2 className="h-4 w-4" />
                  </button>
                </span>

                {saveStatusLabel && saveStatusClass && (
                  <span className={`hidden rounded px-2 py-0.5 text-xs sm:inline-flex ${saveStatusClass}`}>
                    {saveStatusLabel}
                  </span>
                )}
                {saveBlocked && (
                  <span className="hidden rounded bg-red-50 px-2 py-0.5 text-xs text-red-600 sm:inline-flex">
                    已暂停自动保存
                  </span>
                )}
                <button
                  type="button"
                  onClick={onCloseProject}
                  className="hidden cursor-pointer items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 sm:flex"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  关闭项目
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {Boolean(currentProjectName) && (
              <ProjectNameEditor
                projectName={currentProjectName!}
                onUpdate={onUpdateProjectName}
              />
            )}

            {currentUser ? (
              <button
                type="button"
                onClick={onOpenAuth}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm transition-colors hover:bg-slate-50"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-medium text-white">
                  {currentUser.name[0]}
                </span>
                <span className="hidden max-w-28 truncate sm:inline">{currentUser.name}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="flex cursor-pointer items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">登录</span>
              </button>
            )}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

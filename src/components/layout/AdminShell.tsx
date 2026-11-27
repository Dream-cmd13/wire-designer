import { useState, type ComponentType, type ReactNode } from 'react';
import {
  Cable,
  Box,
  Calculator,
  ClipboardList,
  Database,
  DraftingCompass,
  FileImage,
  LayoutDashboard,
  MessageSquareText,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PenTool,
  Redo2,
  Undo2,
  User,
} from 'lucide-react';
import { appRoutes, resolveRoleRoute, type AppRoute, type AppRouteId } from '@/lib/appRoute';
import type { User as AppUser } from '@/types/user';
import { PageHeaderActionsTarget } from './pageHeaderActionsTarget';

export interface SidebarItem {
  label: string;
  path?: string;
  icon: ComponentType<{ className?: string }>;
  children?: SidebarItem[];
  access?: 'projects' | 'materials';
}

const sidebarItems: SidebarItem[] = [
  { label: '询价', path: appRoutes['request-quote'].path, icon: MessageSquareText },
  {
    label: '线束设计器',
    path: appRoutes['designer-projects'].path,
    icon: Cable,
    access: 'projects',
    children: [
      { label: '设计图', path: appRoutes['designer-design'].path, icon: PenTool },
      { label: '成品图', path: appRoutes['designer-product-image'].path, icon: FileImage },
    ],
  },
  {
    label: '自动报价',
    path: appRoutes['auto-quote'].path,
    icon: Calculator,
    access: 'projects',
  },
  {
    label: '物料库',
    path: appRoutes.materials.path,
    icon: Database,
    access: 'materials',
  },
  {
    label: '制作图纸',
    path: appRoutes['drawing-workbench'].path,
    icon: LayoutDashboard,
  },
  {
    label: 'DWG 图纸',
    path: appRoutes['dwg-viewer'].path,
    icon: DraftingCompass,
  },
  { label: '3D 模型', path: appRoutes['model-viewer'].path, icon: Box },
];

interface AdminShellProps {
  route: AppRoute;
  currentUser: AppUser | null;
  currentProjectId?: string;
  currentProjectName?: string;
  saveStatusLabel?: string;
  saveStatusClass?: string;
  saveBlocked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canAccessProjects?: boolean;
  canAccessMaterials?: boolean;
  children: ReactNode;
  onNavigate: (path: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onRetrySave?: () => void;
  onOpenAuth: () => void;
  onCloseProject: () => void;
  onUpdateProjectName?: (name: string) => void;
  onOpenBom?: () => void;
  onOpenQuote?: () => void;
}

function ProjectNameEditor({
  projectName,
  onUpdate,
}: {
  projectName: string;
  onUpdate?: (name: string) => void;
}) {
  const [prevName, setPrevName] = useState(projectName);
  const [value, setValue] = useState(projectName);

  if (prevName !== projectName) {
    setPrevName(projectName);
    setValue(projectName);
  }

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
    <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 transition-colors focus-within:border-blue-500 focus-within:bg-white focus-within:ring-1 focus-within:ring-blue-500">
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
        className="w-24 bg-transparent text-xs font-semibold text-slate-800 outline-none placeholder:text-slate-400 @min-[1150px]:w-32"
        placeholder="未命名项目"
        title="点击修改项目名称，回车或失焦生效"
      />
    </div>
  );
}

const designViews = [
  { route: appRoutes['designer-design'], icon: PenTool },
  { route: appRoutes['designer-product-image'], icon: FileImage },
];
const quoteViews = [
  { route: appRoutes['request-quote'], icon: MessageSquareText },
  { route: appRoutes['quote-requests'], icon: ClipboardList },
];

function HeaderViewToggle({ label, views, currentRouteId, onNavigate, compact, equalWidth }: {
  label: string;
  views: typeof designViews;
  currentRouteId: AppRouteId;
  onNavigate: (path: string) => void;
  compact?: boolean;
  equalWidth?: boolean;
}) {
  return (
    <div className={`${equalWidth ? 'grid w-48 grid-cols-2' : 'flex'} items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs`} role="group" aria-label={label}>
      {views.map(({ route, icon: Icon }) => {
        const active = currentRouteId === route.id;
        return (
          <button
            key={route.id}
            type="button"
            onClick={() => { if (!active) onNavigate(route.path); }}
            className={`flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 font-medium transition-all ${
              active ? 'bg-white text-blue-600 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
            title={route.title}
            aria-pressed={active}
          >
            <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className={compact ? 'hidden sm:inline' : undefined}>{route.title}</span>
          </button>
        );
      })}
    </div>
  );
}

function pathMatches(route: AppRoute, item: SidebarItem) {
  if (item.path === route.path || (item.path === appRoutes['request-quote'].path && route.section === 'quote-requests')) return true;
  return item.children?.some((child) => child.path === route.path) ?? false;
}

export function AdminShell({
  route,
  currentUser,
  currentProjectId,
  currentProjectName,
  saveStatusLabel,
  saveStatusClass,
  saveBlocked,
  canUndo,
  canRedo,
  canAccessProjects,
  canAccessMaterials,
  children,
  onNavigate,
  onUndo,
  onRedo,
  onRetrySave,
  onOpenAuth,
  onCloseProject,
  onUpdateProjectName,
  onOpenBom,
  onOpenQuote,
}: AdminShellProps) {
  const accessProjects = canAccessProjects ?? Boolean(currentUser);
  const accessMaterials = canAccessMaterials ?? Boolean(currentUser);
  const visibleSidebarItems = sidebarItems.filter((item) => {
    if (currentUser && (!currentUser.role || currentUser.role === 'sales')) {
      return Object.values(appRoutes).some((route) => route.path === item.path && resolveRoleRoute(route, 'sales') === route);
    }
    if (item.access === 'projects') return accessProjects;
    if (item.access === 'materials') return accessMaterials;
    return true;
  });
  const showDesignerActions = (currentUser?.role === 'engineer' || currentUser?.role === 'admin') && route.section === 'designer' && Boolean(currentProjectId && currentProjectName);
  const showQuoteToggle = route.section === 'quote-requests' && (currentUser?.role === 'sales' || currentUser?.role === 'admin');
  const contextLabel = route.section === 'quote-requests' ? undefined
    : route.id === 'drawing-workbench'
    ? '独立制图 · 新建后导出'
    : route.id === 'model-viewer'
      ? 'STEP / STL · 本地预览与私有保存'
    : route.id === 'dwg-viewer'
      ? '浏览器内解析与导出'
      : route.section === 'auto-quote'
        ? '基于物料目录与工时基准实时测算'
        : route.section === 'designer'
          ? (showDesignerActions ? undefined : '选择项目后可进入完整设计流程')
          : route.section === 'projects'
            ? '选择项目后可进入完整设计流程'
            : '工程规格检索与采购价格管理';
  const [sidebarToggle, setSidebarToggle] = useState<boolean | null>(null);
  const sidebarCollapsed = sidebarToggle ?? visibleSidebarItems.length <= 1;
  const [pageActionsTarget, setPageActionsTarget] = useState<HTMLDivElement | null>(null);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 text-slate-900">
      <aside
        className={`flex shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-slate-100 transition-[width] duration-200 ${
          sidebarCollapsed ? 'w-14' : 'w-16 sm:w-48'
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
                <p className="truncate text-sm font-bold">线束设计器</p>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => setSidebarToggle(!sidebarCollapsed)}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label={sidebarCollapsed ? '展开侧边栏' : '收缩侧边栏'}
            title={sidebarCollapsed ? '展开侧边栏' : '收缩侧边栏'}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <nav className={`min-h-0 flex-1 overflow-y-auto py-3 ${sidebarCollapsed ? 'px-1.5' : 'px-2'}`}>
          <div className="space-y-1">
            {visibleSidebarItems.map((item) => {
              const Icon = item.icon;
              const active = pathMatches(route, item);
              return (
                <div key={item.label}>
                  <button
                    type="button"
                    onClick={() => { if (item.path && (!active || item.path !== appRoutes['request-quote'].path)) onNavigate(item.path); }}
                    className={`flex h-10 w-full cursor-pointer items-center rounded-md text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                      active ? 'bg-blue-500 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    } ${sidebarCollapsed ? 'justify-center px-0' : 'gap-2 px-2'}`}
                    aria-current={active ? 'page' : undefined}
                    aria-label={item.label}
                    title={item.label}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className={`hidden truncate font-medium ${sidebarCollapsed ? '' : 'sm:block'}`}>
                      {item.label}
                    </span>
                  </button>

                  {item.children && currentProjectId && (
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
                            aria-label={child.label}
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

      <div className="@container flex min-w-0 flex-1 flex-col">
        <header data-page-header className={`relative min-h-14 shrink-0 items-center gap-x-3 gap-y-1.5 border-b border-slate-200 bg-white px-3 py-1.5 sm:px-4 ${
          showQuoteToggle ? 'grid grid-cols-[minmax(0,1fr)_auto] @min-[660px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]' : 'flex flex-wrap'
        }`}>
          <div className="mr-auto min-w-0">
            <h1 className="truncate text-sm font-semibold text-slate-900">{route.title}</h1>
            {contextLabel && <p className="hidden max-w-52 truncate text-xs text-slate-500 @min-[580px]:block" title={contextLabel}>{contextLabel}</p>}
          </div>

          {showDesignerActions && (
            <div className="order-2 flex min-w-0 basis-full flex-wrap items-center gap-1 sm:gap-2 @min-[660px]:order-none @min-[660px]:basis-auto">
                <span className="flex shrink-0 items-center gap-0.5">
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
                {onRetrySave && (
                  <button type="button" onClick={onRetrySave} className="cursor-pointer rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50">
                    重试保存
                  </button>
                )}
                {saveBlocked && (
                  <span className="hidden rounded bg-red-50 px-2 py-0.5 text-xs text-red-600 sm:inline-flex">
                    已暂停自动保存
                  </span>
                )}
                <button
                  type="button"
                  onClick={onCloseProject}
                  aria-label="关闭项目"
                  title="关闭项目"
                  className="hidden cursor-pointer items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 sm:flex"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden @min-[1150px]:inline">关闭项目</span>
                </button>
            </div>
          )}

          {showDesignerActions && (
            <div className="order-2 flex min-w-0 basis-full flex-wrap items-center gap-2 @min-[660px]:order-none @min-[660px]:basis-auto">
                {onOpenBom && (
                  <button
                    type="button"
                    onClick={onOpenBom}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs sm:text-sm font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    title="BOM物料清单"
                    aria-label="BOM物料清单"
                  >
                    <ClipboardList className="h-4 w-4 text-blue-600" />
                    <span className="hidden font-semibold @min-[1150px]:inline">BOM清单</span>
                  </button>
                )}
                {onOpenQuote && (
                  <button
                    type="button"
                    onClick={onOpenQuote}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs sm:text-sm font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    title="线束报价核算"
                    aria-label="线束报价"
                  >
                    <Calculator className="h-4 w-4 text-blue-600" />
                    <span className="hidden font-semibold @min-[1150px]:inline">线束报价</span>
                  </button>
                )}
                <HeaderViewToggle
                  label="视图切换"
                  views={designViews}
                  compact
                  currentRouteId={route.id}
                  onNavigate={onNavigate}
                />
                <ProjectNameEditor
                  projectName={currentProjectName!}
                  onUpdate={onUpdateProjectName}
                />
            </div>
          )}

          {showQuoteToggle && (
            <div className="col-span-2 row-start-2 justify-self-center @min-[660px]:col-span-1 @min-[660px]:col-start-2 @min-[660px]:row-start-1">
              <HeaderViewToggle label="询价切换" views={quoteViews} currentRouteId={route.id} onNavigate={onNavigate} equalWidth />
            </div>
          )}

          <div className={showQuoteToggle
            ? 'col-start-2 row-start-1 flex min-w-0 items-center justify-end gap-2 @min-[660px]:col-start-3'
            : 'contents'
          }>
            <div ref={setPageActionsTarget} className={`flex items-center gap-1.5 empty:hidden ${showQuoteToggle
              ? 'shrink-0' : 'order-2 min-w-0 max-w-full basis-full flex-wrap @min-[660px]:order-none @min-[660px]:basis-auto @min-[660px]:flex-[1_1_0%] @min-[660px]:justify-end'
            }`} />

            <div className={showQuoteToggle ? 'flex min-w-0 items-center' : 'ml-auto flex shrink-0 items-center'}>
              {currentUser ? (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  aria-label={currentUser.name}
                  className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm transition-colors hover:bg-slate-50"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-medium text-white">
                    {currentUser.name[0]}
                  </span>
                  <span className="hidden max-w-28 truncate sm:inline">{currentUser.name}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  aria-label="登录"
                  className="flex cursor-pointer items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">登录</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <main className={`min-h-0 flex-1 ${route.section === 'quote-requests' ? 'overflow-y-auto' : 'overflow-hidden'}`}>
          <PageHeaderActionsTarget value={pageActionsTarget}>{children}</PageHeaderActionsTarget>
        </main>
      </div>
    </div>
  );
}

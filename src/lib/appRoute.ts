export type AppRouteId =
  | 'home'
  | 'designer-design'
  | 'designer-product-image'
  | 'drawing-workbench'
  | 'library-connectors'
  | 'library-harnesses';

export interface AppRoute {
  id: AppRouteId;
  path: string;
  title: string;
  section: 'home' | 'designer' | 'drawing' | 'library';
}

export const appRoutes: Record<AppRouteId, AppRoute> = {
  home: {
    id: 'home',
    path: '/home',
    title: '首页',
    section: 'home',
  },
  'designer-design': {
    id: 'designer-design',
    path: '/designer/design',
    title: '设计图',
    section: 'designer',
  },
  'designer-product-image': {
    id: 'designer-product-image',
    path: '/designer/product-image',
    title: '成品图',
    section: 'designer',
  },
  'drawing-workbench': {
    id: 'drawing-workbench',
    path: '/drawing-workbench',
    title: '制作图纸',
    section: 'drawing',
  },
  'library-connectors': {
    id: 'library-connectors',
    path: '/library/connectors',
    title: '数据库连接器',
    section: 'library',
  },
  'library-harnesses': {
    id: 'library-harnesses',
    path: '/library/harnesses',
    title: '线束库',
    section: 'library',
  },
};

export const defaultRoute = appRoutes.home;

export const projectIdQueryKey = 'projectId';

const routeBaseUrl = 'http://wire-harness-designer.local';

function toUrl(path: string): URL {
  return new URL(path, routeBaseUrl);
}

const routeByPath = new Map(
  Object.values(appRoutes).flatMap((route) => {
    const aliases = route.id === 'home' ? ['/', route.path] : [route.path];
    return aliases.map((path) => [path, route] as const);
  }),
);

export function getRouteByPath(pathname: string): AppRoute {
  return routeByPath.get(toUrl(pathname).pathname) ?? defaultRoute;
}

export function getProjectIdFromSearch(search: string): string | null {
  const projectId = new URLSearchParams(search).get(projectIdQueryKey)?.trim();
  return projectId || null;
}

export function buildProjectRoutePath(path: string, projectId: string | null = null): string {
  const url = toUrl(path);
  if (projectId) {
    url.searchParams.set(projectIdQueryKey, projectId);
  } else {
    url.searchParams.delete(projectIdQueryKey);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
